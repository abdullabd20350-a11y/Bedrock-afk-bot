const bedrock = require('bedrock-protocol');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-secret-2026',
    resave: false,
    saveUninitialized: true
}));

// ==========================================
// 1. إدارة البيانات
// ==========================================
const dbPath = './database.json';
let data = { bots: {} };

if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath)); } catch (e) { data = { bots: {} }; }
}

function saveDB() {
    const toSave = { bots: {} };
    for (let id in data.bots) {
        let b = data.bots[id];
        toSave.bots[id] = {
            id: b.id, host: b.host, port: b.port, botName: b.botName,
            pos: b.pos, connected: false // نحفظ الإعدادات فقط
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(toSave, null, 2));
}

let activeClients = {}; // لتخزين اتصالات البوتات في الذاكرة

// ==========================================
// 2. محرك الحركة (Anti-AFK & Respawn)
// ==========================================
function startBotLogic(id) {
    const b = data.bots[id];
    const client = activeClients[id];

    client.on('start_game', (pkt) => { b.runtimeId = pkt.runtime_entity_id; });

    client.on('spawn', () => {
        b.connected = true;
        if (client.startGameData) b.pos = client.startGameData.player_position;

        // الرسبون التلقائي
        client.on('respawn', () => {
            client.queue('respawn', { runtime_entity_id: b.runtimeId, state: 0, position: { x: 0, y: 0, z: 0 } });
        });

        // حلقة الحركة (كل دقيقة)
        b.moveInterval = setInterval(() => {
            if (!b.connected) return clearInterval(b.moveInterval);
            try {
                let p = { ...b.pos };
                if (Math.random() > 0.5) {
                    p.y += 1; // قفزة
                    client.queue('move_player', { runtime_entity_id: b.runtimeId, position: p, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: false, teleporter_id: 0 });
                    setTimeout(() => { if(b.connected) p.y -= 1; client.queue('move_player', { runtime_entity_id: b.runtimeId, position: p, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 }); }, 500);
                } else {
                    p.x += (Math.random() - 0.5) * 2;
                    client.queue('move_player', { runtime_entity_id: b.runtimeId, position: p, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
                }
                b.pos = p;
            } catch (e) {}
        }, 60000);
    });

    client.on('error', (err) => { b.connected = false; console.log(`Bot ${b.botName} Error: ${err.message}`); });
    client.on('close', () => { b.connected = false; });
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
    .bot-card { background: #f8f9fa; border-radius: 15px; padding: 15px; margin: 15px 0; border: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; text-align: right; }
    .status-on { color: #28a745; font-weight: bold; }
    .status-off { color: #dc3545; font-weight: bold; }
    .btn { padding: 8px 15px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin: 2px; transition: 0.2s; }
    .btn-start { background: #28a745; color: white; }
    .btn-stop { background: #ffc107; color: #222; }
    .btn-del { background: #dc3545; color: white; }
    input { padding: 10px; border: 1px solid #ddd; border-radius: 8px; margin: 5px; width: 100%; max-width: 200px; }
    .xyz { background: #333; color: #0f0; padding: 5px 10px; border-radius: 5px; font-family: monospace; font-size: 0.9em; }
</style>
</head><body><div class="container">${content}</div>
<script>
    function ctl(id, action) {
        fetch('/control', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id, action})
        }).then(() => setTimeout(() => location.reload(), 1000));
    }
    setInterval(() => location.reload(), 30000); // تحديث الصفحة تلقائياً لرؤية الإحداثيات
</script>
</body></html>`;

app.get('/', (req, res) => {
    let botList = Object.values(data.bots).map(b => `
        <div class="bot-card">
            <div>
                <strong>🤖 ${b.botName}</strong> <br>
                <small>${b.host}:${b.port}</small> <br>
                <span class="${b.connected ? 'status-on' : 'status-off'}">${b.connected ? 'متصل ✅' : 'متوقف ❌'}</span>
            </div>
            <div class="xyz">X: ${b.pos.x.toFixed(1)} | Y: ${b.pos.y.toFixed(1)} | Z: ${b.pos.z.toFixed(1)}</div>
            <div>
                <button class="btn btn-start" onclick="ctl('${b.id}', 'start')">تشغيل</button>
                <button class="btn btn-stop" onclick="ctl('${b.id}', 'stop')">إيقاف</button>
                <button class="btn btn-del" onclick="ctl('${b.id}', 'delete')">حذف</button>
            </div>
        </div>
    `).join('');

    res.send(ui(`
        <h1>🚀 مدير بوتات كينجا</h1>
        <form action="/add" method="POST" style="background:#eee; padding:15px; border-radius:15px; margin-bottom:20px;">
            <input name="botName" placeholder="اسم البوت" required>
            <input name="host" placeholder="IP السيرفر" required>
            <input name="port" placeholder="البورت" value="19132" required>
            <button class="btn btn-start" style="width:100%; max-width:100px;">إضافة</button>
        </form>
        ${botList || '<p>لا توجد بوتات مضافة بعد</p>'}
    `));
});

app.post('/add', (req, res) => {
    const id = Date.now().toString();
    data.bots[id] = {
        id, botName: req.body.botName, host: req.body.host, port: parseInt(req.body.port),
        pos: { x: 0, y: 0, z: 0 }, connected: false
    };
    saveDB(); res.redirect('/');
});

app.post('/control', (req, res) => {
    const { id, action } = req.body;
    const b = data.bots[id];
    if (!b) return res.sendStatus(404);

    if (action === 'start' && !b.connected) {
        activeClients[id] = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true });
        startBotLogic(id);
    } else if (action === 'stop' && b.connected) {
        if (activeClients[id]) activeClients[id].disconnect();
        b.connected = false;
        clearInterval(b.moveInterval);
    } else if (action === 'delete') {
        if (activeClients[id]) activeClients[id].disconnect();
        delete data.bots[id];
        delete activeClients[id];
    }
    saveDB(); res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
