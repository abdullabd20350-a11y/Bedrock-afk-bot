const express = require('express');
const bedrock = require('bedrock-protocol');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'bots_config.json');
let botsData = {}; 
let botClients = {}; 
let reconnectTimers = {}; 

function saveData() {
    const dataToSave = {};
    Object.keys(botsData).forEach(id => {
        dataToSave[id] = {
            id: botsData[id].id,
            username: botsData[id].username,
            host: botsData[id].host,
            port: botsData[id].port,
            shouldBeRunning: botsData[id].shouldBeRunning || false
        };
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2));
}

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const raw = fs.readFileSync(DATA_FILE);
            const loaded = JSON.parse(raw);
            Object.keys(loaded).forEach(id => {
                botsData[id] = {
                    ...loaded[id],
                    status: 'متوقف',
                    coordinates: 'غير متوفر',
                    connectedAt: null
                };
                if (botsData[id].shouldBeRunning) {
                    setTimeout(() => startBot(id), 3000);
                }
            });
            console.log("✅ تم تحميل البيانات.");
        } catch (e) { console.error("❌ خطأ تحميل:", e); }
    }
}

function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
    }

    try {
        const client = bedrock.createClient({
            host: botInfo.host,
            port: parseInt(botInfo.port),
            username: botInfo.username,
            offline: true
        });

        botClients[id] = client;
        botInfo.status = 'جاري الاتصال...';
        botInfo.shouldBeRunning = true;
        saveData();

        client.on('join', () => {
            botInfo.status = 'متصل ✅';
            botInfo.connectedAt = Date.now();
        });

        const handlePos = (pos) => {
            if (pos && Math.abs(pos.y) < 30000) {
                botInfo.coordinates = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
            }
        };

        client.on('start_game', (pkt) => handlePos(pkt.player_position));
        client.on('move_player', (pkt) => handlePos(pkt.position));

        client.on('close', () => {
            botInfo.status = 'غير متصل ❌';
            botInfo.coordinates = 'غير متوفر';
        });

        if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
        reconnectTimers[id] = setInterval(() => {
            if (botInfo.shouldBeRunning) {
                console.log(`🔄 إعادة اتصال: ${botInfo.username}`);
                startBot(id);
            }
        }, 20 * 60 * 1000);

    } catch (e) { botInfo.status = 'فشل الاتصال'; }
}

function stopBot(id) {
    if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch(e) {}
        delete botClients[id];
    }
    if (botsData[id]) {
        botsData[id].status = 'متوقف';
        botsData[id].shouldBeRunning = false;
        botsData[id].coordinates = 'غير متوفر';
        saveData();
    }
}

// --- مسارات الـ API المعدلة ---

app.get('/api/bots', (req, res) => {
    const list = Object.values(botsData).map(b => {
        const uptime = b.connectedAt ? Math.floor((Date.now() - b.connectedAt) / 60000) : 0;
        return { ...b, uptime: `${uptime} دقيقة` };
    });
    res.json(list);
});

app.post('/api/bots', (req, res) => {
    const { username, host, port } = req.body;
    const id = Date.now().toString();
    botsData[id] = { id, username, host, port: port || 19132, status: 'مضاف', coordinates: 'غير متوفر', shouldBeRunning: false };
    saveData();
    res.json({ success: true });
});

app.post('/api/bots/:id/start', (req, res) => { startBot(req.params.id); res.json({ success: true }); });
app.post('/api/bots/:id/stop', (req, res) => { stopBot(req.params.id); res.json({ success: true }); });

// 🟢 دالة الحذف النهائية
app.delete('/api/bots/:id', (req, res) => {
    const id = req.params.id;
    console.log(`🗑️ حذف البوت: ${id}`);
    stopBot(id); // إيقاف البوت أولاً
    delete botsData[id]; // مسحه من الذاكرة
    saveData(); // تحديث ملف الحفظ
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { loadData(); console.log(`الخادم يعمل على ${PORT}`); });
