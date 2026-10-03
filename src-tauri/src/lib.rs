use std::ffi::OsStr;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[link(name = "kernel32")]
extern "system" {
    fn GetDiskFreeSpaceExW(
        lpDirectoryName: *const u16,
        lpFreeBytesAvailableToCaller: *mut u64,
        lpTotalNumberOfBytes: *mut u64,
        lpTotalNumberOfFreeBytes: *mut u64,
    ) -> i32;
}

/// Thread-safe and non-panicking logger
/// Crucial for Windows GUI applications without an attached console buffer
fn safe_log(msg: &str) {
    // 1. Attempt non-panicking write to stdout (ignore if handle is invalid / no console attached)
    let _ = writeln!(std::io::stdout(), "{}", msg);

    // 2. Safe persistent logging to %LOCALAPPDATA%\com.storagerelief.app\storage_relief.log
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let dir = PathBuf::from(local).join("com.storagerelief.app");
        let _ = std::fs::create_dir_all(&dir);
        let log_file = dir.join("storage_relief.log");
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(log_file) {
            let _ = writeln!(file, "{}", msg);
        }
    }
}

/// Windows-safe recursive deletion with read-only flag unlocking
fn safe_remove_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    fn unlock_readonly_recursive(p: &Path) {
        if let Ok(meta) = std::fs::symlink_metadata(p) {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(p, perms);
            }
            if meta.is_dir() && !meta.is_symlink() {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() {
                        unlock_readonly_recursive(&entry.path());
                    }
                }
            }
        }
    }

    unlock_readonly_recursive(path);

    let res = if path.is_file() || path.is_symlink() {
        std::fs::remove_file(path)
    } else if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        Ok(())
    };

    res.map_err(|e| format!("{}: {}", path.display(), e))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DriveInfo {
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub total_gb: f64,
    pub free_gb: f64,
    pub used_gb: f64,
    pub percent_free: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StorageItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub category: String, // "ghost_apps", "caches", "dev_junk", "archives", "virtual_disks"
    pub category_label: String,
    pub risk_level: String, // "safe", "review", "caution"
    pub description: String,
    pub selected: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScanResult {
    pub drive_info: DriveInfo,
    pub items: Vec<StorageItem>,
    pub total_reclaimable_bytes: u64,
    pub total_reclaimable_formatted: String,
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Robust and safe recursive directory size calculator with:
/// 1. Strict symlink and NTFS junction bypass (prevents infinite recursion)
/// 2. Max depth guard (prevents stack overflow)
/// 3. Error tolerance for locked files
fn get_dir_size_safe(path: &Path, depth: usize, max_depth: usize) -> u64 {
    if depth > max_depth {
        return 0;
    }

    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return 0,
    };

    if meta.is_symlink() {
        return 0;
    }

    if meta.is_file() {
        return meta.len();
    }

    if !meta.is_dir() {
        return 0;
    }

    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(ft) = entry.file_type() {
                if ft.is_symlink() {
                    continue; // Skip all symlinks & junctions!
                }
                if ft.is_file() {
                    total += entry.metadata().map(|m| m.len()).unwrap_or(0);
                } else if ft.is_dir() {
                    total += get_dir_size_safe(&p, depth + 1, max_depth);
                }
            }
        }
    }
    total
}

#[tauri::command]
fn get_drive_info() -> Result<DriveInfo, String> {
    let drive = "C:\\";
    let wide: Vec<u16> = OsStr::new(drive).encode_wide().chain(std::iter::once(0)).collect();
    let mut free_caller: u64 = 0;
    let mut total: u64 = 0;
    let mut total_free: u64 = 0;

    let res = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_caller,
            &mut total,
            &mut total_free,
        )
    };

    if res == 0 {
        return Err("Failed to query drive space via Windows API".into());
    }

    let used = total.saturating_sub(total_free);
    let gb_divisor = 1024.0 * 1024.0 * 1024.0;
    let total_gb = total as f64 / gb_divisor;
    let free_gb = total_free as f64 / gb_divisor;
    let used_gb = used as f64 / gb_divisor;
    let percent_free = if total > 0 { (total_free as f64 / total as f64) * 100.0 } else { 0.0 };

    Ok(DriveInfo {
        total_bytes: total,
        free_bytes: total_free,
        used_bytes: used,
        total_gb: (total_gb * 100.0).round() / 100.0,
        free_gb: (free_gb * 100.0).round() / 100.0,
        used_gb: (used_gb * 100.0).round() / 100.0,
        percent_free: (percent_free * 10.0).round() / 10.0,
    })
}

#[tauri::command]
async fn scan_storage() -> Result<ScanResult, String> {
    safe_log("[Scan] Starting background scan task...");
    tauri::async_runtime::spawn_blocking(move || {
        safe_log("[Scan] Step 1: Getting drive info...");
        let drive_info = get_drive_info()?;
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".into());
        let user_path = PathBuf::from(&user_profile);
        let mut items = Vec::new();
        let mut id_counter = 0;

        safe_log("[Scan] Step 2: Scanning Ghost Apps...");
        let capcut_apps = user_path.join("AppData\\Local\\CapCut\\Apps");
        if capcut_apps.exists() && capcut_apps.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&capcut_apps) {
                let mut versions: Vec<PathBuf> = entries
                    .flatten()
                    .filter(|e| e.path().is_dir())
                    .map(|e| e.path())
                    .collect();
                
                versions.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
                if versions.len() > 1 {
                    let oldest = &versions[..versions.len() - 1];
                    for old in oldest {
                        let sz = get_dir_size_safe(old, 0, 4);
                        if sz > 10 * 1024 * 1024 {
                            id_counter += 1;
                            items.push(StorageItem {
                                id: format!("item_{}", id_counter),
                                name: format!("CapCut Legacy v{}", old.file_name().and_then(|n| n.to_str()).unwrap_or("unknown")),
                                path: old.to_string_lossy().to_string(),
                                size_bytes: sz,
                                size_formatted: format_bytes(sz),
                                category: "ghost_apps".into(),
                                category_label: "Ghost App Version".into(),
                                risk_level: "safe".into(),
                                description: "Obsolete previous version installer kept after auto-update".into(),
                                selected: true,
                            });
                        }
                    }
                }
            }
        }

        safe_log("[Scan] Step 3: Scanning caches...");
        // Package & Build Caches (max depth 4)
        let cache_targets = vec![
            (user_path.join("AppData\\Local\\CapCut\\User Data\\Cache"), "CapCut Video Project Cache", "caches", "safe", "Temporary timeline proxies and effect caches"),
            (user_path.join("AppData\\Local\\uv\\cache"), "uv Python Package Cache", "caches", "safe", "Cached Python wheels and binaries"),
            (user_path.join("AppData\\Local\\npm-cache"), "npm Package Cache", "caches", "safe", "Cached Node.js npm packages"),
            (user_path.join("AppData\\Local\\pip\\cache"), "pip Package Cache", "caches", "safe", "Cached Python pip downloads"),
            (user_path.join(".gradle\\caches"), "Gradle Build Cache", "caches", "safe", "Cached Android/Java gradle dependencies"),
            (PathBuf::from("C:\\Temp"), "Root Temp Directory", "caches", "safe", "Windows root temporary scratch space"),
            (PathBuf::from("C:\\tmp"), "Root tmp Directory", "caches", "safe", "Windows root tmp scratch space"),
            (user_path.join("OneDrive\\Desktop\\.tmp.driveupload"), "OneDrive Sync Upload Temp", "caches", "safe", "Interrupted OneDrive cloud upload cache"),
        ];

        for (p, name, cat, risk, desc) in cache_targets {
            if p.exists() {
                let sz = get_dir_size_safe(&p, 0, 4);
                if sz > 5 * 1024 * 1024 {
                    id_counter += 1;
                    items.push(StorageItem {
                        id: format!("item_{}", id_counter),
                        name: name.into(),
                        path: p.to_string_lossy().to_string(),
                        size_bytes: sz,
                        size_formatted: format_bytes(sz),
                        category: cat.into(),
                        category_label: "Cache & Temp".into(),
                        risk_level: risk.into(),
                        description: desc.into(),
                        selected: true,
                    });
                }
            }
        }

        safe_log("[Scan] Step 4: Scanning heavy archives in Downloads/Desktop...");
        // Heavy Repacks, Installers & Large Archives (> 300 MB)
        let scan_dirs = vec![
            user_path.join("Downloads"),
            user_path.join("Desktop"),
            user_path.join("OneDrive\\Desktop"),
        ];

        for dir in scan_dirs {
            if !dir.exists() {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let sz = if p.is_file() {
                        entry.metadata().map(|m| m.len()).unwrap_or(0)
                    } else if p.is_dir() {
                        get_dir_size_safe(&p, 0, 3)
                    } else {
                        0
                    };

                    if sz > 300 * 1024 * 1024 {
                        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
                        
                        let is_installer_or_archive = matches!(ext.as_str(), "bin" | "iso" | "zip" | "rar" | "exe" | "msi" | "7z" | "tar" | "gz")
                            || (p.is_dir() && (fname.to_lowercase().contains("repack") || fname.to_lowercase().contains("setup") || fname.to_lowercase().contains("installer") || fname.to_lowercase().contains("extracted")));

                        if is_installer_or_archive {
                            id_counter += 1;
                            items.push(StorageItem {
                                id: format!("item_{}", id_counter),
                                name: fname.into(),
                                path: p.to_string_lossy().to_string(),
                                size_bytes: sz,
                                size_formatted: format_bytes(sz),
                                category: "archives".into(),
                                category_label: "Heavy Installer/Archive".into(),
                                risk_level: "review".into(),
                                description: "Large downloaded installer or archive. Safe to remove if already installed.".into(),
                                selected: false,
                            });
                        }
                    }
                }
            }
        }

        safe_log("[Scan] Step 5: Scanning developer project roots...");
        // Developer Artifacts & Heavy Build Output
        let project_roots = vec![
            user_path.join("OneDrive\\Desktop\\Projects"),
            user_path.join("Desktop\\Projects"),
            user_path.join("Projects"),
        ];

        for root in project_roots {
            if !root.exists() {
                continue;
            }
            if let Ok(projects) = std::fs::read_dir(&root) {
                for proj in projects.flatten() {
                    let proj_path = proj.path();
                    if !proj_path.is_dir() {
                        continue;
                    }
                    
                    let p_name = proj_path.file_name().and_then(|n| n.to_str()).unwrap_or("project");
                    // Do not scan or suggest deleting storage-relief's own running target/dist
                    if p_name.to_lowercase() == "storage-relief" {
                        continue;
                    }

                    let build_targets = vec![
                        (proj_path.join("flutter_app\\build"), "Flutter Build Cache", "dev_junk", "safe", "Rebuildable compiled Flutter APK/debug binaries"),
                        (proj_path.join("build"), "Build Directory", "dev_junk", "safe", "Compiled output binaries"),
                        (proj_path.join("dist"), "Dist Package Output", "dev_junk", "safe", "Compiled distribution artifacts"),
                        (proj_path.join("src-tauri\\target"), "Rust/Tauri Target Cache", "dev_junk", "safe", "Rebuildable cargo build artifacts"),
                        (proj_path.join(".venv"), "Python Virtual Environment", "dev_junk", "review", "Virtual environment (can be re-created via requirements.txt)"),
                        (proj_path.join("node_modules"), "Node Modules Folder", "dev_junk", "review", "Node.js dependencies (can be reinstalled via npm install)"),
                    ];

                    for (bt, label, cat, risk, desc) in build_targets {
                        if bt.exists() && bt.is_dir() {
                            let sz = get_dir_size_safe(&bt, 0, 4);
                            if sz > 50 * 1024 * 1024 {
                                id_counter += 1;
                                items.push(StorageItem {
                                    id: format!("item_{}", id_counter),
                                    name: format!("{} / {}", p_name, label),
                                    path: bt.to_string_lossy().to_string(),
                                    size_bytes: sz,
                                    size_formatted: format_bytes(sz),
                                    category: cat.into(),
                                    category_label: "Dev Build/Cache".into(),
                                    risk_level: risk.into(),
                                    description: desc.into(),
                                    selected: risk == "safe",
                                });
                            }
                        }
                    }
                }
            }
        }

        safe_log("[Scan] Step 6: Scanning virtual disks...");
        // Virtual Machines & Emulators
        let vm_targets = vec![
            (PathBuf::from("C:\\Program Files\\Netease\\MuMuPlayer\\vms"), "MuMuPlayer VM Disks", "virtual_disks", "review", "Android emulator virtual hard drive (.vdi)"),
            (user_path.join("AppData\\Local\\wsl"), "WSL Virtual Hard Drive", "virtual_disks", "caution", "Windows Subsystem for Linux ext4.vhdx storage disk"),
        ];

        for (p, name, cat, risk, desc) in vm_targets {
            if p.exists() {
                let sz = get_dir_size_safe(&p, 0, 3);
                if sz > 500 * 1024 * 1024 {
                    id_counter += 1;
                    items.push(StorageItem {
                        id: format!("item_{}", id_counter),
                        name: name.into(),
                        path: p.to_string_lossy().to_string(),
                        size_bytes: sz,
                        size_formatted: format_bytes(sz),
                        category: cat.into(),
                        category_label: "Virtual Machine / Emulator".into(),
                        risk_level: risk.into(),
                        description: desc.into(),
                        selected: false,
                    });
                }
            }
        }

        safe_log(&format!("[Scan] Scan complete! Found {} items.", items.len()));
        items.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        let total_reclaimable: u64 = items.iter().filter(|i| i.selected).map(|i| i.size_bytes).sum();

        Ok(ScanResult {
            drive_info,
            items,
            total_reclaimable_bytes: total_reclaimable,
            total_reclaimable_formatted: format_bytes(total_reclaimable),
        })
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
async fn clean_selected_items(paths: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut deleted = Vec::new();
        let mut errors = Vec::new();

        for p_str in paths {
            let p = Path::new(&p_str);
            if !p.exists() {
                deleted.push(p_str);
                continue;
            }

            match safe_remove_path(p) {
                Ok(_) => {
                    safe_log(&format!("[Clean] Removed: {}", p_str));
                    deleted.push(p_str);
                }
                Err(e) => {
                    safe_log(&format!("[Clean] Error removing {}: {}", p_str, e));
                    errors.push(e);
                }
            }
        }

        if !errors.is_empty() && deleted.is_empty() {
            return Err(format!("Errors deleting files: {}", errors.join("; ")));
        }

        Ok(deleted)
    }).await.map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
fn open_item_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Item path does not exist on disk".into());
    }

    let target = if p.is_file() {
        p.parent().unwrap_or(p)
    } else {
        p
    };

    std::process::Command::new("explorer.exe")
        .arg(target)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Global panic hook: logs to persistent app log instead of terminating silently
    std::panic::set_hook(Box::new(|info| {
        safe_log(&format!("[CRITICAL PANIC] {}", info));
    }));

    safe_log("[StorageRelief] App booting up...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_drive_info,
            scan_storage,
            clean_selected_items,
            open_item_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running storage-relief application");
}
