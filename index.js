const bedrock = require('bedrock-protocol');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// تخزين بيانات البوتات النشطة
const activeBots = new Map();

// دالة تشغيل البوت
function startBot(botId, config) {
    if (activeBots.has(botId)) {
        console.log(`Bot ${botId} is already running.`);
        return;
    }

    const startTime = Date.now();
    let botData = {
        id: botId,
        username: config.username,
        serverIp: config.host,
        port: config.port,
        status: 'Connecting...',
        coordinates: { x: 0, y: 0, z: 0 },
        uptime: 0,
        reconnectTimer: null
    };

    activeBots.set(botId, botData);

    const client = bedrock.createClient({
        host: config.host,
        port: config.port,
        username: config.username,
        offline: true // اجعلها false إذا كان السيرفر يتطلب حساب مايكروسوفت رسمي
    });

    client.on('spawn', () => {
        botData.status = 'Online';
        console.log(`${config.username} spawned in the server!`);
    });

    client.on('position', (pos) => {
        botData.coordinates = { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
    });

    client.on('close', () => {
        botData.status = 'Offline';
        console.log(`${config.username} disconnected.`);
    });

    // تحديث وقت الاتصال (Uptime)
    setInterval(() => {
        if (botData.status === 'Online') {
            botData.uptime = Math.floor((Date.now() - startTime) / 1000); // بالثواني
        }
    }, 1000);

    // نظام الخروج والدخول التلقائي كل 20 دقيقة (1200000 ملي ثانية)
    botData.reconnectTimer = setTimeout(() => {
        console.log(`Auto-reconnecting ${config.username}...`);
        client.disconnect();
        activeBots.delete(botId);
        // إعادة الدخول بعد 10 ثواني من الخروج
        setTimeout(() => startBot(botId, config), 10000);
    }, 20 * 60 * 1000);

    // حفظ كائن العميل للتحكم به لاحقاً
    botData.client = client;
}

// واجهة برمجة التطبيقات (API) للوحة التحكم

// 1. جلب بيانات جميع البوتات
app.get('/api/bots', (req, res) => {
    const botsList = Array.from(activeBots.values()).map(bot => {
        // إزالة كائن العميل من الاستجابة لتخفيف حجم البيانات
        const { client, reconnectTimer, ...safeData } = bot;
        return safeData;
    });
    res.json(botsList);
});

// 2. إضافة وتشغيل بوت جديد
app.post('/api/bots/start', (req, res) => {
    const { id, username, host, port } = req.body;
    if (!id || !username || !host) return res.status(400).json({ error: 'Missing data' });
    
    startBot(id, { username, host, port: port || 19132 });
    res.json({ message: 'Bot starting...' });
});

// 3. إيقاف بوت
app.post('/api/bots/stop', (req, res) => {
    const { id } = req.body;
    const bot = activeBots.get(id);
    if (bot) {
        clearTimeout(bot.reconnectTimer);
        bot.client.disconnect();
        activeBots.delete(id);
        res.json({ message: 'Bot stopped and removed.' });
    } else {
        res.status(404).json({ error: 'Bot not found.' });
    }
});

// تشغيل خادم الويب
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Dashboard API running on port ${PORT}`);
});
