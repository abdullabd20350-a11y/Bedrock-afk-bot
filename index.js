const express = require('express');
const bedrock = require('bedrock-protocol');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'bots_config.json');
let botsData = {}; // لتخزين معلومات البوتات (الاسم، السيرفر، الحالة المطلوبة)
let botClients = {}; // لتخزين جلسات الاتصال الحية (RAM فقط)
let reconnectTimers = {}; // لتخزين مؤقتات الـ 20 دقيقة

// --- وظائف إدارة البيانات ---

function saveData() {
    const dataToSave = {};
    // نحفظ فقط الإعدادات، ولا نحفظ البيانات المتغيرة بسرعة مثل الإحداثيات
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
                // إذا كان البوت مضبوطاً ليعمل تلقائياً، نشغله
                if (botsData[id].shouldBeRunning) {
                    setTimeout(() => startBot(id), 3000);
                }
            });
            console.log("✅ تم تحميل بيانات البوتات بنجاح.");
        } catch (e) { console.error("❌ خطأ في تحميل البيانات:", e); }
    }
}

// --- وظائف البوت ---

function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
    }

    try {
        const client = bedrock.createClient({
            host: botInfo.host,
            port: botInfo.port,
            username: botInfo.username,
            offline: true
        });

        botClients[id] = client;
        botInfo.status = 'جاري الاتصال...';
        botInfo.shouldBeRunning = true;
        saveData();

        client.on('join', () => {
            botInfo.status = 'متصل';
            botInfo.connectedAt = Date.now();
        });

        // تحسين التقاط الإحداثيات وتجاهل القيم الوهمية (مثل 32769)
        const handlePos = (pos) => {
            if (pos && Math.abs(pos.y) < 30000) {
                botInfo.coordinates = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
            }
        };

        client.on('start_game', (pkt) => handlePos(pkt.player_position));
        client.on('move_player', (pkt) => handlePos(pkt.position));
        client.on('player_auth_input', (pkt) => handlePos(pkt.position));

        client.on('close', () => {
            botInfo.status = 'غير متصل';
            botInfo.coordinates = 'غير متوفر';
            botInfo.connectedAt = null;
        });

        client.on('error', (err) => {
            console.error(`[Error] ${botInfo.username}:`, err.message);
            botInfo.status = 'خطأ في الاتصال';
        });

        // مؤقت الـ 20 دقيقة لإعادة التشغيل تلقائياً
        if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
        reconnectTimers[id] = setInterval(() => {
            if (botInfo.shouldBeRunning) {
                console.log(`🔄 إعادة اتصال دوري (20 دقيقة) للبوت: ${botInfo.username}`);
                client.disconnect();
                setTimeout(() => startBot(id), 5000);
            }
        }, 20 * 60 * 1000);

    } catch (e) {
        botInfo.status = 'فشل في التشغيل';
    }
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
        botsData[id].connectedAt = null;
        saveData();
    }
}

// --- واجهات الـ API ---

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
    botsData[id] = { id, username, host, port: parseInt(port) || 19132, status: 'مضاف', coordinates: 'غير متوفر', shouldBeRunning: false };
    saveData();
    res.json({ success: true });
});

app.post('/api/bots/:id/start', (req, res) => { startBot(req.params.id); res.json({ success: true }); });
app.post('/api/bots/:id/stop', (req, res) => { stopBot(req.params.id); res.json({ success: true }); });
app.delete('/api/bots/:id', (req, res) => {
    stopBot(req.params.id);
    delete botsData[req.params.id];
    saveData();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    loadData();
    console.log(`🚀 Dashboard is live on port ${PORT}`);
});
