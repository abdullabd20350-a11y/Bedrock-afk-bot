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

// نظام الحماية والتخزين
process.on('uncaughtException', (err) => { console.log('Anti-Crash:', err.message); });

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
            pos: b.pos, deathCount: b.deathCount, startTime: b.startTime,
            lastError: b.lastError || ''
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(cleanData, null, 2));
}

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// واجهة المستخدم
const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
        .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 15px; border: 1px solid #eee; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-edit { background: #17a2b8; color: white; }
        .btn-delete { background: #dc3545; color: white; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        .edit-panel { display: none; background: #f8f9fa; padding: 15px; border-radius: 10px; margin-top: 15px; border: 1px solid #dee2e6; }
        .error-msg { background: #fff3cd; color: #856404; padding: 10px; border-radius: 10px; margin-top: 10px; font-size: 0.85em; border: 1px solid #ffeeba; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/login', (req, res) => {
    res.send(layout('Login', `<div class="card" style="max-width:380px; text-align:center;"><h2>Kinga Pro 🚀</h2><form action="/auth-login" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><button class="btn btn-start" style="width:100%; margin-top:15px;">Login</button></form><p><a href="/register">Register Account</a></p></div>`));
});

app.get('/register', (req, res) => {
    res.send(layout('Register', `<div class="card" style="max-width:380px; text-align:center;"><h2>New Account</h2><form action="/auth-register" method="POST"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><input name="confirm" type="password" placeholder="Confirm" required><button class="btn btn-start" style="width:100%; margin-top:15px;">Create</button></form></div>`));
});

app.get('/', checkAuth, (req, res) => {
    const isAr = (req.session.lang || 'ar') === 'ar';
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
            
            ${b.lastError && !b.connected && !b.connecting ? `<div class="error-msg">ℹ️ ${b.lastError}</div>` : ''}

            <div style="margin-top:15px; background:#f4f4f4; padding:15px; border-radius:12px;">
                <p style="margin:0; font-family:monospace;">📍 X: ${b.pos.x.toFixed(1)} | Y: ${b.pos.y.toFixed(1)} | Z: ${b.pos.z.toFixed(1)}</p>
                <p style="margin: 10px 0 0 0;">⏱️ Uptime: <b id="timer-${id}" data-start="${b.startTime || ''}">---</b></p>
            </div>

            <div id="edit-${id}" class="edit-panel">
                <form action="/edit" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <input type="hidden" name="id" value="${id}">
                    <input name="botName" value="${b.botName}" placeholder="Name" required>
                    <select name="type"><option value="bedrock" ${b.type==='bedrock'?'selected':''}>Bedrock</option><option value="java" ${b.type==='java'?'selected':''}>Java</option></select>
                    <input name="address" value="${b.host}:${b.port}" placeholder="IP:Port" style="grid-column:span 2;" required>
                    <button class="btn btn-start" style="grid-column:span 2;">Save</button>
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
        <div style="display:flex; justify-content:space-between; align-items:center;"><h2>🚀 Kinga Live</h2><a href="/logout" style="color:red; text-decoration:none;">Logout</a></div>
        <form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:20px 0;">
            <select name="type"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
            <input name="botName" placeholder="Bot Name" required>
            <input name="address" placeholder="IP:Port" required style="grid-column:span 2;">
            <button class="btn btn-start" style="grid-column:span 2;">Add Bot</button>
        </form>
        <div id="botList">${botCards || '<p style="text-align:center; color:#999;">No bots active</p>'}</div>
    </div>
    <script>
        function toggleEdit(id) { const el = document.getElementById('edit-'+id); el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none'; }
        function ctl(id,a){ 
            if(a==='delete' && !confirm('Sure?')) return;
            fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})})
            .then(()=>setTimeout(()=>location.reload(), 800));
        }
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
        setInterval(() => { if(!document.body.innerText.includes('Connecting')) location.reload(); }, 15000);
    </script>`, isAr ? 'ar' : 'en'));
});

// العمليات الخلفية
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("Error");
    data.users.push({ username, password }); saveData(); res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; return res.redirect('/'); }
    res.send("Invalid Login");
});

app.post('/add', checkAuth, (req, res) => {
    const { type, address, botName } = req.body;
    const id = Date.now().toString();
    let [h, p] = address.trim().split(':');
    if (!p) p = type === 'bedrock' ? 19132 : 25565;
    data.activeBots[id] = { id, botName, host: h, port: parseInt(p), type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null };
    saveData(); res.redirect('/');
});

app.post('/edit', checkAuth, (req, res) => {
    const { id, botName, type, address } = req.body;
    const b = data.activeBots[id];
    if (b && !b.connected) {
        let [h, p] = address.trim().split(':');
        if (!p) p = type === 'bedrock' ? 19132 : 25565;
        b.botName = botName; b.type = type; b.host = h; b.port = parseInt(p); saveData();
    }
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const b = data.activeBots[id];
    if(!b) return res.sendStatus(404);

    if (action === 'start' && !b.connected) {
        b.connecting = true; b.lastError = ''; saveData();
        
        if (b.type === 'bedrock') {
            b.client = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true });
            b.client.on('spawn', () => { b.connected = true; b.connecting = false; b.startTime = Date.now(); saveData(); });
            b.client.on('error', (err) => { b.connected = false; b.connecting = false; b.lastError = err.message; saveData(); });
        } else {
            try {
                b.client = mineflayer.createBot({ host: b.host, port: b.port, username: b.botName, auth: 'offline', version: false });
                b.client.on('spawn', () => { b.connected = true; b.connecting = false; b.startTime = Date.now(); b.pos = b.client.entity.position; saveData(); });
                b.client.on('error', (err) => { 
                    if (err.code === 'ECONNRESET' && b.connected) return;
                    b.connected = false; b.connecting = false; b.lastError = "Connection Failed: " + err.message; saveData(); 
                });
                b.client.on('kicked', (reason) => { b.connected = false; b.connecting = false; b.lastError = "Kicked: " + (typeof reason === 'string' ? reason : JSON.stringify(reason)); saveData(); });
                b.client.on('end', () => { b.connected = false; b.connecting = false; saveData(); });
            } catch (err) { b.connecting = false; b.lastError = err.message; saveData(); }
        }
    } else if (action === 'stop') {
        if (b.client) { b.type === 'bedrock' ? b.client.disconnect() : b.client.quit(); }
        b.connected = false; b.connecting = false; b.startTime = null; saveData();
    } else if (action === 'delete') {
        if (b.client) { b.type === 'bedrock' ? b.client.disconnect() : b.client.quit(); }
        delete data.activeBots[id]; saveData();
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.listen(process.env.PORT || 10000);
