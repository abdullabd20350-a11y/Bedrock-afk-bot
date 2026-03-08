const bedrock = require('bedrock-protocol');
const express = require('express');
const app = express();

// ==========================================
// الإعدادات - ضع بيانات سيرفرك هنا
// ==========================================
const config = {
    host: 'ضع_الآيبي_هنا',      // مثال: '162.55.100.208'
    port: 25199,               // البورت الافتراضي للبيدروك
    username: 'Kinga_Bot',     // اسم البوت داخل اللعبة
    moveInterval: 60000        // حركة كل دقيقة (60000 مللي ثانية)
};

let bot;
let currentPos = { x: 0, y: 0, z: 0 };
let runtimeId;

// سيرفر ويب بسيط لإبقاء الخدمة تعمل على منصات الاستضافة
app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(process.env.PORT || 10000);

function createBot() {
    console.log(`[System] Connecting to ${config.host}:${config.port}...`);

    bot = bedrock.createClient({
        host: config.host,
        port: config.port,
        username: config.username,
        offline: true // للدخول للسيرفرات المكركة
    });

    // التقاط معرف البوت فور بدء اللعبة
    bot.on('start_game', (packet) => {
        runtimeId = packet.runtime_entity_id;
        console.log('[System] Game Started!');
    });

    // عند دخول البوت للعالم فعلياً
    bot.on('spawn', () => {
        console.log('[System] Bot Spawned!');
        
        // الحصول على الإحداثيات الأولية
        if (bot.startGameData) {
            currentPos = bot.startGameData.player_position;
        }

        // بدء حلقة الحركة كل دقيقة
        const moveLoop = setInterval(() => {
            if (!bot) return clearInterval(moveLoop);
            
            try {
                const isJump = Math.random() > 0.5;
                let nextPos = { ...currentPos };

                if (isJump) {
                    console.log('[Action] Jumping...');
                    nextPos.y += 1.2;
                    sendMove(nextPos, false); // قفزة للأعلى
                    setTimeout(() => sendMove(currentPos, true), 500); // العودة للأرض
                } else {
                    console.log('[Action] Walking...');
                    nextPos.x += (Math.random() - 0.5) * 2;
                    nextPos.z += (Math.random() - 0.5) * 2;
                    sendMove(nextPos, true);
                    currentPos = nextPos; // تحديث الموقع الحالي
                }
            } catch (err) {
                console.log('[Error] Movement failed');
            }
        }, config.moveInterval);
    });

    bot.on('error', (err) => {
        console.log(`[Error]: ${err.message}`);
        reconnect();
    });

    bot.on('close', () => {
        console.log('[System] Connection closed. Reconnecting...');
        reconnect();
    });
}

// دالة إرسال حزمة الحركة للسيرفر
function sendMove(pos, onGround) {
    bot.queue('move_player', {
        runtime_entity_id: runtimeId,
        position: pos,
        pitch: 0, yaw: 0, head_yaw: 0,
        mode: 0, on_ground: onGround,
        teleporter_id: 0
    });
}

// دالة إعادة الاتصال التلقائي في حال الفصل
function reconnect() {
    bot = null;
    setTimeout(createBot, 10000); // حاول مرة أخرى بعد 10 ثوانٍ
}

createBot();
