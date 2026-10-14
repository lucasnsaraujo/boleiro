mod slots;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            slots::list_slots,
            slots::write_slot,
            slots::write_slot_shards,
            slots::slot_shard_hashes,
            slots::read_slot,
            slots::delete_slot
        ])
        .run(tauri::generate_context!())
        .expect("error while running Boleiro");
}
