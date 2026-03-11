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

// دالة حفظ البيانات (تعدل فقط عند الإضافة أو الحذف اليدوي)
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
            botsData = JSON.parse(raw);
            Object.keys(botsData).forEach(id => {
                botsData[id].status = 'متوقف';
                botsData[id].coordinates = 'غير متوفر';
                if (botsData[id].shouldBeRunning) setTimeout(() => startBot(id), 2000);
            });
        } catch (e) { console.error("خطأ في تحميل البيانات:", e); botsData = {}; }
    }
}

function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    // تنظيف أي محاولة اتصال سابقة لتجنب تداخل المستمعين (Listeners)
    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
        delete botClients[id];
    }

    botInfo.status = 'جاري محاولة الاتصال...';
    botInfo.shouldBeRunning = true;
    saveData();

    try {
        const client = bedrock.createClient({
            host: botInfo.host,
            port: parseInt(botInfo.port) || 19132,
            username: botInfo.username,
            offline: true,
            connectTimeout: 10000 // مهلة الاتصال
        });

        botClients[id] = client;

        client.on('join', () => {
            botInfo.status = 'متصل ✅';
            console.log(`[${botInfo.username}] دخل السيرفر.`);
        });

        // التقاط الإحداثيات وتجاهل القيم الوهمية
        const handlePos = (pos) => {
            if (pos && Math.abs(pos.y) < 30000) {
                botInfo.coordinates = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
            }
        };
        client.on('start_game', (pkt) => handlePos(pkt.player_position));
        client.on('move_player', (pkt) => handlePos(pkt.position));

        // معالجة الخطأ أو الطرد أو قفل السيرفر
        client.on('error', (err) => {
            console.error(`[خطأ - ${botInfo.username}]: ${err.message}`);
            botInfo.status = 'فشل (إعادة محاولة...)';
        });

        client.on('close', () => {
            botInfo.coordinates = 'غير متوفر';
            // إذا كان البوت مضبوطاً للعمل، يحاول مجدداً بعد 5 ثواني للأبد
            if (botInfo.shouldBeRunning) {
                botInfo.status = 'السيرفر مغلق (إعادة محاولة...)';
                setTimeout(() => {
                    if (botInfo.shouldBeRunning) startBot(id);
                }, 5000);
            } else {
                botInfo.status = 'منفصل ❌';
            }
        });

    } catch (e) {
        console.error(`[فشل فوري]: ${e.message}`);
        if (botInfo.shouldBeRunning) {
            setTimeout(() => startBot(id), 5000);
        }
    }
}

function stopBot(id) {
    if (botsData[id]) {
        botsData[id].shouldBeRunning = false;
        botsData[id].status = 'متوقف';
        botsData[id].coordinates = 'غير متوفر';
        saveData();
    }
    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
        delete botClients[id];
    }
}

// واجهات الـ API
app.get('/api/bots', (req, res) => {
    res.json(Object.values(botsData));
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

app.delete('/api/bots/:id', (req, res) => {
    const id = req.params.id;
    stopBot(id);
    delete botsData[id];
    saveData();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { loadData(); console.log(`الخادم يعمل على المنفذ ${PORT}`); });
