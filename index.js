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
    botData.lastHealth = 20; // الصحة الكاملة الافتراضية
    const startTime = Date.now();

    try {
        const client = bedrock.createClient({
            host: botData.serverIp,
            port: botData.port,
            username: botData.username,
            offline: true
        });

        botData.client = client;

        // عند دخول اللعبة
        client.on('start_game', (packet) => {
            botData.status = 'Online';
            botData.runtime_id = packet.runtime_id; 
            
            botData.coordinates = {
                x: Math.round(packet.player_position.x),
                y: Math.round(packet.player_position.y),
                z: Math.round(packet.player_position.z)
            };
            console.log(`${botData.username} spawned at X:${botData.coordinates.x} Y:${botData.coordinates.y} Z:${botData.coordinates.z}`);
        });

        // تحديث الإحداثيات عند الحركة
        client.on('move_player', (packet) => {
            if (packet.runtime_id === botData.runtime_id) {
                botData.coordinates = {
                    x: Math.round(packet.position.x),
                    y: Math.round(packet.position.y),
                    z: Math.round(packet.position.z)
                };
            }
        });

        // --- نظام الصحة والضرب وإعادة الإحياء ---
        client.on('set_health', (packet) => {
            // إذا نقصت الصحة (يعني انضرب) والصحة أكبر من 0
            if (packet.health < botData.lastHealth && packet.health > 0) {
                console.log(`${botData.username} took damage! Health: ${packet.health}`);
                
                // البوت يرسل رسالة في الشات
                client.write('text', {
                    type: 'chat',
                    needs_translation: false,
                    source_name: client.username,
                    xuid: '',
                    platform_chat_id: '',
                    message: 'أوتش! ليش تضربني؟ 🤕' // تقدر تغير هذه الرسالة
                });
            }

            // إذا وصلت الصحة 0 (يعني البوت مات)
            if (packet.health <= 0) {
                console.log(`${botData.username} died! Respawning in 2 seconds...`);
                setTimeout(() => {
                    if (botData.status === 'Online' && botData.runtime_id) {
                        // إرسال حزمة إعادة الإحياء للسيرفر
                        client.write('respawn', {
                            state: 2, // حالة العميل جاهز للإحياء
                            runtime_entity_id: botData.runtime_id
                        });
                        console.log(`${botData.username} respawned!`);
                    }
                }, 2000);
            }

            // حفظ الصحة الحالية للمقارنة في الضربة القادمة
            botData.lastHealth = packet.health;
        });

        client.on('close', () => {
            botData.status = 'Offline';
            clearAllTimers(botData);
            console.log(`${botData.username} disconnected.`);
        });

        client.on('error', (err) => {
            botData.status = 'Error';
            clearAllTimers(botData);
            console.log(`Error with ${botData.username}:`, err.message);
        });

        // تحديث وقت الاتصال
        botData.uptimeInterval = setInterval(() => {
            if (botData.status === 'Online') {
                botData.uptime = Math.floor((Date.now() - startTime) / 1000);
            }
        }, 1000);

        // نظام الحركة التلقائية (كل دقيقة) لمنع الـ AFK
        botData.moveInterval = setInterval(() => {
            if (botData.status !== 'Online' || !botData.runtime_id || botData.lastHealth <= 0) return;

            // تحريك اليد
            client.write('animate', {
                action_id: 1, 
                runtime_id: botData.runtime_id
            });

            // اختيار اتجاه عشوائي
            const directions = [
                { dx: 2, dz: 0 }, { dx: -2, dz: 0 }, { dx: 0, dz: 2 }, { dx: 0, dz: -2 }
            ];
            const randomDir = directions[Math.floor(Math.random() * directions.length)];

            const targetX = botData.coordinates.x + randomDir.dx;
            const targetZ = botData.coordinates.z + randomDir.dz;
            const jumpY = botData.coordinates.y + 1;

            client.write('move_player', {
                runtime_id: botData.runtime_id,
                position: { x: targetX, y: jumpY, z: targetZ },
                pitch: 0, yaw: 0, head_yaw: 0, mode: 'normal', on_ground: false, 
                ridden_runtime_id: 0n, teleport_cause: 'unknown', teleport_item: 0
            });

            setTimeout(() => {
                if (botData.status !== 'Online') return;
                client.write('move_player', {
                    runtime_id: botData.runtime_id,
                    position: { x: targetX, y: botData.coordinates.y, z: targetZ },
                    pitch: 0, yaw: 0, head_yaw: 0, mode: 'normal', on_ground: true, 
                    ridden_runtime_id: 0n, teleport_cause: 'unknown', teleport_item: 0
                });
                
                botData.coordinates.x = targetX;
                botData.coordinates.z = targetZ;
            }, 500);

        }, 60 * 1000);

        // نظام الخروج والدخول التلقائي كل 20 دقيقة
        botData.reconnectTimer = setTimeout(() => {
            if(botData.status === 'Online') {
                console.log(`Auto-reconnecting ${botData.username}...`);
                client.disconnect();
                setTimeout(() => startMinecraftBot(botId), 10000); 
            }
        }, 20 * 60 * 1000);

    } catch (err) {
        botData.status = 'Error';
        console.log(err);
    }
}

// تنظيف الموقتات
function clearAllTimers(botData) {
    clearInterval(botData.uptimeInterval);
    clearInterval(botData.moveInterval);
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

// --- API ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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
        status: 'Offline', coordinates: { x: 0, y: 0, z: 0 }, uptime: 0,
        client: null, reconnectTimer: null, uptimeInterval: null, moveInterval: null, runtime_id: null
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
