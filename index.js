const bedrock = require('bedrock-protocol');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-ultra-secret-2026',
    resave: false,
    saveUninitialized: true
}));

// ==========================================
// 1. إدارة البيانات
// ==========================================
const dbPath = './database.json';
let data = { bots: {} };

if (fs.existsSync(dbPath)) {
    try { 
        data = JSON.parse(fs.readFileSync(dbPath));
        for (let id in data.bots) {
            data.bots[id].connected = false;
            data.bots[id].connecting = false;
            data.bots[id].shouldRun = false; 
            data.bots[id].retryCount = 0;    
        }
    } catch (e) { data = { bots: {} }; }
}

function saveDB() {
    const toSave = { bots: {} };
    for (let id in data.bots) {
        let b = data.bots[id];
        toSave.bots[id] = {
            id: b.id, host: b.host, port: b.port, botName: b.botName,
            pos: b.pos, connected: b.connected, connecting: b.connecting
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(toSave, null, 2));
}

let activeClients = {}; 

// ==========================================
// 2. محرك الاتصال (إنهاء حالة الشبح)
// ==========================================
function connectBot(id) {
    const b = data.bots[id];
    if (!b || !b.shouldRun) return;

    b.connecting = true;
    b.connected = false;
    saveDB();

    try {
        activeClients[id] = bedrock.createClient({ 
            host: b.host, port: b.port, username: b.botName, offline: true 
        });
        const client = activeClients[id];

        client.on('start_game', (pkt) => { 
            b.runtimeId = pkt.runtime_entity_id; 
            if (pkt.player_position) b.pos = pkt.player_position;
            // إجبار السيرفر على تحميل الخريطة
            client.queue('request_chunk_radius', { chunk_radius: 2 });
        });

        client.on('spawn', () => {
            b.connected = true;
            b.connecting = false;
            b.retryCount = 0; 
            saveDB();

            // 🔥 الحل الجذري 1: إخبار السيرفر بإنهاء شاشة التحميل
            client.queue('set_local_player_as_initialized', {
                runtime_entity_id: b.runtimeId
            });

            let tickCount = 0n;

            // 🔥 الحل الجذري 2: محاكاة نبض اللعبة (Tick) كل 50 ملي ثانية
            if (b.physicsInterval) clearInterval(b.physicsInterval);
            b.physicsInterval = setInterval(() => {
                if (!b.connected) return clearInterval(b.physicsInterval);
                try {
                    tickCount++;
                    // هذه الحزمة هي التي تثبت للسيرفر أن هذا لاعب حقيقي
                    client.queue('player_auth_input', {
                        pitch: 0,
                        yaw: 0,
                        position: b.pos,
                        move_vector: { x: 0, z: 0 },
                        head_yaw: 0,
                        input_data: 0n,
                        play_mode: 0,
                        interaction_model: 0,
                        gaze_direction: { x: 0, y: 0, z: 1 },
                        tick: tickCount,
                        delta: { x: 0, y: 0, z: 0 }
                    });
                } catch (e) {}
            }, 50);

            // التقاط الإحداثيات الحقيقية بعد السقوط من السماء
            client.on('move_player', (pkt) => {
                if (pkt.runtime_entity_id === b.runtimeId) {
                    b.pos = pkt.position;
                }
            });

            // Anti-AFK آمن (تأرجح اليد فقط)
            if (b.moveInterval) clearInterval(b.moveInterval);
            b.moveInterval = setInterval(() => {
                if (!b.connected) return clearInterval(b.moveInterval);
                try {
                    client.queue('animate', {
                        action_id: 1, 
                        runtime_entity_id: b.runtimeId
                    });
                } catch (e) {}
            }, 30000);

            // التجديد التلقائي
            if (b.reloginTimer) clearTimeout(b.reloginTimer);
            b.reloginTimer = setTimeout(() => {
                b.isRelogging = true; 
                client.disconnect();
            }, 20 * 60 * 1000); 
        });

        client.on('respawn', () => {
            client.queue('respawn', { runtime_entity_id: b.runtimeId, state: 0, position: { x: 0, y: 0, z: 0 } });
        });

        client.on('error', (err) => { handleDisconnect(id); });
        client.on('close', () => { handleDisconnect(id); });

    } catch (e) {
        handleDisconnect(id);
    }
}

function handleDisconnect(id) {
    const b = data.bots[id];
    if (!b) return;

    if (b.physicsInterval) clearInterval(b.physicsInterval);
    if (b.moveInterval) clearInterval(b.moveInterval);
    if (b.reloginTimer) clearTimeout(b.reloginTimer);
    if (activeClients[id]) delete activeClients[id];

    b.connected = false;
    b.connecting = false;
    saveDB();

    if (!b.shouldRun) return; 

    if (b.isRelogging) {
        b.isRelogging = false;
        setTimeout(() => connectBot(id), 5000); 
        return;
    }

    if (b.retryCount === 0) {
        b.retryCount = 1;
        setTimeout(() => connectBot(id), 30000);
    } 
    else if (b.retryCount === 1) {
        b.retryCount = 2;
        setTimeout(() => connectBot(id), 60000);
    } 
    else {
        b.shouldRun = false; 
        b.retryCount = 0;
        saveDB();
    }
}

// ==========================================
// 3. الواجهة (HTML)
// ==========================================
const ui = (content) => `
<html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>لوحة الملك كينجا</title>
<style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; padding: 20px; text-align: center; }
    .container { max-width: 900px; margin: auto; background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
    .bot-card { background: #f8f9fa; border-radius: 15px; padding: 15px; margin: 15px 0; border: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; text-align: right; border-right: 6px solid #dc3545; }
    .bot-card.online { border-right-color: #28a745; }
    .status-on { color: #28a745; font-weight: bold; background: #d4edda; padding: 5px 10px; border-radius: 10px; }
    .status-off { color: #dc3545; font-weight: bold; background: #f8d7da; padding: 5px 10px; border-radius: 10px; }
    .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; margin: 2px; transition: 0.2s; }
    .btn-start { background: #28a745; color: white; }
    .btn-stop { background: #ffc107; color: #222; }
    .btn-del { background: #dc3545; color: white; }
    input { padding: 12px; border: 1px solid #ddd; border-radius: 10px; margin: 5px; width: 100%; max-width: 180px; }
    .xyz { background: #2c3e50; color: #34e7e4; padding: 10px; border-radius: 10px; font-family: 'Courier New', monospace; font-weight: bold; }
</style></head><body><div class="container">${content}</div>
<script>
    function ctl(id, action) {
        fetch('/control', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id, action})
        }).then(() => setTimeout(() => location.reload(), 800));
    }
    setInterval(() => location.reload(), 5000); 
</script></body></html>`;

app.get('/', (req, res) => {
    let botList = Object.values(data.bots).map(b => {
        let statusText = b.connecting ? 'جاري الاتصال...' : (b.connected ? 'متصل ✅' : 'متوقف ❌');
        return `
        <div class="bot-card ${b.connected ? 'online' : ''}">
            <div>
                <strong>🤖 ${b.botName}</strong> <br>
                <small style="color: #666;">${b.host}:${b.port}</small> <br><br>
                <span class="${b.connected ? 'status-on' : 'status-off'}">${statusText}</span>
            </div>
            <div class="xyz">X: ${b.pos.x.toFixed(1)}<br>Y: ${b.pos.y.toFixed(1)}<br>Z: ${b.pos.z.toFixed(1)}</div>
            <div>
                <button class="btn btn-start" onclick="ctl('${b.id}', 'start')" ${b.connected || b.connecting ? 'disabled opacity:0.5':''}>تشغيل</button>
                <button class="btn btn-stop" onclick="ctl('${b.id}', 'stop')" ${!b.connected && !b.connecting ? 'disabled opacity:0.5':''}>إيقاف</button>
                <button class="btn btn-del" onclick="ctl('${b.id}', 'delete')">حذف</button>
            </div>
        </div>`
    }).join('');

    res.send(ui(`
        <h1 style="color: #2c3e50;">🚀 مدير بوتات كينجا برو (إصدار السرفايفل الحقيقي)</h1>
        <form action="/add" method="POST" style="background:#f1f2f6; padding:20px; border-radius:15px; margin-bottom:20px; display: flex; flex-wrap: wrap; justify-content: center;">
            <input name="botName" placeholder="اسم البوت" required>
            <input name="host" placeholder="IP السيرفر" required>
            <input name="port" placeholder="البورت" value="19132" required>
            <button class="btn btn-start">إضافة بوت</button>
        </form>
        <div id="botList">${botList || '<p style="color: #999;">لا توجد بوتات مضافة حالياً</p>'}</div>
    `));
});

// ==========================================
// 4. العمليات الخلفية
// ==========================================
app.post('/add', (req, res) => {
    const id = Date.now().toString();
    data.bots[id] = { 
        id, botName: req.body.botName, host: req.body.host, port: parseInt(req.body.port), 
        pos: { x: 0, y: 0, z: 0 }, connected: false, connecting: false, shouldRun: false, retryCount: 0 
    };
    saveDB(); res.redirect('/');
});

app.post('/control', (req, res) => {
    const { id, action } = req.body;
    const b = data.bots[id];
    if (!b) return res.sendStatus(404);

    if (action === 'start' && !b.shouldRun) {
        b.shouldRun = true;
        b.retryCount = 0;
        connectBot(id);
    } else if (action === 'stop' || action === 'delete') {
        b.shouldRun = false;
        b.isRelogging = false;
        if (activeClients[id]) activeClients[id].disconnect();
        
        if (action === 'delete') {
            delete data.bots[id];
            saveDB();
        }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
