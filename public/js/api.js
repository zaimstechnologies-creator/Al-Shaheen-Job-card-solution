// ==========================================================================
// AL SHAHEEN AUTO HUB - API & REAL-TIME EVENT CONNECTOR
// ==========================================================================

const API_BASE = '/api';
const LOCAL_STORAGE_KEY = 'al_shaheen_job_cards_v3';

class JobCardAPI {
    constructor() {
        this.isOnline = true;
        this.sse = null;
        this.initSSE();
    }

    // Initialize Server-Sent Events for real-time live synchronization
    initSSE() {
        try {
            this.sse = new EventSource(`${API_BASE}/live-stream`);
            
            this.sse.addEventListener('update', (e) => {
                const data = JSON.parse(e.data);
                window.dispatchEvent(new CustomEvent('hub-data-updated', { detail: data }));
            });

            this.sse.addEventListener('vehicle_ready', (e) => {
                const data = JSON.parse(e.data);
                window.dispatchEvent(new CustomEvent('hub-vehicle-ready', { detail: data }));
            });

            this.sse.addEventListener('voice_announce', (e) => {
                const data = JSON.parse(e.data);
                window.dispatchEvent(new CustomEvent('hub-voice-announce', { detail: data }));
            });

            this.sse.onerror = () => {
                // Connection dropped or local file mode, will retry automatically
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
        try {
            const res = await fetch(`${API_BASE}/jobcards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(card)
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    this.updateLocalCard(json.data);
                    return json.data;
                }
            }
        } catch (err) {
            console.warn('API save failed, saving to localStorage:', err.message);
        }

        // Fallback to localStorage
        this.updateLocalCard(card);
        window.dispatchEvent(new CustomEvent('hub-data-updated', { detail: { card } }));
        if (card.status === 'Ready') {
            window.dispatchEvent(new CustomEvent('hub-vehicle-ready', {
                detail: {
                    id: card.id,
                    plateNo: card.vehicle?.plateNo || 'Vehicle',
                    makeModel: card.vehicle?.makeModel || '',
                    customer: card.customer?.name || '',
                    bay: card.currentBay || 'Bay 6'
                }
            }));
        }
        return card;
    }

    // Update vehicle bay
    async updateBay(id, bay, status) {
        try {
            const res = await fetch(`${API_BASE}/jobcards/${encodeURIComponent(id)}/bay`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bay, status })
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    this.updateLocalCard(json.data);
                    return json.data;
                }
            }
        } catch (err) {
            console.warn('API bay update failed:', err.message);
        }

        // Fallback
        const cards = this.getLocalJobCards();
        const found = cards.find(c => c.id.toLowerCase() === id.toLowerCase());
        if (found) {
            found.currentBay = bay;
            if (status) found.status = status;
            if (bay === 'Bay 6') found.status = 'Ready';
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
            window.dispatchEvent(new CustomEvent('hub-data-updated', { detail: { card: found } }));
            if (found.status === 'Ready') {
                window.dispatchEvent(new CustomEvent('hub-vehicle-ready', {
                    detail: {
                        id: found.id,
                        plateNo: found.vehicle?.plateNo || 'Vehicle',
                        makeModel: found.vehicle?.makeModel || '',
                        customer: found.customer?.name || '',
                        bay: found.currentBay
                    }
                }));
            }
            return found;
        }
        return null;
    }

    // Delete job card
    async deleteJobCard(id) {
        try {
            const res = await fetch(`${API_BASE}/jobcards/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                let cards = this.getLocalJobCards().filter(c => c.id.toLowerCase() !== id.toLowerCase());
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
                return true;
            }
        } catch (err) {
            console.warn('API delete failed:', err.message);
        }

        let cards = this.getLocalJobCards().filter(c => c.id.toLowerCase() !== id.toLowerCase());
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
        window.dispatchEvent(new CustomEvent('hub-data-updated', { detail: { id } }));
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
