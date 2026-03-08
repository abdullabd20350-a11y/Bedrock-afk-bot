const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const fs = require('fs'); 
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'kinga-stable-safe-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==========================================
// 1. نظام الحماية وإدارة البيانات
// ==========================================
process.on('uncaughtException', (err) => { console.log('[System-Error]:', err.message); });

const dbPath = './database.json';
let data = { users: [], activeBots: {} };

if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath)); } 
    catch (e) { data = { users: [], activeBots: {} }; }
}

let botInstances = {}; // تخزين البوتات الحية في الذاكرة

function saveData() {
    let cleanData = { users: data.users, activeBots: {} };
    for (let id in data.activeBots) {
        let b = data.activeBots[id];
        cleanData.activeBots[id] = {
            id: b.id, host: b.host, port: b.port, type: b.type, owner: b.owner, botName: b.botName,
            connected: b.connected, connecting: b.connecting, pos: b.pos, startTime: b.startTime
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(cleanData, null, 2));
}

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// ==========================================
// 2. محرك النشاط المتطور (Anti-AFK)
// ==========================================
function runActivity(id) {
    const b = data.activeBots[id];
    const client = botInstances[id];
    if (!b || !b.connected || !client) return;

    if (b.type === 'java') {
        const action = ['forward', 'back', 'left', 'right', 'jump'][Math.floor(Math.random() * 5)];
        if (action === 'jump') {
            client.setControlState('jump', true);
            setTimeout(() => { if (client.setControlState) client.setControlState('jump', false); }, 500);
        } else {
            client.setControlState(action, true);
            setTimeout(() => { if (client.setControlState) client.setControlState(action, false); }, 1000);
        }
    } else {
        try {
            let p = { ...b.pos };
            p.x += (Math.random() - 0.5) * 2;
            client.queue('move_player', { runtime_entity_id: b.runtimeId, position: p, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
            b.pos = p;
        } catch (e) {}
    }
}

// ==========================================
// 3. واجهة المستخدم (The King's UI)
// ==========================================
const layout = (title, content) => `
<html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
    .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 800px; margin: auto; }
    .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 15px; border: 1px solid #eee; transition: 0.3s; }
    .status { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
    .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .btn-start { background: #28a745; color: white; }
    .btn-stop { background: #ffc107; color: #212529; }
    .btn-del { background: #dc3545; color: white; }
    input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; }
    .xyz { font-family: monospace; background: #f8f9fa; padding: 10px; border-radius: 10px; display: flex; gap: 10px; margin: 10px 0; }
</style></head><body>${content}</body></html>`;

app.get('/login', (req, res) => res.send(layout('دخول', `<div class="card" style="max-width:380px; text-align:center;"><h2>دخول الملك كينجا 👑</h2><form action="/auth-login" method="POST"><input name="username" placeholder="اليوزر" required><input name="password" type="password" placeholder="الباسورد" required><button class="btn btn-start" style="width:100%">دخول</button></form><p><a href="/register">حساب جديد</a></p></div>`)));
app.get('/register', (req, res) => res.send(layout('تسجيل', `<div class="card" style="max-width:380px; text-align:center;"><h2>حساب جديد</h2><form action="/auth-register" method="POST"><input name="username" placeholder="اليوزر" required><input name="password" type="password" placeholder="الباسورد" required><input name="confirm" type="password" placeholder="تأكيد" required><button class="btn btn-start" style="width:100%">إنشاء</button></form></div>`)));

app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    let cards = myBots.map(id => {
        const b = data.activeBots[id];
        let state = b.connecting ? 'جاري الانضمام...' : (b.connected ? 'متصل ✅' : 'متوقف ❌');
        return `
        <div class="bot-card" style="border-right: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${b.botName} <small>(${b.type})</small></h3>
                <span class="status" style="background:${b.connected?'#d4edda':'#f8d7da'}">${state}</span>
            </div>
            <div class="xyz">
                <span>X: <b>${b.pos.x.toFixed(1)}</b></span><span>Y: <b>${b.pos.y.toFixed(1)}</b></span><span>Z: <b>${b.pos.z.toFixed(1)}</b></span>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${id}','start')" class="btn btn-start" style="flex:1;" ${b.connected || b.connecting ? 'disabled opacity:0.5':''}>تشغيل</button>
                <button onclick="ctl('${id}','stop')" class="btn btn-stop" style="flex:1;" ${!b.connected && !b.connecting ? 'disabled opacity:0.5':''}>إيقاف</button>
                <button onclick="ctl('${id}','delete')" class="btn btn-del" style="flex:1;">حذف</button>
            </div>
        </div>`;
    }).join('');
    res.send(layout('الرئيسية', `<div class="card"><h2>🚀 لوحة التحكم</h2><form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:20px 0;"><select name="type"><option value="java">Java</option><option value="bedrock">Bedrock</option></select><input name="botName" placeholder="اسم البوت"><input name="address" placeholder="IP:Port" style="grid-column:span 2;"><button class="btn btn-start" style="grid-column:span 2;">إضافة</button></form>${cards || '<p style="text-align:center;">لا توجد بوتات</p>'}</div><script>function ctl(id,a){fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})}).then(()=>setTimeout(()=>location.reload(), 1500));}setInterval(()=>{if(!document.body.innerText.includes('جاري الانضمام')) location.reload();}, 25000);</script>`));
});

// ==========================================
// 4. منطق التحكم (Core logic)
// ==========================================
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("Error");
    data.users.push({ username, password }); saveData(); res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const user = data.users.find(u => u.username === req.body.username && u.password === req.body.password);
    if (user) { req.session.user = user.username; return res.redirect('/'); }
    res.send("Failed");
});

app.post('/add', checkAuth, (req, res) => {
    const { type, address, botName } = req.body;
    const id = Date.now().toString();
    let [h, p] = address.trim().split(':');
    if (!p) p = type === 'java' ? 25565 : 19132;
    data.activeBots[id] = { id, botName, host: h, port: parseInt(p), type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, startTime: null };
    saveData(); res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const b = data.activeBots[id];
    if (!b) return res.sendStatus(404);

    if (action === 'start' && !b.connected) {
        b.connecting = true; saveData();
        if (b.type === 'java') {
            botInstances[id] = mineflayer.createBot({ host: b.host, port: b.port, username: b.botName, auth: 'offline', checkTimeoutInterval: 60000 });
            
            botInstances[id].once('spawn', () => { 
                b.connected = true; b.connecting = false; b.startTime = Date.now(); 
                b.pos = botInstances[id].entity.position; saveData(); 
                if (b.itv) clearInterval(b.itv);
                b.itv = setInterval(() => runActivity(id), 120000);
            });
            botInstances[id].on('move', () => { if(botInstances[id].entity) b.pos = botInstances[id].entity.position; });
            botInstances[id].on('error', (err) => { console.log(`[Java Error ${b.botName}]:`, err.message); b.connected = false; b.connecting = false; saveData(); });
            botInstances[id].on('end', () => { b.connected = false; b.connecting = false; saveData(); });
        } else {
            botInstances[id] = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true, version: '1.20.0' });
            
            botInstances[id].on('start_game', (pkt) => { b.runtimeId = pkt.runtime_entity_id; });
            botInstances[id].once('spawn', () => { 
                b.connected = true; b.connecting = false; b.startTime = Date.now();
                if(botInstances[id].startGameData) b.pos = botInstances[id].startGameData.player_position;
                saveData();
                if (b.itv) clearInterval(b.itv);
                b.itv = setInterval(() => runActivity(id), 120000);
            });
            botInstances[id].on('error', (err) => { console.log(`[Bedrock Error ${b.botName}]:`, err.message); b.connected = false; b.connecting = false; saveData(); });
        }
    } else if (action === 'stop' || action === 'delete') {
        if (b.itv) clearInterval(b.itv);
        if (botInstances[id]) { b.type === 'java' ? botInstances[id].quit() : botInstances[id].disconnect(); delete botInstances[id]; }
        b.connected = false; b.connecting = false;
        if (action === 'delete') delete data.activeBots[id];
        saveData();
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.listen(process.env.PORT || 10000, () => console.log('🚀 Kinga Pro Dashboard v2.0 - Final Build'));
