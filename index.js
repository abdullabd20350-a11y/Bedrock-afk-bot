const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-secret-key-123',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

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

// --- واجهة تسجيل الدخول وانشاء الحساب ---
const authUI = (isLogin, lang, error = "") => {
    const isAr = lang === 'ar';
    const t = {
        h: isLogin ? (isAr ? 'تسجيل الدخول' : 'Login') : (isAr ? 'إنشاء حساب' : 'Register'),
        btn: isLogin ? (isAr ? 'دخول' : 'Login') : (isAr ? 'إنشاء' : 'Create'),
        link: isLogin ? (isAr ? 'ليس لديك حساب؟ سجل' : 'No account? Register') : (isAr ? 'لديك حساب؟ سجل دخول' : 'Have account? Login'),
        path: isLogin ? '/register' : '/login'
    };
    return `
    <html dir="${isAr?'rtl':'ltr'}"><body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5; margin:0;">
        <div style="background:white; padding:30px; border-radius:15px; box-shadow:0 8px 20px rgba(0,0,0,0.1); width:320px; text-align:center;">
            <h2 style="color:#1a73e8;">${t.h}</h2>
            ${error ? `<p style="color:red; font-size:0.8em;">${error}</p>` : ''}
            <form action="${isLogin?'/auth-login':'/auth-register'}" method="POST">
                <input name="username" placeholder="${isAr?'اسم المستخدم':'User'}" required style="width:100%; padding:10px; margin:8px 0; border:1px solid #ddd; border-radius:5px;">
                <input name="password" type="password" placeholder="${isAr?'كلمة المرور':'Pass'}" required style="width:100%; padding:10px; margin:8px 0; border:1px solid #ddd; border-radius:5px;">
                ${!isLogin ? `<input name="confirm" type="password" placeholder="${isAr?'تأكيد كلمة المرور':'Confirm'}" required style="width:100%; padding:10px; margin:8px 0; border:1px solid #ddd; border-radius:5px;">` : ''}
                <button style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:5px; cursor:pointer; font-weight:bold; margin-top:10px;">${t.btn}</button>
            </form>
            <a href="${t.path}?lang=${lang}" style="font-size:0.85em; color:#666;">${t.link}</a>
        </div>
    </body></html>`;
};

app.get('/login', (req, res) => res.send(authUI(true, req.query.lang || 'ar')));
app.get('/register', (req, res) => res.send(authUI(false, req.query.lang || 'ar')));

// --- لوحة التحكم ---
app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(activeBots).filter(n => activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = activeBots[name];
        return `
        <div style="background:white; padding:20px; border-radius:15px; margin-bottom:20px; border-${isAr?'right':'left'}: 5px solid ${b.connected ? '#28a745' : '#dc3545'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${name} <small>(${b.type})</small></h3>
                <span style="color:${b.connected ? 'green' : 'red'}; font-weight:bold;">● ${b.connected?(isAr?'متصل':'Online'):(isAr?'متوقف':'Stopped')}</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px; font-size:0.85em; background:#f9f9f9; padding:10px; border-radius:10px;">
                <p>📍 ${isAr?'الإحداثيات':'Coords'}: ${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}</p>
                <p>💀 ${isAr?'الوفيات':'Deaths'}: ${b.deathCount}</p>
                <p style="grid-column: span 2;">⏱️ ${isAr?'مدة الاتصال':'Uptime'}: <b>${b.connected ? getUptime(b.startTime) : '---'}</b></p>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${name}','start')" style="flex:1; background:#28a745; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer;" ${b.connected?'disabled':''}>${isAr?'تشغيل':'Start'}</button>
                <button onclick="ctl('${name}','stop')" style="flex:1; background:#ffc107; color:black; border:none; padding:10px; border-radius:8px; cursor:pointer;" ${!b.connected?'disabled':''}>${isAr?'إيقاف':'Stop'}</button>
                <button onclick="ctl('${name}','delete')" style="flex:1; background:#dc3545; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer;">${isAr?'حذف':'Delete'}</button>
            </div>
        </div>`;
    }).join('');

    res.send(`
    <html dir="${isAr?'rtl':'ltr'}">
    <head><meta charset="UTF-8"><style>body{font-family:sans-serif; background:#f4f7f6; padding:20px;} .card{background:white; padding:25px; border-radius:15px; box-shadow:0 4px 15px rgba(0,0,0,0.1); max-width:800px; margin:auto;}</style></head>
    <body>
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h1>🚀 Kinga Pro</h1>
                <div>
                    <a href="/set-lang?l=${isAr?'en':'ar'}" style="margin-right:10px;">${isAr?'English':'عربي'}</a>
                    <a href="/logout" style="color:red;">${isAr?'خروج':'Logout'}</a>
                </div>
            </div>
            <form action="/add" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0;">
                <select name="type" id="tp" onchange="u()"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
                <input name="botName" placeholder="${isAr?'اسم البوت':'Bot Name'}" required>
                <input name="host" id="host" placeholder="${isAr?'IP السيرفر':'Server IP'}" required style="grid-column:span 2;">
                <input name="port" id="port" placeholder="${isAr?'البورت':'Port'}" style="grid-column:span 2;">
                <button style="grid-column:span 2; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer;">${isAr?'حفظ':'Save'}</button>
            </form>
            <div>${botCards || '<p style="text-align:center; color:#999;">لا توجد بوتات</p>'}</div>
        </div>
        <script>
            function u(){ const v=document.getElementById('tp').value; const p=document.getElementById('port'); p.style.display=v==='java'?'none':'block'; p.required=v==='bedrock'; }
            function ctl(n,a){ fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})}).then(()=>setTimeout(()=>location.reload(),1000));}
            u();
        </script>
    </body></html>`);
});

// --- المنطق الخلفي ---
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (users.find(u => u.username === username)) return res.send(authUI(false, 'ar', 'اسم المستخدم مأخوذ!'));
    if (password !== confirm) return res.send(authUI(false, 'ar', 'كلمات المرور غير متطابقة!'));
    users.push({ username, password });
    res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.send(authUI(true, 'ar', 'بيانات خاطئة!'));
    req.session.user = username;
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = activeBots[name];
    if (action === 'start' && !bot.connected) {
        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
            bot.client.on('spawn', () => { bot.connected = true; bot.startTime = Date.now(); });
            bot.client.on('close', () => { bot.connected = false; });
        } else {
            const [h, p] = bot.host.split(':');
            bot.client = mineflayer.createBot({ host: h, port: p||25565, username: name });
            bot.client.on('spawn', () => { bot.connected = true; bot.startTime = Date.now(); bot.pos = bot.client.entity.position; });
            bot.client.on('death', () => bot.deathCount++);
            bot.client.on('end', () => { bot.connected = false; });
        }
    } else if (action === 'stop' && bot.connected) {
        bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        bot.connected = false;
    } else if (action === 'delete') {
        if (bot.client) bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        delete activeBots[name];
    }
    res.sendStatus(200);
});

app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null };
    res.redirect('/');
});

app.get('/set-lang', (req, res) => { req.session.lang = req.query.l; res.redirect('/'); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(process.env.PORT || 10000);
