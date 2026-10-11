//! Save slots as files under `<app data dir>/saves`: `<id>.save.json` holds the game and
//! `<id>.meta.json` the small summary the start menu lists.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const SAVE_SUFFIX: &str = ".save.json";
const META_SUFFIX: &str = ".meta.json";

/// Tauri runs async commands in parallel, so two autosaves can overlap. Writes take turns,
/// which also keeps each meta file paired with the save written next to it.
static WRITE_TURN: Mutex<()> = Mutex::new(());
static TEMPORARY_COUNT: AtomicU64 = AtomicU64::new(0);

/// Same rule as `assertSlotId` in `ui/saves/slotMeta.ts`: ids become file names, so no dots or slashes.
fn check_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if valid {
        Ok(())
    } else {
        Err(format!("invalid slot id \"{id}\""))
    }
}

/// Writes through a temporary file of its own, synced to disk before the rename, so a crash
/// mid-write never leaves half a save behind.
fn write_atomically(path: &Path, contents: &str) -> Result<(), String> {
    let count = TEMPORARY_COUNT.fetch_add(1, Ordering::Relaxed);
    let temporary = path.with_extension(format!("{}-{count}.tmp", std::process::id()));
    let mut file = File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}

fn write(dir: &Path, id: &str, meta: &str, save: &str) -> Result<(), String> {
    check_id(id)?;
    let _turn = WRITE_TURN.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    write_atomically(&dir.join(format!("{id}{SAVE_SUFFIX}")), save)?;
    write_atomically(&dir.join(format!("{id}{META_SUFFIX}")), meta)
}

fn read(dir: &Path, id: &str) -> Result<String, String> {
    check_id(id)?;
    fs::read_to_string(dir.join(format!("{id}{SAVE_SUFFIX}"))).map_err(|_| format!("no save in slot {id}"))
}

fn list(dir: &Path) -> Result<Vec<String>, String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(Vec::new());
    };
    Ok(entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(META_SUFFIX))
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .collect())
}

fn delete(dir: &Path, id: &str) -> Result<(), String> {
    check_id(id)?;
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
pub async fn read_slot(app: AppHandle, id: String) -> Result<String, String> {
    read(&saves_dir(&app)?, &id)
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
}
