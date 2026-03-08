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
    catch (e) { data = { users: [], activeBots: {} }; }
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
// 2. نظام الحركة العشوائية الحقيقي (مشي/قفز)
// ==========================================
function startAntiAFK(bot) {
    const afkLoop = () => {
        if (!bot.connected) return;

        if (bot.type === 'java' && bot.client && bot.client.setControlState) {
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
                    currentPos.y += 1;
                    setTimeout(() => {
                        if (bot.connected) {
                            currentPos.y -= 1;
                            bot.client.queue('move_player', { runtime_entity_id: bot.client.entityId, position: currentPos, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
                        }
                    }, 500);
                } else {
                    currentPos.x += (Math.random() - 0.5) * 2;
                    currentPos.z += (Math.random() - 0.5) * 2;
                }
                bot.client.queue('move_player', { runtime_entity_id: bot.client.entityId, position: currentPos, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
                bot.pos = currentPos;
            } catch (e) {}
        }
        bot.afkTimeout = setTimeout(afkLoop, 120000); // كل دقيقتين
    };
    bot.afkTimeout = setTimeout(afkLoop, 15000); // أول حركة بعد 15 ثانية
}

// ==========================================
// 3. واجهة المستخدم (HTML)
// ==========================================
const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
        .dashboard-card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .coords-box { display: flex; gap: 15px; background: #f9f9f9; padding: 10px; border-radius: 10px; font-family: monospace; font-size: 0.9em; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-edit { background: #17a2b8; color: white; }
        .btn-delete { background: #dc3545; color: white; }
        .auth-card { background: white; padding: 35px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 380px; margin: 80px auto; text-align: center; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        .edit-panel { display: none; background: #e9ecef; padding: 15px; border-radius: 10px; margin-top: 15px; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/login', (req, res) => {
    res.send(layout('دخول', `<div class="auth-card"><h2>Kinga Pro 🚀</h2><form action="/auth-login" method="POST"><input name="username" placeholder="اسم المستخدم" required><input name="password" type="password" placeholder="كلمة المرور" required><button class="btn btn-start" style="width:100%; margin-top:15px;">دخول</button></form><p><a href="/register">إنشاء حساب جديد</a></p></div>`));
});

app.get('/register', (req, res) => {
    res.send(layout('تسجيل', `<div class="auth-card"><h2>حساب جديد</h2><form action="/auth-register" method="POST"><input name="username" placeholder="اسم المستخدم" required><input name="password" type="password" placeholder="كلمة المرور" required><input name="confirm" type="password" placeholder="تأكيد كلمة المرور" required><button class="btn btn-start" style="width:100%; margin-top:15px;">إنشاء</button></form><p><a href="/login">العودة للدخول</a></p></div>`));
});

app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    let botCards = myBots.map(id => {
        const b = data.activeBots[id];
        let statusText = b.connecting ? 'جاري الانضمام...' : (b.connected ? 'متصل' : 'متوقف');
        let isBusy = b.connected || b.connecting;
        return `
        <div class="bot-card" style="border-right: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${b.botName} <small>(${b.type})</small></h3>
                <span class="status-badge" style="background:${b.connected?'#d4edda':'#f8d7da'}; color:${b.connected?'#155724':'#721c24'};">${statusText}</span>
            </div>
            <div style="margin-top:15px; background:#f4f4f4; padding:15px; border-radius:12px;">
                <div class="coords-box"><span>X: <b>${b.pos.x.toFixed(1)}</b></span><span>Y: <b>${b.pos.y.toFixed(1)}</b></span><span>Z: <b>${b.pos.z.toFixed(1)}</b></span></div>
            </div>
            <div id="edit-${id}" class="edit-panel">
                <form action="/edit" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <input type="hidden" name="id" value="${id}"><input name="botName" value="${b.botName}" required>
                    <select name="type"><option value="bedrock" ${b.type==='bedrock'?'selected':''}>Bedrock</option><option value="java" ${b.type==='java'?'selected':''}>Java</option></select>
                    <input name="address" value="${b.host}:${b.port}" style="grid-column:span 2;" required>
                    <button class="btn btn-start" style="grid-column:span 2;">حفظ</button>
                </form>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${id}','start')" class="btn btn-start" style="flex:1;" ${isBusy?'disabled':''}>تشغيل</button>
                <button onclick="ctl('${id}','stop')" class="btn btn-stop" style="flex:1;" ${!isBusy?'disabled':''}>إيقاف</button>
                <button onclick="toggleEdit('${id}')" class="btn btn-edit" style="flex:1;" ${isBusy?'disabled':''}>تعديل</button>
                <button onclick="ctl('${id}','delete')" class="btn btn-delete" style="flex:1;">حذف</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('الرئيسية', `
    <div class="dashboard-card">
        <div style="display:flex; justify-content:space-between; align-items:center;"><h2>🚀 لوحة الملك كينجا</h2><a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">خروج</a></div>
        <form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:20px 0;">
            <select name="type"><option value="java">Java</option><option value="bedrock">Bedrock</option></select>
            <input name="botName" placeholder="اسم البوت" required>
            <input name="address" placeholder="الآيبي:البورت" style="grid-column:span 2;" required>
            <button class="btn btn-start" style="grid-column:span 2; background:#1a73e8;">إضافة بوت</button>
        </form>
        <div id="botList">${botCards || '<p style="text-align:center; color:#999;">لا توجد بوتات</p>'}</div>
    </div>
    <script>
        function toggleEdit(id) { const el = document.getElementById('edit-'+id); el.style.display = (el.style.display === 'none') ? 'block' : 'none'; }
        function ctl(id,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})}).then(()=>setTimeout(()=>location.reload(), 1000)); }
        setInterval(()=> { if(!document.body.innerText.includes('جاري الانضمام')) location.reload(); }, 20000);
    </script>`));
});

// ==========================================
// 4. المنطق الخلفي - العودة للاتصال الأصلي
// ==========================================
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("Error");
    data.users.push({ username, password }); saveData(); res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const user = data.users.find(u => u.username === req.body.username && u.password === req.body.password);
    if (user) { req.session.user = user.username; return res.redirect('/'); }
    res.send("Invalid Login");
});

app.post('/add', checkAuth, (req, res) => {
    const { type, address, botName } = req.body;
    const id = Date.now().toString();
    let [h, p] = address.trim().split(':');
    if (!p) p = type === 'java' ? 25565 : 19132;
    data.activeBots[id] = { id, botName, host: h, port: parseInt(p), type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0 };
    saveData(); res.redirect('/');
});

app.post('/edit', checkAuth, (req, res) => {
    const { id, botName, address, type } = req.body;
    const b = data.activeBots[id];
    if (b && !b.connected) {
        let [h, p] = address.trim().split(':');
        if (!p) p = type === 'java' ? 25565 : 19132;
        b.botName = botName; b.host = h; b.port = parseInt(p); b.type = type; saveData();
    }
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const b = data.activeBots[id];
    if(!b) return res.sendStatus(404);

    if (action === 'start' && !b.connected) {
        b.connecting = true; saveData();
        if (b.type === 'java') {
            // كود الجافا الأصلي والناجح 100% بدون أي إضافات معطلة
            b.client = mineflayer.createBot({ host: b.host, port: b.port, username: b.botName, auth: 'offline' });
            b.client.on('spawn', () => { 
                b.connected = true; b.connecting = false; b.pos = b.client.entity.position; 
                saveData(); 
                startAntiAFK(b); 
            });
            b.client.on('error', (err) => { console.log('Bot Error:', err); b.connected = false; b.connecting = false; saveData(); });
            b.client.on('end', () => { b.connected = false; b.connecting = false; saveData(); });
        } else {
            b.client = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true });
            b.client.on('spawn', () => { 
                b.connected = true; b.connecting = false; 
                if(b.client.startGameData) b.pos = b.client.startGameData.player_position;
                saveData(); 
                startAntiAFK(b); 
            });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
        }
    } else if (action === 'stop' || action === 'delete') {
        if (b.client) { b.type === 'java' ? b.client.quit() : b.client.disconnect(); }
        if (b.afkTimeout) clearTimeout(b.afkTimeout);
        b.connected = false; b.connecting = false;
        if (action === 'delete') delete data.activeBots[id];
        saveData();
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.listen(process.env.PORT || 10000);
