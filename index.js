const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-final-fix-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// قاعدة بيانات وهمية في الذاكرة
let users = []; 
let activeBots = {}; 

// حماية المسارات
function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// دالة حساب وقت التشغيل
function getUptime(startTime) {
    if (!startTime) return "0s";
    const diff = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// --- واجهات المستخدم (HTML) ---

const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; color: #333; }
        .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 400px; margin: 50px auto; }
        .dashboard-card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); max-width: 850px; margin: auto; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; margin-top: 10px; }
        .btn-primary { background: #1a73e8; color: white; }
        .btn-danger { background: #dc3545; color: white; }
        .btn-warning { background: #ffc107; color: #212529; }
        .btn-success { background: #28a745; color: white; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/login', (req, res) => {
    const isAr = (req.query.lang || 'ar') === 'ar';
    res.send(layout(isAr ? 'دخول' : 'Login', `
    <div class="card" style="text-align:center;">
        <h2 style="color:#1a73e8;">Kinga Pro 🚀</h2>
        <form action="/auth-login" method="POST">
            <input name="username" placeholder="${isAr ? 'اسم المستخدم' : 'Username'}" required>
            <input name="password" type="password" placeholder="${isAr ? 'كلمة المرور' : 'Password'}" required>
            <button class="btn btn-primary">${isAr ? 'دخول' : 'Login'}</button>
        </form>
        <p style="font-size:0.9em;"><a href="/register?lang=${isAr ? 'ar' : 'en'}">${isAr ? 'إنشاء حساب جديد' : 'Create an account'}</a></p>
    </div>`, isAr ? 'ar' : 'en'));
});

app.get('/register', (req, res) => {
    const isAr = (req.query.lang || 'ar') === 'ar';
    res.send(layout(isAr ? 'تسجيل' : 'Register', `
    <div class="card" style="text-align:center;">
        <h2 style="color:#1a73e8;">${isAr ? 'حساب جديد' : 'New Account'}</h2>
        <form action="/auth-register" method="POST">
            <input name="username" placeholder="${isAr ? 'اسم المستخدم' : 'Username'}" required>
            <input name="password" type="password" placeholder="${isAr ? 'كلمة المرور' : 'Password'}" required>
            <input name="confirm" type="password" placeholder="${isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}" required>
            <button class="btn btn-primary">${isAr ? 'إنشاء' : 'Register'}</button>
        </form>
        <p style="font-size:0.9em;"><a href="/login?lang=${isAr ? 'ar' : 'en'}">${isAr ? 'لديك حساب؟ دخول' : 'Already have an account? Login'}</a></p>
    </div>`, isAr ? 'ar' : 'en'));
});

// --- لوحة التحكم ---
app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(activeBots).filter(n => activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = activeBots[name];
        const status = b.connected ? (isAr ? 'متصل' : 'Online') : (isAr ? 'متوقف' : 'Stopped');
        return `
        <div style="background:white; padding:20px; border-radius:15px; margin-bottom:20px; border-right: 5px solid ${b.connected ? '#28a745' : '#dc3545'}; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${name} <small>(${b.type})</small></h3>
                <span style="color:${b.connected ? 'green' : 'red'}; font-weight:bold;">● ${status}</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px; font-size:0.85em; background:#f8f9fa; padding:12px; border-radius:10px;">
                <p>📍 ${isAr ? 'الإحداثيات' : 'Coords'}: X:${b.pos.x.toFixed(1)}, Y:${b.pos.y.toFixed(1)}</p>
                <p>💀 ${isAr ? 'الوفيات' : 'Deaths'}: ${b.deathCount}</p>
                <p style="grid-column: span 2;">⏱️ ${isAr ? 'مدة الاتصال' : 'Uptime'}: <b style="color:#1a73e8;">${b.connected ? getUptime(b.startTime) : '---'}</b></p>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${name}','start')" class="btn btn-success" style="flex:1;" ${b.connected ? 'disabled style="opacity:0.5;"' : ''}>${isAr ? 'تشغيل' : 'Start'}</button>
                <button onclick="ctl('${name}','stop')" class="btn btn-warning" style="flex:1;" ${!b.connected ? 'disabled style="opacity:0.5;"' : ''}>${isAr ? 'إيقاف' : 'Stop'}</button>
                <button onclick="ctl('${name}','delete')" class="btn btn-danger" style="flex:1;">${isAr ? 'حذف' : 'Delete'}</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('Kinga Dashboard', `
    <div class="dashboard-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h1>🚀 Kinga Pro</h1>
            <div>
                <a href="/set-lang?l=${isAr ? 'en' : 'ar'}" style="margin-right:10px;">${isAr ? 'English' : 'عربي'}</a>
                <a href="/logout" style="color:red;">${isAr ? 'خروج' : 'Logout'}</a>
            </div>
        </div>
        <form action="/add" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0;">
            <select name="type" id="tp" onchange="u()"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
            <input name="botName" placeholder="${isAr ? 'اسم البوت' : 'Bot Name'}" required>
            <input name="host" id="host" placeholder="${isAr ? 'IP السيرفر' : 'Server IP'}" required style="grid-column:span 2;">
            <input name="port" id="port" placeholder="${isAr ? 'البورت' : 'Port'}" style="grid-column:span 2;">
            <button class="btn btn-primary" style="grid-column:span 2;">${isAr ? 'حفظ وإضافة' : 'Save & Add'}</button>
        </form>
        <div id="botList">${botCards || '<p style="text-align:center; color:#999;">لا توجد بوتات</p>'}</div>
    </div>
    <script>
        function u(){ const v=document.getElementById('tp').value; const p=document.getElementById('port'); p.style.display=v==='java'?'none':'block'; p.required=v==='bedrock'; }
        function ctl(n,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})}).then(()=>setTimeout(()=>location.reload(), 1500));}
        u();
        // تحديث الواجهة كل 10 ثوانٍ إذا كان البوت شغال
        setInterval(() => { if (document.body.innerText.includes('Online') || document.body.innerText.includes('متصل')) location.reload(); }, 10000);
    </script>`, isAr ? 'ar' : 'en'));
});

// --- المنطق الخلفي ---

app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm) return res.send("Passwords do not match!");
    if (users.find(u => u.username === username)) return res.send("User already exists!");
    users.push({ username, password });
    res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.send("Invalid username or password!");
    req.session.user = username;
    res.redirect('/');
});

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
            bot.interval = setInterval(() => { if (bot.client && bot.client.startGameData) bot.pos = bot.client.startGameData.player_position; }, 5000);
            bot.client.on('close', () => { bot.connected = false; clearInterval(bot.interval); });
        } else {
            const [h, p] = bot.host.split(':');
            bot.client = mineflayer.createBot({ host: h, port: p || 25565, username: name });
            bot.client.on('spawn', () => { 
                bot.connected = true; 
                bot.startTime = Date.now(); 
                bot.pos = bot.client.entity.position;
            });
            bot.interval = setInterval(() => { if (bot.client && bot.client.entity) bot.pos = bot.client.entity.position; }, 5000);
            bot.client.on('death', () => bot.deathCount++);
            bot.client.on('end', () => { bot.connected = false; clearInterval(bot.interval); });
        }
    } else if (action === 'stop' && bot.connected) {
        bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        bot.connected = false;
        clearInterval(bot.interval);
    } else if (action === 'delete') {
        if (bot.client) bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        clearInterval(bot.interval);
        delete activeBots[name];
    }
    res.sendStatus(200);
});

app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, pos: { x: 0, y: 0, z: 0 }, deathCount: 0, startTime: null };
    res.redirect('/');
});

app.get('/set-lang', (req, res) => { req.session.lang = req.query.l; res.redirect('/'); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Kinga Dash Live on port ${PORT}`));
