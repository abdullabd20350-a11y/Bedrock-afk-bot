const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const fs = require('fs'); 
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'kinga-secure-auth-2026',
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
// 2. نظام الحركة العشوائية المتطور (كل دقيقتين)
// ==========================================
function startAntiAFK(bot) {
    const moveActions = ['forward', 'back', 'left', 'right', 'jump'];
    
    const afkLoop = () => {
        if (!bot.connected) return;

        const action = moveActions[Math.floor(Math.random() * moveActions.length)];

        if (bot.type === 'java' && bot.client && bot.client.setControlState) {
            if (action === 'jump') {
                bot.client.setControlState('jump', true);
                setTimeout(() => { if (bot.connected) bot.client.setControlState('jump', false); }, 500);
            } else {
                bot.client.setControlState(action, true);
                setTimeout(() => { if (bot.connected) bot.client.setControlState(action, false); }, 1000);
            }
            console.log(`[Java AFK] ${bot.botName} moved: ${action}`);
        } 
        else if (bot.type === 'bedrock' && bot.client) {
            // البيدروك: تحريك اليد كإشارة نشاط للسيرفر
            bot.client.queue('animate', { action_id: 1, runtime_entity_id: bot.client.entityId || 1 });
            console.log(`[Bedrock AFK] ${bot.botName} performed action`);
        }

        // تكرار كل دقيقتين (120,000 مللي ثانية)
        bot.afkTimeout = setTimeout(afkLoop, 120000);
    };

    // البدء بعد أول دقيقتين من الدخول
    bot.afkTimeout = setTimeout(afkLoop, 120000);
}

// ==========================================
// 3. واجهة المستخدم (HTML)
// ==========================================
const layout = (title, content) => `
<html dir="rtl">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; text-align: right; }
        .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 500px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 15px; border: 1px solid #eee; position: relative; }
        .btn { padding: 10px 15px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; margin: 2px; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-edit { background: #17a2b8; color: white; }
        .btn-delete { background: #dc3545; color: white; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        .edit-panel { display: none; background: #f8f9fa; padding: 15px; border-radius: 10px; margin-top: 10px; border: 1px solid #ddd; }
        .badge { padding: 5px 10px; border-radius: 15px; font-size: 0.8em; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/login', (req, res) => {
    res.send(layout('تسجيل الدخول', `<div class="card"><h2>دخول 🚀</h2><form action="/auth-login" method="POST"><input name="username" placeholder="اسم المستخدم" required><input name="password" type="password" placeholder="كلمة المرور" required><button class="btn btn-start" style="width:100%;">دخول</button></form><p>ليس لديك حساب؟ <a href="/register">سجل الآن</a></p></div>`));
});

app.get('/register', (req, res) => {
    res.send(layout('حساب جديد', `<div class="card"><h2>إنشاء حساب جديد ✨</h2><form action="/auth-register" method="POST"><input name="username" placeholder="اسم المستخدم" required><input name="password" type="password" placeholder="كلمة المرور" required><input name="confirm" type="password" placeholder="تأكيد كلمة المرور" required><button class="btn btn-start" style="width:100%;">إنشاء الحساب</button></form><p><a href="/login">العودة للدخول</a></p></div>`));
});

app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    let botCards = myBots.map(id => {
        const b = data.activeBots[id];
        return `
        <div class="bot-card" style="border-right: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${b.botName} <small>(${b.type})</small></h3>
                <span class="badge" style="background:${b.connected?'#d4edda':'#f8d7da'}; color:${b.connected?'#155724':'#721c24'};">${b.connected?'متصل':'متوقف'}</span>
            </div>
            <div style="margin-top:10px; font-family:monospace; font-size:0.9em; background:#f9f9f9; padding:10px; border-radius:10px;">
                📍 X: ${b.pos.x.toFixed(1)} | Y: ${b.pos.y.toFixed(1)} | Z: ${b.pos.z.toFixed(1)}
            </div>
            <div id="edit-${id}" class="edit-panel">
                <form action="/edit" method="POST">
                    <input type="hidden" name="id" value="${id}">
                    <input name="botName" value="${b.botName}" required>
                    <input name="address" value="${b.host}:${b.port}" required>
                    <button class="btn btn-start">حفظ</button>
                </form>
            </div>
            <div style="margin-top:10px;">
                <button onclick="ctl('${id}','start')" class="btn btn-start">تشغيل</button>
                <button onclick="ctl('${id}','stop')" class="btn btn-stop">إيقاف</button>
                <button onclick="toggleEdit('${id}')" class="btn btn-edit">تعديل</button>
                <button onclick="ctl('${id}','delete')" class="btn btn-delete">حذف</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('الرئيسية', `
    <div class="card">
        <div style="display:flex; justify-content:space-between;"><h2>لوحة الملك كينجا 👑</h2><a href="/logout">خروج</a></div>
        <form action="/add" method="POST" style="background:#f4f4f4; padding:15px; border-radius:15px; margin-bottom:20px;">
            <select name="type"><option value="java">Java</option><option value="bedrock">Bedrock</option></select>
            <input name="botName" placeholder="اسم البوت" required>
            <input name="address" placeholder="الآيبي:البورت" required>
            <button class="btn btn-start" style="width:100%; background:#1a73e8;">إضافة بوت جديد</button>
        </form>
        <div id="botList">${botCards || '<p>لا توجد بوتات حالياً</p>'}</div>
    </div>
    <script>
        function toggleEdit(id) { const el = document.getElementById('edit-'+id); el.style.display = (el.style.display === 'none') ? 'block' : 'none'; }
        function ctl(id,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})}).then(()=>setTimeout(()=>location.reload(), 1000)); }
        setInterval(()=>location.reload(), 30000);
    </script>`));
});

// ==========================================
// 4. المنطق الخلفي (Logic)
// ==========================================
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("<script>alert('خطأ في البيانات'); window.location='/register';</script>");
    data.users.push({ username, password }); saveData(); res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; return res.redirect('/'); }
    res.send("<script>alert('خطأ في الدخول'); window.location='/login';</script>");
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
    const { id, botName, address } = req.body;
    const b = data.activeBots[id];
    if (b && !b.connected) {
        let [h, p] = address.trim().split(':');
        b.botName = botName; b.host = h; b.port = parseInt(p); saveData();
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
            b.client = mineflayer.createBot({ host: b.host, port: b.port, username: b.botName, auth: 'offline' });
            b.client.on('spawn', () => { b.connected = true; b.connecting = false; b.pos = b.client.entity.position; saveData(); startAntiAFK(b); });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
            b.client.on('end', () => { b.connected = false; b.connecting = false; saveData(); });
        } else {
            b.client = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true });
            b.client.on('spawn', () => { b.connected = true; b.connecting = false; saveData(); startAntiAFK(b); });
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
