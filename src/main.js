// StorageRelief Frontend Controller
// Interacts with Tauri Native Backend

// Safe fallback for browser preview vs Tauri runtime
const isTauri = window.__TAURI__ && window.__TAURI__.core;
const invoke = isTauri ? window.__TAURI__.core.invoke : async (cmd, args) => {
  console.log(`[Mock Tauri Call] ${cmd}`, args);
  return getMockData(cmd, args);
};

// Application State
let state = {
  driveInfo: { total_gb: 447.4, free_gb: 138.1, used_gb: 309.3, percent_free: 30.9 },
  items: [],
  selectedIds: new Set(),
  activeCategory: 'all',
  searchQuery: '',
  isScanning: false,
};

// Category Icons Mapping (SVG paths)
const categoryIcons = {
  ghost_apps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>`,
  caches: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  archives: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
  dev_junk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  virtual_disks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
};

// DOM References
const el = {
  btnScan: document.getElementById('btn-scan'),
  scanIcon: document.querySelector('.icon-spin-target'),
  statusText: document.getElementById('status-text'),
  scanningOverlay: document.getElementById('scanning-overlay'),
  itemsContainer: document.getElementById('items-container'),
  
  // Drive Stats
  gaugePercent: document.getElementById('gauge-percent'),
  gaugeFill: document.getElementById('gauge-fill'),
  statFree: document.getElementById('stat-free'),
  statUsed: document.getElementById('stat-used'),
  statTotal: document.getElementById('stat-total'),
  linearProgress: document.getElementById('drive-linear-progress'),
  
  // Reclaim Box
  totalReclaimText: document.getElementById('total-reclaim-text'),
  itemsFoundCount: document.getElementById('items-found-count'),
  countSafe: document.getElementById('count-safe'),
  countReview: document.getElementById('count-review'),
  countCaution: document.getElementById('count-caution'),
  btnSelectAllSafe: document.getElementById('btn-select-all-safe'),
  btnDeselectAll: document.getElementById('btn-deselect-all'),
  
  // Controls
  filterTabs: document.querySelectorAll('.filter-tab'),
  filterSearch: document.getElementById('filter-search'),
  
  // Tab Badges
  tabAllCount: document.getElementById('tab-all-count'),
  tabGhostCount: document.getElementById('tab-ghost-count'),
  tabCacheCount: document.getElementById('tab-cache-count'),
  tabArchiveCount: document.getElementById('tab-archive-count'),
  tabDevCount: document.getElementById('tab-dev-count'),
  tabVmCount: document.getElementById('tab-vm-count'),
  
  // Footer
  footerSelectedCount: document.getElementById('footer-selected-count'),
  footerSelectedSize: document.getElementById('footer-selected-size'),
  btnClean: document.getElementById('btn-clean'),
  btnCleanText: document.getElementById('btn-clean-text'),
  
  // Modal
  cleanModal: document.getElementById('clean-modal'),
  modalItemsList: document.getElementById('modal-items-list'),
  modalTotalSize: document.getElementById('modal-total-size'),
  btnCancelClean: document.getElementById('btn-cancel-clean'),
  btnConfirmClean: document.getElementById('btn-confirm-clean'),
  modalClose: document.getElementById('modal-close'),
  
  // Celebration
  successModal: document.getElementById('success-modal'),
  celebrationReclaimedText: document.getElementById('celebration-reclaimed-text'),
  btnCelebrationClose: document.getElementById('btn-celebration-close'),
};

// Format Bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initial Boot
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  try {
    await refreshDriveInfo();
  } catch (e) {
    console.warn('Initial drive query notice:', e);
  }
  
  // Slight delay to ensure window paint completes before scan kicks off
  setTimeout(() => {
    runScan();
  }, 250);
});

// Setup Listeners
function setupEventListeners() {
  el.btnScan.addEventListener('click', () => runScan());
  
  el.filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      el.filterTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeCategory = tab.dataset.category;
      renderItemsList();
    });
  });

  el.filterSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderItemsList();
  });

  el.btnSelectAllSafe.addEventListener('click', () => {
    state.items.forEach((item) => {
      if (item.risk_level === 'safe') {
        state.selectedIds.add(item.id);
      }
    });
    updateSelectedSummary();
    renderItemsList();
  });

  el.btnDeselectAll.addEventListener('click', () => {
    state.selectedIds.clear();
    updateSelectedSummary();
    renderItemsList();
  });

  el.btnClean.addEventListener('click', () => openCleanModal());
  el.btnCancelClean.addEventListener('click', () => closeCleanModal());
  el.modalClose.addEventListener('click', () => closeCleanModal());
  el.btnConfirmClean.addEventListener('click', () => executeClean());
  el.btnCelebrationClose.addEventListener('click', () => {
    el.successModal.classList.add('hidden');
  });
}

// Refresh Drive Info
async function refreshDriveInfo() {
  try {
    const info = await invoke('get_drive_info');
    if (info) {
      state.driveInfo = info;
      updateDriveUI();
    }
  } catch (err) {
    console.error('Failed to get drive info:', err);
  }
}

// Update Drive UI
function updateDriveUI() {
  const { free_gb, total_gb, used_gb, percent_free } = state.driveInfo;
  el.gaugePercent.textContent = `${percent_free.toFixed(0)}%`;
  el.statFree.textContent = `${free_gb.toFixed(1)} GB`;
  el.statUsed.textContent = `${used_gb.toFixed(1)} GB`;
  el.statTotal.textContent = `${total_gb.toFixed(1)} GB`;

  // Circular gauge stroke animation
  el.gaugeFill.setAttribute('stroke-dasharray', `${percent_free.toFixed(1)}, 100`);

  // Progress Bar
  const usedPercent = 100 - percent_free;
  el.linearProgress.style.width = `${usedPercent.toFixed(1)}%`;

  // Color warning if full
  if (percent_free < 10) {
    el.gaugeFill.style.stroke = 'var(--accent-rose)';
    el.linearProgress.style.background = 'linear-gradient(90deg, #f43f5e, #e11d48)';
  } else if (percent_free < 20) {
    el.gaugeFill.style.stroke = 'var(--accent-amber)';
    el.linearProgress.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
  } else {
    el.gaugeFill.style.stroke = 'var(--accent-cyan)';
    el.linearProgress.style.background = 'linear-gradient(90deg, var(--accent-cyan), var(--accent-emerald))';
  }
}

// Run Native Storage Scan
async function runScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  el.scanIcon.classList.add('spin');
  el.statusText.textContent = 'Scanning...';
  el.scanningOverlay.classList.remove('hidden');

  try {
    const res = await invoke('scan_storage');
    if (res && res.items) {
      state.items = res.items;
      state.driveInfo = res.drive_info || state.driveInfo;
      
      // Auto-select safe items by default
      state.selectedIds.clear();
      state.items.forEach((item) => {
        if (item.selected) {
          state.selectedIds.add(item.id);
        }
      });

      updateDriveUI();
      updateCategoryCounts();
      updateSelectedSummary();
      renderItemsList();
    }
  } catch (err) {
    console.error('Scan failed:', err);
    showToast(`Scan issue: ${err}`, 'error');
  } finally {
    state.isScanning = false;
    el.scanIcon.classList.remove('spin');
    el.statusText.textContent = 'Ready';
    el.scanningOverlay.classList.add('hidden');
  }
}

// Update Badge Counts
function updateCategoryCounts() {
  const counts = {
    all: state.items.length,
    ghost_apps: 0,
    caches: 0,
    archives: 0,
    dev_junk: 0,
    virtual_disks: 0,
  };

  let safeCount = 0;
  let reviewCount = 0;
  let cautionCount = 0;

  state.items.forEach((item) => {
    if (counts[item.category] !== undefined) {
      counts[item.category]++;
    }
    if (item.risk_level === 'safe') safeCount++;
    if (item.risk_level === 'review') reviewCount++;
    if (item.risk_level === 'caution') cautionCount++;
  });

  el.tabAllCount.textContent = counts.all;
  el.tabGhostCount.textContent = counts.ghost_apps;
  el.tabCacheCount.textContent = counts.caches;
  el.tabArchiveCount.textContent = counts.archives;
  el.tabDevCount.textContent = counts.dev_junk;
  el.tabVmCount.textContent = counts.virtual_disks;

  el.itemsFoundCount.textContent = `${counts.all} Items Detected`;
  el.countSafe.textContent = `${safeCount} Zero-Risk`;
  el.countReview.textContent = `${reviewCount} User Review`;
  el.countCaution.textContent = `${cautionCount} Virtual Disks`;
}

// Update Reclaim Summary & Action Buttons
function updateSelectedSummary() {
  let selectedBytes = 0;
  state.items.forEach((item) => {
    if (state.selectedIds.has(item.id)) {
      selectedBytes += item.size_bytes;
    }
  });

  const formatted = formatBytes(selectedBytes);
  el.totalReclaimText.textContent = formatted;
  el.footerSelectedCount.textContent = `${state.selectedIds.size} items`;
  el.footerSelectedSize.textContent = formatted;

  if (state.selectedIds.size > 0) {
    el.btnClean.disabled = false;
    el.btnCleanText.textContent = `Clean Selected (${formatted})`;
  } else {
    el.btnClean.disabled = true;
    el.btnCleanText.textContent = 'Clean Selected (0.00 GB)';
  }
}

// Render Storage Items List
function renderItemsList() {
  const filtered = state.items.filter((item) => {
    const matchesCat = state.activeCategory === 'all' || item.category === state.activeCategory;
    const matchesQuery = !state.searchQuery || 
      item.name.toLowerCase().includes(state.searchQuery) || 
      item.path.toLowerCase().includes(state.searchQuery);
    return matchesCat && matchesQuery;
  });

  if (filtered.length === 0) {
    el.itemsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3>No storage waste found</h3>
        <p>This category is clean! Switch tabs or perform a fresh scan anytime.</p>
      </div>
    `;
    return;
  }

  el.itemsContainer.innerHTML = '';
  filtered.forEach((item) => {
    const card = document.createElement('div');
    const isChecked = state.selectedIds.has(item.id);
    card.className = `storage-item-card ${isChecked ? 'is-selected' : ''}`;

    const iconSvg = categoryIcons[item.category] || categoryIcons.caches;

    card.innerHTML = `
      <div class="item-left">
        <input type="checkbox" class="custom-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} />
        <div class="item-cat-icon ${item.category}">
          ${iconSvg}
        </div>
        <div class="item-details">
          <div class="item-title-row">
            <span class="item-title">${escapeHtml(item.name)}</span>
            <span class="item-badge-risk ${item.risk_level}">${item.risk_level}</span>
          </div>
          <span class="item-desc">${escapeHtml(item.description)}</span>
          <span class="item-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</span>
        </div>
      </div>

      <div class="item-right">
        <span class="item-size">${item.size_formatted}</span>
        <button class="btn-open-explorer" data-path="${escapeHtml(item.path)}" title="Open folder in File Explorer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
      </div>
    `;

    // Checkbox toggle
    const checkbox = card.querySelector('.custom-checkbox');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.selectedIds.add(item.id);
        card.classList.add('is-selected');
      } else {
        state.selectedIds.delete(item.id);
        card.classList.remove('is-selected');
      }
      updateSelectedSummary();
    });

    // Explorer launch button
    const btnExplorer = card.querySelector('.btn-open-explorer');
    btnExplorer.addEventListener('click', (e) => {
      e.stopPropagation();
      invoke('open_item_path', { path: item.path });
    });

    el.itemsContainer.appendChild(card);
  });
}

// Modal Handling
function openCleanModal() {
  const selectedItems = state.items.filter((i) => state.selectedIds.has(i.id));
  if (selectedItems.length === 0) return;

  el.modalItemsList.innerHTML = '';
  let totalBytes = 0;

  selectedItems.forEach((item) => {
    totalBytes += item.size_bytes;
    const row = document.createElement('div');
    row.className = 'preview-row';
    row.innerHTML = `
      <span class="preview-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span>
      <span class="preview-size">${item.size_formatted}</span>
    `;
    el.modalItemsList.appendChild(row);
  });

  el.modalTotalSize.textContent = formatBytes(totalBytes);
  el.cleanModal.classList.remove('hidden');
}

function closeCleanModal() {
  el.cleanModal.classList.add('hidden');
}

// Execute Clean
async function executeClean() {
  const selectedItems = state.items.filter((i) => state.selectedIds.has(i.id));
  const paths = selectedItems.map((i) => i.path);
  const totalReclaimed = selectedItems.reduce((acc, i) => acc + i.size_bytes, 0);

  el.btnConfirmClean.disabled = true;
  el.btnConfirmClean.textContent = 'Cleaning...';

  try {
    await invoke('clean_selected_items', { paths });
    closeCleanModal();

    // Show celebration modal
    el.celebrationReclaimedText.textContent = `+${formatBytes(totalReclaimed)}`;
    el.successModal.classList.remove('hidden');

    // Trigger fresh scan
    await refreshDriveInfo();
    await runScan();
  } catch (err) {
    console.error('Clean operation encountered an issue:', err);
    showToast(`Clean issue: ${err}`, 'error');
  } finally {
    el.btnConfirmClean.disabled = false;
    el.btnConfirmClean.textContent = 'Proceed with Clean';
  }
}

// In-App Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = type === 'error'
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : type === 'success'
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(String(message))}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px) scale(0.95)';
    setTimeout(() => toast.remove(), 250);
  }, 4500);
}

// Global safety net for webview stability
window.addEventListener('error', (e) => {
  console.warn('[StorageRelief UI Notice]:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.warn('[StorageRelief UI Notice (Promise)]:', e.reason);
});

// Escape HTML utility
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Mock data generator for browser preview
function getMockData(cmd, args) {
  if (cmd === 'get_drive_info') {
    return {
      total_bytes: 480436977664,
      free_bytes: 148239474688,
      used_bytes: 332197502976,
      total_gb: 447.4,
      free_gb: 138.1,
      used_gb: 309.3,
      percent_free: 30.9,
    };
  }
  if (cmd === 'scan_storage') {
    return {
      drive_info: { total_gb: 447.4, free_gb: 138.1, used_gb: 309.3, percent_free: 30.9 },
      items: [
        {
          id: 'mock_1',
          name: 'CapCut Legacy v9.4.0.4015',
          path: 'C:\\Users\\Asus\\AppData\\Local\\CapCut\\Apps\\9.4.0.4015',
          size_bytes: 1610612736,
          size_formatted: '1.50 GB',
          category: 'ghost_apps',
          risk_level: 'safe',
          description: 'Obsolete previous version installer kept after auto-update',
          selected: true,
        },
        {
          id: 'mock_2',
          name: 'CapCut Video Project Cache',
          path: 'C:\\Users\\Asus\\AppData\\Local\\CapCut\\User Data\\Cache',
          size_bytes: 17179869184,
          size_formatted: '16.00 GB',
          category: 'caches',
          risk_level: 'safe',
          description: 'Temporary timeline proxies and effect caches',
          selected: true,
        },
      ],
      total_reclaimable_bytes: 18790481920,
      total_reclaimable_formatted: '17.50 GB',
    };
  }
  return null;
}
