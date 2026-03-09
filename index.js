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
    botData.lastHealth = 20;
    const startTime = Date.now();

    try {
        const client = bedrock.createClient({
            host: botData.serverIp,
            port: botData.port,
            username: botData.username,
            offline: true
        });

        botData.client = client;

        client.on('start_game', (packet) => {
            botData.status = 'Online';
            botData.runtime_id = packet.runtime_id; 
            botData.coordinates = {
                x: Math.round(packet.player_position.x),
                y: Math.round(packet.player_position.y),
                z: Math.round(packet.player_position.z)
            };
        });

        client.on('move_player', (packet) => {
            if (packet.runtime_id === botData.runtime_id) {
                botData.coordinates = {
                    x: Math.round(packet.position.x), y: Math.round(packet.position.y), z: Math.round(packet.position.z)
                };
            }
        });

        client.on('set_health', (packet) => {
            if (packet.health < botData.lastHealth && packet.health > 0) {
                client.write('text', {
                    type: 'chat', needs_translation: false, source_name: client.username,
                    xuid: '', platform_chat_id: '', message: 'أوتش! ليش تضربني؟ 🤕'
                });
            }
            if (packet.health <= 0) {
                setTimeout(() => {
                    if (botData.status === 'Online' && botData.runtime_id) {
                        client.write('respawn', { state: 2, runtime_entity_id: botData.runtime_id });
                    }
                }, 2000);
            }
            botData.lastHealth = packet.health;
        });

        // 🚨 الكود الجديد لصيد أسباب الطرد والأخطاء بدقة 🚨
        
        // 1. إذا قام السيرفر بطرد البوت (Kick/Disconnect)
        client.on('disconnect', (packet) => {
            const reason = packet?.message || packet?.reason || 'تم الطرد من السيرفر (بدون سبب واضح)';
            botData.status = `مفصول: ${reason}`;
            clearAllTimers(botData);
            console.log(`[DISCONNECT] ${botData.username}: ${reason}`);
        });

        // 2. إذا حدث خطأ في الاتصال أو الشبكة
        client.on('error', (err) => {
            botData.status = `خطأ: ${err.message}`;
            clearAllTimers(botData);
            console.log(`[ERROR] ${botData.username}: ${err.message}`);
        });

        // 3. عند إغلاق الاتصال بشكل عام
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

        // نظام الحركة لمنع الـ AFK
        botData.moveInterval = setInterval(() => {
            if (botData.status !== 'Online' || !botData.runtime_id || botData.lastHealth <= 0) return;
            client.write('animate', { action_id: 1, runtime_id: botData.runtime_id });

            const directions = [{ dx: 2, dz: 0 }, { dx: -2, dz: 0 }, { dx: 0, dz: 2 }, { dx: 0, dz: -2 }];
            const randomDir = directions[Math.floor(Math.random() * directions.length)];
            const targetX = botData.coordinates.x + randomDir.dx;
            const targetZ = botData.coordinates.z + randomDir.dz;
            const jumpY = botData.coordinates.y + 1;

            client.write('move_player', {
                runtime_id: botData.runtime_id, position: { x: targetX, y: jumpY, z: targetZ },
                pitch: 0, yaw: 0, head_yaw: 0, mode: 'normal', on_ground: false, 
                ridden_runtime_id: 0n, teleport_cause: 'unknown', teleport_item: 0
            });

            setTimeout(() => {
                if (botData.status !== 'Online') return;
                client.write('move_player', {
                    runtime_id: botData.runtime_id, position: { x: targetX, y: botData.coordinates.y, z: targetZ },
                    pitch: 0, yaw: 0, head_yaw: 0, mode: 'normal', on_ground: true, 
                    ridden_runtime_id: 0n, teleport_cause: 'unknown', teleport_item: 0
                });
                botData.coordinates.x = targetX; botData.coordinates.z = targetZ;
            }, 500);
        }, 60 * 1000);

        // نظام الخروج والدخول التلقائي
        botData.reconnectTimer = setTimeout(() => {
            if(botData.status === 'Online') {
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
    clearInterval(botData.moveInterval);
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

// --- API ROUTES ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.get('/api/bots', (req, res) => {
    const botsList = Array.from(botsManager.values()).map(bot => {
        const { client, reconnectTimer, uptimeInterval, moveInterval, runtime_id, ...safeData } = bot;
        return safeData;
    });
    res.json(botsList);
});

app.post('/api/bots/add', (req, res) => {
    const { id, username, host, port } = req.body;
    if (!id || !username || !host) return res.status(400).json({ error: 'Missing data' });
    botsManager.set(id, {
        id, username, serverIp: host, port: port || 19132,
        status: 'Offline', coordinates: { x: 0, y: 0, z: 0 }, uptime: 0, lastHealth: 20,
        client: null, reconnectTimer: null, uptimeInterval: null, moveInterval: null, runtime_id: null
    });
    res.json({ message: 'Bot added.' });
});

app.post('/api/bots/start', (req, res) => { startMinecraftBot(req.body.id); res.json({ message: 'Bot starting...' }); });
app.post('/api/bots/stop', (req, res) => { stopMinecraftBot(req.body.id); res.json({ message: 'Bot stopped.' }); });
app.post('/api/bots/delete', (req, res) => { stopMinecraftBot(req.body.id); botsManager.delete(req.body.id); res.json({ message: 'Bot deleted.' }); });
app.post('/api/bots/edit', (req, res) => {
    const bot = botsManager.get(req.body.id);
    if (bot && !bot.status.includes('Online') && !bot.status.includes('Connecting')) {
        bot.username = req.body.username; bot.serverIp = req.body.host; bot.port = req.body.port;
        res.json({ message: 'Bot updated.' });
    } else { res.status(400).json({ error: 'Stop the bot before editing.' }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`Dashboard running on port ${PORT}`); });
