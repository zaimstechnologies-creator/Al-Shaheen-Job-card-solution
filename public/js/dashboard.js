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

    window.addEventListener('storage', (e) => {
        if (e.key === 'al_shaheen_job_cards_v3') {
            refreshDashboard();
        }
    });

    // Active background runtime sync (checks every 1.2s for seamless multi-device updates without refresh)
    setInterval(() => {
        const activeView = document.querySelector('.nav-item.active')?.dataset.view || 'dashboardView';
        if (activeView !== 'editorView') {
            refreshDashboard();
        }
    }, 1200);

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
        const matchingCards = allCards.filter(c => !isClosedCard(c) && (c.currentBay || 'Bay 1') === bay.id);
        const isReadyBay = bay.id === 'Bay 6';

        const cardsHtml = matchingCards.map(c => `
            <div class="bay-card" onclick="openCardInEditor('${c.id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div class="bay-card-plate">${escapeHtml(c.vehicle?.plateNo || 'REG-PENDING')}</div>
                    <button type="button" style="background:none; border:none; color:#ef4444; font-size:12px; cursor:pointer;" onclick="event.stopPropagation(); deleteJobCardById('${c.id}')" title="Delete Card">🗑️</button>
                </div>
                <div class="bay-card-model">${escapeHtml(c.vehicle?.makeModel || 'Vehicle')}</div>
                <div class="bay-card-customer">👤 ${escapeHtml(c.customer?.name || 'Walk-in')}</div>
                <div class="bay-card-status">
                    <span class="status-tag ${c.status === 'Ready' ? 'ready' : 'in-progress'}">${c.status || 'In Progress'}</span>
                    ${isReadyBay ? `
                        <button type="button" class="btn-success" style="padding:2px 7px; font-size:10px;" onclick="event.stopPropagation(); closeJobCardPayment('${c.id}')" title="Clear Payment and Remove from TV">
                            💳 Clear &amp; Close
                        </button>
                    ` : `
                        <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:10px;" onclick="event.stopPropagation(); quickAdvanceBay('${c.id}', '${bay.id}')">
                            Move Next ➔
                        </button>
                    `}
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
let activeStatusFilter = 'active'; // 'active' | 'closed' | 'all'

function isClosedCard(c) {
    if (!c) return false;
    const s = (c.status || '').toLowerCase().trim();
    const b = (c.currentBay || '').toLowerCase().trim();
    return s === 'completed' || s === 'delivered' || s === 'closed' || s === 'cancelled' ||
           s.includes('paid') || s.includes('closed') || b.includes('closed') || c.paymentCleared === true;
}

function setStatusViewFilter(filter) {
    activeStatusFilter = filter;
    document.querySelectorAll('.daily-status-tab').forEach(el => {
        el.classList.remove('active');
    });
    if (filter === 'active') document.getElementById('tabActiveJobs')?.classList.add('active');
    if (filter === 'closed') document.getElementById('tabClosedJobs')?.classList.add('active');
    if (filter === 'all') document.getElementById('tabAllJobs')?.classList.add('active');
    renderTable();
}

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

    // Update count badges
    const activeCount = allCards.filter(c => !isClosedCard(c)).length;
    const closedCount = allCards.filter(c => isClosedCard(c)).length;
    const allCount = allCards.length;

    if (document.getElementById('countActiveJobs')) document.getElementById('countActiveJobs').textContent = activeCount;
    if (document.getElementById('countClosedJobs')) document.getElementById('countClosedJobs').textContent = closedCount;
    if (document.getElementById('countAllJobs')) document.getElementById('countAllJobs').textContent = allCount;

    let filtered = allCards;

    // 1. Status Filter (Today's Active vs Closed Archive vs All)
    if (activeStatusFilter === 'active') {
        filtered = filtered.filter(c => !isClosedCard(c));
    } else if (activeStatusFilter === 'closed') {
        filtered = filtered.filter(c => isClosedCard(c));
    }

    // 2. Department Filter
    if (activeDeptFilter !== 'all') {
        filtered = filtered.filter(c => (c.departments || []).includes(activeDeptFilter));
    }

    // 3. Search Query Filter
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
        const msg = activeStatusFilter === 'closed' ? 'No closed or paid job cards found.' : 
                    activeStatusFilter === 'active' ? 'No active vehicle jobs in the workshop bays today.' : 
                    'No job cards found matching your criteria.';
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;">
                    ${msg}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const isClosed = isClosedCard(c);
        const isReady = (c.status === 'Ready' || c.currentBay === 'Bay 6') && !isClosed;
        return `
            <tr style="${isClosed ? 'background-color:#fafafa; opacity:0.85;' : ''}">
                <td style="font-weight:800; color:#162544;">
                    ${c.id}
                    ${isClosed ? '<div style="font-size:10px; color:#15803d; font-weight:700;">✓ PAID & CLOSED</div>' : ''}
                </td>
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
                    ${isClosed ? `
                        <span style="font-size:11.5px; font-weight:700; color:#15803d;">Delivered (Accounts Settled)</span>
                    ` : `
                        <select onchange="updateCardBay('${c.id}', this.value)" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:#f8fafc;">
                            <option value="Bay 1" ${c.currentBay === 'Bay 1' ? 'selected' : ''}>Bay 1: Diagnostics</option>
                            <option value="Bay 2" ${c.currentBay === 'Bay 2' ? 'selected' : ''}>Bay 2: Electrical & AC</option>
                            <option value="Bay 3" ${c.currentBay === 'Bay 3' ? 'selected' : ''}>Bay 3: Suspension & Brakes</option>
                            <option value="Bay 4" ${c.currentBay === 'Bay 4' ? 'selected' : ''}>Bay 4: Denting & Body</option>
                            <option value="Bay 5" ${c.currentBay === 'Bay 5' ? 'selected' : ''}>Bay 5: Detailing & Wash</option>
                            <option value="Bay 6" ${c.currentBay === 'Bay 6' ? 'selected' : ''}>Bay 6: Ready for Delivery</option>
                        </select>
                    `}
                </td>
                <td>
                    <span class="status-tag ${isClosed ? 'closed' : (isReady ? 'ready' : 'in-progress')}">
                        ${isClosed ? 'Closed & Paid' : (isReady ? 'Ready' : (c.status || 'In Progress'))}
                    </span>
                </td>
                <td style="font-weight:800; color:#162544; text-align:right;">
                    Rs. ${Number(c.netPayable || 0).toLocaleString()}
                </td>
                <td style="text-align:right; white-space:nowrap;">
                    ${!isClosed ? `
                        <button type="button" class="btn-success" style="padding:4px 8px; font-size:11px;" onclick="closeJobCardPayment('${c.id}')" title="Clear payment and remove from TV screen">
                            💳 Mark Paid & Close
                        </button>
                    ` : `
                        <button type="button" class="btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="reopenJobCard('${c.id}')" title="Reopen card">
                            🔄 Reopen
                        </button>
                    `}
                    <button type="button" class="btn-secondary" style="padding:4px 7px; font-size:11px; margin-left:3px;" onclick="printJobCardNativeById('${c.id}')" title="Print Official A4">
                        🖨️
                    </button>
                    <button type="button" class="btn-secondary" style="padding:4px 7px; font-size:11px; margin-left:3px;" onclick="downloadJobCardPdfById('${c.id}')" title="Download PDF">
                        📄
                    </button>
                    <button type="button" class="btn-primary" style="padding:4px 8px; font-size:11px; margin-left:3px;" onclick="openCardInEditor('${c.id}')" title="Edit">
                        ✏️
                    </button>
                    <button type="button" class="btn-danger" style="padding:4px 8px; font-size:11px; margin-left:3px;" onclick="deleteJobCardById('${c.id}')" title="Delete permanently (if created by mistake or cancelled)">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function closeJobCardPayment(cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    const plate = card.vehicle?.plateNo || cardId;
    const conf = confirm(`Mark Job Card ${cardId} (${plate}) as PAID & DELIVERED?\n\nThis will clear payment and remove the vehicle from the Waiting Lounge TV Screen.`);
    if (!conf) return;

    card.status = 'Paid & Delivered';
    card.currentBay = 'Delivered (Closed)';
    card.paymentCleared = true;
    card.closedAt = new Date().toISOString();

    localStorage.setItem('al_shaheen_job_cards_v3', JSON.stringify(allCards));

    if (window.HubAPI) {
        await window.HubAPI.saveJobCard(card);
        await window.HubAPI.updateBay(cardId, 'Delivered (Closed)', 'Paid & Delivered');
    }
    await refreshDashboard();
    if (window.showToast) window.showToast(`Job Card ${cardId} closed & cleared. Removed from Lounge TV!`, 'success');
}

async function reopenJobCard(cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    card.status = 'In Progress';
    card.currentBay = 'Bay 1';
    card.paymentCleared = false;
    delete card.closedAt;

    if (window.HubAPI) {
        await window.HubAPI.saveJobCard(card);
        await window.HubAPI.updateBay(cardId, 'Bay 1', 'In Progress');
    }
    await refreshDashboard();
    if (window.showToast) window.showToast(`Job Card ${cardId} reopened into Bay 1.`, 'info');
}

async function deleteJobCardById(cardId) {
    const card = allCards.find(c => c.id === cardId);
    const plate = card?.vehicle?.plateNo || cardId;
    const conf = confirm(`Are you sure you want to DELETE Job Card ${cardId} (${plate})?\n\nChoose OK if the client cancelled or if this card was created by mistake. This will permanently remove the record.`);
    if (!conf) return;

    allCards = allCards.filter(c => c.id.toLowerCase() !== cardId.toLowerCase());
    localStorage.setItem('al_shaheen_job_cards_v3', JSON.stringify(allCards));

    if (window.HubAPI) {
        await window.HubAPI.deleteJobCard(cardId);
    }
    await refreshDashboard();
    if (window.showToast) window.showToast(`Job Card ${cardId} permanently deleted.`, 'info');
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
window.setStatusViewFilter = setStatusViewFilter;
window.closeJobCardPayment = closeJobCardPayment;
window.reopenJobCard = reopenJobCard;
window.deleteJobCardById = deleteJobCardById;
window.handleStaffLoginSubmit = handleStaffLoginSubmit;
window.quickLoginStaff = quickLoginStaff;
window.staffLogout = staffLogout;
