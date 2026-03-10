const express = require('express');
const bedrock = require('bedrock-protocol');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

let botsData = {};
let botClients = {};
let reconnectTimers = {};

// دالة التشغيل الآمنة (تمنع انهيار السيرفر بالكامل)
function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    // تنظيف الجلسة القديمة
    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
        delete botClients[id];
    }

    try {
        console.log(`[${botInfo.username}] محاولة اتصال بـ ${botInfo.host}...`);
        
        const client = bedrock.createClient({
            host: botInfo.host,
            port: parseInt(botInfo.port),
            username: botInfo.username,
            offline: true,
            connectTimeout: 10000 // مهلة 10 ثواني للاتصال
        });

        botClients[id] = client;
        botInfo.status = 'جاري الاتصال...';

        client.on('join', () => {
            botInfo.status = 'متصل ✅';
            botInfo.connectedAt = Date.now();
            console.log(`[${botInfo.username}] دخل السيرفر!`);
        });

        // التقاط الإحداثيات (تجنب 32769)
        const updateCoords = (pos) => {
            if (pos && Math.abs(pos.y) < 30000) {
                botInfo.coordinates = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
            }
        };

        client.on('start_game', (pkt) => updateCoords(pkt.player_position));
        client.on('move_player', (pkt) => updateCoords(pkt.position));

        // منع الانهيار عند حدوث خطأ
        client.on('error', (err) => {
            console.error(`[خطأ في البوت ${botInfo.username}]:`, err.message);
            botInfo.status = 'خطأ/طرد من السيرفر';
            botInfo.coordinates = 'غير متوفر';
        });

        client.on('close', () => {
            botInfo.status = 'منفصل ❌';
            botInfo.coordinates = 'غير متوفر';
        });

        // إعادة الاتصال كل 20 دقيقة
        if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
        reconnectTimers[id] = setInterval(() => {
            console.log(`[${botInfo.username}] إعادة تشغيل دوري...`);
            startBot(id);
        }, 20 * 60 * 1000);

    } catch (e) {
        console.error("فشل بدء البوت:", e);
        botInfo.status = 'فشل في التشغيل';
    }
}

// --- واجهات الـ API ---
app.get('/api/bots', (req, res) => {
    const list = Object.values(botsData).map(b => {
        const uptime = b.connectedAt && b.status.includes('متصل') ? Math.floor((Date.now() - b.connectedAt) / 60000) : 0;
        return { ...b, uptime: `${uptime} دقيقة` };
    });
    res.json(list);
});

app.post('/api/bots', (req, res) => {
    const { username, host, port } = req.body;
    const id = Date.now().toString();
    botsData[id] = { id, username, host, port: port || 19132, status: 'مضاف', coordinates: 'غير متوفر' };
    res.json({ success: true });
});

app.post('/api/bots/:id/start', (req, res) => { startBot(req.params.id); res.json({ success: true }); });

app.post('/api/bots/:id/stop', (req, res) => {
    if (reconnectTimers[req.params.id]) clearInterval(reconnectTimers[req.params.id]);
    if (botClients[req.params.id]) botClients[req.params.id].disconnect();
    if (botsData[req.params.id]) botsData[req.params.id].status = 'متوقف';
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`الخادم يعمل على منفذ ${PORT}`));
