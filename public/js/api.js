// ==========================================================================
// AL SHAHEEN AUTO HUB - ULTRA-FAST REAL-TIME MULTI-DEVICE SYNC ENGINE
// Native WebSockets (Sub-ms) + SSE + 1-Sec Delta Poller + BroadcastChannel
// ==========================================================================

const API_BASE = '/api';
const LOCAL_STORAGE_KEY = 'al_shaheen_job_cards_v3';
const SYNC_CHANNEL_NAME = 'al_shaheen_hub_sync_v2';

function getStaffAuthHeaders(extraHeaders = {}) {
    const token = (typeof window !== 'undefined') ?
        (localStorage.getItem('al_shaheen_staff_token') || sessionStorage.getItem('al_shaheen_staff_token') || '') : '';
    const headers = { ...extraHeaders };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

let syncChannel = null;
try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    }
} catch (e) {
    console.warn('BroadcastChannel not supported', e);
}

function broadcastSync(type, data) {
    // 1. Post across all open tabs/windows instantly (0ms)
    if (syncChannel) {
        try {
            syncChannel.postMessage({ type, data, timestamp: Date.now() });
        } catch (e) {}
    }
    // 2. Dispatch in current window
    if (typeof window !== 'undefined') {
        if (type === 'update') {
            window.dispatchEvent(new CustomEvent('hub-data-updated', { detail: data }));
        } else if (type === 'vehicle_ready') {
            window.dispatchEvent(new CustomEvent('hub-vehicle-ready', { detail: data }));
        } else if (type === 'voice_announce') {
            window.dispatchEvent(new CustomEvent('hub-voice-announce', { detail: data }));
        }
    }
}

class JobCardAPI {
    constructor() {
        this.isOnline = true;
        this.ws = null;
        this.sse = null;
        this.lastKnownHash = '';
        this.initChannelListener();
        this.initWebSocket();
        this.initSSE();
        this.startLiveHeartbeat();
    }

    initChannelListener() {
        if (!syncChannel) return;
        syncChannel.onmessage = (event) => {
            const { type, data } = event.data || {};
            if (!type) return;
            if (typeof window !== 'undefined') {
                if (type === 'update') {
                    window.dispatchEvent(new CustomEvent('hub-data-updated', { detail: data }));
                } else if (type === 'vehicle_ready') {
                    window.dispatchEvent(new CustomEvent('hub-vehicle-ready', { detail: data }));
                } else if (type === 'voice_announce') {
                    window.dispatchEvent(new CustomEvent('hub-voice-announce', { detail: data }));
                }
            }
        };
    }

    // 1. Native WebSocket Connection (<5ms Sub-Millisecond Multi-Device Sync)
    initWebSocket() {
        if (typeof window === 'undefined' || !('WebSocket' in window)) return;
        try {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${proto}//${window.location.host}/ws`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                const token = (typeof window !== 'undefined') ?
                    (localStorage.getItem('al_shaheen_staff_token') || sessionStorage.getItem('al_shaheen_staff_token') || '') : '';
                if (token && this.ws.readyState === WebSocket.OPEN) {
                    try {
                        this.ws.send(JSON.stringify({ type: 'auth', token }));
                    } catch (e) {}
                }
            };

            this.ws.onmessage = (evt) => {
                try {
                    const msg = JSON.parse(evt.data);
                    if (msg.type === 'snapshot' && Array.isArray(msg.data)) {
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(msg.data));
                        broadcastSync('update', { all: msg.data });
                    } else if (msg.type === 'update') {
                        broadcastSync('update', msg.data);
                    } else if (msg.type === 'vehicle_ready') {
                        broadcastSync('vehicle_ready', msg.data);
                    } else if (msg.type === 'voice_announce') {
                        broadcastSync('voice_announce', msg.data);
                    }
                } catch (e) {}
            };

            this.ws.onclose = () => {
                // Auto-reconnect WebSocket after 2.5 seconds
                setTimeout(() => this.initWebSocket(), 2500);
            };

            this.ws.onerror = () => {
                try { this.ws.close(); } catch (e) {}
            };
        } catch (e) {}
    }

    // 2. Server-Sent Events (SSE) Fallback Stream
    initSSE() {
        if (typeof window === 'undefined' || !('EventSource' in window)) return;
        try {
            this.sse = new EventSource(`${API_BASE}/live-stream`);

            this.sse.addEventListener('update', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    broadcastSync('update', data);
                } catch (err) {}
            });

            this.sse.addEventListener('vehicle_ready', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    broadcastSync('vehicle_ready', data);
                } catch (err) {}
            });

            this.sse.addEventListener('voice_announce', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    broadcastSync('voice_announce', data);
                } catch (err) {}
            });

            this.sse.onerror = () => {
                // Managed automatically by browser EventSource retry
            };
        } catch (e) {}
    }

    // 3. High-Speed 1-Second Delta Heartbeat Poller (Guarantees Real-Time Across All Devices on Vercel)
    startLiveHeartbeat() {
        if (typeof window === 'undefined') return;
        setInterval(async () => {
            const token = localStorage.getItem('al_shaheen_staff_token') || sessionStorage.getItem('al_shaheen_staff_token') || '';
            // Only poll protected jobcards endpoint if user is logged in
            if (!token) return;

            try {
                const res = await fetch(`${API_BASE}/jobcards?_t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: getStaffAuthHeaders({ 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' })
                });

                if (res.status === 401) {
                    window.dispatchEvent(new CustomEvent('hub-auth-required'));
                    return;
                }

                if (res.ok) {
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) {
                        // Calculate fingerprint of dataset
                        const currentHash = json.data.map(c => `${c.id}|${c.currentBay}|${c.status}|${c.paymentCleared}|${c.netPayable}`).join(';;');
                        if (currentHash !== this.lastKnownHash) {
                            this.lastKnownHash = currentHash;
                            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(json.data));
                            window.dispatchEvent(new CustomEvent('hub-data-updated', { detail: { cards: json.data } }));
                        }
                    }
                }
            } catch (e) {}
        }, 1000);
    }

    // Fetch all job cards (Protected with staff auth)
    async getAllJobCards() {
        try {
            const res = await fetch(`${API_BASE}/jobcards?_t=${Date.now()}`, {
                cache: 'no-store',
                headers: getStaffAuthHeaders({ 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' })
            });

            if (res.status === 401) {
                window.dispatchEvent(new CustomEvent('hub-auth-required'));
                return [];
            }

            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(json.data));
                    this.lastKnownHash = json.data.map(c => `${c.id}|${c.currentBay}|${c.status}|${c.paymentCleared}|${c.netPayable}`).join(';;');
                    return json.data;
                }
            }
        } catch (err) {
            console.warn('API fetch failed, falling back to localStorage:', err.message);
        }

        return this.getLocalJobCards();
    }

    // Public TV Queue (Sanitized, no customer private data)
    async getTvQueue() {
        try {
            const res = await fetch(`${API_BASE}/tv/queue?_t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    return json.data;
                }
            }
        } catch (e) {}
        return [];
    }

    // Public Vehicle Tracking (Sanitized, no customer private data)
    async trackVehicle(query) {
        try {
            const res = await fetch(`${API_BASE}/public/track?q=${encodeURIComponent(query)}&_t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            const json = await res.json();
            return json;
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    // Save or update a job card
    async saveJobCard(card) {
        let savedCard = card;

        // Persist locally immediately (0ms)
        this.updateLocalCard(savedCard);
        broadcastSync('update', { card: savedCard });

        // Push via WebSocket if open
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({ type: 'update', data: { card: savedCard } }));
            } catch (e) {}
        }

        try {
            const res = await fetch(`${API_BASE}/jobcards`, {
                method: 'POST',
                headers: getStaffAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(card)
            });
            if (res.status === 401) {
                window.dispatchEvent(new CustomEvent('hub-auth-required'));
            } else if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    savedCard = json.data;
                    this.updateLocalCard(savedCard);
                }
            }
        } catch (err) {
            console.warn('API save failed, using local mirror:', err.message);
        }

        if (savedCard.status === 'Ready' || savedCard.currentBay === 'Bay 6') {
            const payload = {
                id: savedCard.id,
                plateNo: savedCard.vehicle?.plateNo || 'Vehicle',
                makeModel: savedCard.vehicle?.makeModel || '',
                customer: savedCard.customer?.name || '',
                bay: savedCard.currentBay || 'Bay 6'
            };
            broadcastSync('vehicle_ready', payload);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: 'vehicle_ready', data: payload }));
                } catch (e) {}
            }
        }
        return savedCard;
    }

    // Update vehicle bay
    async updateBay(id, bay, status) {
        let updatedCard = null;

        // Update locally immediately
        const cards = this.getLocalJobCards();
        const found = cards.find(c => c.id.toLowerCase() === id.toLowerCase());
        if (found) {
            found.currentBay = bay;
            if (status) found.status = status;
            if (bay === 'Bay 6' || status === 'Ready') {
                found.status = 'Ready';
                found.currentBay = 'Bay 6';
            }
            updatedCard = found;
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
            broadcastSync('update', { card: updatedCard });
        }

        // Push via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN && updatedCard) {
            try {
                this.ws.send(JSON.stringify({ type: 'update', data: { card: updatedCard } }));
            } catch (e) {}
        }

        try {
            const res = await fetch(`${API_BASE}/jobcards/${encodeURIComponent(id)}/bay`, {
                method: 'PUT',
                headers: getStaffAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ bay, status })
            });
            if (res.status === 401) {
                window.dispatchEvent(new CustomEvent('hub-auth-required'));
            } else if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    updatedCard = json.data;
                    this.updateLocalCard(updatedCard);
                }
            }
        } catch (err) {
            console.warn('API bay update failed:', err.message);
        }

        if (updatedCard && (updatedCard.status === 'Ready' || updatedCard.currentBay === 'Bay 6')) {
            const payload = {
                id: updatedCard.id,
                plateNo: updatedCard.vehicle?.plateNo || 'Vehicle',
                makeModel: updatedCard.vehicle?.makeModel || '',
                customer: updatedCard.customer?.name || '',
                bay: updatedCard.currentBay || 'Bay 6'
            };
            broadcastSync('vehicle_ready', payload);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: 'vehicle_ready', data: payload }));
                } catch (e) {}
            }
        }
        return updatedCard;
    }

    // Delete job card
    async deleteJobCard(id) {
        let cards = this.getLocalJobCards().filter(c => c.id.toLowerCase() !== id.toLowerCase());
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
        broadcastSync('update', { id, deleted: true });

        // Push via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({ type: 'update', data: { id, deleted: true } }));
            } catch (e) {}
        }

        try {
            const res = await fetch(`${API_BASE}/jobcards/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: getStaffAuthHeaders()
            });
            if (res.status === 401) {
                window.dispatchEvent(new CustomEvent('hub-auth-required'));
            }
        } catch (err) {
            console.warn('API delete failed:', err.message);
        }

        return true;
    }

    // Local Storage Helpers
    getLocalJobCards() {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return [];
    }

    updateLocalCard(card) {
        if (!card || !card.id) return;
        const cards = this.getLocalJobCards();
        const idx = cards.findIndex(c => c.id.toLowerCase() === card.id.toLowerCase());
        if (idx >= 0) {
            cards[idx] = card;
        } else {
            cards.unshift(card);
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
    }
}

const api = new JobCardAPI();
window.HubAPI = api;
window.broadcastSync = broadcastSync;
