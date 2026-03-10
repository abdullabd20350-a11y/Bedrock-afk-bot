const express = require('express');
const bedrock = require('bedrock-protocol');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

let botsData = {};
let botClients = {};
let reconnectTimers = {};

function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    // تنظيف الاتصال القديم إذا كان موجوداً
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
        botInfo.connectedAt = Date.now();

        // عند الدخول بنجاح
        client.on('join', () => {
            botInfo.status = 'متصل';
            console.log(`Bot ${botInfo.username} connected.`);
        });

        // التقاط الإحداثيات عند أول ظهور (Spawn)
        client.on('start_game', (packet) => {
            if (packet.player_position) {
                botInfo.coordinates = `X: ${Math.floor(packet.player_position.x)}, Y: ${Math.floor(packet.player_position.y)}, Z: ${Math.floor(packet.player_position.z)}`;
            }
        });

        // تحديث الإحداثيات عند تحرك البوت
        client.on('move_player', (packet) => {
            if (packet.runtime_id === client.entityId) {
                botInfo.coordinates = `X: ${Math.floor(packet.position.x)}, Y: ${Math.floor(packet.position.y)}, Z: ${Math.floor(packet.position.z)}`;
            }
        });

        client.on('close', () => {
            botInfo.status = 'غير متصل';
            botInfo.coordinates = 'غير متوفر';
        });

        client.on('error', (err) => {
            botInfo.status = 'خطأ في الاتصال';
            console.error(err);
        });

        // ✅ إعادة الاتصال التلقائي كل 20 دقيقة
        if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
        reconnectTimers[id] = setInterval(() => {
            console.log(`Reconnecting bot ${botInfo.username}...`);
            if (botClients[id]) {
                try { botClients[id].disconnect(); } catch (e) {}
            }
            botInfo.status = 'إعادة اتصال تلقائي...';
            setTimeout(() => startBot(id), 5000);
        }, 20 * 60 * 1000);

    } catch (error) {
        botInfo.status = 'فشل التشغيل';
    }
}

function stopBot(id) {
    if (reconnectTimers[id]) { clearInterval(reconnectTimers[id]); delete reconnectTimers[id]; }
    if (botClients[id]) { try { botClients[id].disconnect(); } catch (e) {} delete botClients[id]; }
    if (botsData[id]) { botsData[id].status = 'متوقف'; botsData[id].coordinates = 'غير متوفر'; }
}

// API Endpoints
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
app.listen(PORT, () => console.log(`Dashboard active on port ${PORT}`));
