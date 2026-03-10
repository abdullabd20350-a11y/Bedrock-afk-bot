const bedrock = require('bedrock-protocol');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// تخزين بيانات البوتات
const botsManager = new Map();

// دالة تشغيل البوت (بالطريقة الكلاسيكية الآمنة)
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

        // الاتصال الكلاسيكي الآمن
        client.on('spawn', () => {
            botData.status = 'Online';
            console.log(`${botData.username} spawned in the server!`);
        });

        // قراءة الإحداثيات بشكل طبيعي
        client.on('position', (pos) => {
            botData.coordinates = {
                x: Math.round(pos.x),
                y: Math.round(pos.y),
                z: Math.round(pos.z)
            };
        });

        // صيد أسباب الطرد لتعرف المشكلة لو رفض السيرفر دخول البوت
        client.on('disconnect', (packet) => {
            const reason = packet?.message || packet?.reason || 'تم الطرد من السيرفر';
            botData.status = `مفصول: ${reason}`;
            clearAllTimers(botData);
            console.log(`[DISCONNECT] ${botData.username}: ${reason}`);
        });

        client.on('error', (err) => {
            botData.status = `خطأ: ${err.message}`;
            clearAllTimers(botData);
            console.log(`[ERROR] ${botData.username}: ${err.message}`);
        });

        client.on('close', () => {
            if (botData.status === 'Online' || botData.status === 'Connecting...') {
                botData.status = 'Offline';
            }
            clearAllTimers(botData);
        });

        // تحديث وقت الاتصال
        botData.uptimeInterval = setInterval(() => {
            if (botData.status === 'Online') {
                botData.uptime = Math.floor((Date.now() - startTime) / 1000);
            }
        }, 1000);

        // نظام الخروج والدخول التلقائي كل 20 دقيقة (بدون حركة وهمية)
        botData.reconnectTimer = setTimeout(() => {
            if(botData.status === 'Online') {
                console.log(`Auto-reconnecting ${botData.username}...`);
                client.disconnect();
                setTimeout(() => startMinecraftBot(botId), 10000); 
            }
        }, 20 * 60 * 1000);

    } catch (err) {
        botData.status = `خطأ النظام: ${err.message}`;
        console.log("Catch Error:", err);
    }
}

// تنظيف الموقتات
function clearAllTimers(botData) {
    clearInterval(botData.uptimeInterval);
    clearTimeout(botData.reconnectTimer);
}

// إيقاف البوت
function stopMinecraftBot(botId) {
    const botData = botsManager.get(botId);
    if (botData && botData.client) {
        clearAllTimers(botData);
        botData.client.disconnect();
        botData.status = 'Offline';
    }
}

// --- API ROUTES (لا تغيير هنا، اللوحة تعمل كما هي) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/bots', (req, res) => {
    const botsList = Array.from(botsManager.values()).map(bot => {
        const { client, reconnectTimer, uptimeInterval, ...safeData } = bot;
        return safeData;
    });
    res.json(botsList);
});

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

app.post('/api/bots/start', (req, res) => {
    const { id } = req.body;
    startMinecraftBot(id);
    res.json({ message: 'Bot starting...' });
});

app.post('/api/bots/stop', (req, res) => {
    const { id } = req.body;
    stopMinecraftBot(id);
    res.json({ message: 'Bot stopped.' });
});

app.post('/api/bots/delete', (req, res) => {
    const { id } = req.body;
    stopMinecraftBot(id);
    botsManager.delete(id);
    res.json({ message: 'Bot deleted.' });
});

app.post('/api/bots/edit', (req, res) => {
    const { id, username, host, port } = req.body;
    const bot = botsManager.get(id);
    if (bot && !bot.status.includes('Online') && !bot.status.includes('Connecting')) {
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
