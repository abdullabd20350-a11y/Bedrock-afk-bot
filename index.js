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
// 2. واجهة المستخدم (HTML)
// ==========================================
const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
        .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 15px; border: 1px solid #eee; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .coords-box { display: flex; gap: 15px; background: #f9f9f9; padding: 10px; border-radius: 10px; font-family: monospace; font-size: 0.9em; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-edit { background: #17a2b8; color: white; }
        .btn-delete { background: #dc3545; color: white; }
        .auth-card { background: white; padding: 35px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 380px; margin: 80px auto; text-align: center; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        .edit-panel { display: none; background: #f8f9fa; padding: 15px; border-radius: 10px; margin-top: 15px; border: 1px solid #dee2e6; }
    </style>
</head>
<body>${content}</body></html>`;

// --- مسارات الدخول والتسجيل ---
app.get('/login', (req, res) => {
    const isAr = (req.query.lang || 'ar') === 'ar';
    res.send(layout('Login', `<div class="auth-card"><h2>Kinga Pro 🚀</h2><form action="/auth-login" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><button class="btn btn-start" style="width:100%; margin-top:15px;">Login</button></form><p><a href="/register">Create Account</a></p></div>`));
});

app.get('/register', (req, res) => {
    res.send(layout('Register', `<div class="auth-card"><h2>New Account</h2><form action="/auth-register" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><input name="confirm" type="password" placeholder="Confirm Password" required><button class="btn btn-start" style="width:100%; margin-top:15px;">Register</button></form></div>`));
});

app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    
    let botCards = myBots.map(id => {
        const b = data.activeBots[id];
        let statusText = b.connecting ? (isAr ? 'جاري الانضمام...' : 'Connecting...') : (b.connected ? (isAr ? 'متصل' : 'Online') : (isAr ? 'متوقف' : 'Stopped'));
        let isBusy = b.connected || b.connecting;

        return `
        <div class="bot-card" style="border-${isAr?'right':'left'}: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${b.botName} <small>(${b.type})</small></h3>
                <span class="status-badge" style="background:${b.connected?'#d4edda':'#f8d7da'}; color:${b.connected?'#155724':'#721c24'};">${statusText}</span>
            </div>
            
            <div style="margin-top:15px; background:#f4f4f4; padding:15px; border-radius:12px;">
                <div class="coords-box">
                    <span>X: <b>${b.pos.x.toFixed(1)}</b></span>
                    <span>Y: <b>${b.pos.y.toFixed(1)}</b></span>
                    <span>Z: <b>${b.pos.z.toFixed(1)}</b></span>
                </div>
                <p style="margin: 10px 0 0 0;">⏱️ ${isAr?'Uptime':'Uptime'}: <b id="timer-${id}" data-start="${b.startTime || ''}">---</b></p>
            </div>

            <div id="edit-${id}" class="edit-panel">
                <form action="/edit" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:0;">
                    <input type="hidden" name="id" value="${id}">
                    <input name="botName" value="${b.botName}" placeholder="Bot Name" required>
                    <select name="type"><option value="bedrock" ${b.type==='bedrock'?'selected':''}>Bedrock</option><option value="java" ${b.type==='java'?'selected':''}>Java</option></select>
                    <input name="address" value="${b.host}:${b.port}" placeholder="IP:Port" style="grid-column:span 2;" required>
                    <button class="btn btn-start" style="grid-column:span 2;">${isAr?'حفظ التعديلات':'Save'}</button>
                </form>
            </div>

            <div style="margin-top:15px; display:flex; gap:8px;">
                <button onclick="ctl('${id}','start')" class="btn btn-start" style="flex:1;" ${isBusy?'disabled opacity:0.5':''}>Start</button>
                <button onclick="ctl('${id}','stop')" class="btn btn-stop" style="flex:1;" ${!isBusy?'disabled opacity:0.5':''}>Stop</button>
                <button onclick="toggleEdit('${id}')" class="btn btn-edit" style="flex:1;" ${isBusy?'disabled opacity:0.5':''}>Edit</button>
                <button onclick="ctl('${id}','delete')" class="btn btn-delete" style="flex:1;">Delete</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('Dashboard', `
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center;"><h2>🚀 Kinga Live</h2><a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">Logout</a></div>
        <form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:20px 0;">
            <select name="type"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
            <input name="botName" placeholder="Bot Name" required>
            <input name="address" placeholder="IP:Port (e.g. server.aternos.me:12345)" required style="grid-column:span 2;">
            <button class="btn btn-start" style="grid-column:span 2; background:#1a73e8;">Add Bot</button>
        </form>
        <div id="botList">${botCards || '<p style="text-align:center; color:#999;">No bots active</p>'}</div>
    </div>
    <script>
        function toggleEdit(id) { const el = document.getElementById('edit-'+id); el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none'; }
        function ctl(id,a){ 
            if(a==='delete' && !confirm('Are you sure?')) return;
            fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})})
            .then(()=>setTimeout(()=>location.reload(), 800));
        }
        setInterval(() => {
            document.querySelectorAll('[id^="timer-"]').forEach(el => {
                const start = el.getAttribute('data-start');
                if (start && !isNaN(start)) {
                    const diff = Math.floor((Date.now() - parseInt(start)) / 1000);
                    const m = Math.floor(diff / 60); const s = diff % 60;
                    el.innerText = m > 0 ? m + "m " + s + "s" : s + "s";
                }
            });
        }, 1000);
        setInterval(() => { location.reload(); }, 15000);
    </script>`, isAr ? 'ar' : 'en'));
});

// ==========================================
// 3. العمليات الخلفية (Logic)
// ==========================================

app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("<script>alert('Error'); window.location='/register';</script>");
    data.users.push({ username, password }); saveData(); res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; return res.redirect('/'); }
    res.send("<script>alert('Invalid Login'); window.location='/login';</script>");
});

app.post('/add', checkAuth, (req, res) => {
    const { type, address, botName } = req.body;
    const id = Date.now().toString();
    let [host, port] = address.trim().split(':');
    if (!port) port = type === 'bedrock' ? 19132 : 25565;
    data.activeBots[id] = { id, botName, host, port: parseInt(port), type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null };
    saveData(); res.redirect('/');
});

app.post('/edit', checkAuth, (req, res) => {
    const { id, botName, type, address } = req.body;
    const bot = data.activeBots[id];
    if (bot && !bot.connected && !bot.connecting) {
        let [host, port] = address.trim().split(':');
        if (!port) port = type === 'bedrock' ? 19132 : 25565;
        bot.botName = botName; bot.type = type; bot.host = host; bot.port = parseInt(port);
        saveData();
    }
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const bot = data.activeBots[id];
    if(!bot) return res.sendStatus(404);

    if (action === 'start' && !bot.connected) {
        bot.connecting = true;
        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: bot.port, username: bot.botName, offline: true });
            bot.client.on('spawn', () => { bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); saveData(); });
            bot.client.on('error', () => { bot.connected = false; bot.connecting = false; });
        } else {
            // كود الجافا الأصلي والبسيط
            bot.client = mineflayer.createBot({ host: bot.host, port: bot.port, username: bot.botName, auth: 'offline', version: false });
            bot.client.on('spawn', () => { 
                bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); 
                bot.pos = bot.client.entity.position; saveData(); 
            });
            bot.client.on('error', (err) => { console.log('Java Bot Error:', err.message); bot.connected = false; bot.connecting = false; });
            bot.client.on('end', () => { bot.connected = false; bot.connecting = false; });
        }
    } else if (action === 'stop') {
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        bot.connected = false; bot.connecting = false; bot.startTime = null; saveData();
    } else if (action === 'delete') {
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        delete data.activeBots[id]; saveData();
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.listen(process.env.PORT || 10000, () => console.log('🚀 Final Stable Version Online!'));
