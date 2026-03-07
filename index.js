const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-final-secret-2026',
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

function getUptime(startTime) {
    if (!startTime) return "0s";
    const diff = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// --- الواجهة الرسومية (HTML) ---
app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(activeBots).filter(n => activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = activeBots[name];
        const statusColor = b.connected ? '#28a745' : '#dc3545';
        return `
        <div style="background:white; padding:20px; border-radius:15px; margin-bottom:20px; border-${isAr?'right':'left'}: 5px solid ${statusColor}; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${name} <small>(${b.type})</small></h3>
                <span style="color:${statusColor}; font-weight:bold;">● ${b.connected?(isAr?'متصل':'Online'):(isAr?'متوقف':'Stopped')}</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px; font-size:0.85em; background:#f8f9fa; padding:12px; border-radius:10px;">
                <p>📍 ${isAr?'الإحداثيات':'Coords'}: X:${b.pos.x.toFixed(1)}, Y:${b.pos.y.toFixed(1)}, Z:${b.pos.z.toFixed(1)}</p>
                <p>🎮 ${isAr?'الوضع':'Mode'}: ${b.gamemode}</p>
                <p>💀 ${isAr?'الوفيات':'Deaths'}: ${b.deathCount}</p>
                <p style="grid-column: span 2;">⏱️ ${isAr?'مدة الاتصال':'Uptime'}: <b style="color:#1a73e8;">${b.connected ? getUptime(b.startTime) : '---'}</b></p>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${name}','start')" style="flex:1; background:#28a745; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold;" ${b.connected?'disabled style="opacity:0.5;"':''}>${isAr?'تشغيل':'Start'}</button>
                <button onclick="ctl('${name}','stop')" style="flex:1; background:#ffc107; color:black; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold;" ${!b.connected?'disabled style="opacity:0.5;"':''}>${isAr?'إيقاف':'Stop'}</button>
                <button onclick="ctl('${name}','delete')" style="flex:1; background:#dc3545; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold;">${isAr?'حذف':'Delete'}</button>
            </div>
        </div>`;
    }).join('');

    res.send(`
    <html dir="${isAr?'rtl':'ltr'}">
    <head><meta charset="UTF-8"><style>body{font-family:sans-serif; background:#f4f7f6; padding:20px;} .card{background:white; padding:25px; border-radius:15px; box-shadow:0 4px 15px rgba(0,0,0,0.1); max-width:800px; margin:auto;}</style></head>
    <body>
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h1>🚀 Kinga Pro Manager</h1>
                <div>
                    <a href="/set-lang?l=${isAr?'en':'ar'}" style="margin-right:15px; text-decoration:none; font-weight:bold;">${isAr?'English':'عربي'}</a>
                    <a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">${isAr?'خروج':'Logout'}</a>
                </div>
            </div>
            <form action="/add" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0;">
                <select name="type" id="tp" onchange="u()"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
                <input name="botName" placeholder="${isAr?'اسم البوت':'Bot Name'}" required style="padding:10px; border:1px solid #ddd; border-radius:5px;">
                <input name="host" id="host" placeholder="${isAr?'IP السيرفر':'Server IP'}" required style="grid-column:span 2; padding:10px; border:1px solid #ddd; border-radius:5px;">
                <input name="port" id="port" placeholder="${isAr?'البورت':'Port'}" style="grid-column:span 2; padding:10px; border:1px solid #ddd; border-radius:5px;">
                <button style="grid-column:span 2; background:#1a73e8; color:white; border:none; padding:14px; border-radius:8px; font-weight:bold; cursor:pointer;">${isAr?'إضافة بوت':'Add Bot'}</button>
            </form>
            <div id="botList">${botCards || '<p style="text-align:center; color:#999;">لا توجد بوتات نشطة</p>'}</div>
        </div>
        <script>
            function u(){ const v=document.getElementById('tp').value; const p=document.getElementById('port'); p.style.display=v==='java'?'none':'block'; p.required=v==='bedrock'; }
            function ctl(n,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})}).then(()=>setTimeout(()=>location.reload(), 1500));}
            u();
            // تحديث الواجهة تلقائياً كل 10 ثوانٍ إذا كان هناك بوت يعمل
            setInterval(() => {
                if (document.body.innerText.includes('Online') || document.body.innerText.includes('متصل')) {
                    location.reload();
                }
            }, 10000);
        </script>
    </body></html>`);
});

// --- المنطق الخلفي (Control Logic) ---

app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = activeBots[name];
    
    if (action === 'start' && !bot.connected) {
        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
            bot.client.on('spawn', () => { 
                bot.connected = true; 
                bot.startTime = Date.now();
                if(bot.client.startGameData) bot.pos = bot.client.startGameData.player_position;
            });
            bot.interval = setInterval(() => {
                if (bot.client && bot.client.startGameData) bot.pos = bot.client.startGameData.player_position;
            }, 5000); // تحديث الإحداثيات كل 5 ثوانٍ
            bot.client.on('close', () => { bot.connected = false; clearInterval(bot.interval); });
        } else {
            const [h, p] = bot.host.split(':');
            bot.client = mineflayer.createBot({ host: h, port: p||25565, username: name });
            bot.client.on('spawn', () => { 
                bot.connected = true; 
                bot.startTime = Date.now(); 
                bot.gamemode = bot.client.game.gameMode;
            });
            bot.interval = setInterval(() => {
                if (bot.client && bot.client.entity) bot.pos = bot.client.entity.position;
            }, 5000);
            bot.client.on('death', () => bot.deathCount++);
            bot.client.on('end', () => { bot.connected = false; clearInterval(bot.interval); });
        }
    } else if (action === 'stop') {
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        bot.connected = false; clearInterval(bot.interval);
    } else if (action === 'delete') {
        if (bot.client) bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        clearInterval(bot.interval);
        delete activeBots[name];
    }
    res.sendStatus(200);
});

// المسارات الأساسية (Auth & Login)
app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null, gamemode: 'Connecting...' };
    res.redirect('/');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; res.redirect('/'); } else res.send("Error Login");
});

app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password === confirm && !users.find(u=>u.username===username)) { users.push({username, password}); res.redirect('/login'); } else res.send("Error Register");
});

app.get('/login', (req, res) => res.send(`<html><body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;"><div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1);"><h2>Login</h2><form action="/auth-login" method="POST"><input name="username" placeholder="User" required style="width:100%; padding:10px; margin:10px 0;"><input name="password" type="password" placeholder="Pass" required style="width:100%; padding:10px; margin:10px 0;"><button style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer;">Enter</button></form><p style="text-align:center;"><a href="/register">Register</a></p></div></body></html>`));
app.get('/register', (req, res) => res.send(`<html><body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;"><div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1);"><h2>Register</h2><form action="/auth-register" method="POST"><input name="username" placeholder="User" required style="width:100%; padding:10px; margin:10px 0;"><input name="password" type="password" placeholder="Pass" required style="width:100%; padding:10px; margin:10px 0;"><input name="confirm" type="password" placeholder="Confirm" required style="width:100%; padding:10px; margin:10px 0;"><button style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer;">Create</button></form><p style="text-align:center;"><a href="/login">Login</a></p></div></body></html>`));
app.get('/set-lang', (req, res) => { req.session.lang = req.query.l; res.redirect('/'); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(process.env.PORT || 10000);
