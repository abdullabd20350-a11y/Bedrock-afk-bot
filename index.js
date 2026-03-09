const bedrock = require('bedrock-protocol');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// تخزين بيانات البوتات (سواء كانت تعمل أو مطفأة)
const botsManager = new Map();

// دالة تشغيل البوت
function startMinecraftBot(botId) {
    const botData = botsManager.get(botId);
    if (!botData || botData.status === 'Online' || botData.status === 'Connecting...') return;

    botData.status = 'Connecting...';
    botData.uptime = 0;
    const startTime = Date.now();

    try {
        const client = bedrock.createClient({
            host: botData.serverIp,
            port: botData.port,
            username: botData.username,
            offline: true
        });

        botData.client = client;

        client.on('spawn', () => {
            botData.status = 'Online';
            console.log(`${botData.username} spawned in the server!`);
        });

        client.on('position', (pos) => {
            botData.coordinates = { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
        });

        client.on('close', () => {
            botData.status = 'Offline';
            clearInterval(botData.uptimeInterval);
            clearTimeout(botData.reconnectTimer);
            console.log(`${botData.username} disconnected.`);
        });

        client.on('error', (err) => {
            botData.status = 'Error';
            clearInterval(botData.uptimeInterval);
            clearTimeout(botData.reconnectTimer);
            console.log(`Error with ${botData.username}:`, err.message);
        });

        // تحديث وقت الاتصال
        botData.uptimeInterval = setInterval(() => {
            if (botData.status === 'Online') {
                botData.uptime = Math.floor((Date.now() - startTime) / 1000);
            }
        }, 1000);

        // الخروج والدخول التلقائي كل 20 دقيقة
        botData.reconnectTimer = setTimeout(() => {
            if(botData.status === 'Online') {
                console.log(`Auto-reconnecting ${botData.username}...`);
                client.disconnect();
                setTimeout(() => startMinecraftBot(botId), 10000); // إعادة الدخول بعد 10 ثواني
            }
        }, 20 * 60 * 1000);

    } catch (err) {
        botData.status = 'Error';
        console.log(err);
    }
}

// دالة إيقاف البوت
function stopMinecraftBot(botId) {
    const botData = botsManager.get(botId);
    if (botData && botData.client) {
        clearInterval(botData.uptimeInterval);
        clearTimeout(botData.reconnectTimer);
        botData.client.disconnect();
        botData.status = 'Offline';
    }
}

// --- واجهة برمجة التطبيقات (API) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// جلب جميع البوتات
app.get('/api/bots', (req, res) => {
    const botsList = Array.from(botsManager.values()).map(bot => {
        const { client, reconnectTimer, uptimeInterval, ...safeData } = bot;
        return safeData;
    });
    res.json(botsList);
});

// حفظ بوت جديد في القائمة (مطفأ)
app.post('/api/bots/add', (req, res) => {
    const { id, username, host, port } = req.body;
    if (!id || !username || !host) return res.status(400).json({ error: 'Missing data' });
    
    botsManager.set(id, {
        id, username, serverIp: host, port: port || 19132,
        status: 'Offline', coordinates: { x: 0, y: 0, z: 0 }, uptime: 0,
        client: null, reconnectTimer: null, uptimeInterval: null
    });
    res.json({ message: 'Bot added.' });
});

// تشغيل بوت
app.post('/api/bots/start', (req, res) => {
    const { id } = req.body;
    startMinecraftBot(id);
    res.json({ message: 'Bot starting...' });
});

// إيقاف بوت
app.post('/api/bots/stop', (req, res) => {
    const { id } = req.body;
    stopMinecraftBot(id);
    res.json({ message: 'Bot stopped.' });
});

// حذف بوت من القائمة
app.post('/api/bots/delete', (req, res) => {
    const { id } = req.body;
    stopMinecraftBot(id); // نفصله إذا كان شغال أولاً
    botsManager.delete(id);
    res.json({ message: 'Bot deleted.' });
});

// تعديل بيانات البوت
app.post('/api/bots/edit', (req, res) => {
    const { id, username, host, port } = req.body;
    const bot = botsManager.get(id);
    // نسمح بالتعديل فقط إذا كان البوت مطفأ
    if (bot && (bot.status === 'Offline' || bot.status === 'Error')) {
        bot.username = username;
        bot.serverIp = host;
        bot.port = port;
        res.json({ message: 'Bot updated.' });
    } else {
        res.status(400).json({ error: 'Stop the bot before editing.' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Dashboard running on port ${PORT}`);
});
