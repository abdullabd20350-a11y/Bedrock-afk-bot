const bedrock = require('bedrock-protocol');
const express = require('express');
const app = express();

// خادم ويب لإبقاء الاستضافة تعمل
app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(process.env.PORT || 3000);

// إعدادات البوت
const client = bedrock.createClient({
  host: 'abdnt4.aternos.me', 
  port: 64541, 
  username: 'Kinga_Cloud_Bot', 
  offline: true 
});

client.on('join', () => console.log('✅ Bot Joined Aternos!'));
client.on('error', (err) => console.log('❌ Error:', err.message));
