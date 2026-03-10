const bedrock = require('bedrock-protocol');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// تخزين بيانات البوتات
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
            offline: false, // تم تفعيل الدخول بحساب مايكروسوفت
            
            // إجبار النظام على طباعة رابط وكود مايكروسوفت في Render
            onMsaCode: (response) => {
                botData.status = 'يطلب تسجيل دخول (راجع Render)';
                console.log('\n========================================');
                console.log(`🚨 [تنبيه: البوت ${botData.username} يحتاج تسجيل دخول] 🚨`);
                console.log(`1. افتح هذا الرابط: ${response.verification_uri}`);
                console.log(`2. انسخ والصق هذا الكود: ${response.user_code}`);
                console.log('========================================\n');
            }
        });

        botData.client = client;

        client.on('spawn', () => {
            botData.status = 'Online';
            console.log(`${botData.username} spawned in the server!`);
        });

        client.on('position', (pos) => {
            botData.coordinates = { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
        });

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
            if (botData.status === 'Online' || botData.status === 'Connecting...' || botData.status.includes('تسجيل')) {
                botData.status = 'Offline';
            }
            clearAllTimers(botData);
        });

        botData.uptimeInterval = setInterval(() => {
            if (botData.status === 'Online') {
                botData.uptime = Math.floor((Date.now() - startTime) / 1000);
            }
        }, 1000);

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

function clearAllTimers(botData) {
    clearInterval(botData.uptimeInterval);
    clearTimeout(botData.reconnectTimer);
}

function stopMinecraftBot(botId) {
    const botData = botsManager.get(botId);
    if (botData && botData.client) {
        clearAllTimers(botData);
        botData.client.disconnect();
        botData.status = 'Offline';
    }
}

// --- واجهة برمجة التطبيقات (API) ---

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

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
    startMinecraftBot(req.body.id); 
    res.json({ message: 'Bot starting...' }); 
});

app.post('/api/bots/stop', (req, res) => { 
    stopMinecraftBot(req.body.id); 
    res.json({ message: 'Bot stopped.' }); 
});

app.post('/api/bots/delete', (req, res) => { 
    stopMinecraftBot(req.body.id); 
    botsManager.delete(req.body.id); 
    res.json({ message: 'Bot deleted.' }); 
});

app.post('/api/bots/edit', (req, res) => {
    const bot = botsManager.get(req.body.id);
    if (bot && !bot.status.includes('Online') && !bot.status.includes('Connecting')) {
        bot.username = req.body.username; 
        bot.serverIp = req.body.host; 
        bot.port = req.body.port;
        res.json({ message: 'Bot updated.' });
    } else { 
        res.status(400).json({ error: 'Stop the bot before editing.' }); 
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`Dashboard running on port ${PORT}`); });
