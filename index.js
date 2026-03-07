const bedrock = require('bedrock-protocol');
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تخزين البوتات النشطة
let activeBots = {};

// --- الواجهة الرسومية البسيطة (HTML) ---
app.get('/', (req, res) => {
    let botList = Object.keys(activeBots).map(name => `
        <div style="border: 1px solid #ccc; padding: 10px; margin: 10px; border-radius: 8px;">
            <strong>🤖 الاسم: ${name}</strong> | الحالة: <span style="color: green;">نشط</span>
            <button onclick="stopBot('${name}')" style="background: red; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px; margin-left: 10px;">إيقاف</button>
        </div>
    `).join('');

    res.send(`
        <body style="font-family: sans-serif; direction: rtl; padding: 20px; background: #f4f4f9;">
            <h2>🚀 لوحة تحكم بوتات ماينكرافت (Kinga Dash)</h2>
            <div style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <h3>إضافة بوت جديد</h3>
                <form action="/start" method="POST">
                    IP: <input type="text" name="host" required placeholder="example.aternos.me">
                    Port: <input type="number" name="port" required placeholder="12345">
                    Username: <input type="text" name="username" required placeholder="Bot_Name">
                    <button type="submit" style="background: green; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 4px;">تشغيل البوت</button>
                </form>
            </div>
            <hr>
            <h3>البوتات المشغلة حالياً:</h3>
            <div id="botList">${botList || '<p>لا توجد بوتات نشطة حالياً.</p>'}</div>

            <script>
                function stopBot(name) {
                    fetch('/stop', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({username: name})
                    }).then(() => location.reload());
                }
            </script>
        </body>
    `);
});

// --- وظائف التحكم بالبوتات ---

// 1. دالة تشغيل بوت جديد
function startNewBot(host, port, username) {
    if (activeBots[username]) {
        console.log(`⚠️ البوت ${username} موجود بالفعل.`);
        return;
    }

    console.log(`📡 جاري تشغيل بوت جديد: ${username} على ${host}:${port}`);
    
    const client = bedrock.createClient({
        host: host,
        port: parseInt(port),
        username: username,
        offline: true
    });

    // إعداد البوت ككائن (Object)
    activeBots[username] = {
        client: client,
        interval: null
    };

    client.on('spawn', () => {
        console.log(`✅ [${username}] رسبن في السيرفر.`);
        
        // حركة الدلع كل 3 دقائق
        activeBots[username].interval = setInterval(() => {
            try {
                if (!client.startGameData) return;
                const moveX = (Math.random() - 0.5) * 2;
                const moveZ = (Math.random() - 0.5) * 2;
                
                client.queue('player_auth_input', {
                    pitch: 0, yaw: 0,
                    position: { 
                        x: client.startGameData.player_position.x + moveX, 
                        y: client.startGameData.player_position.y, 
                        z: client.startGameData.player_position.z + moveZ 
                    },
                    move_vector: { x: moveX, z: moveZ },
                    head_yaw: 0, input_data: { _value: 0n },
                    input_mode: 'mouse', play_mode: 'normal', tick: 0n,
                    delta: { x: moveX, y: 0, z: moveZ }
                });
                console.log(`🏃‍♂️ [${username}] تحرك خطوة.`);
            } catch (e) { console.log(`❌ خطأ حركة [${username}]:`, e.message); }
        }, 180000);
    });

    client.on('disconnect', (p) => {
        console.log(`🔌 [${username}] انفصل: ${p.reason}`);
        // إعادة اتصال تلقائي إذا لم يتم إيقافه يدوياً
        if (activeBots[username]) {
            setTimeout(() => startNewBot(host, port, username), 10000);
        }
    });

    client.on('error', (e) => console.log(`⚠️ خطأ [${username}]:`, e.message));
}

// --- الروابط (API Endpoints) ---

app.post('/start', (req, res) => {
    const { host, port, username } = req.body;
    startNewBot(host, port, username);
    res.redirect('/');
});

app.post('/stop', (req, res) => {
    const { username } = req.body;
    if (activeBots[username]) {
        clearInterval(activeBots[username].interval);
        activeBots[username].client.disconnect();
        delete activeBots[username]; // حذفه من القائمة النشطة
        console.log(`🛑 تم إيقاف البوت [${username}] يدوياً.`);
    }
    res.sendStatus(200);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dashboard ready on port ${PORT}`));
