const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-ultra-pro-v6',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

let users = []; 
let activeBots = {}; 

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// واجهة المستخدم الأساسية
const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
        .dashboard-card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; transition: 0.3s; position: relative; overflow: hidden; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .status-connecting { background: #fff3cd; color: #856404; }
        .status-online { background: #d4edda; color: #155724; }
        .status-offline { background: #f8d7da; color: #721c24; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-delete { background: #dc3545; color: white; }
        input, select { padding: 12px; margin: 5px 0; border: 1px solid #ddd; border-radius: 10px; width: 100%; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(activeBots).filter(n => activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = activeBots[name];
        let statusClass = 'status-offline';
        let statusText = isAr ? 'متوقف' : 'Stopped';

        if (b.connecting) {
            statusClass = 'status-connecting';
            statusText = isAr ? 'جاري الانضمام...' : 'Connecting...';
        } else if (b.connected) {
            statusClass = 'status-online';
            statusText = isAr ? 'متصل' : 'Online';
        }

        return `
        <div class="bot-card" id="bot-${name}" style="border-${isAr?'right':'left'}: 6px solid ${b.connected?'#28a745':(b.connecting?'#ffc107':'#dc3545')};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${name} <small style="color:#888;">(${b.type})</small></h3>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px; font-size:0.9em; background:#f9f9f9; padding:15px; border-radius:12px;">
                <p>📍 ${isAr?'الإحداثيات':'Coords'}: <span id="pos-${name}">${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}</span></p>
                <p>💀 ${isAr?'الوفيات':'Deaths'}: ${b.deathCount}</p>
                <p style="grid-column: span 2;">⏱️ ${isAr?'مدة الاتصال':'Uptime'}: 
                    <b id="timer-${name}" data-start="${b.startTime || ''}" style="color:#1a73e8;">0s</b>
                </p>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${name}','start')" class="btn btn-start" style="flex:1;" ${b.connected || b.connecting ? 'disabled opacity:0.5':''}>${isAr?'تشغيل':'Start'}</button>
                <button onclick="ctl('${name}','stop')" class="btn btn-stop" style="flex:1;" ${!b.connected ? 'disabled opacity:0.5':''}>${isAr?'إيقاف':'Stop'}</button>
                <button onclick="ctl('${name}','delete')" class="btn btn-delete" style="flex:1;">${isAr?'حذف':'Delete'}</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('Kinga Dash', `
    <div class="dashboard-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2>🚀 Kinga Control <span style="font-size:0.5em; color:#666;">v6.0</span></h2>
            <div style="font-size:0.9em;">
                <a href="/set-lang?l=${isAr?'en':'ar'}">${isAr?'English':'عربي'}</a> | 
                <a href="/logout" style="color:red;">${isAr?'خروج':'Logout'}</a>
            </div>
        </div>
        <form action="/add" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0;">
            <select name="type" id="tp" onchange="u()"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
            <input name="botName" placeholder="${isAr?'اسم البوت':'Bot Name'}" required>
            <input name="host" id="host" placeholder="IP" required style="grid-column:span 2;">
            <input name="port" id="port" placeholder="Port" style="grid-column:span 2;">
            <button class="btn btn-start" style="grid-column:span 2; background:#1a73e8;">${isAr?'إضافة':'Add'}</button>
        </form>
        <div id="botList">${botCards || '<p style="text-align:center; color:#999;">لا توجد بوتات</p>'}</div>
    </div>
    <script>
        function u(){ const v=document.getElementById('tp').value; const p=document.getElementById('port'); p.style.display=v==='java'?'none':'block'; }
        function ctl(n,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})}).then(()=>setTimeout(()=>location.reload(), 1000));}
        
        // تحديث العداد تلقائياً (Live Timer)
        setInterval(() => {
            document.querySelectorAll('[id^="timer-"]').forEach(el => {
                const start = el.getAttribute('data-start');
                if (start) {
                    const diff = Math.floor((Date.now() - parseInt(start)) / 1000);
                    const m = Math.floor(diff / 60);
                    const s = diff % 60;
                    el.innerText = m > 0 ? m + "m " + s + "s" : s + "s";
                }
            });
        }, 1000);

        // تحديث الصفحة تلقائياً كل 15 ثانية لجلب الإحداثيات وحالة "متصل"
        setInterval(() => {
            if (document.body.innerText.includes('Connecting') || document.body.innerText.includes('انضمام') || document.body.innerText.includes('Online')) {
                location.reload();
            }
        }, 15000);
        u();
    </script>`, isAr ? 'ar' : 'en'));
});

// المنطق الخلفي المحدث
app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = activeBots[name];
    if (action === 'start' && !bot.connected) {
        bot.connecting = true; // تفعيل حالة جاري الانضمام
        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
            bot.client.on('spawn', () => { 
                bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); 
                if(bot.client.startGameData) bot.pos = bot.client.startGameData.player_position;
            });
            bot.client.on('close', () => { bot.connected = false; bot.connecting = false; });
            bot.client.on('error', () => { bot.connected = false; bot.connecting = false; });
        } else {
            const [h, p] = bot.host.split(':');
            bot.client = mineflayer.createBot({ host: h, port: p || 25565, username: name });
            bot.client.on('spawn', () => { 
                bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); 
                bot.pos = bot.client.entity.position;
            });
            bot.client.on('end', () => { bot.connected = false; bot.connecting = false; });
            bot.client.on('error', () => { bot.connected = false; bot.connecting = false; });
        }
    } else if (action === 'stop') {
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        bot.connected = false; bot.connecting = false; bot.startTime = null;
    } else if (action === 'delete') {
        if (bot.client) bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        delete activeBots[name];
    }
    res.sendStatus(200);
});

// المسارات الأخرى (Auth)
app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null };
    res.redirect('/');
});
app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; res.redirect('/'); } else res.send("Error");
});
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password === confirm && !users.find(u=>u.username===username)) { users.push({username, password}); res.redirect('/login'); } else res.send("Error");
});
app.get('/login', (req, res) => res.send(`<html><body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;"> <div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1);"><h2>Login</h2><form action="/auth-login" method="POST"><input name="username" placeholder="User" required style="width:100%; padding:10px; margin:10px 0;"><input name="password" type="password" placeholder="Pass" required style="width:100%; padding:10px; margin:10px 0;"><button style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer;">Enter</button></form><p style="text-align:center;"><a href="/register">Register</a></p></div></body></html>`));
app.get('/register', (req, res) => res.send(`<html><body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;"> <div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1);"><h2>Register</h2><form action="/auth-register" method="POST"><input name="username" placeholder="User" required style="width:100%; padding:10px; margin:10px 0;"><input name="password" type="password" placeholder="Pass" required style="width:100%; padding:10px; margin:10px 0;"><input name="confirm" type="password" placeholder="Confirm" required style="width:100%; padding:10px; margin:10px 0;"><button style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer;">Create</button></form><p style="text-align:center;"><a href="/login">Login</a></p></div></body></html>`));
app.get('/set-lang', (req, res) => { req.session.lang = req.query.l; res.redirect('/'); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(process.env.PORT || 10000);
