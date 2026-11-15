// ==========================================================================
// AL SHAHEEN AUTO HUB - API & REAL-TIME EVENT CONNECTOR
// Robust dual-layer sync: Server-Sent Events (SSE) + BroadcastChannel + LocalStorage
// ==========================================================================

const API_BASE = '/api';
const LOCAL_STORAGE_KEY = 'al_shaheen_job_cards_v3';
const SYNC_CHANNEL_NAME = 'al_shaheen_hub_sync_v2';

let syncChannel = null;
try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    }
} catch (e) {
    console.warn('BroadcastChannel not supported', e);
}

function broadcastSync(type, data) {
    // 1. Post across all open tabs/windows
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
        this.sse = null;
        this.initSSE();
        this.initChannelListener();
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

    // Initialize Server-Sent Events for real-time live synchronization
    initSSE() {
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
                // Connection dropped or serverless mode, will retry automatically
            };
        } catch (e) {
            console.warn('SSE not supported or local preview mode', e);
        }
    }

    // Fetch all job cards
    async getAllJobCards() {
        try {
            const res = await fetch(`${API_BASE}/jobcards`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    // Update localStorage mirror
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(json.data));
                    return json.data;
                }
            }
        } catch (err) {
            console.warn('API fetch failed, falling back to localStorage:', err.message);
        }

        // Fallback to localStorage
        return this.getLocalJobCards();
    }

    // Save or update a job card
    async saveJobCard(card) {
        let savedCard = card;
        try {
            const res = await fetch(`${API_BASE}/jobcards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(card)
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    savedCard = json.data;
                }
            }
        } catch (err) {
            console.warn('API save failed, using local mirror:', err.message);
        }

        // Persist locally
        this.updateLocalCard(savedCard);

        // Broadcast across all tabs and TV screens
        broadcastSync('update', { card: savedCard });
        if (savedCard.status === 'Ready' || savedCard.currentBay === 'Bay 6') {
            broadcastSync('vehicle_ready', {
                id: savedCard.id,
                plateNo: savedCard.vehicle?.plateNo || 'Vehicle',
                makeModel: savedCard.vehicle?.makeModel || '',
                customer: savedCard.customer?.name || '',
                bay: savedCard.currentBay || 'Bay 6'
            });
        }
        return savedCard;
    }

    // Update vehicle bay
    async updateBay(id, bay, status) {
        let updatedCard = null;
        try {
            const res = await fetch(`${API_BASE}/jobcards/${encodeURIComponent(id)}/bay`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bay, status })
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    updatedCard = json.data;
                }
            }
        } catch (err) {
            console.warn('API bay update failed:', err.message);
        }

        // Fallback & local update
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
        } else if (updatedCard) {
            this.updateLocalCard(updatedCard);
        }

        if (updatedCard) {
            broadcastSync('update', { card: updatedCard });
            if (updatedCard.status === 'Ready' || updatedCard.currentBay === 'Bay 6') {
                broadcastSync('vehicle_ready', {
                    id: updatedCard.id,
                    plateNo: updatedCard.vehicle?.plateNo || 'Vehicle',
                    makeModel: updatedCard.vehicle?.makeModel || '',
                    customer: updatedCard.customer?.name || '',
                    bay: updatedCard.currentBay || 'Bay 6'
                });
            }
        }
        return updatedCard;
    }

    // Delete job card
    async deleteJobCard(id) {
        try {
            await fetch(`${API_BASE}/jobcards/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.warn('API delete failed:', err.message);
        }

        let cards = this.getLocalJobCards().filter(c => c.id.toLowerCase() !== id.toLowerCase());
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
        broadcastSync('update', { id, deleted: true });
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
