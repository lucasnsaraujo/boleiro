//! Save slots as files under `<app data dir>/saves`.
//!
//! A save in shards lives in the folder `<id>/`: one file per shard, `<shard>.<generation>.json`, and
//! `index.json`, which holds the slot's meta and, for each shard, the generation of its file and its hash.
//! A write puts each changed shard in a new file of the next generation, syncs them, and only then
//! replaces the index; the files the new index no longer names are deleted after. Until the index is
//! replaced, the old index names only old files, none of which the write touched, so a crash at any point
//! leaves the slot holding either the previous save or the new one, whole, with its meta.
//!
//! A save written whole, as before shards, is `<id>.save.json` next to its `<id>.meta.json`. It still
//! loads, and the slot's next write in shards replaces it.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const SAVE_SUFFIX: &str = ".save.json";
const META_SUFFIX: &str = ".meta.json";
const INDEX: &str = "index.json";

/// Tauri runs async commands in parallel, so two autosaves can overlap. Writes take turns, which also
/// keeps each meta paired with the save written with it. Reads of a save in shards take a turn too, so a
/// write never deletes an old shard file between a read opening the index and opening that file.
static TURN: Mutex<()> = Mutex::new(());
static TEMPORARY_COUNT: AtomicU64 = AtomicU64::new(0);

/// A slot's save as read: its shards by name, or the string of a save written whole.
#[derive(Serialize, Debug, PartialEq)]
#[serde(untagged)]
pub enum StoredSave {
    Whole(String),
    Shards(BTreeMap<String, String>),
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct Shard {
    generation: u64,
    hash: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct Index {
    generation: u64,
    meta: String,
    shards: BTreeMap<String, Shard>,
}

/// Whether `name` can be used in a file name as is: lowercase letters, digits and dashes, so never a dot or a slash.
fn is_plain_name(name: &str, max_len: usize) -> bool {
    !name.is_empty()
        && name.len() <= max_len
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Same rule as `assertSlotId` in `packages/game-client/src/saves/slotMeta.ts`: ids become file names, so no dots or slashes.
fn check_id(id: &str) -> Result<(), String> {
    if is_plain_name(id, 64) {
        Ok(())
    } else {
        Err(format!("invalid slot id \"{id}\""))
    }
}

/// Shard names become file names too, under the same rule as slot ids.
fn check_shard_name(name: &str) -> Result<(), String> {
    if is_plain_name(name, 128) {
        Ok(())
    } else {
        Err(format!("invalid shard name \"{name}\""))
    }
}

fn shard_file(name: &str, generation: u64) -> String {
    format!("{name}.{generation}.json")
}

fn take_turn() -> std::sync::MutexGuard<'static, ()> {
    TURN.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Writes through a temporary file of its own, synced to disk before the rename, so a crash
/// mid-write never leaves half a file behind.
fn write_atomically(path: &Path, contents: &str) -> Result<(), String> {
    let count = TEMPORARY_COUNT.fetch_add(1, Ordering::Relaxed);
    let temporary = path.with_extension(format!("{}-{count}.tmp", std::process::id()));
    let mut file = File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}

/// Makes the renames done in `dir` durable, so after a power cut the index never names a shard file whose rename was lost.
#[cfg(unix)]
fn sync_dir(dir: &Path) -> Result<(), String> {
    File::open(dir).and_then(|dir| dir.sync_all()).map_err(|e| e.to_string())
}

/// Windows can't open a folder as a file; NTFS journals the renames themselves.
#[cfg(not(unix))]
fn sync_dir(_dir: &Path) -> Result<(), String> {
    Ok(())
}

/// The slot's index; none when the slot holds no save in shards. An index that can't be read or that names a
/// shard outside the plain-name rule is an error.
fn read_index(slot: &Path) -> Result<Option<Index>, String> {
    let json = match fs::read_to_string(slot.join(INDEX)) {
        Ok(json) => json,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let index: Index = serde_json::from_str(&json).map_err(|e| format!("the save index is malformed: {e}"))?;
    for name in index.shards.keys() {
        check_shard_name(name)?;
    }
    Ok(Some(index))
}

/// The save written whole in slot `id`.
fn write(dir: &Path, id: &str, meta: &str, save: &str) -> Result<(), String> {
    check_id(id)?;
    let _turn = take_turn();
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    write_atomically(&dir.join(format!("{id}{SAVE_SUFFIX}")), save)?;
    write_atomically(&dir.join(format!("{id}{META_SUFFIX}")), meta)?;
    remove_shards_folder(&dir.join(id))
}

/// Puts the changed shards in files of the slot's next generation and returns the index naming them and the
/// kept ones, without writing it: until it is written, the slot still holds its previous save.
fn stage_shards(
    slot: &Path,
    meta: &str,
    hashes: &BTreeMap<String, String>,
    changed: &BTreeMap<String, String>,
) -> Result<Index, String> {
    for name in hashes.keys() {
        check_shard_name(name)?;
    }
    if let Some(name) = changed.keys().find(|name| !hashes.contains_key(*name)) {
        return Err(format!("shard {name} came without its hash"));
    }
    let previous = read_index(slot).ok().flatten();
    let generation = previous.as_ref().map_or(0, |index| index.generation) + 1;
    let mut shards = BTreeMap::new();
    for (name, hash) in hashes {
        if changed.contains_key(name) {
            shards.insert(name.clone(), Shard { generation, hash: hash.clone() });
            continue;
        }
        let kept = previous
            .as_ref()
            .and_then(|index| index.shards.get(name))
            .filter(|kept| &kept.hash == hash)
            .ok_or_else(|| format!("the slot holds no shard {name} with that hash to keep"))?;
        shards.insert(name.clone(), kept.clone());
    }
    fs::create_dir_all(slot).map_err(|e| e.to_string())?;
    for (name, json) in changed {
        write_atomically(&slot.join(shard_file(name, generation)), json)?;
    }
    sync_dir(slot)?;
    Ok(Index { generation, meta: meta.to_string(), shards })
}

/// The moment the slot switches to the new save: one rename of the index.
fn commit_index(slot: &Path, index: &Index) -> Result<(), String> {
    write_atomically(&slot.join(INDEX), &serde_json::to_string(index).map_err(|e| e.to_string())?)?;
    sync_dir(slot)
}

/// Deletes what the committed index no longer needs: older shard files, temporary files and the save written whole.
/// The save is already safe, so a file that won't go is left for the next write.
fn remove_leftovers(dir: &Path, id: &str, index: &Index) {
    let slot = dir.join(id);
    let named: HashSet<String> = index.shards.iter().map(|(name, shard)| shard_file(name, shard.generation)).collect();
    for entry in fs::read_dir(&slot).into_iter().flatten().flatten() {
        let file = entry.file_name().to_string_lossy().into_owned();
        if file != INDEX && !named.contains(&file) {
            let _ = fs::remove_file(entry.path());
        }
    }
    for suffix in [SAVE_SUFFIX, META_SUFFIX] {
        let _ = fs::remove_file(dir.join(format!("{id}{suffix}")));
    }
}

/// Writes slot `id` in shards. `hashes` names every shard of the save; `changed` carries the content of those
/// that differ from the slot's, and every other one must be in the slot already with the same hash.
fn write_shards(
    dir: &Path,
    id: &str,
    meta: &str,
    hashes: &BTreeMap<String, String>,
    changed: &BTreeMap<String, String>,
) -> Result<(), String> {
    check_id(id)?;
    let _turn = take_turn();
    let slot = dir.join(id);
    let index = stage_shards(&slot, meta, hashes, changed)?;
    commit_index(&slot, &index)?;
    remove_leftovers(dir, id, &index);
    Ok(())
}

/// The hash of each shard slot `id` holds; none when the slot holds no save in shards.
fn shard_hashes(dir: &Path, id: &str) -> Result<Option<BTreeMap<String, String>>, String> {
    check_id(id)?;
    let index = read_index(&dir.join(id)).ok().flatten();
    Ok(index.map(|index| index.shards.into_iter().map(|(name, shard)| (name, shard.hash)).collect()))
}

/// The save written whole in slot `id`.
fn read(dir: &Path, id: &str) -> Result<String, String> {
    check_id(id)?;
    fs::read_to_string(dir.join(format!("{id}{SAVE_SUFFIX}"))).map_err(|_| format!("no save in slot {id}"))
}

/// Slot `id`'s save: the shards its index names, or else the save written whole.
fn read_save(dir: &Path, id: &str) -> Result<StoredSave, String> {
    check_id(id)?;
    let _turn = take_turn();
    let slot = dir.join(id);
    let Some(index) = read_index(&slot)? else {
        return read(dir, id).map(StoredSave::Whole);
    };
    let mut shards = BTreeMap::new();
    for (name, shard) in index.shards {
        let json = fs::read_to_string(slot.join(shard_file(&name, shard.generation)))
            .map_err(|_| format!("the save in slot {id} is missing its shard {name}"))?;
        shards.insert(name, json);
    }
    Ok(StoredSave::Shards(shards))
}

/// Each slot's meta; a slot in shards gives the one in its index, even when a save written whole is still beside it.
fn list(dir: &Path) -> Result<Vec<String>, String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(Vec::new());
    };
    let mut metas = Vec::new();
    for entry in entries.flatten() {
        let file = entry.file_name().to_string_lossy().into_owned();
        if let Some(id) = file.strip_suffix(META_SUFFIX) {
            if !dir.join(id).join(INDEX).exists() {
                metas.extend(fs::read_to_string(entry.path()).ok());
            }
        } else if entry.path().is_dir() {
            metas.extend(read_index(&entry.path()).ok().flatten().map(|index| index.meta));
        }
    }
    Ok(metas)
}

/// The index goes first, so a delete cut short never leaves an index naming shard files already gone.
fn remove_shards_folder(slot: &Path) -> Result<(), String> {
    match fs::remove_file(slot.join(INDEX)) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    if slot.exists() {
        fs::remove_dir_all(slot).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn delete(dir: &Path, id: &str) -> Result<(), String> {
    check_id(id)?;
    let _turn = take_turn();
    remove_shards_folder(&dir.join(id))?;
    for suffix in [META_SUFFIX, SAVE_SUFFIX] {
        let path = dir.join(format!("{id}{suffix}"));
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn saves_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("saves"))
}

#[tauri::command]
pub async fn list_slots(app: AppHandle) -> Result<Vec<String>, String> {
    list(&saves_dir(&app)?)
}

#[tauri::command]
pub async fn write_slot(app: AppHandle, id: String, meta: String, save: String) -> Result<(), String> {
    write(&saves_dir(&app)?, &id, &meta, &save)
}

#[tauri::command]
pub async fn write_slot_shards(
    app: AppHandle,
    id: String,
    meta: String,
    hashes: BTreeMap<String, String>,
    changed: BTreeMap<String, String>,
) -> Result<(), String> {
    write_shards(&saves_dir(&app)?, &id, &meta, &hashes, &changed)
}

#[tauri::command]
pub async fn slot_shard_hashes(app: AppHandle, id: String) -> Result<Option<BTreeMap<String, String>>, String> {
    shard_hashes(&saves_dir(&app)?, &id)
}

#[tauri::command]
pub async fn read_slot(app: AppHandle, id: String) -> Result<StoredSave, String> {
    read_save(&saves_dir(&app)?, &id)
}

#[tauri::command]
pub async fn delete_slot(app: AppHandle, id: String) -> Result<(), String> {
    delete(&saves_dir(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("boleiro-slots-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn a_written_slot_is_listed_and_reads_back() {
        let dir = empty_dir("roundtrip");
        write(&dir, "slot-1", "{\"id\":\"slot-1\"}", "game").unwrap();
        assert_eq!(list(&dir).unwrap(), vec!["{\"id\":\"slot-1\"}".to_string()]);
        assert_eq!(read(&dir, "slot-1").unwrap(), "game");
    }

    #[test]
    fn a_deleted_slot_is_gone() {
        let dir = empty_dir("delete");
        write(&dir, "autosave", "{}", "game").unwrap();
        delete(&dir, "autosave").unwrap();
        assert!(list(&dir).unwrap().is_empty());
        assert!(read(&dir, "autosave").is_err());
    }

    #[test]
    fn ids_that_could_leave_the_saves_folder_are_refused() {
        let dir = empty_dir("escape");
        assert!(write(&dir, "../x", "{}", "game").is_err());
        assert!(read(&dir, "a/b").is_err());
        assert!(delete(&dir, "..").is_err());
    }

    #[test]
    fn concurrent_writes_to_one_slot_leave_one_whole_save() {
        let dir = empty_dir("concurrent");
        for round in 0..50 {
            let saves: Vec<String> = (0..4).map(|n| format!("{n}-{round}-").repeat(20_000)).collect();
            let writers: Vec<_> = saves
                .iter()
                .map(|save| {
                    let (dir, save) = (dir.clone(), save.clone());
                    std::thread::spawn(move || write(&dir, "autosave", &save[..8], &save))
                })
                .collect();
            for writer in writers {
                writer.join().unwrap().unwrap();
            }
            let save = read(&dir, "autosave").unwrap();
            assert!(saves.contains(&save), "round {round} left a save matching no write");
            let meta = fs::read_to_string(dir.join("autosave.meta.json")).unwrap();
            assert_eq!(meta, save[..8], "round {round} paired a meta with another write's save");
        }
    }

    #[test]
    fn listing_before_any_save_is_empty() {
        assert!(list(&empty_dir("missing")).unwrap().is_empty());
    }

    fn shards(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|(name, value)| (name.to_string(), value.to_string())).collect()
    }

    /// Stand-in hashes: the tests only need one per distinct content.
    fn hashes_of(save: &BTreeMap<String, String>) -> BTreeMap<String, String> {
        save.iter().map(|(name, json)| (name.clone(), format!("hash-of-{json}"))).collect()
    }

    fn write_all(dir: &Path, id: &str, meta: &str, save: &BTreeMap<String, String>) {
        write_shards(dir, id, meta, &hashes_of(save), save).unwrap();
    }

    /// Writes `save` sending only the shards whose hash differs from what the slot holds, as the game client does.
    fn write_changed(dir: &Path, id: &str, meta: &str, save: &BTreeMap<String, String>) -> BTreeMap<String, String> {
        let hashes = hashes_of(save);
        let held = shard_hashes(dir, id).unwrap().unwrap_or_default();
        let changed: BTreeMap<String, String> =
            save.iter().filter(|(name, _)| held.get(*name) != hashes.get(*name)).map(|(n, j)| (n.clone(), j.clone())).collect();
        write_shards(dir, id, meta, &hashes, &changed).unwrap();
        changed
    }

    fn files_in(dir: &Path) -> Vec<String> {
        let mut files: Vec<String> =
            fs::read_dir(dir).unwrap().flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
        files.sort();
        files
    }

    fn first() -> BTreeMap<String, String> {
        shards(&[("game", "game-1"), ("world", "[aa,bb]"), ("country-aa", "aa-1"), ("country-bb", "bb-1"), ("session", "s-1")])
    }

    fn second() -> BTreeMap<String, String> {
        shards(&[("game", "game-2"), ("world", "[aa,bb]"), ("country-aa", "aa-2"), ("country-bb", "bb-1"), ("session", "s-2")])
    }

    #[test]
    fn a_save_in_shards_reads_back_and_lists_its_meta() {
        let dir = empty_dir("shards-roundtrip");
        write_all(&dir, "slot-1", "meta-1", &first());
        assert_eq!(read_save(&dir, "slot-1").unwrap(), StoredSave::Shards(first()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-1".to_string()]);
    }

    #[test]
    fn a_save_again_writes_only_the_shards_that_changed_and_reads_back_whole() {
        let dir = empty_dir("shards-changed");
        write_changed(&dir, "autosave", "meta-1", &first());
        let written = write_changed(&dir, "autosave", "meta-2", &second());
        assert_eq!(written.keys().collect::<Vec<_>>(), ["country-aa", "game", "session"]);
        assert_eq!(read_save(&dir, "autosave").unwrap(), StoredSave::Shards(second()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-2".to_string()]);
        assert_eq!(
            files_in(&dir.join("autosave")),
            ["country-aa.2.json", "country-bb.1.json", "game.2.json", "index.json", "session.2.json", "world.1.json"]
        );
    }

    #[test]
    fn keeping_a_shard_the_slot_does_not_hold_is_refused_and_changes_nothing() {
        let dir = empty_dir("shards-stale");
        write_all(&dir, "slot-1", "meta-1", &first());
        let mut hashes = hashes_of(&second());
        hashes.insert("country-bb".into(), "hash-of-something-else".into());
        assert!(write_shards(&dir, "slot-1", "meta-2", &hashes, &shards(&[("game", "game-2")])).is_err());
        assert!(write_shards(&dir, "slot-1", "meta-2", &BTreeMap::new(), &shards(&[("game", "game-2")])).is_err());
        assert_eq!(read_save(&dir, "slot-1").unwrap(), StoredSave::Shards(first()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-1".to_string()]);
    }

    #[test]
    fn a_crash_after_the_new_shards_but_before_the_index_leaves_the_previous_save_whole() {
        let dir = empty_dir("shards-crash-before-index");
        write_all(&dir, "autosave", "meta-1", &first());
        let slot = dir.join("autosave");
        stage_shards(&slot, "meta-2", &hashes_of(&second()), &second()).unwrap();
        fs::write(slot.join("game.2.4242-0.tmp"), "half a sha").unwrap();
        assert_eq!(read_save(&dir, "autosave").unwrap(), StoredSave::Shards(first()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-1".to_string()]);
        let third = shards(&[("game", "game-3"), ("session", "s-3")]);
        write_changed(&dir, "autosave", "meta-3", &third);
        assert_eq!(read_save(&dir, "autosave").unwrap(), StoredSave::Shards(third));
        assert_eq!(files_in(&slot), ["game.2.json", "index.json", "session.2.json"]);
    }

    #[test]
    fn a_crash_after_the_index_leaves_the_new_save_whole_and_the_next_write_clears_the_old_files() {
        let dir = empty_dir("shards-crash-after-index");
        write_all(&dir, "autosave", "meta-1", &first());
        let slot = dir.join("autosave");
        let index = stage_shards(&slot, "meta-2", &hashes_of(&second()), &second()).unwrap();
        commit_index(&slot, &index).unwrap();
        assert_eq!(read_save(&dir, "autosave").unwrap(), StoredSave::Shards(second()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-2".to_string()]);
        write_changed(&dir, "autosave", "meta-2", &second());
        assert!(files_in(&slot).iter().all(|file| !file.ends_with(".1.json")));
    }

    #[test]
    fn a_save_written_whole_still_loads_and_the_next_save_in_shards_replaces_it() {
        let dir = empty_dir("shards-migrate");
        write(&dir, "slot-1", "meta-whole", "whole save").unwrap();
        assert_eq!(read_save(&dir, "slot-1").unwrap(), StoredSave::Whole("whole save".into()));
        assert_eq!(shard_hashes(&dir, "slot-1").unwrap(), None);
        write_changed(&dir, "slot-1", "meta-shards", &first());
        assert_eq!(read_save(&dir, "slot-1").unwrap(), StoredSave::Shards(first()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-shards".to_string()]);
        assert_eq!(files_in(&dir), ["slot-1"]);
    }

    #[test]
    fn a_crash_between_the_index_and_removing_the_save_written_whole_lists_the_slot_once() {
        let dir = empty_dir("shards-migrate-crash");
        write(&dir, "slot-1", "meta-whole", "whole save").unwrap();
        let slot = dir.join("slot-1");
        let index = stage_shards(&slot, "meta-shards", &hashes_of(&first()), &first()).unwrap();
        commit_index(&slot, &index).unwrap();
        assert_eq!(read_save(&dir, "slot-1").unwrap(), StoredSave::Shards(first()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-shards".to_string()]);
    }

    #[test]
    fn a_save_written_whole_over_one_in_shards_replaces_it() {
        let dir = empty_dir("shards-then-whole");
        write_all(&dir, "slot-1", "meta-shards", &first());
        write(&dir, "slot-1", "meta-whole", "whole save").unwrap();
        assert_eq!(read_save(&dir, "slot-1").unwrap(), StoredSave::Whole("whole save".into()));
        assert_eq!(list(&dir).unwrap(), vec!["meta-whole".to_string()]);
    }

    #[test]
    fn a_deleted_save_in_shards_is_gone() {
        let dir = empty_dir("shards-delete");
        write_all(&dir, "slot-1", "meta-1", &first());
        delete(&dir, "slot-1").unwrap();
        assert!(list(&dir).unwrap().is_empty());
        assert!(read_save(&dir, "slot-1").is_err());
        assert!(!dir.join("slot-1").exists());
    }

    #[test]
    fn shard_names_that_could_leave_the_slot_folder_are_refused() {
        let dir = empty_dir("shards-escape");
        for name in ["../x", "a/b", "a\\b", "a.b", "", "Game", "index.json"] {
            let save = shards(&[(name, "x")]);
            assert!(write_shards(&dir, "slot-1", "meta", &hashes_of(&save), &save).is_err(), "{name:?} was accepted");
        }
        assert!(write_shards(&dir, "../x", "meta", &hashes_of(&first()), &first()).is_err());
        assert!(shard_hashes(&dir, "a/b").is_err());
        assert!(read_save(&dir, "..").is_err());
        assert!(!dir.exists() || files_in(&dir).is_empty());
    }

    #[test]
    fn an_index_naming_a_shard_outside_the_slot_folder_is_refused() {
        let dir = empty_dir("shards-tampered");
        write_all(&dir, "slot-1", "meta-1", &first());
        fs::write(dir.join("secret.1.json"), "secret").unwrap();
        let tampered = r#"{"generation":1,"meta":"m","shards":{"../secret":{"generation":1,"hash":"h"}}}"#;
        fs::write(dir.join("slot-1").join(INDEX), tampered).unwrap();
        assert!(read_save(&dir, "slot-1").is_err());
        assert!(list(&dir).unwrap().is_empty());
    }

    #[test]
    fn concurrent_writes_in_shards_leave_one_whole_save_with_its_meta() {
        let dir = empty_dir("shards-concurrent");
        for round in 0..20 {
            let saves: Vec<BTreeMap<String, String>> = (0..4)
                .map(|n| shards(&[("game", &format!("game-{n}-{round}").repeat(5_000)), ("session", &format!("s-{n}-{round}"))]))
                .collect();
            let writers: Vec<_> = saves
                .iter()
                .enumerate()
                .map(|(n, save)| {
                    let (dir, save) = (dir.clone(), save.clone());
                    std::thread::spawn(move || write_all(&dir, "autosave", &format!("meta-{n}-{round}"), &save))
                })
                .collect();
            for writer in writers {
                writer.join().unwrap();
            }
            let StoredSave::Shards(save) = read_save(&dir, "autosave").unwrap() else {
                panic!("round {round} read back a save written whole");
            };
            let n = saves.iter().position(|written| *written == save).expect("a save matching one write");
            assert_eq!(list(&dir).unwrap(), vec![format!("meta-{n}-{round}")], "round {round} paired a meta with another write's save");
        }
    }
}
