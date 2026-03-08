const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const fs = require('fs'); // لإضافة التخزين الدائم
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسة
app.use(session({
    secret: 'kinga-ultra-stable-v9',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// نظام تخزين دائم بسيط (لحماية حسابك وبياناتك)
let dbPath = './database.json';
let data = { users: [], activeBots: {} };

if (fs.existsSync(dbPath)) {
    data = JSON.parse(fs.readFileSync(dbPath));
}

function saveData() {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// الواجهة الرسومية (HTML)
const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
        .dashboard-card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .status-connecting { background: #fff3cd; color: #856404; animation: blink 1s infinite; }
        .status-online { background: #d4edda; color: #155724; }
        .status-offline { background: #f8d7da; color: #721c24; }
        @keyframes blink { 50% { opacity: 0.6; } }
        .coords-box { display: flex; gap: 15px; background: #f9f9f9; padding: 10px; border-radius: 10px; font-family: monospace; font-size: 0.9em; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-delete { background: #dc3545; color: white; }
        .auth-card { background: white; padding: 35px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 380px; margin: 80px auto; text-align: center; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
    </style>
</head>
<body>${content}</body></html>`;

// --- مسارات الحسابات ---
app.get('/login', (req, res) => {
    const isAr = (req.query.lang || 'ar') === 'ar';
    res.send(layout('Login', `<div class="auth-card"><h2>Kinga Pro 🚀</h2><form action="/auth-login" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><button class="btn btn-start" style="width:100%; background:#1a73e8; margin-top:15px;">Login</button></form><p><a href="/register">Create Account</a></p></div>`, isAr ? 'ar' : 'en'));
});

app.get('/register', (req, res) => {
    res.send(layout('Register', `<div class="auth-card"><h2>New Account</h2><form action="/auth-register" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><input name="confirm" type="password" placeholder="Confirm" required><button class="btn btn-start" style="width:100%; background:#1a73e8; margin-top:15px;">Register</button></form></div>`));
});

app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("<script>alert('Error'); window.location='/register';</script>");
    data.users.push({ username, password });
    saveData();
    res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; return res.redirect('/'); }
    res.send("<script>alert('Invalid Login'); window.location='/login';</script>");
});

// --- لوحة التحكم ---
app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(data.activeBots).filter(n => data.activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = data.activeBots[name];
        let statusClass = b.connecting ? 'status-connecting' : (b.connected ? 'status-online' : 'status-offline');
        return `
        <div class="bot-card" style="border-${isAr?'right':'left'}: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <div style="display:flex; justify-content:space-between;">
                <h3>🤖 ${name} <small>(${b.type})</small></h3>
                <span class="status-badge ${statusClass}">${b.connected?'Online':'Offline'}</span>
            </div>
            <div style="margin-top:10px; background:#f9f9f9; padding:10px; border-radius:10px;">
                <p>📍 X: ${b.pos.x.toFixed(1)} Y: ${b.pos.y.toFixed(1)} Z: ${b.pos.z.toFixed(1)}</p>
                <p>⏱️ Uptime: <b id="timer-${name}" data-start="${b.startTime || ''}">---</b></p>
            </div>
            <div style="margin-top:10px; display:flex; gap:10px;">
                <button onclick="ctl('${name}','start')" class="btn btn-start" style="flex:1;" ${b.connected?'disabled':''}>Start</button>
                <button onclick="ctl('${name}','stop')" class="btn btn-stop" style="flex:1;" ${!b.connected?'disabled':''}>Stop</button>
                <button onclick="ctl('${name}','delete')" class="btn btn-danger">Delete</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('Dashboard', `<div class="dashboard-card"><h2>🚀 Kinga Live</h2><form action="/add" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"><select name="type"><option value="bedrock">Bedrock</option><option value="java">Java</option></select><input name="botName" placeholder="Bot Name" required><input name="host" placeholder="IP" required style="grid-column:span 2;"><input name="port" placeholder="Port" style="grid-column:span 2;"><button class="btn btn-start" style="grid-column:span 2;">Add Bot</button></form><div id="botList">${botCards}</div></div><script>function ctl(n,a){fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})}).then(()=>setTimeout(()=>location.reload(),1200));} setInterval(()=>{location.reload();},15000);</script>`, isAr?'ar':'en'));
});

// --- التحكم في البوتات (إصلاح الجافا) ---
app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = data.activeBots[name];
    if (action === 'start' && !bot.connected) {
        bot.connecting = true;
        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
            bot.client.on('spawn', () => { bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); });
            bot.client.on('close', () => { bot.connected = false; bot.connecting = false; });
        } else {
            // تطوير الجافا لدعم النسخ تلقائياً
            let host = bot.host.split(':')[0];
            let port = parseInt(bot.host.split(':')[1]) || 25565;
            bot.client = mineflayer.createBot({ host, port, username: name, version: false }); // version: false للتعرف التلقائي
            bot.client.on('spawn', () => { 
                bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); 
                bot.pos = bot.client.entity.position;
            });
            bot.client.on('error', (err) => { console.log(err); bot.connected = false; bot.connecting = false; });
            bot.client.on('end', () => { bot.connected = false; bot.connecting = false; });
        }
    } else if (action === 'stop') {
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        bot.connected = false; bot.connecting = false; bot.startTime = null;
    } else if (action === 'delete') {
        delete data.activeBots[name];
        saveData();
    }
    res.sendStatus(200);
});

app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    data.activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null };
    saveData();
    res.redirect('/');
});

app.listen(process.env.PORT || 10000);
