const express = require('express');
const bedrock = require('bedrock-protocol');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ذاكرة لتخزين بيانات البوتات
let botsData = {};
let botClients = {};
let reconnectTimers = {};

// دالة لتشغيل البوت
function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    try {
        const client = bedrock.createClient({
            host: botInfo.host,
            port: botInfo.port,
            username: botInfo.username,
            offline: true // اجعلها false إذا كان السيرفر يتطلب حساب Xbox أصلي
        });

        botClients[id] = client;
        botInfo.status = 'متصل';
        botInfo.connectedAt = Date.now();

        client.on('join', () => {
            console.log(`Bot ${botInfo.username} joined ${botInfo.host}`);
        });

        // محاولة التقاط الإحداثيات (قد تختلف حسب إصدار البيدروك)
        client.on('move_player', (packet) => {
            if (packet.runtime_id === client.entityId) {
                botInfo.coordinates = `X: ${Math.floor(packet.position.x)}, Y: ${Math.floor(packet.position.y)}, Z: ${Math.floor(packet.position.z)}`;
            }
        });

        client.on('close', () => {
            botInfo.status = 'غير متصل';
            botInfo.coordinates = 'غير متوفر';
        });

        // نظام الخروج والدخول كل 20 دقيقة (1200000 مللي ثانية)
        if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
        reconnectTimers[id] = setInterval(() => {
            console.log(`Auto-reconnecting bot ${botInfo.username}...`);
            client.disconnect();
            setTimeout(() => startBot(id), 5000); // الانتظار 5 ثوانٍ ثم الدخول مجدداً
        }, 20 * 60 * 1000);

    } catch (error) {
        console.error('Error starting bot:', error);
        botInfo.status = 'خطأ في الاتصال';
    }
}

// دالة لإيقاف البوت
function stopBot(id) {
    if (botClients[id]) {
        botClients[id].disconnect();
        delete botClients[id];
    }
    if (reconnectTimers[id]) {
        clearInterval(reconnectTimers[id]);
        delete reconnectTimers[id];
    }
    if (botsData[id]) {
        botsData[id].status = 'متوقف';
    }
}

// --- واجهات برمجة التطبيقات (API) للوحة التحكم ---

// جلب بيانات كل البوتات
app.get('/api/bots', (req, res) => {
    // حساب مدة الاتصال (Uptime)
    const responseData = Object.keys(botsData).map(id => {
        const b = botsData[id];
        const uptime = b.connectedAt && b.status === 'متصل' ? Math.floor((Date.now() - b.connectedAt) / 60000) : 0;
        return { ...b, uptime: `${uptime} دقيقة` };
    });
    res.json(responseData);
});

// إضافة أو تعديل بوت
app.post('/api/bots', (req, res) => {
    const { id, username, host, port } = req.body;
    const botId = id || Date.now().toString(); // إنشاء ID جديد إذا لم يكن موجوداً
    
    botsData[botId] = {
        id: botId,
        username,
        host,
        port: parseInt(port) || 19132,
        status: 'مضاف (لم يعمل بعد)',
        coordinates: 'غير متوفر',
        connectedAt: null
    };
    res.json({ success: true, bot: botsData[botId] });
});

// تشغيل بوت
app.post('/api/bots/:id/start', (req, res) => {
    startBot(req.params.id);
    res.json({ success: true });
});

// إيقاف بوت
app.post('/api/bots/:id/stop', (req, res) => {
    stopBot(req.params.id);
    res.json({ success: true });
});

// تشغيل خادم الموقع
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
