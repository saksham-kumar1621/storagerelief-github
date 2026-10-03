# Changelog

All notable changes to **StorageRelief** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-03

### Added
- **Native Tauri v2 + Rust Core**: High-speed multi-threaded disk crawler with low memory footprint (~40 MB RAM).
- **Drive Info Dashboard**: Real-time Win32 `GetDiskFreeSpaceExW` query with circular SVG capacity gauge and percentage breakdown.
- **Ghost App Detector**: Identifies accumulated obsolete previous version folders (e.g. CapCut legacy versions).
- **Package & Build Cache Hunter**: Safely finds Gradle, npm, pip, uv, and temporary Windows scratch space.
- **Large Installer & Repack Scanner**: Uncovers leftover setup `.exe`, `.msi`, `.iso`, and repack directories (>300 MB).
- **Dev Junk Cleaner**: Discovers rebuildable `.venv`, `node_modules`, Flutter, and Rust build targets.
- **Virtual Disk Manager**: Flags large Android emulator (`.vdi`) and WSL (`.vhdx`) virtual disk files.
- **Safety System**:
  - Recursive read-only attribute unlocking for Windows paths.
  - NTFS Junction & symlink bypass to prevent recursive loops.
  - Three-tier safety ratings (`Safe`, `Review`, `Caution`).
  - Pre-clean preview modal with confirmation step.
  - Direct folder inspection button via `explorer.exe`.
- **Modern Glassmorphic Dark UI**: Custom typography, category filter tabs, interactive search bar, and toast notification alerts.
- **Packaged Deliverables**: Portable standalone `.exe` (13 MB) and NSIS Windows Setup Wizard (3.4 MB).
