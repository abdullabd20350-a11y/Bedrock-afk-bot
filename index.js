const bedrock = require('bedrock-protocol');
const express = require('express');
const session = require('express-session');
const fs = require('fs'); 
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'kinga-bedrock-only-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==========================================
// 1. نظام الحماية وإدارة البيانات
// ==========================================
process.on('uncaughtException', (err) => { console.log('[Critical-Error]:', err.message); });

const dbPath = './database.json';
let data = { users: [], activeBots: {} };

if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath)); } 
    catch (e) { data = { users: [], activeBots: {} }; }
}

let botInstances = {}; 

function saveData() {
    let cleanData = { users: data.users, activeBots: {} };
    for (let id in data.activeBots) {
        let b = data.activeBots[id];
        cleanData.activeBots[id] = {
            id: b.id, host: b.host, port: b.port, owner: b.owner, botName: b.botName,
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
// 2. محرك النشاط (مشي وقفز فيزيائي)
// ==========================================
function runActivity(id) {
    const b = data.activeBots[id];
    const client = botInstances[id];
    if (!b || !b.connected || !client) return;

    try {
        let p = { ...b.pos };
        const isJump = Math.random() > 0.5;

        if (isJump) {
            // القفز: رفع الإحداثي Y ثم خفضه
            p.y += 1.2;
            client.queue('move_player', { runtime_entity_id: b.runtimeId, position: p, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: false, teleporter_id: 0 });
            setTimeout(() => {
                if (b.connected) {
                    p.y -= 1.2;
                    client.queue('move_player', { runtime_entity_id: b.runtimeId, position: p, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
                }
            }, 500);
        } else {
            // المشي: تغيير بسيط في X و Z
            p.x += (Math.random() - 0.5) * 2;
            p.z += (Math.random() - 0.5) * 2;
            client.queue('move_player', { runtime_entity_id: b.runtimeId, position: p, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
        }
        b.pos = p;
        saveData();
    } catch (e) { console.log("Movement error"); }
}

// ==========================================
// 3. واجهة المستخدم (التحكم الكامل)
// ==========================================
const layout = (title, content) => `
<html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
    .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 800px; margin: auto; }
    .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; position: relative; border-right: 6px solid #dc3545; }
    .bot-card.online { border-right-color: #28a745; }
    .status { padding: 6px 12px; border-radius: 20px; font-size: 0.85em; font-weight: bold; }
    .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .btn-start { background: #28a745; color: white; }
    .btn-stop { background: #ffc107; color: #212529; }
    .btn-del { background: #dc3545; color: white; }
    input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
    .xyz-box { font-family: monospace; background: #f8f9fa; padding: 12px; border-radius: 10px; margin: 10px 0; display: flex; justify-content: space-around; border: 1px solid #eee; }
    .uptime { color: #1a73e8; font-weight: bold; }
</style></head><body>${content}</body></html>`;

app.get('/login', (req, res) => res.send(layout('دخول', `<div class="card" style="max-width:380px; text-align:center;"><h2>دخول كينجا 👑</h2><form action="/auth-login" method="POST"><input name="username" placeholder="اليوزر" required><input name="password" type="password" placeholder="الباسورد" required><button class="btn btn-start" style="width:100%">دخول</button></form><p><a href="/register">حساب جديد</a></p></div>`)));
app.get('/register', (req, res) => res.send(layout('تسجيل', `<div class="card" style="max-width:380px; text-align:center;"><h2>إنشاء حساب</h2><form action="/auth-register" method="POST"><input name="username" placeholder="اليوزر" required><input name="password" type="password" placeholder="الباسورد" required><input name="confirm" type="password" placeholder="تأكيد" required><button class="btn btn-start" style="width:100%">إنشاء</button></form></div>`)));

app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    let cards = myBots.map(id => {
        const b = data.activeBots[id];
        let state = b.connecting ? 'جاري الانضمام...' : (b.connected ? 'متصل ✅' : 'متوقف ❌');
        return `
        <div class="bot-card ${b.connected ? 'online' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${b.botName} <small>(Bedrock)</small></h3>
                <span class="status" style="background:${b.connected?'#d4edda':'#f8d7da'}">${state}</span>
            </div>
            <div class="xyz-box">
                <span>X: <b>${b.pos.x.toFixed(1)}</b></span><span>Y: <b>${b.pos.y.toFixed(1)}</b></span><span>Z: <b>${b.pos.z.toFixed(1)}</b></span>
            </div>
            <p>⏱️ مدة الجلسة: <span class="uptime" id="timer-${id}" data-start="${b.startTime || ''}">---</span></p>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${id}','start')" class="btn btn-start" style="flex:1;" ${b.connected || b.connecting ? 'disabled opacity:0.5':''}>تشغيل</button>
                <button onclick="ctl('${id}','stop')" class="btn btn-stop" style="flex:1;" ${!b.connected && !b.connecting ? 'disabled opacity:0.5':''}>إيقاف</button>
                <button onclick="ctl('${id}','delete')" class="btn btn-del" style="flex:1;">حذف</button>
            </div>
        </div>`;
    }).join('');
    res.send(layout('الرئيسية', `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center;"><h2>🚀 لوحة كينجا (بيدروك فقط)</h2><a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">خروج</a></div><form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr; gap:10px; margin:20px 0; background:#f4f4f4; padding:15px; border-radius:15px;"><input name="botName" placeholder="اسم البوت" required><input name="address" placeholder="الآيبي:البورت (مثال: kinga.aternos.me:12345)" required><button class="btn btn-start">إضافة بوت جديد</button></form>${cards || '<p style="text-align:center;">لا توجد بوتات نشطة</p>'}</div><script>function ctl(id,a){fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})}).then(()=>setTimeout(()=>location.reload(), 1500));}setInterval(()=>{document.querySelectorAll('[id^="timer-"]').forEach(el=>{const s=el.getAttribute('data-start');if(s){const d=Math.floor((Date.now()-parseInt(s))/1000);const m=Math.floor(d/60);const sc=d%60;el.innerText=m+"m "+sc+"s";}else el.innerText="---";});},1000);setInterval(()=>{if(!document.body.innerText.includes('جاري الانضمام')) location.reload();}, 25000);</script>`));
});

// ==========================================
// 4. منطق التحكم (Bedrock Engine)
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
    const { address, botName } = req.body;
    const id = Date.now().toString();
    let [h, p] = address.trim().split(':');
    if (!p) p = 19132;
    data.activeBots[id] = { id, botName, host: h, port: parseInt(p), type: 'bedrock', owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, startTime: null };
    saveData(); res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const b = data.activeBots[id];
    if (!b) return res.sendStatus(404);

    if (action === 'start' && !b.connected) {
        b.connecting = true; saveData();
        try {
            botInstances[id] = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true, version: '1.20.0' });
            
            botInstances[id].on('start_game', (pkt) => { b.runtimeId = pkt.runtime_entity_id; });
            
            botInstances[id].on('spawn', () => { 
                b.connected = true; b.connecting = false; b.startTime = Date.now();
                if(botInstances[id].startGameData) b.pos = botInstances[id].startGameData.player_position;
                saveData();
                if (b.itv) clearInterval(b.itv);
                b.itv = setInterval(() => runActivity(id), 120000);
            });

            botInstances[id].on('error', (err) => { 
                console.log(`[Bedrock Error ${b.botName}]:`, err.message); 
                b.connected = false; b.connecting = false; saveData(); 
            });

            botInstances[id].on('close', () => { b.connected = false; b.connecting = false; saveData(); });

        } catch (e) { b.connecting = false; saveData(); }
        
    } else if (action === 'stop' || action === 'delete') {
        if (b.itv) clearInterval(b.itv);
        if (botInstances[id]) { botInstances[id].disconnect(); delete botInstances[id]; }
        b.connected = false; b.connecting = false; b.startTime = null;
        if (action === 'delete') delete data.activeBots[id];
        saveData();
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.listen(process.env.PORT || 10000, () => console.log('🚀 Kinga Bedrock Dashboard Online!'));
