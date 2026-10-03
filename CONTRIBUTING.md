# Contributing to StorageRelief

Thank you for your interest in contributing to **StorageRelief**! We welcome bug reports, new storage bloat detectors, performance improvements, and UI enhancements.

---

## 🛠️ Development Setup

### Prerequisites
1. **Rust**: Version 1.75+ (install via [rustup.rs](https://rustup.rs/))
   - Recommended toolchain on Windows: `stable-x86_64-pc-windows-msvc` or `stable-x86_64-pc-windows-gnu`.
2. **Node.js**: Version 18+ (Node 20+ LTS recommended).
3. **Microsoft Edge WebView2**: Pre-installed on Windows 10/11.

### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/USERNAME/StorageRelief.git
cd StorageRelief

# 2. Install frontend dependencies
npm install

# 3. Run in development mode (with live reload)
npm run dev
# or via PowerShell
.\run.ps1 -Dev
```

---

## 🏗️ Architecture Overview

StorageRelief is designed with a lightweight, multi-threaded separation of concerns:

- **Backend (`src-tauri/src/`)**:
  - `lib.rs`: Implements high-performance recursive disk scanners with strict NTFS junction guards and depth limiters, Win32 disk space APIs, non-panicking logging (`safe_log`), and safe deletion handlers.
  - `main.rs`: Entry point with Windows GUI subsystem declaration.
- **Frontend (`src/`)**:
  - `index.html`: Semantic HTML5 layout with glassmorphic design and dark mode.
  - `styles.css`: Bespoke CSS design tokens, circular drive SVG gauge, animations, and toast notifications.
  - `main.js`: Reactive controller managing scan states, categorization, risk ratings, and Tauri IPC invocations.

---

## 🔒 Golden Safety Rules for New Cleaners

Every proposed storage detection rule must adhere to the **Zero-Risk Principle**:

1. **Never Touch Active User Files:** Do not target generic folders like `Documents` or project sources unless scanning for specific build artifacts (e.g. `flutter_app\build`, `dist`).
2. **Assign Accurate Risk Badges:**
   - `safe` (Zero Risk): Obsolete versions, temporary build cache, scratch files.
   - `review` (User Review Required): Large game installers, virtual environments, heavy repacks.
   - `caution` (High Impact): VM virtual hard drives (`.vhdx`, `.vdi`).
3. **Symlink and Junction Awareness:** Always use `std::fs::symlink_metadata` and check `!is_symlink()` before traversing directories to prevent infinite NTFS recursion.

---

## 📦 Pull Request Process

1. Fork the repo and create your branch from `main`:
   ```bash
   git checkout -b feature/my-cool-detection-rule
   ```
2. Test your changes thoroughly on a local Windows machine.
3. Commit with clear, descriptive messages:
   ```bash
   git commit -m "feat(scanner): add detection for OBS recording cache"
   ```
4. Push to your fork and submit a Pull Request following the PR template.
