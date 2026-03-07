const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-ultra-secure-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// قاعدة بيانات وهمية (تصفر عند ريستارت السيرفر)
let users = []; 
let activeBots = {}; 

// دالة حماية المسارات
function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// --- القواميس اللغوية (عربي / إنجليزي) ---
const translations = {
    ar: {
        title: "كينجا بوت مانجر Pro",
        login: "تسجيل الدخول",
        register: "إنشاء حساب جديد",
        user: "اسم المستخدم",
        pass: "كلمة المرور",
        confirmPass: "تأكيد كلمة المرور",
        enter: "دخول",
        create: "إنشاء الحساب",
        noAccount: "ليس لديك حساب؟ سجل الآن",
        hasAccount: "لديك حساب بالفعل؟ سجل دخولك",
        welcome: "مرحباً بك،",
        logout: "تسجيل الخروج",
        addBot: "إضافة بوت جديد",
        botName: "اسم البوت داخل اللعبة",
        serverIp: "عنوان السيرفر (IP)",
        port: "المنفذ (Port)",
        save: "حفظ وإضافة",
        activeBots: "البوتات النشطة",
        stats: "الإحصائيات",
        coords: "الإحداثيات",
        deaths: "الوفيات",
        uptime: "وقت التشغيل",
        start: "تشغيل",
        stop: "إيقاف",
        delete: "حذف",
        refresh: "تحديث الإحصائيات",
        errorUserTaken: "⚠️ اسم المستخدم مأخوذ بالفعل!",
        errorPassMatch: "⚠️ كلمات المرور غير متطابقة!",
        errorWrongPass: "⚠️ اسم المستخدم أو كلمة المرور غير صحيحة!"
    },
    en: {
        title: "Kinga Bot Manager Pro",
        login: "Login",
        register: "Create New Account",
        user: "Username",
        pass: "Password",
        confirmPass: "Confirm Password",
        enter: "Login",
        create: "Register",
        noAccount: "Don't have an account? Register",
        hasAccount: "Already have an account? Login",
        welcome: "Welcome,",
        logout: "Logout",
        addBot: "Add New Bot",
        botName: "In-game Bot Name",
        serverIp: "Server IP",
        port: "Port",
        save: "Save & Add",
        activeBots: "Active Bots",
        stats: "Statistics",
        coords: "Coordinates",
        deaths: "Deaths",
        uptime: "Uptime",
        start: "Start",
        stop: "Stop",
        delete: "Delete",
        refresh: "Refresh Stats",
        errorUserTaken: "⚠️ Username is already taken!",
        errorPassMatch: "⚠️ Passwords do not match!",
        errorWrongPass: "⚠️ Incorrect username or password!"
    }
};

// --- الصفحات (HTML) ---

const baseHead = (lang) => `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root { --primary: #1a73e8; --danger: #dc3545; --success: #28a745; --bg: #f4f7f6; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: var(--bg); margin: 0; direction: ${lang === 'ar' ? 'rtl' : 'ltr'}; text-align: ${lang === 'ar' ? 'right' : 'left'}; }
        .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-width: 400px; margin: 50px auto; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; margin-top: 10px; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-danger { background: var(--danger); color: white; }
        .btn-link { background: none; color: var(--primary); text-decoration: underline; }
        .lang-switch { position: fixed; top: 20px; right: 20px; background: white; padding: 10px; border-radius: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); text-decoration: none; font-size: 0.8em; z-index: 1000; }
    </style>
`;

app.get('/login', (req, res) => {
    const lang = req.query.lang || 'ar';
    const t = translations[lang];
    res.send(`
        <html><head>${baseHead(lang)}</head><body>
            <a href="?lang=${lang === 'ar' ? 'en' : 'ar'}" class="lang-switch">${lang === 'ar' ? 'English' : 'العربية'}</a>
            <div class="card">
                <h2>${t.login}</h2>
                <form action="/auth-login" method="POST">
                    <input type="text" name="username" placeholder="${t.user}" required>
                    <input type="password" name="password" placeholder="${t.pass}" required>
                    <button class="btn btn-primary">${t.enter}</button>
                </form>
                <a href="/register?lang=${lang}" class="btn-link" style="display:block; text-align:center;">${t.noAccount}</a>
            </div>
        </body></html>
    `);
});

app.get('/register', (req, res) => {
    const lang = req.query.lang || 'ar';
    const t = translations[lang];
    res.send(`
        <html><head>${baseHead(lang)}</head><body>
            <div class="card">
                <h2>${t.register}</h2>
                <form action="/auth-register" method="POST">
                    <input type="text" name="username" placeholder="${t.user}" required>
                    <input type="password" name="password" placeholder="${t.pass}" required>
                    <input type="password" name="confirm" placeholder="${t.confirmPass}" required>
                    <button class="btn btn-primary">${t.create}</button>
                </form>
                <a href="/login?lang=${lang}" class="btn-link" style="display:block; text-align:center;">${t.hasAccount}</a>
            </div>
        </body></html>
    `);
});

// --- لوحة التحكم مدمجة مع اللغات ---
app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const t = translations[lang];
    let myBots = Object.keys(activeBots).filter(n => activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = activeBots[name];
        return `
            <div style="background:white; padding:20px; border-radius:12px; margin-bottom:20px; border-left: 5px solid ${b.connected ? 'green' : 'red'};">
                <div style="display:flex; justify-content:space-between;">
                    <h3>🤖 ${name} <small>(${b.type})</small></h3>
                    <span style="color:${b.connected ? 'green' : 'red'}">${b.connected ? 'ON' : 'OFF'}</span>
                </div>
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; font-size:0.9em; display:grid; grid-template-columns:1fr 1fr;">
                    <p>📍 ${t.coords}: ${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}</p>
                    <p>💀 ${t.deaths}: ${b.deathCount}</p>
                </div>
                <div style="margin-top:10px; display:flex; gap:5px;">
                    <button onclick="ctl('${name}', 'start')" class="btn btn-primary" style="padding:5px; flex:1;" ${b.connected ? 'disabled' : ''}>${t.start}</button>
                    <button onclick="ctl('${name}', 'stop')" class="btn btn-danger" style="padding:5px; flex:1;" ${!b.connected ? 'disabled' : ''}>${t.stop}</button>
                    <button onclick="ctl('${name}', 'delete')" style="background:#555; color:white; border:none; border-radius:8px; flex:1;">${t.delete}</button>
                </div>
            </div>`;
    }).join('');

    res.send(`
        <html><head>${baseHead(lang)}<style>.container{max-width:800px; margin:auto; padding:20px;}</style></head><body>
            <div class="container">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h1>${t.title}</h1>
                    <div>
                        <a href="/set-lang?l=${lang==='ar'?'en':'ar'}" style="margin-right:15px;">${lang==='ar'?'English':'عربي'}</a>
                        <a href="/logout" style="color:red;">${t.logout}</a>
                    </div>
                </div>
                <div class="card" style="max-width:none; margin:20px 0;">
                    <h3>${t.addBot}</h3>
                    <form action="/add" method="POST" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <select name="type" id="tp" onchange="u()">
                            <option value="bedrock">Bedrock</option>
                            <option value="java">Java</option>
                        </select>
                        <input name="botName" placeholder="${t.botName}" required>
                        <input name="host" id="host" placeholder="${t.serverIp}" required>
                        <input name="port" id="port" placeholder="${t.port}">
                        <button class="btn btn-primary" style="grid-column: span 2;">${t.save}</button>
                    </form>
                </div>
                <div>${botCards || '<p>No bots saved.</p>'}</div>
            </div>
            <script>
                function u(){const v=document.getElementById('tp').value; const p=document.getElementById('port'); p.style.display=v==='java'?'none':'block';}
                function ctl(n,a){fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})}).then(()=>location.reload());}
                u();
            </script>
        </body></html>
    `);
});

// --- المنطق البرمجي (Backend) ---

app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    const lang = req.headers.referer.includes('en') ? 'en' : 'ar';
    
    if (users.find(u => u.username === username)) return res.send(`<h3>${translations[lang].errorUserTaken}</h3><a href="/register?lang=${lang}">Back</a>`);
    if (password !== confirm) return res.send(`<h3>${translations[lang].errorPassMatch}</h3><a href="/register?lang=${lang}">Back</a>`);
    
    users.push({ username, password });
    res.redirect(`/login?lang=${lang}`);
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.send(`<h3>Invalid Login</h3><a href="/login">Back</a>`);
    
    req.session.user = username;
    req.session.lang = req.headers.referer.includes('en') ? 'en' : 'ar';
    res.redirect('/');
});

app.get('/set-lang', (req, res) => { req.session.lang = req.query.l; res.redirect('/'); });

// تشغيل البوتات والتحكم بها (نفس منطق الكود السابق الفعال)
app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, client: null, pos: {x:0, y:0, z:0}, deathCount: 0 };
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = activeBots[name];
    if (action === 'start') {
        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
            bot.client.on('spawn', () => { bot.connected = true; });
        } else {
            const [h, p] = bot.host.split(':');
            bot.client = mineflayer.createBot({ host: h, port: p||25565, username: name });
            bot.client.on('spawn', () => { bot.connected = true; bot.pos = bot.client.entity.position; });
            bot.client.on('death', () => bot.deathCount++);
        }
    } else if (action === 'stop' || action === 'delete') {
        if (bot.client) bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        if (action === 'delete') delete activeBots[name]; else bot.connected = false;
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(process.env.PORT || 10000);
