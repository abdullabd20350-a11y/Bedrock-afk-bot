const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-super-secret-key',
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

// دالة حساب مدة الاتصال بتنسيق مقروء
function getUptime(startTime) {
    if (!startTime) return "0s";
    const diff = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// --- الواجهة الرسومية المحدثة ---
app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(activeBots).filter(n => activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = activeBots[name];
        const timeOnline = b.connected ? getUptime(b.startTime) : (isAr ? "غير متصل" : "Offline");
        
        return `
            <div style="background:white; padding:20px; border-radius:15px; margin-bottom:20px; border-right: 5px solid ${b.connected ? '#28a745' : '#dc3545'}; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">🤖 ${name} <small style="color:#666;">(${b.type})</small></h3>
                    <span style="background:${b.connected ? '#d4edda' : '#f8d7da'}; color:${b.connected ? '#155724' : '#721c24'}; padding:5px 10px; border-radius:20px; font-size:0.8em; font-weight:bold;">
                        ${b.connected ? (isAr ? 'متصل' : 'Connected') : (isAr ? 'متوقف' : 'Stopped')}
                    </span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px; font-size:0.9em; color:#555; background:#fcfcfc; padding:10px; border-radius:10px;">
                    <p>📍 ${isAr ? 'الإحداثيات' : 'Coords'}: ${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}</p>
                    <p>💀 ${isAr ? 'الوفيات' : 'Deaths'}: ${b.deathCount}</p>
                    <p style="grid-column: span 2;">⏱️ ${isAr ? 'مدة الاتصال الحالية' : 'Online for'}: <b style="color:#1a73e8;">${timeOnline}</b></p>
                </div>
                <div style="margin-top:15px; display:flex; gap:10px;">
                    <button onclick="controlBot('${name}', 'start')" style="flex:1; background:#28a745; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold;" ${b.connected ? 'disabled style="opacity:0.5;"' : ''}>${isAr ? 'تشغيل' : 'Start'}</button>
                    <button onclick="controlBot('${name}', 'stop')" style="flex:1; background:#ffc107; color:black; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold;" ${!b.connected ? 'disabled style="opacity:0.5;"' : ''}>${isAr ? 'إيقاف' : 'Stop'}</button>
                    <button onclick="controlBot('${name}', 'delete')" style="flex:1; background:#dc3545; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold;">${isAr ? 'حذف' : 'Delete'}</button>
                </div>
            </div>`;
    }).join('');

    res.send(`
        <html lang="${lang}" dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: auto; }
                .card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h1>${isAr ? 'لوحة تحكم كينجا' : 'Kinga Dashboard'}</h1>
                    <a href="/logout" style="color:red; font-weight:bold; text-decoration:none;">${isAr ? 'خروج' : 'Logout'}</a>
                </div>
                <div class="card" style="margin:20px 0;">
                    <h3>${isAr ? 'إضافة بوت جديد' : 'Add New Bot'}</h3>
                    <form action="/add" method="POST">
                        <select name="type" id="tp" onchange="u()">
                            <option value="bedrock">Bedrock</option>
                            <option value="java">Java</option>
                        </select>
                        <input name="botName" placeholder="${isAr ? 'اسم البوت' : 'Bot Name'}" required>
                        <input name="host" id="host" placeholder="${isAr ? 'الآيبي' : 'IP'}" required>
                        <input name="port" id="port" placeholder="${isAr ? 'البورت' : 'Port'}">
                        <button type="submit" style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer;">${isAr ? 'حفظ' : 'Save'}</button>
                    </form>
                </div>
                <div id="botList">${botCards || '<p style="text-align:center; color:#888;">لا توجد بوتات حالياً</p>'}</div>
            </div>
            <script>
                function u(){ const v=document.getElementById('tp').value; document.getElementById('port').style.display=v==='java'?'none':'block'; }
                function controlBot(n, a){ 
                    fetch('/control', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: n, action: a})
                    }).then(() => {
                        // تحديث تلقائي بعد ثانية لضمان استلام حالة الاتصال من السيرفر
                        setTimeout(() => location.reload(), 1000);
                    });
                }
                u();
                // تحديث الصفحة كل 30 ثانية لتحديث عداد الوقت تلقائياً
                setInterval(() => location.reload(), 30000);
            </script>
        </body></html>
    `);
});

// --- المنطق الخلفي (Backend) ---

app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = activeBots[name];
    if (!bot) return res.sendStatus(404);

    if (action === 'start') {
        if (bot.connected) return res.sendStatus(200);

        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
            bot.client.on('spawn', () => { 
                bot.connected = true; 
                bot.startTime = Date.now(); 
            });
            bot.client.on('error', (err) => { bot.connected = false; console.error(err); });
            bot.client.on('close', () => { bot.connected = false; });
        } else {
            const [h, p] = bot.host.split(':');
            bot.client = mineflayer.createBot({ host: h, port: p || 25565, username: name });
            bot.client.on('spawn', () => { 
                bot.connected = true; 
                bot.startTime = Date.now();
                bot.pos = bot.client.entity.position;
            });
            bot.client.on('death', () => bot.deathCount++);
            bot.client.on('end', () => { bot.connected = false; });
            bot.client.on('error', (err) => { bot.connected = false; });
        }
    } else if (action === 'stop') {
        if (bot.client) {
            bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        }
        bot.connected = false;
        bot.startTime = null;
        bot.client = null;
    } else if (action === 'delete') {
        if (bot.client) bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        delete activeBots[name];
    }
    res.sendStatus(200);
});

// (بقية المسارات /login, /register, /auth تبقى كما هي)
app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, client: null, pos: {x:0, y:0, z:0}, deathCount: 0, startTime: null };
    res.redirect('/');
});

app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (users.find(u => u.username === username)) return res.send("User taken");
    if (password !== confirm) return res.send("Pass mismatch");
    users.push({ username, password });
    res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.send("Invalid Login");
    req.session.user = username;
    res.redirect('/');
});

app.get('/login', (req, res) => { res.send(`<html><body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;"><div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1);"><h2 style="text-align:center;">Login</h2><form action="/auth-login" method="POST"><input name="username" placeholder="Username" required style="width:100%; padding:10px; margin:10px 0;"><input name="password" type="password" placeholder="Password" required style="width:100%; padding:10px; margin:10px 0;"><button style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer;">Enter</button></form><p style="text-align:center;"><a href="/register">Register</a></p></div></body></html>`); });

app.get('/register', (req, res) => { res.send(`<html><body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;"><div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1);"><h2 style="text-align:center;">Register</h2><form action="/auth-register" method="POST"><input name="username" placeholder="Username" required style="width:100%; padding:10px; margin:10px 0;"><input name="password" type="password" placeholder="Password" required style="width:100%; padding:10px; margin:10px 0;"><input name="confirm" type="password" placeholder="Confirm Password" required style="width:100%; padding:10px; margin:10px 0;"><button style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer;">Create</button></form><p style="text-align:center;"><a href="/login">Login</a></p></div></body></html>`); });

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(process.env.PORT || 10000);
