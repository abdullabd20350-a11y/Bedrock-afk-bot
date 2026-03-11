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

// تحميل البيانات عند البداية
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const raw = fs.readFileSync(DATA_FILE);
            botsData = JSON.parse(raw);
            Object.keys(botsData).forEach(id => {
                botsData[id].status = 'متوقف';
                botsData[id].coordinates = 'غير متوفر';
                botsData[id].connectedAt = null; // تصفير الوقت لمنع undefined
                if (botsData[id].shouldBeRunning) setTimeout(() => startBot(id), 2000);
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

    // إنهاء أي جلسة سابقة تماماً قبل البدء
    if (botClients[id]) {
        try {
            botClients[id].disconnect();
            botClients[id] = null;
        } catch (e) {}
    }

    botInfo.status = 'جاري الاتصال...';
    botInfo.shouldBeRunning = true;
    saveData();

    try {
        const client = bedrock.createClient({
            host: botInfo.host,
            port: parseInt(botInfo.port) || 19132,
            username: botInfo.username,
            offline: true,
            // سيستخدم المكتبة أحدث إصدار تلقائياً كما طلبت
            connectTimeout: 15000
        });

        botClients[id] = client;

        client.on('join', () => {
            botInfo.status = 'متصل ✅';
            botInfo.connectedAt = Date.now();
            console.log(`[${botInfo.username}] Joined successfully.`);
        });

        client.on('error', (err) => {
            console.log(`[${botInfo.username}] Error: ${err.message}`);
            botInfo.status = 'خطأ (إعادة محاولة...)';
            botInfo.connectedAt = null;
        });

        client.on('close', () => {
            botInfo.coordinates = 'غير متوفر';
            botInfo.connectedAt = null;
            
            // نظام إعادة الاتصال كل 5 ثواني في حال كان البوت مفروض يشتغل
            if (botInfo.shouldBeRunning) {
                console.log(`[${botInfo.username}] Connection closed. Retrying in 5s...`);
                // تأخير بسيط قبل المحاولة لضمان عدم تداخل الطلبات
                setTimeout(() => {
                    if (botInfo.shouldBeRunning) startBot(id);
                }, 5000);
            } else {
                botInfo.status = 'منفصل ❌';
            }
        });

        // التقاط الإحداثيات
        client.on('start_game', (pkt) => {
            const pos = pkt.player_position;
            if (pos && Math.abs(pos.y) < 30000) {
                botInfo.coordinates = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
            }
        });

    } catch (e) {
        console.log(`[${botInfo.username}] Critical Error: ${e.message}`);
        setTimeout(() => {
            if (botInfo.shouldBeRunning) startBot(id);
        }, 5000);
    }
}

app.get('/api/bots', (req, res) => {
    const list = Object.values(botsData).map(b => {
        // حساب الوقت بشكل آمن لتجنب undefined
        let uptimeStr = "0 دقيقة";
        if (b.connectedAt && b.status === 'متصل ✅') {
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
    botsData[id] = { 
        id, username, host, 
        port: port || 19132, 
        status: 'مضاف', 
        coordinates: 'غير متوفر', 
        connectedAt: null,
        shouldBeRunning: false 
    };
    saveData();
    res.json({ success: true });
});

app.post('/api/bots/:id/start', (req, res) => { startBot(req.params.id); res.json({ success: true }); });

app.post('/api/bots/:id/stop', (req, res) => {
    const id = req.params.id;
    if (botsData[id]) { 
        botsData[id].shouldBeRunning = false; 
        botsData[id].status = 'متوقف'; 
        botsData[id].connectedAt = null;
        saveData(); 
    }
    if (botClients[id]) { 
        try { botClients[id].disconnect(); } catch (e) {} 
        botClients[id] = null; 
    }
    res.json({ success: true });
});

app.delete('/api/bots/:id', (req, res) => {
    const id = req.params.id;
    if (botClients[id]) try { botClients[id].disconnect(); } catch (e) {}
    delete botsData[id];
    saveData();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { loadData(); console.log(`Server is running on port ${PORT}`); });
