const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسة الاحترافي لحل مشكلة MemoryStore وتثبيت الدخول
app.use(session({
    secret: 'kinga-ultra-stable-v10',
    resave: false,
    saveUninitialized: false,
    proxy: true, // مهم لمنصات الاستضافة مثل Render
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        secure: false // اجعلها true فقط إذا كنت تستخدم https رسمي
    }
}));

// نظام التخزين الدائم
const dbPath = './database.json';
let data = { users: [], activeBots: {} };

if (fs.existsSync(dbPath)) {
    try {
        data = JSON.parse(fs.readFileSync(dbPath));
    } catch (e) { console.log("DB Reset"); }
}

function saveData() {
    const dataToSave = JSON.parse(JSON.stringify(data));
    Object.keys(dataToSave.activeBots).forEach(n => {
        delete dataToSave.activeBots[n].client;
        delete dataToSave.activeBots[n].interval;
    });
    fs.writeFileSync(dbPath, JSON.stringify(dataToSave, null, 2));
}

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// الواجهة الرسومية (HTML)
const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
        .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 8px 25px rgba(0,0,0,0.05); max-width: 850px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; }
        input, select { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/login', (req, res) => {
    res.send(layout('Login', `<div class="card" style="max-width:380px; text-align:center;"><h2>Kinga Pro 🚀</h2><form action="/auth-login" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><button class="btn" style="width:100%; background:#1a73e8; color:white; margin-top:15px;">Login</button></form><p><a href="/register">Create Account</a></p></div>`));
});

app.get('/register', (req, res) => {
    res.send(layout('Register', `<div class="card" style="max-width:380px; text-align:center;"><h2>New Account</h2><form action="/auth-register" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><input name="confirm" type="password" placeholder="Confirm" required><button class="btn" style="width:100%; background:#1a73e8; color:white; margin-top:15px;">Create</button></form></div>`));
});

app.get('/', checkAuth, (req, res) => {
    const isAr = (req.session.lang || 'ar') === 'ar';
    let myBots = Object.keys(data.activeBots).filter(n => data.activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = data.activeBots[name];
        return `
        <div class="bot-card" style="border-${isAr?'right':'left'}: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${name} <small>(${b.type})</small></h3>
                <span class="status-badge" style="background:${b.connected?'#d4edda':'#f8d7da'}; color:${b.connected?'#155724':'#721c24'};">
                    ${b.connected?(isAr?'متصل':'Online'):(isAr?'متوقف':'Stopped')}
                </span>
            </div>
            <div style="margin-top:15px; background:#f9f9f9; padding:12px; border-radius:12px; font-size:0.9em;">
                <p>📍 X: <b>${b.pos.x.toFixed(1)}</b> Y: <b>${b.pos.y.toFixed(1)}</b> Z: <b>${b.pos.z.toFixed(1)}</b></p>
                <p>⏱️ ${isAr?'مدة الاتصال':'Uptime'}: <b id="timer-${name}" data-start="${b.startTime || ''}" style="color:#1a73e8;">---</b></p>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${name}','start')" class="btn" style="flex:1; background:#28a745; color:white;" ${b.connected?'disabled':''}>Start</button>
                <button onclick="ctl('${name}','stop')" class="btn" style="flex:1; background:#ffc107; color:black;" ${!b.connected?'disabled':''}>Stop</button>
                <button onclick="ctl('${name}','delete')" class="btn" style="background:#dc3545; color:white;">Delete</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('Dashboard', `
    <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center;"><h2>🚀 Kinga Live</h2><a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">Logout</a></div>
        <form action="/add" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0;">
            <select name="type"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
            <input name="botName" placeholder="Bot Name" required>
            <input name="host" placeholder="Server IP (e.g. play.host.com:25565)" required style="grid-column:span 2;">
            <button class="btn" style="grid-column:span 2; background:#1a73e8; color:white;">Add Bot</button>
        </form>
        <div id="botList">${botCards || '<p style="text-align:center; color:#999;">No bots active</p>'}</div>
    </div>
    <script>
        function ctl(n,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})}).then(()=>setTimeout(()=>location.reload(),1000)); }
        setInterval(() => {
            document.querySelectorAll('[id^="timer-"]').forEach(el => {
                const start = el.getAttribute('data-start');
                const card = el.closest('.bot-card');
                const isOnline = card && (card.innerText.includes('Online') || card.innerText.includes('متصل'));
                if (start && isOnline && !isNaN(start)) {
                    const diff = Math.floor((Date.now() - parseInt(start)) / 1000);
                    const m = Math.floor(diff / 60);
                    const s = diff % 60;
                    el.innerText = m > 0 ? m + "m " + s + "s" : s + "s";
                } else { el.innerText = "---"; }
            });
        }, 1000);
        setInterval(() => { if(document.body.innerText.includes('Online')) location.reload(); }, 15000);
    </script>`, isAr?'ar':'en'));
});

// --- المنطق الخلفي (Logic) ---
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("<script>alert('Error'); window.location='/register';</script>");
    data.users.push({ username, password }); saveData();
    res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; return res.redirect('/'); }
    res.send("<script>alert('Invalid Login'); window.location='/login';</script>");
});

app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = data.activeBots[name];
    if (action === 'start' && !bot.connected) {
        if (bot.type === 'bedrock') {
            const host = bot.host.split(':')[0];
            const port = parseInt(bot.host.split(':')[1]) || 19132;
            bot.client = bedrock.createClient({ host, port, username: name, offline: true });
            bot.client.on('spawn', () => { bot.connected = true; bot.startTime = Date.now(); });
            bot.client.on('close', () => { bot.connected = false; });
        } else {
            const host = bot.host.split(':')[0];
            const port = parseInt(bot.host.split(':')[1]) || 25565;
            bot.client = mineflayer.createBot({ host, port, username: name, version: false });
            bot.client.on('spawn', () => { bot.connected = true; bot.startTime = Date.now(); bot.pos = bot.client.entity.position; });
            bot.client.on('error', () => { bot.connected = false; });
            bot.client.on('end', () => { bot.connected = false; });
        }
    } else if (action === 'stop') {
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        bot.connected = false; bot.startTime = null;
    } else if (action === 'delete') {
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        delete data.activeBots[name]; saveData();
    }
    res.sendStatus(200);
});

app.post('/add', checkAuth, (req, res) => {
    const { type, host, botName } = req.body;
    data.activeBots[botName] = { host, type, owner: req.session.user, connected: false, pos: {x:0,y:0,z:0}, startTime: null };
    saveData(); res.redirect('/');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(process.env.PORT || 10000);
