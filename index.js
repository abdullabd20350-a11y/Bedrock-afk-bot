const bedrock = require('bedrock-protocol');
const express = require('express');
const cors = require('cors');
const path = require('path');

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
        offline: true
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

    client.on('error', (err) => {
        botData.status = 'Error';
        console.log(`Error with ${config.username}:`, err.message);
    });

    // تحديث وقت الاتصال (Uptime) بالثواني
    setInterval(() => {
        if (botData.status === 'Online') {
            botData.uptime = Math.floor((Date.now() - startTime) / 1000);
        }
    }, 1000);

    // نظام الخروج والدخول التلقائي كل 20 دقيقة
    botData.reconnectTimer = setTimeout(() => {
        console.log(`Auto-reconnecting ${config.username}...`);
        client.disconnect();
        activeBots.delete(botId);
        setTimeout(() => startBot(botId, config), 10000);
    }, 20 * 60 * 1000);

    botData.client = client;
}

// --- واجهة برمجة التطبيقات (API) والتوجيه ---

// الكود اللي يحل مشكلة Cannot GET / ويعرض اللوحة
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// جلب بيانات جميع البوتات
app.get('/api/bots', (req, res) => {
    const botsList = Array.from(activeBots.values()).map(bot => {
        const { client, reconnectTimer, ...safeData } = bot;
        return safeData;
    });
    res.json(botsList);
});

// إضافة وتشغيل بوت جديد
app.post('/api/bots/start', (req, res) => {
    const { id, username, host, port } = req.body;
    if (!id || !username || !host) return res.status(400).json({ error: 'Missing data' });
    
    startBot(id, { username, host, port: port || 19132 });
    res.json({ message: 'Bot starting...' });
});

// إيقاف بوت
app.post('/api/bots/stop', (req, res) => {
    const { id } = req.body;
    const bot = activeBots.get(id);
    if (bot) {
        clearTimeout(bot.reconnectTimer);
        if (bot.client) bot.client.disconnect();
        activeBots.delete(id);
        res.json({ message: 'Bot stopped and removed.' });
    } else {
        res.status(404).json({ error: 'Bot not found.' });
    }
});

// تشغيل الخادم
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Dashboard running on port ${PORT}`);
});
