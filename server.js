const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'jobcards.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure data folder exists
const dataDir = path.join(__dirname, 'data');
try {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
} catch (e) {
    // Read-only serverless environment (e.g. Vercel Lambda)
}

// Pre-load default seed job cards so Vercel NFT bundles it
let bundledSeedCards = [];
try {
    bundledSeedCards = require('./data/jobcards.json');
} catch (e) {
    bundledSeedCards = [];
}

let inMemoryCards = null;

// Helpers for Data Persistence
function readJobCards() {
    if (inMemoryCards && Array.isArray(inMemoryCards) && inMemoryCards.length > 0) {
        return inMemoryCards;
    }

    // 1. Try reading from /tmp on serverless environments
    try {
        const tmpFile = path.join('/tmp', 'jobcards.json');
        if (fs.existsSync(tmpFile)) {
            const raw = fs.readFileSync(tmpFile, 'utf8');
            inMemoryCards = JSON.parse(raw);
            return inMemoryCards;
        }
    } catch (e) {}

    // 2. Try reading from local data file
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            inMemoryCards = JSON.parse(raw);
            return inMemoryCards;
        }
    } catch (err) {}

    // 3. Fallback to bundled seed cards
    inMemoryCards = JSON.parse(JSON.stringify(bundledSeedCards));
    return inMemoryCards;
}

function writeJobCards(cards) {
    inMemoryCards = cards;
    let written = false;

    // 1. Attempt local file write
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2), 'utf8');
        written = true;
    } catch (err) {
        // 2. Serverless Lambda fallback: write to writable /tmp
        try {
            const tmpFile = path.join('/tmp', 'jobcards.json');
            fs.writeFileSync(tmpFile, JSON.stringify(cards, null, 2), 'utf8');
            written = true;
        } catch (e2) {}
    }

    broadcastEvent('update', { count: cards.length, timestamp: Date.now() });
    return written;
}

function getGeminiApiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (conf.geminiApiKey) return conf.geminiApiKey;
        }
    } catch (e) {}
    return '';
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
app.get(['/api/live-stream', '/live-stream'], (req, res) => {
    if (process.env.VERCEL) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'close');
        res.write(`event: connected\ndata: ${JSON.stringify({ vercel: true, time: Date.now() })}\n\n`);
        return res.end();
    }

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

// REST API Endpoints (supports both /api/jobcards and /jobcards)
app.get(['/api/jobcards', '/jobcards'], (req, res) => {
    const cards = readJobCards();
    res.json({ success: true, data: cards });
});

app.get(['/api/jobcards/:id', '/jobcards/:id'], (req, res) => {
    const cards = readJobCards();
    const found = cards.find(c => c.id.toLowerCase() === req.params.id.toLowerCase());
    if (found) {
        res.json({ success: true, data: found });
    } else {
        res.status(404).json({ success: false, message: 'Job card not found' });
    }
});

// Create or Update Job Card via POST
app.post(['/api/jobcards', '/jobcards'], (req, res) => {
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
app.put(['/api/jobcards/:id', '/jobcards/:id'], (req, res) => {
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

app.put(['/api/jobcards/:id/bay', '/jobcards/:id/bay'], (req, res) => {
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

app.delete(['/api/jobcards/:id', '/jobcards/:id'], (req, res) => {
    let cards = readJobCards();
    const initialLen = cards.length;
    cards = cards.filter(c => c.id.toLowerCase() !== req.params.id.toLowerCase());

    if (cards.length === initialLen) {
        return res.status(404).json({ success: false, message: 'Job card not found' });
    }

    writeJobCards(cards);
    res.json({ success: true, message: 'Deleted successfully' });
});

// ==========================================================================
// GEMINI AI AUTOMOTIVE DIAGNOSTIC ENGINE (SERVER-SIDE PROXY)
// Accurately interprets English, Urdu, and Roman Urdu mechanical concerns
// ==========================================================================
app.post(['/api/ai/diagnose', '/ai/diagnose'], (req, res) => {
    const { concern, makeModel, mileage, apiKey: clientApiKey } = req.body;
    const apiKey = clientApiKey || getGeminiApiKey();

    if (!concern) {
        return res.status(400).json({ success: false, message: 'Customer concern is required' });
    }

    const prompt = `You are a Master Automotive Engineer and Chief Technical Diagnostician at Al Shaheen Auto Hub (Lahore, Pakistan).
Vehicle Details: ${makeModel || 'Automobile'} (Mileage: ${mileage || 'Unknown'} km).
Customer Concern (as reported by driver in English or Roman Urdu):
"${concern}"

Understand the mechanical symptoms described by Pakistani drivers:
- "Gari aik trf khainchti hai / pulling to one side": Steering pulling, wheel alignment camber/caster out, worn tie rod ends, damaged lower control arm ball joint or bushings, uneven tire pressure.
- "Jhatky ly kr chlti hai / jerking": Engine misfire, fouled spark plugs, dirty fuel injectors, clogged fuel filter, carbon buildup on throttle body, or ignition coil breakdown.
- "Gear shift main masla / 3rd gear phas jata hai": Manual transmission 3rd gear synchronizer brass ring worn/chipped, clutch pressure plate or release bearing worn, gear shift linkage cable out of adjustment, or low/burnt gear oil.
- "Khady main awaz / tik tik sound": Worn outer CV axle joints, stabilizer sway bar links, or strut mount bearings.
- "AC cooling issue": Low refrigerant gas (R134a), evaporator leak, faulty compressor clutch, or clogged cabin filter.

Provide a comprehensive, professional automotive solution for the official Al Shaheen Job Card:
1. workToBeDone: Formatted as numbered actionable repair tasks for the mechanics.
2. recommendedParts: Array of specific spare parts and consumables needed with realistic Pakistani market rates (PKR).
3. estimatedLabour: Estimated total labour charges in PKR.

Return STRICTLY valid JSON with no markdown wrapping:
{
  "workToBeDone": "1. ...\\n2. ...\\n3. ...",
  "recommendedParts": [
    { "desc": "Part description", "qty": 1, "estimatedRate": 5000 }
  ],
  "estimatedLabour": 6500
}`;

    const payload = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    });

    if (apiKey) {
        const reqAi = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 15000,
            agent: new https.Agent({ rejectUnauthorized: false })
        }, (resAi) => {
            let body = '';
            resAi.on('data', d => body += d);
            resAi.on('end', () => {
                if (resAi.statusCode === 200) {
                    try {
                        const json = JSON.parse(body);
                        const text = json.candidates[0].content.parts[0].text;
                        const parsedData = JSON.parse(text);
                        return res.json({ success: true, source: 'gemini-2.5-flash', data: parsedData });
                    } catch (parseErr) {
                        console.warn('Failed parsing Gemini output, using heuristic fallback:', parseErr.message);
                    }
                }
                // Fallback to advanced heuristic
                const fallback = generateAdvancedAutomotiveDiagnosis(concern, makeModel);
                return res.json({ success: true, source: 'al-shaheen-expert-system', data: fallback });
            });
        });

        reqAi.on('error', (err) => {
            console.warn('Gemini request error, using heuristic fallback:', err.message);
            const fallback = generateAdvancedAutomotiveDiagnosis(concern, makeModel);
            return res.json({ success: true, source: 'al-shaheen-expert-system', data: fallback });
        });

        reqAi.on('timeout', () => {
            reqAi.destroy();
            const fallback = generateAdvancedAutomotiveDiagnosis(concern, makeModel);
            return res.json({ success: true, source: 'al-shaheen-expert-system', data: fallback });
        });

        reqAi.write(payload);
        reqAi.end();
    } else {
        const fallback = generateAdvancedAutomotiveDiagnosis(concern, makeModel);
        return res.json({ success: true, source: 'al-shaheen-expert-system', data: fallback });
    }
});

// Advanced Automotive Knowledge Base (Expert Fallback with Roman Urdu Understanding)
function generateAdvancedAutomotiveDiagnosis(concern, makeModel) {
    const text = (concern || '').toLowerCase();
    const parts = [];
    const tasks = [];
    let labour = 4000;

    const hasPulling = text.includes('khainch') || text.includes('pull') || text.includes('alignment') || text.includes('side');
    const hasJerking = text.includes('jhatk') || text.includes('jerk') || text.includes('misfire') || text.includes('chlti');
    const hasGearIssue = text.includes('gear') || text.includes('3rd') || text.includes('clutch') || text.includes('phas');
    const hasNoise = text.includes('awaz') || text.includes('sound') || text.includes('tik') || text.includes('khad');
    const hasAC = text.includes('ac') || text.includes('cooling') || text.includes('hawa');

    if (hasPulling) {
        tasks.push('Inspect front suspension geometry, lower control arm bushings, and steering tie rod ends; perform 3D computerized wheel alignment and calibrate steering angle sensor.');
        parts.push({ desc: 'Front Lower Control Arm Bushings Set', qty: 1, estimatedRate: 4800 });
        parts.push({ desc: 'Tie Rod Ends (Pair)', qty: 1, estimatedRate: 4200 });
        labour += 2500;
    }

    if (hasJerking) {
        tasks.push('Perform complete EFI diagnostic tune-up: scan OBD-II for misfire codes, replace fouled spark plugs, chemically clean fuel injectors, and service throttle body.');
        parts.push({ desc: 'OEM Spark Plugs Set', qty: 1, estimatedRate: 7500 });
        parts.push({ desc: 'Throttle Body & Carb Cleaner Spray', qty: 2, estimatedRate: 1200 });
        labour += 3000;
    }

    if (hasGearIssue) {
        tasks.push('Inspect manual transmission and clutch assembly: check gear linkage cable alignment, drain and refill burnt gear oil, remove gearbox to inspect/replace worn 3rd gear synchronizer brass ring and clutch release bearing.');
        parts.push({ desc: '3rd Gear Synchronizer Brass Ring', qty: 1, estimatedRate: 6500 });
        parts.push({ desc: 'Manual Transmission Gear Oil (75W-90) - 1L', qty: 3, estimatedRate: 2600 });
        labour += 8000;
    }

    if (hasNoise && !hasPulling) {
        tasks.push('Inspect drive axles, CV boots, and stabilizer sway bar links for excessive play or tears; road test over speed bumps to verify contact noise elimination.');
        parts.push({ desc: 'Outer CV Joint Assembly', qty: 1, estimatedRate: 8500 });
        parts.push({ desc: 'Front Stabilizer Sway Bar Links (Pair)', qty: 1, estimatedRate: 3400 });
        labour += 2500;
    }

    if (hasAC) {
        tasks.push('Perform AC refrigerant pressure check, test condenser and evaporator for micro-leaks, evacuate system, recharge R134a refrigerant, and replace cabin filter.');
        parts.push({ desc: 'R134a Refrigerant Gas Recharge & Compressor Oil', qty: 1, estimatedRate: 3500 });
        parts.push({ desc: 'Cabin AC Air Filter (OEM)', qty: 1, estimatedRate: 1800 });
        labour += 2000;
    }

    if (tasks.length === 0) {
        tasks.push('Perform 40-point vehicle multi-point health check and OBD-II electronic diagnostic trouble code scan.');
        parts.push({ desc: 'General Maintenance Service Filter Kit', qty: 1, estimatedRate: 4500 });
    }

    return {
        workToBeDone: tasks.map((t, i) => `${i + 1}. ${t}`).join('\n'),
        recommendedParts: parts,
        estimatedLabour: labour
    };
}

// Trigger voice announcement
app.post(['/api/tv/announce', '/tv/announce'], (req, res) => {
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
