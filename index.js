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
// 1. نظام الحماية والتخزين الدائم
// ==========================================
process.on('uncaughtException', (err) => { console.log('[Anti-Crash] Error:', err.message); });

const dbPath = './database.json';
let data = { users: [], activeBots: {} };

if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath)); } 
    catch (e) { console.log("Database file error, starting fresh."); }
}

function saveData() {
    let cleanData = { users: data.users, activeBots: {} };
    for (let id in data.activeBots) {
        let b = data.activeBots[id];
        cleanData.activeBots[id] = {
            id: b.id, host: b.host, port: b.port, type: b.type, owner: b.owner, botName: b.botName,
            connected: b.connected, connecting: b.connecting,
            pos: b.pos, deathCount: b.deathCount, startTime: b.startTime
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(cleanData, null, 2));
}

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// ==========================================
// 2. نظام الحركة العشوائية (كل دقيقتين)
// ==========================================
function startAntiAFK(bot) {
    const afkLoop = () => {
        if (!bot.connected || !bot.client) return;

        if (bot.type === 'java' && bot.client.setControlState) {
            const actions = ['forward', 'back', 'left', 'right', 'jump'];
            const action = actions[Math.floor(Math.random() * actions.length)];
            if (action === 'jump') {
                bot.client.setControlState('jump', true);
                setTimeout(() => { if (bot.connected) bot.client.setControlState('jump', false); }, 500);
            } else {
                bot.client.setControlState(action, true);
                setTimeout(() => { if (bot.connected) bot.client.setControlState(action, false); }, 1000);
            }
        } 
        else if (bot.type === 'bedrock' && bot.client) {
            try {
                let currentPos = { ...bot.pos };
                const isJump = Math.random() > 0.5;
                if (isJump) {
                    currentPos.y += 1.2;
                    setTimeout(() => {
                        if (bot.connected) {
                            currentPos.y -= 1.2;
                            bot.client.queue('move_player', { runtime_entity_id: bot.runtimeId, position: currentPos, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
                        }
                    }, 500);
                } else {
                    currentPos.x += (Math.random() - 0.5) * 2;
                    currentPos.z += (Math.random() - 0.5) * 2;
                }
                bot.client.queue('move_player', { runtime_entity_id: bot.runtimeId, position: currentPos, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
                bot.pos = currentPos;
            } catch (e) { console.log("Bedrock move error"); }
        }
        bot.afkTimeout = setTimeout(afkLoop, 120000);
    };
    bot.afkTimeout = setTimeout(afkLoop, 15000);
}

// ==========================================
// 3. واجهة المستخدم (HTML)
// ==========================================
const layout = (title, content) => `
<html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
    .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
    .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; transition: 0.3s; }
    .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
    .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .btn-start { background: #28a745; color: white; }
    .btn-stop { background: #ffc107; color: #212529; }
    .btn-delete { background: #dc3545; color: white; }
    input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
    .coords-box { font-family: monospace; background: #f8f9fa; padding: 10px; border-radius: 10px; margin-top: 10px; display: flex; gap: 15px; border: 1px solid #eee; }
    .uptime { color: #1a73e8; font-weight: bold; }
</style></head><body>${content}</body></html>`;

app.get('/login', (req, res) => res.send(layout('دخول', `<div class="card" style="max-width:400px; text-align:center;"><h2>دخول الملك كينجا 👑</h2><form action="/auth-login" method="POST"><input name="username" placeholder="اليوزر" required><input name="password" type="password" placeholder="الباسورد" required><button class="btn btn-start" style="width:100%">دخول</button></form><p><a href="/register">حساب جديد</a></p></div>`)));
app.get('/register', (req, res) => res.send(layout('تسجيل', `<div class="card" style="max-width:400px; text-align:center;"><h2>إنشاء حساب</h2><form action="/auth-register" method="POST"><input name="username" placeholder="اليوزر" required><input name="password" type="password" placeholder="الباسورد" required><input name="confirm" type="password" placeholder="تأكيد الباسورد" required><button class="btn btn-start" style="width:100%">إنشاء الحساب</button></form><p><a href="/login">العودة للدخول</a></p></div>`)));

app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    let cards = myBots.map(id => {
        const b = data.activeBots[id];
        let statusText = b.connecting ? 'جاري الانضمام...' : (b.connected ? 'متصل ✅' : 'متوقف ❌');
        let isBusy = b.connected || b.connecting;
        return `
        <div class="bot-card" style="border-right: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${b.botName} <small>(${b.type})</small></h3>
                <span class="status-badge" style="background:${b.connected?'#d4edda':'#f8d7da'}; color:${b.connected?'#155724':'#721c24'};">${statusText}</span>
            </div>
            <div class="coords-box">
                <span>X: <b>${b.pos.x.toFixed(1)}</b></span><span>Y: <b>${b.pos.y.toFixed(1)}</b></span><span>Z: <b>${b.pos.z.toFixed(1)}</b></span>
            </div>
            <p style="margin-top:10px;">⏱️ مدة الاتصال: <span class="uptime" id="timer-${id}" data-start="${b.startTime || ''}">---</span></p>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${id}','start')" class="btn btn-start" style="flex:1;" ${isBusy?'disabled opacity:0.5':''}>تشغيل</button>
                <button onclick="ctl('${id}','stop')" class="btn btn-stop" style="flex:1;" ${!isBusy?'disabled opacity:0.5':''}>إيقاف</button>
                <button onclick="ctl('${id}','delete')" class="btn btn-delete" style="flex:1;">حذف</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('الرئيسية', `
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center;"><h2>🚀 لوحة التحكم</h2><a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">خروج</a></div>
        <form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:20px 0; background:#f4f4f4; padding:15px; border-radius:15px;">
            <select name="type"><option value="java">Java (جافا)</option><option value="bedrock">Bedrock (بيدروك)</option></select>
            <input name="botName" placeholder="اسم البوت" required>
            <input name="address" placeholder="IP:Port" style="grid-column:span 2;" required>
            <button class="btn btn-start" style="grid-column:span 2;">إضافة بوت جديد</button>
        </form>
        <div id="botList">${cards || '<p style="text-align:center; color:#999;">لا توجد بوتات نشطة</p>'}</div>
    </div>
    <script>
        function ctl(id,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})}).then(()=>setTimeout(()=>location.reload(), 1200)); }
        setInterval(() => {
            document.querySelectorAll('[id^="timer-"]').forEach(el => {
                const start = el.getAttribute('data-start');
                if (start && !isNaN(start)) {
                    const diff = Math.floor((Date.now() - parseInt(start)) / 1000);
                    const m = Math.floor(diff / 60); const s = diff % 60;
                    el.innerText = m + "m " + s + "s";
                }
            });
        }, 1000);
        setInterval(() => { if(!document.body.innerText.includes('جاري الانضمام')) location.reload(); }, 20000);
    </script>`));
});

// ==========================================
// 4. العمليات الخلفية (Logic)
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
    data.activeBots[id] = { id, botName, host: h, port: parseInt(p), type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null };
    saveData(); res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const b = data.activeBots[id];
    if (!b) return res.sendStatus(404);

    if (action === 'start' && !b.connected) {
        b.connecting = true; saveData();
        
        // حماية: إذا لم ينضم البوت خلال 30 ثانية يتم إلغاء الحالة
        const timeout = setTimeout(() => {
            if (b.connecting) { b.connecting = false; b.connected = false; saveData(); }
        }, 30000);

        if (b.type === 'java') {
            b.client = mineflayer.createBot({ host: b.host, port: b.port, username: b.botName, auth: 'offline' });
            b.client.on('spawn', () => { 
                clearTimeout(timeout);
                b.connected = true; b.connecting = false; b.startTime = Date.now(); 
                b.pos = b.client.entity.position;
                saveData(); startAntiAFK(b); 
            });
            b.client.on('move', () => { if(b.client.entity) { b.pos = b.client.entity.position; } });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
            b.client.on('end', () => { b.connected = false; b.connecting = false; saveData(); });
        } else {
            b.client = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true });
            b.client.on('spawn', () => { 
                clearTimeout(timeout);
                b.connected = true; b.connecting = false; b.startTime = Date.now();
                b.runtimeId = b.client.entityId;
                if(b.client.startGameData) b.pos = b.client.startGameData.player_position;
                saveData(); startAntiAFK(b); 
            });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
        }
    } else if (action === 'stop' || action === 'delete') {
        if (b.client) { b.type === 'java' ? b.client.quit() : b.client.disconnect(); }
        if (b.afkTimeout) clearTimeout(b.afkTimeout);
        b.connected = false; b.connecting = false; b.startTime = null;
        if (action === 'delete') delete data.activeBots[id];
        saveData();
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.listen(process.env.PORT || 10000);
