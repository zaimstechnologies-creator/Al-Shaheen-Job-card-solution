const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'jobcards.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure data folder exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Helpers for Data Persistence
function readJobCards() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return [];
        }
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Error reading job cards:', err.message);
        return [];
    }
}

function writeJobCards(cards) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2), 'utf8');
        broadcastEvent('update', { count: cards.length, timestamp: Date.now() });
        return true;
    } catch (err) {
        console.error('Error writing job cards:', err.message);
        return false;
    }
}

// Server-Sent Events (SSE) for Real-Time TV and Dashboard Sync
let sseClients = [];

function broadcastEvent(eventType, payload) {
    const dataStr = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach(client => {
        try {
            client.res.write(dataStr);
        } catch (e) {
            // Client disconnected
        }
    });
}

// SSE Endpoint
app.get('/api/live-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    const clientId = Date.now() + Math.random().toString(36).substring(2, 9);
    sseClients.push({ id: clientId, res });

    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, time: Date.now() })}\n\n`);

    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

// REST API Endpoints
app.get('/api/jobcards', (req, res) => {
    const cards = readJobCards();
    res.json({ success: true, data: cards });
});

app.get('/api/jobcards/:id', (req, res) => {
    const cards = readJobCards();
    const found = cards.find(c => c.id.toLowerCase() === req.params.id.toLowerCase());
    if (found) {
        res.json({ success: true, data: found });
    } else {
        res.status(404).json({ success: false, message: 'Job card not found' });
    }
});

// Create or Update Job Card via POST
app.post('/api/jobcards', (req, res) => {
    const newCard = req.body;
    if (!newCard || !newCard.id) {
        return res.status(400).json({ success: false, message: 'Valid job card object required' });
    }

    const cards = readJobCards();
    const existingIdx = cards.findIndex(c => c.id.toLowerCase() === newCard.id.toLowerCase());
    const oldCard = existingIdx >= 0 ? cards[existingIdx] : null;

    if (existingIdx >= 0) {
        cards[existingIdx] = { ...cards[existingIdx], ...newCard };
    } else {
        cards.unshift(newCard);
    }

    writeJobCards(cards);

    if (newCard.status === 'Ready' && (!oldCard || oldCard.status !== 'Ready')) {
        broadcastEvent('vehicle_ready', {
            id: newCard.id,
            plateNo: newCard.vehicle?.plateNo || 'Vehicle',
            makeModel: newCard.vehicle?.makeModel || '',
            customer: newCard.customer?.name || '',
            bay: newCard.currentBay || 'Bay 6'
        });
    }

    res.json({ success: true, data: newCard });
});

// Update Job Card via PUT
app.put('/api/jobcards/:id', (req, res) => {
    const updated = req.body;
    const cards = readJobCards();
    const idx = cards.findIndex(c => c.id.toLowerCase() === req.params.id.toLowerCase());
    const oldCard = idx >= 0 ? cards[idx] : null;

    if (idx >= 0) {
        cards[idx] = { ...cards[idx], ...updated };
    } else {
        cards.unshift(updated);
    }

    writeJobCards(cards);

    if (updated.status === 'Ready' && (!oldCard || oldCard.status !== 'Ready')) {
        broadcastEvent('vehicle_ready', {
            id: updated.id,
            plateNo: updated.vehicle?.plateNo || 'Vehicle',
            makeModel: updated.vehicle?.makeModel || '',
            customer: updated.customer?.name || '',
            bay: updated.currentBay || 'Bay 6'
        });
    }

    res.json({ success: true, data: cards[idx >= 0 ? idx : 0] });
});

app.put('/api/jobcards/:id/bay', (req, res) => {
    const { bay, status } = req.body;
    const cards = readJobCards();
    const idx = cards.findIndex(c => c.id.toLowerCase() === req.params.id.toLowerCase());

    if (idx === -1) {
        return res.status(404).json({ success: false, message: 'Job card not found' });
    }

    const prevStatus = cards[idx].status;
    if (bay) cards[idx].currentBay = bay;
    if (status) cards[idx].status = status;

    if (bay === 'Bay 6' || status === 'Ready') {
        cards[idx].status = 'Ready';
        cards[idx].currentBay = 'Bay 6';
    }

    writeJobCards(cards);

    if (cards[idx].status === 'Ready' && prevStatus !== 'Ready') {
        broadcastEvent('vehicle_ready', {
            id: cards[idx].id,
            plateNo: cards[idx].vehicle?.plateNo || 'Vehicle',
            makeModel: cards[idx].vehicle?.makeModel || '',
            customer: cards[idx].customer?.name || '',
            bay: cards[idx].currentBay
        });
    }

    res.json({ success: true, data: cards[idx] });
});

app.delete('/api/jobcards/:id', (req, res) => {
    let cards = readJobCards();
    const initialLen = cards.length;
    cards = cards.filter(c => c.id.toLowerCase() !== req.params.id.toLowerCase());

    if (cards.length === initialLen) {
        return res.status(404).json({ success: false, message: 'Job card not found' });
    }

    writeJobCards(cards);
    res.json({ success: true, message: 'Deleted successfully' });
});

// Trigger voice announcement
app.post('/api/tv/announce', (req, res) => {
    const { plateNo, makeModel, message } = req.body;
    broadcastEvent('voice_announce', {
        plateNo: plateNo || 'Test Vehicle',
        makeModel: makeModel || 'Al Shaheen Auto Hub',
        message: message || 'Please proceed to the Accounts Counter for key collection.'
    });
    res.json({ success: true, message: 'Announcement broadcasted to 60-inch TV' });
});

// Serve Static Assets from /public
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders: (res, pathStr) => {
        if (pathStr.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Clean Page Route Rewrites
app.get('/tv', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tv.html'));
});

app.get('/lounge', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tv.html'));
});

app.get('/track', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

app.get('/workshop', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
if (require.main === module) {
    const server = http.createServer(app);
    server.listen(PORT, () => {
        console.log(`===================================================================`);
        console.log(`🚗 Al Shaheen Auto Hub - Modern Node.js Enterprise Application`);
        console.log(`===================================================================`);
        console.log(`📡 Workshop Staff Portal: http://localhost:${PORT}/workshop`);
        console.log(`📺 60" Lounge TV Display:  http://localhost:${PORT}/tv`);
        console.log(`📱 Customer Mobile Track:  http://localhost:${PORT}/track`);
        console.log(`⚡ REST API & SSE Live:    http://localhost:${PORT}/api/live-stream`);
        console.log(`===================================================================`);
    });
}

module.exports = app;
