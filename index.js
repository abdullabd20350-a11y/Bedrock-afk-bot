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
process.on('uncaughtException', (err) => { console.log('[Anti-Crash] Uncaught Exception:', err.message); });
process.on('unhandledRejection', (reason) => { console.log('[Anti-Crash] Unhandled Rejection:', reason); });

const dbPath = './database.json';
let data = { users: [], activeBots: {} };

if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath)); } 
    catch (e) { console.log("DB Load Error, starting fresh."); }
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
// 2. نظام الحركة العشوائية (Anti-AFK)
// ==========================================
function startAntiAFK(bot) {
    // ننتظر 10 ثوانٍ بعد الدخول قبل بدء الحركة لضمان استقرار البوت
    setTimeout(() => {
        const afkLoop = () => {
            if (!bot.connected) return;

            if (bot.type === 'bedrock' && bot.client) {
                // البيدروك: تحريك اليد
                bot.client.queue('animate', { action_id: 1, runtime_entity_id: bot.client.entityId || 1 });
            } else if (bot.type === 'java' && bot.client && bot.client.setControlState) {
                // الجافا: القفز لمنع الـ Timeout
                bot.client.setControlState('jump', true);
                setTimeout(() => { if (bot.connected) bot.client.setControlState('jump', false); }, 500);
            }

            // تكرار كل 20 ثانية
            bot.afkTimeout = setTimeout(afkLoop, 20000);
        };
        afkLoop();
    }, 10000);
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
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
        .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-edit { background: #17a2b8; color: white; }
        .btn-delete { background: #dc3545; color: white; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        .edit-panel { display: none; background: #e9ecef; padding: 15px; border-radius: 10px; margin-top: 15px; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/login', (req, res) => {
    res.send(layout('دخول', `<div class="card" style="max-width:380px; text-align:center;"><h2>Kinga Pro 🚀</h2><form action="/auth-login" method="POST"><input name="username" placeholder="اسم المستخدم" required><input name="password" type="password" placeholder="كلمة المرور" required><button class="btn btn-start" style="width:100%;">دخول</button></form></div>`));
});

app.get('/', checkAuth, (req, res) => {
    const isAr = true;
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    let botCards = myBots.map(id => {
        const b = data.activeBots[id];
        let statusText = b.connecting ? 'جاري الانضمام...' : (b.connected ? 'متصل' : 'متوقف');
        return `
        <div class="bot-card" style="border-right: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${b.botName} <small>(${b.type})</small></h3>
                <span class="status-badge" style="background:${b.connected?'#d4edda':'#f8d7da'}; color:${b.connected?'#155724':'#721c24'};">${statusText}</span>
            </div>
            <div style="margin-top:15px; background:#f4f4f4; padding:15px; border-radius:12px;">
                <p>📍 X: ${b.pos.x.toFixed(1)} | Y: ${b.pos.y.toFixed(1)} | Z: ${b.pos.z.toFixed(1)}</p>
                <p>💀 الوفيات: ${b.deathCount}</p>
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
                <button onclick="ctl('${id}','start')" class="btn btn-start" style="flex:1;">تشغيل</button>
                <button onclick="ctl('${id}','stop')" class="btn btn-stop" style="flex:1;">إيقاف</button>
                <button onclick="toggleEdit('${id}')" class="btn btn-edit" style="flex:1;">تعديل</button>
                <button onclick="ctl('${id}','delete')" class="btn btn-delete" style="flex:1;">حذف</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('الرئيسية', `
    <div class="card">
        <h2>🚀 لوحة التحكم</h2>
        <form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
            <select name="type"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
            <input name="botName" placeholder="اسم البوت" required>
            <input name="address" placeholder="الآيبي:البورت" style="grid-column:span 2;" required>
            <button class="btn btn-start" style="grid-column:span 2;">إضافة بوت</button>
        </form>
        <div id="botList">${botCards}</div>
    </div>
    <script>
        function toggleEdit(id) { const el = document.getElementById('edit-'+id); el.style.display = (el.style.display === 'none') ? 'block' : 'none'; }
        function ctl(id,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})}).then(()=>setTimeout(()=>location.reload(), 1000)); }
        setInterval(()=>location.reload(), 15000);
    </script>`));
});

// ==========================================
// 4. العمليات الخلفية
// ==========================================
app.post('/auth-login', (req, res) => { req.session.user = req.body.username; res.redirect('/'); });

app.post('/add', checkAuth, (req, res) => {
    const { type, address, botName } = req.body;
    const id = Date.now().toString();
    let [h, p] = address.trim().split(':');
    if (!p) p = type === 'bedrock' ? 19132 : 25565;
    data.activeBots[id] = { id, botName, host: h, port: parseInt(p), type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0 };
    saveData(); res.redirect('/');
});

app.post('/edit', checkAuth, (req, res) => {
    const { id, botName, type, address } = req.body;
    const b = data.activeBots[id];
    if (b) {
        let [h, p] = address.trim().split(':');
        b.botName = botName; b.type = type; b.host = h; b.port = parseInt(p); saveData();
    }
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const b = data.activeBots[id];
    if (action === 'start' && !b.connected) {
        b.connecting = true; saveData();
        if (b.type === 'bedrock') {
            b.client = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true });
            b.client.on('spawn', () => { b.connected = true; b.connecting = false; saveData(); startAntiAFK(b); });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
        } else {
            // كود الجافا الأصلي والناجح 100%
            b.client = mineflayer.createBot({ host: b.host, port: b.port, username: b.botName, auth: 'offline' });
            b.client.on('spawn', () => { b.connected = true; b.connecting = false; b.pos = b.client.entity.position; saveData(); startAntiAFK(b); });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
            b.client.on('end', () => { b.connected = false; b.connecting = false; saveData(); });
            b.client.on('death', () => { b.deathCount++; saveData(); });
        }
    } else if (action === 'stop' || action === 'delete') {
        if (b.client) { b.type === 'bedrock' ? b.client.disconnect() : b.client.quit(); }
        if (b.afkTimeout) clearTimeout(b.afkTimeout);
        b.connected = false; b.connecting = false;
        if (action === 'delete') delete data.activeBots[id];
        saveData();
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
