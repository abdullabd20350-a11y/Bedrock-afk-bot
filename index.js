const bedrock = require('bedrock-protocol');
const express = require('express');
const app = express();

// ==========================================
// الإعدادات - بيانات سيرفرك الجديدة يا ملك
// ==========================================
const config = {
    host: '162.55.100.208',   // الآيبي الجديد
    port: 25199,             // البورت الجديد
    username: 'Kinga_Bot',   // اسم البوت
    moveInterval: 60000      // حركة كل دقيقة (60 ثانية)
};

let bot;
let currentPos = { x: 0, y: 0, z: 0 };
let runtimeId;

// سيرفر ويب لضمان عمل البوت على منصات الاستضافة (Port Binding)
app.get('/', (req, res) => res.send('Kinga Bedrock Bot is Active!'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Web server active on port ${PORT}`));

function createBot() {
    console.log(`[System] Connecting to ${config.host}:${config.port}...`);

    bot = bedrock.createClient({
        host: config.host,
        port: config.port,
        username: config.username,
        offline: true
    });

    bot.on('start_game', (packet) => {
        runtimeId = packet.runtime_entity_id;
        console.log('[System] Game Started! RuntimeID:', runtimeId);
    });

    // ميزة الرسبون التلقائي فور الموت
    bot.on('respawn', (packet) => {
        console.log('[Death] Bot died! Sending respawn request...');
        bot.queue('respawn', {
            runtime_entity_id: runtimeId,
            state: 0, 
            position: { x: 0, y: 0, z: 0 }
        });
    });

    bot.on('spawn', () => {
        console.log('[System] Bot Spawned at its position!');
        
        if (bot.startGameData) {
            currentPos = bot.startGameData.player_position;
        }

        // إيقاف أي حلقة قديمة قبل البدء بجديدة لتجنب تضاعف السرعة
        if (global.moveLoop) clearInterval(global.moveLoop);

        global.moveLoop = setInterval(() => {
            if (!bot) return clearInterval(global.moveLoop);
            
            try {
                const isJump = Math.random() > 0.5;
                let nextPos = { ...currentPos };

                if (isJump) {
                    console.log('[Move] Action: Jumping');
                    nextPos.y += 1.2;
                    sendMove(nextPos, false);
                    setTimeout(() => {
                        if (bot) sendMove(currentPos, true);
                    }, 500);
                } else {
                    console.log('[Move] Action: Walking 1 block');
                    nextPos.x += (Math.random() - 0.5) * 2;
                    nextPos.z += (Math.random() - 0.5) * 2;
                    sendMove(nextPos, true);
                    currentPos = nextPos; // حفظ الموقع الجديد للخطوة القادمة
                }
            } catch (err) {
                console.log('[Error] Movement calculation skipped');
            }
        }, config.moveInterval);
    });

    bot.on('error', (err) => {
        console.log(`[Error Log]: ${err.message}`);
        reconnect();
    });

    bot.on('close', () => {
        console.log('[System] Connection lost. Reconnecting in 15s...');
        reconnect();
    });
}

function sendMove(pos, onGround) {
    if (!bot || !runtimeId) return;
    bot.queue('move_player', {
        runtime_entity_id: runtimeId,
        position: pos,
        pitch: 0, yaw: 0, head_yaw: 0,
        mode: 0, on_ground: onGround,
        teleporter_id: 0
    });
}

function reconnect() {
    if (global.moveLoop) clearInterval(global.moveLoop);
    bot = null;
    setTimeout(createBot, 15000); // إعادة محاولة الاتصال بعد 15 ثانية
}

createBot();
