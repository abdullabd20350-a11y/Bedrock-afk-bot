const express = require('express');
const bedrock = require('bedrock-protocol');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// مخزن البيانات
let botsData = {};
let botClients = {};
let reconnectTimers = {};

// دالة لتشغيل البوت
function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    // إغلاق أي اتصال قديم لنفس البوت
    if (botClients[id]) {
        try { botClients[id].disconnect(); } catch (e) {}
    }

    try {
        const client = bedrock.createClient({
            host: botInfo.host,
            port: botInfo.port,
            username: botInfo.username,
            offline: true // وضع الأوفلاين كما طلبت
        });

        botClients[id] = client;
        botInfo.status = 'جاري الاتصال...';
        botInfo.connectedAt = Date.now();

        client.on('join', () => {
            botInfo.status = 'متصل';
            console.log(`[${botInfo.username}] دخل السيرفر بنجاح`);
        });

        // ✅ حل مشكلة الإحداثيات الوهمية (تجاهل القيم غير المنطقية)
        const updateCoords = (pos) => {
            if (pos && pos.y < 30000 && pos.y > -128) { // تجاهل الرقم 32769
                botInfo.coordinates = `X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
            } else if (!botInfo.coordinates || botInfo.coordinates === 'غير متوفر') {
                botInfo.coordinates = "جاري تحديد الموقع الحقيقي...";
            }
        };

        client.on('start_game', (packet) => updateCoords(packet.player_position));
        client.on('move_player', (packet) => updateCoords(packet.position));
        client.on('player_auth_input', (packet) => updateCoords(packet.position));

        client.on('close', () => {
            botInfo.status = 'غير متصل';
            botInfo.coordinates = 'غير متوفر';
        });

        client.on('error', (err) => {
            console.error(`خطأ في بوت ${botInfo.username}:`, err);
            botInfo.status = 'خطأ في الاتصال';
        });

        // ✅ نظام إعادة الاتصال كل 20 دقيقة بدقة
        if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
        reconnectTimers[id] = setInterval(() => {
            console.log(`[إعادة اتصال] البوت ${botInfo.username} يخرج ويدخل الآن...`);
            if (botClients[id]) {
                try { botClients[id].disconnect(); } catch (e) {}
            }
            botInfo.status = 'إعادة اتصال دوري...';
            setTimeout(() => startBot(id), 5000); // ينتظر 5 ثواني ثم يدخل
        }, 20 * 60 * 1000);

    } catch (error) {
        botInfo.status = 'فشل في التشغيل';
    }
}

// دالة لإيقاف البوت نهائياً
function stopBot(id) {
    if (reconnectTimers[id]) { clearInterval(reconnectTimers[id]); delete reconnectTimers[id]; }
    if (botClients[id]) { try { botClients[id].disconnect(); } catch (e) {} delete botClients[id]; }
    if (botsData[id]) {
        botsData[id].status = 'متوقف';
        botsData[id].coordinates = 'غير متوفر';
    }
}

// واجهات الـ API
app.get('/api/bots', (req, res) => {
    const response = Object.keys(botsData).map(id => {
        const b = botsData[id];
        const uptime = b.connectedAt && b.status === 'متصل' ? Math.floor((Date.now() - b.connectedAt) / 60000) : 0;
        return { ...b, uptime: `${uptime} دقيقة` };
    });
    res.json(response);
});

app.post('/api/bots', (req, res) => {
    const { username, host, port } = req.body;
    const botId = Date.now().toString();
    botsData[botId] = { id: botId, username, host, port: parseInt(port) || 19132, status: 'مضاف', coordinates: 'غير متوفر', connectedAt: null };
    res.json({ success: true });
});

app.post('/api/bots/:id/start', (req, res) => { startBot(req.params.id); res.json({ success: true }); });
app.post('/api/bots/:id/stop', (req, res) => { stopBot(req.params.id); res.json({ success: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`لوحة التحكم تعمل على المنفذ ${PORT}`));
