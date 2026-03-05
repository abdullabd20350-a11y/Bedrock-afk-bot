const bedrock = require('bedrock-protocol');
const express = require('express');
const app = express();

// 1. خادم ويب لـ Render و UptimeRobot
app.get('/', (req, res) => {
  res.send('<h1>Bot is Moving & Running 24/7! 🚀</h1>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📡 Web server is listening on port ${PORT}`);
});

// 2. إعدادات اتصال البوت
const client = bedrock.createClient({
  host: 'abdnt4.aternos.me', 
  port: 64541,              
  username: 'bbtr45yb', 
  offline: true             
});

// 3. نظام الحركة العشوائية والرسائل
client.on('spawn', () => {
  console.log('👤 البوت رسبن وبدأ الحركة الذكية!');

  // وظيفة الحركة كل 3 دقائق (180,000 مللي ثانية)
  setInterval(() => {
    try {
      // توليد إحداثيات عشوائية بسيطة (خطوة واحدة)
      const moveX = (Math.random() - 0.5) * 2; // يمين أو يسار
      const moveZ = (Math.random() - 0.5) * 2; // قدام أو ورا
      
      // إرسال حزمة الحركة للسيرفر
      client.queue('player_auth_input', {
        pitch: 0,
        yaw: 0,
        position: { x: client.startGameData.player_position.x + moveX, y: client.startGameData.player_position.y, z: client.startGameData.player_position.z + moveZ },
        move_vector: { x: moveX, z: moveZ },
        head_yaw: 0,
        input_data: { _value: 0n },
        input_mode: 'mouse',
        play_mode: 'normal',
        tick: 0n,
        delta: { x: moveX, y: 0, z: moveZ }
      });

      // إرسال رسالة شات للتأكيد
      client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: client.username,
        xuid: '',
        platform_chat_id: '',
        message: 'Moving to stay active! 🏃‍♂️'
      });
      
      console.log(`🏃‍♂️ تحرك البوت خطوة عشوائية: X:${moveX.toFixed(2)}, Z:${moveZ.toFixed(2)}`);
    } catch (err) {
      console.log('⚠️ خطأ في نظام الحركة:', err.message);
    }
  }, 180000); 
});

// 4. معالجة الأخطاء
client.on('error', (err) => console.log('❌ خطأ:', err.message));
client.on('disconnect', (packet) => console.log('🔌 انفصل، السبب:', packet.reason));
