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

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const raw = fs.readFileSync(DATA_FILE);
            botsData = JSON.parse(raw);
            Object.keys(botsData).forEach(id => {
                botsData[id].status = 'متوقف';
                botsData[id].coordinates = 'غير متوفر';
                botsData[id].connectedAt = null;
                if (botsData[id].shouldBeRunning) setTimeout(() => startBot(id), 5000);
            });
        } catch (e) { botsData = {}; }
    }
}

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

function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
        delete botClients[id];
    }

    botInfo.status = 'جاري الاتصال المباشر...';
    botInfo.shouldBeRunning = true;
    saveData();

    try {
        console.log(`[${botInfo.username}] محاولة الدخول المباشر (بدون Ping)...`);
        
        const client = bedrock.createClient({
            host: botInfo.host,
            port: parseInt(botInfo.port) || 19132,
            username: botInfo.username,
            offline: true, // أعدناها أوفلاين لتسهيل الدخول دون حسابات مايكروسوفت
            version: '1.26.12', 
            skipPing: true, // 🚀 هذا هو السلاح السري: تخطي فحص السيرفر والدخول فوراً
            connectTimeout: 30000 
        });

        botClients[id] = client;

        client.on('join', () => {
            botInfo.status = 'متصل ✅';
            botInfo.connectedAt = Date.now();
            console.log(`[${botInfo.username}] دخل السيرفر بنجاح!`);
        });

        client.on('start_game', (pkt) => {
            const pos = pkt.player_position;
            if (pos && Math.abs(pos.y) < 30000) {
                botInfo.coordinates = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
            }
        });

        client.on('error', (err) => {
            console.log(`[خطأ - ${botInfo.username}]: ${err.message}`);
            botInfo.status = 'فشل (إعادة محاولة...)';
            botInfo.connectedAt = null;
        });

        client.on('close', () => {
            botInfo.coordinates = 'غير متوفر';
            botInfo.connectedAt = null;
            if (botInfo.shouldBeRunning) {
                console.log(`[${botInfo.username}] انقطع الاتصال. محاولة جديدة بعد 10 ثواني...`);
                botInfo.status = 'إعادة اتصال...';
                delete botClients[id];
                setTimeout(() => { if (botsData[id] && botsData[id].shouldBeRunning) startBot(id); }, 10000); 
            } else {
                botInfo.status = 'متوقف';
            }
        });

    } catch (e) {
        console.log(`[فشل التشغيل - ${botInfo.username}]: ${e.message}`);
        setTimeout(() => { if (botsData[id] && botsData[id].shouldBeRunning) startBot(id); }, 10000);
    }
}

function stopBot(id) {
    if (botsData[id]) {
        botsData[id].shouldBeRunning = false;
        botsData[id].status = 'متوقف';
        botsData[id].connectedAt = null;
        saveData();
    }
    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
        delete botClients[id];
    }
}

app.get('/api/bots', (req, res) => {
    const list = Object.values(botsData).map(b => {
        let uptimeStr = "0 دقيقة";
        if (b.connectedAt && b.status.includes('متصل')) {
            const minutes = Math.floor((Date.now() - b.connectedAt) / 60000);
            uptimeStr = `${minutes} دقيقة`;
        }
        return { ...b, uptime: uptimeStr };
    });
    res.json(list);
});

app.post('/api/bots', (req, res) => {
    const { username, host, port } = req.body;
    const id = Date.now().toString();
    botsData[id] = { id, username, host, port: port || 19132, status: 'مضاف', coordinates: 'غير متوفر', connectedAt: null, shouldBeRunning: false };
    saveData();
    res.json({ success: true });
});

app.post('/api/bots/:id/start', (req, res) => { startBot(req.params.id); res.json({ success: true }); });
app.post('/api/bots/:id/stop', (req, res) => { stopBot(req.params.id); res.json({ success: true }); });

app.delete('/api/bots/:id', (req, res) => {
    const id = req.params.id;
    stopBot(id);
    delete botsData[id];
    saveData();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { loadData(); console.log(`الخادم يعمل على ${PORT}`); });
