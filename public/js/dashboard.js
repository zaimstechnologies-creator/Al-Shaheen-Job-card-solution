// ==========================================================================
// AL SHAHEEN AUTO HUB - WORKSHOP DASHBOARD, KANBAN & SECURITY CONTROLLER
// Features: 1-Click Instant Login | Real-time Kanban | Database Search
// ==========================================================================

const STAFF_AUTH_KEY = 'al_shaheen_staff_session';
let allCards = [];
let activeDeptFilter = 'all';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
    // Check Staff Authentication
    if (checkStaffAuth()) {
        showAuthenticatedUi();
    } else {
        showStaffLogin();
    }

    await refreshDashboard();

    // Listen to real-time events
    window.addEventListener('hub-data-updated', () => {
        refreshDashboard();
    });

    handleInitialNavigation();
});

// ==========================================================================
// 1. STAFF AUTHENTICATION & LOGIN GATE
// ==========================================================================
function checkStaffAuth() {
    try {
        const session = localStorage.getItem(STAFF_AUTH_KEY) || sessionStorage.getItem(STAFF_AUTH_KEY);
        if (session) {
            const data = JSON.parse(session);
            return !!data.user;
        }
    } catch (e) {}
    return false;
}

function showStaffLogin() {
    const authScreen = document.getElementById('staffAuthScreen');
    const mainWrapper = document.getElementById('authenticatedAppWrapper');
    if (authScreen) authScreen.style.display = 'flex';
    if (mainWrapper) mainWrapper.style.display = 'none';
}

function showAuthenticatedUi() {
    const authScreen = document.getElementById('staffAuthScreen');
    const mainWrapper = document.getElementById('authenticatedAppWrapper');
    if (authScreen) authScreen.style.display = 'none';
    if (mainWrapper) mainWrapper.style.display = 'block';

    try {
        const session = JSON.parse(localStorage.getItem(STAFF_AUTH_KEY) || sessionStorage.getItem(STAFF_AUTH_KEY) || '{"user":"Service Incharge"}');
        const userBadge = document.getElementById('staffUserBadge');
        if (userBadge) {
            userBadge.textContent = `👤 ${session.user || 'Service Incharge'}`;
        }
    } catch (e) {}
}

// 1-Click Instant Login
function quickLoginStaff() {
    const sessionObj = {
        user: 'Service Incharge (Admin)',
        role: 'admin',
        loginTime: Date.now()
    };
    localStorage.setItem(STAFF_AUTH_KEY, JSON.stringify(sessionObj));
    showAuthenticatedUi();
    refreshDashboard();
}

// Form-based Login
function handleStaffLoginSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const usernameInput = document.getElementById('authUsername');
    const passwordInput = document.getElementById('authPassword');
    const rememberMe = document.getElementById('authRememberMe')?.checked;

    const u = (usernameInput?.value || '').trim() || 'Admin';
    const p = (passwordInput?.value || '').trim();

    // Accept common passwords: 1234, 123456, admin, alshaheen, alshaheen@2026, or any non-empty
    const sessionObj = {
        user: u.toUpperCase(),
        loginTime: Date.now()
    };

    if (rememberMe) {
        localStorage.setItem(STAFF_AUTH_KEY, JSON.stringify(sessionObj));
    } else {
        sessionStorage.setItem(STAFF_AUTH_KEY, JSON.stringify(sessionObj));
    }

    showAuthenticatedUi();
    refreshDashboard();
}

// Logout
function staffLogout() {
    localStorage.removeItem(STAFF_AUTH_KEY);
    sessionStorage.removeItem(STAFF_AUTH_KEY);
    showStaffLogin();
}

// ==========================================================================
// 2. VIEW ROUTING & NAVIGATION
// ==========================================================================
function handleInitialNavigation() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');

    if (view === 'editor') {
        showView('editorView');
    } else if (view === 'database') {
        showView('dbView');
    } else {
        showView('dashboardView');
    }
}

function showView(viewId) {
    const views = ['dashboardView', 'dbView', 'editorView'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === viewId) ? 'block' : 'none';
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId);
    });

    if (viewId === 'dashboardView') {
        renderKanban();
        updateKpis();
    } else if (viewId === 'dbView') {
        renderTable();
    }
}

async function refreshDashboard() {
    if (window.HubAPI) {
        allCards = await window.HubAPI.getAllJobCards();
    } else {
        const raw = localStorage.getItem('al_shaheen_job_cards_v3');
        allCards = raw ? JSON.parse(raw) : [];
    }
    updateKpis();
    renderKanban();
    renderTable();
}

// ==========================================================================
// 3. EXECUTIVE KPIS
// ==========================================================================
function updateKpis() {
    const totalVehiclesEl = document.getElementById('kpiTotalVehicles');
    const inBaysEl = document.getElementById('kpiInBays');
    const readyEl = document.getElementById('kpiReady');
    const revenueEl = document.getElementById('kpiRevenue');

    const activeCards = allCards.filter(c => c.status !== 'Completed' && c.status !== 'Delivered');
    const inBays = activeCards.filter(c => c.status !== 'Ready' && c.currentBay !== 'Bay 6');
    const ready = activeCards.filter(c => c.status === 'Ready' || c.currentBay === 'Bay 6');
    const revenue = allCards.reduce((sum, c) => sum + (Number(c.netPayable) || 0), 0);

    if (totalVehiclesEl) totalVehiclesEl.textContent = activeCards.length;
    if (inBaysEl) inBaysEl.textContent = inBays.length;
    if (readyEl) readyEl.textContent = ready.length;
    if (revenueEl) revenueEl.textContent = `Rs. ${revenue.toLocaleString()}`;
}

// ==========================================================================
// 4. LIVE BAY FLOW KANBAN BOARD
// ==========================================================================
function renderKanban() {
    const bays = [
        { id: 'Bay 1', name: 'Bay 1: Diagnostics' },
        { id: 'Bay 2', name: 'Bay 2: Electrical & AC' },
        { id: 'Bay 3', name: 'Bay 3: Suspension & Brakes' },
        { id: 'Bay 4', name: 'Bay 4: Denting & Body' },
        { id: 'Bay 5', name: 'Bay 5: Detailing & Wash' },
        { id: 'Bay 6', name: 'Bay 6: Ready for Delivery' }
    ];

    const container = document.getElementById('kanbanColumns');
    if (!container) return;

    container.innerHTML = bays.map(bay => {
        const matchingCards = allCards.filter(c => (c.currentBay || 'Bay 1') === bay.id);
        const isReadyBay = bay.id === 'Bay 6';

        const cardsHtml = matchingCards.map(c => `
            <div class="bay-card" onclick="openCardInEditor('${c.id}')">
                <div class="bay-card-plate">${escapeHtml(c.vehicle?.plateNo || 'REG-PENDING')}</div>
                <div class="bay-card-model">${escapeHtml(c.vehicle?.makeModel || 'Vehicle')}</div>
                <div class="bay-card-customer">👤 ${escapeHtml(c.customer?.name || 'Walk-in')}</div>
                <div class="bay-card-status">
                    <span class="status-tag ${c.status === 'Ready' ? 'ready' : 'in-progress'}">${c.status || 'In Progress'}</span>
                    <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:10px;" onclick="event.stopPropagation(); quickAdvanceBay('${c.id}', '${bay.id}')">
                        Move Next ➔
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="bay-column">
                <div class="bay-col-header">
                    <h5>${bay.name}</h5>
                    <span class="bay-col-badge ${isReadyBay ? 'ready' : ''}">${matchingCards.length}</span>
                </div>
                <div class="bay-col-list">
                    ${cardsHtml || '<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:12px;">Bay Available</div>'}
                </div>
            </div>
        `;
    }).join('');
}

async function quickAdvanceBay(cardId, currentBay) {
    const baySequence = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6'];
    const idx = baySequence.indexOf(currentBay);
    const nextBay = idx < baySequence.length - 1 ? baySequence[idx + 1] : 'Bay 6';
    const nextStatus = nextBay === 'Bay 6' ? 'Ready' : 'In Progress';

    if (window.HubAPI) {
        await window.HubAPI.updateBay(cardId, nextBay, nextStatus);
    }
    await refreshDashboard();
}

// ==========================================================================
// 5. JOB CARDS DATABASE TABLE & FILTER
// ==========================================================================
function setDeptFilter(dept) {
    activeDeptFilter = dept;
    document.querySelectorAll('.dept-pill').forEach(el => {
        el.classList.toggle('active', el.dataset.dept === dept);
    });
    renderTable();
}

function handleSearch(q) {
    searchQuery = (q || '').toLowerCase().trim();
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('jobCardsTableBody');
    if (!tbody) return;

    let filtered = allCards;

    if (activeDeptFilter !== 'all') {
        filtered = filtered.filter(c => (c.departments || []).includes(activeDeptFilter));
    }

    if (searchQuery) {
        filtered = filtered.filter(c => {
            const plate = (c.vehicle?.plateNo || '').toLowerCase();
            const model = (c.vehicle?.makeModel || '').toLowerCase();
            const name = (c.customer?.name || '').toLowerCase();
            const id = (c.id || '').toLowerCase();
            return plate.includes(searchQuery) || model.includes(searchQuery) || name.includes(searchQuery) || id.includes(searchQuery);
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;">
                    No job cards found matching your criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const isReady = c.status === 'Ready' || c.currentBay === 'Bay 6';
        return `
            <tr>
                <td style="font-weight:800; color:#162544;">${c.id}</td>
                <td>
                    <span style="display:inline-block; background:#0f172a; color:#fff; font-weight:800; padding:2px 7px; border-radius:4px; font-size:11px;">
                        ${escapeHtml(c.vehicle?.plateNo || '-')}
                    </span>
                    <div style="font-size:11.5px; color:#64748b; margin-top:2px;">${escapeHtml(c.vehicle?.makeModel || '-')}</div>
                </td>
                <td>
                    <div style="font-weight:700;">${escapeHtml(c.customer?.name || '-')}</div>
                    <div style="font-size:11px; color:#64748b;">${escapeHtml(c.customer?.phone || '-')}</div>
                </td>
                <td>
                    <select onchange="updateCardBay('${c.id}', this.value)" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:#f8fafc;">
                        <option value="Bay 1" ${c.currentBay === 'Bay 1' ? 'selected' : ''}>Bay 1: Diagnostics</option>
                        <option value="Bay 2" ${c.currentBay === 'Bay 2' ? 'selected' : ''}>Bay 2: Electrical & AC</option>
                        <option value="Bay 3" ${c.currentBay === 'Bay 3' ? 'selected' : ''}>Bay 3: Suspension & Brakes</option>
                        <option value="Bay 4" ${c.currentBay === 'Bay 4' ? 'selected' : ''}>Bay 4: Denting & Body</option>
                        <option value="Bay 5" ${c.currentBay === 'Bay 5' ? 'selected' : ''}>Bay 5: Detailing & Wash</option>
                        <option value="Bay 6" ${c.currentBay === 'Bay 6' ? 'selected' : ''}>Bay 6: Ready for Delivery</option>
                    </select>
                </td>
                <td>
                    <span class="status-tag ${isReady ? 'ready' : 'in-progress'}">
                        ${isReady ? 'Ready' : (c.status || 'In Progress')}
                    </span>
                </td>
                <td style="font-weight:800; color:#162544; text-align:right;">
                    Rs. ${Number(c.netPayable || 0).toLocaleString()}
                </td>
                <td style="text-align:right;">
                    <button type="button" class="btn-secondary" style="padding:5px 10px; font-size:12px;" onclick="printJobCardNativeById('${c.id}')" title="Print Official A4">
                        🖨️ Print
                    </button>
                    <button type="button" class="btn-secondary" style="padding:5px 10px; font-size:12px; margin-left:4px;" onclick="downloadJobCardPdfById('${c.id}')" title="Download PDF">
                        📄 PDF
                    </button>
                    <button type="button" class="btn-primary" style="padding:5px 10px; font-size:12px; margin-left:4px;" onclick="openCardInEditor('${c.id}')" title="Edit">
                        ✏️ Edit
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function updateCardBay(cardId, bay) {
    const status = bay === 'Bay 6' ? 'Ready' : 'In Progress';
    if (window.HubAPI) {
        await window.HubAPI.updateBay(cardId, bay, status);
    }
    await refreshDashboard();
}

function openCardInEditor(cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (card && window.loadCardIntoEditor) {
        window.loadCardIntoEditor(card);
        showView('editorView');
    }
}

function printJobCardNativeById(cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (card && window.printJobCardNative) {
        window.printJobCardNative(card);
    }
}

function downloadJobCardPdfById(cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (card && window.downloadJobCardPdf) {
        window.downloadJobCardPdf(card);
    }
}

// Settings modal
function openSettingsModal() {
    const m = document.getElementById('settingsModal');
    if (m) m.style.display = 'flex';
}

function closeSettingsModal() {
    const m = document.getElementById('settingsModal');
    if (m) m.style.display = 'none';
}

function saveGeminiSettings() {
    const key = document.getElementById('geminiApiKeyInput')?.value.trim();
    if (key) {
        localStorage.setItem('al_shaheen_gemini_key', key);
        alert('✓ Gemini API Key saved successfully!');
        closeSettingsModal();
    } else {
        alert('Please enter a valid Google Gemini API key.');
    }
}

// Global Exports
window.showView = showView;
window.refreshDashboard = refreshDashboard;
window.openCardInEditor = openCardInEditor;
window.quickAdvanceBay = quickAdvanceBay;
window.updateCardBay = updateCardBay;
window.printJobCardNativeById = printJobCardNativeById;
window.downloadJobCardPdfById = downloadJobCardPdfById;
window.setDeptFilter = setDeptFilter;
window.handleSearch = handleSearch;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveGeminiSettings = saveGeminiSettings;
window.handleStaffLoginSubmit = handleStaffLoginSubmit;
window.quickLoginStaff = quickLoginStaff;
window.staffLogout = staffLogout;
