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
    for (let name in data.activeBots) {
        let b = data.activeBots[name];
        cleanData.activeBots[name] = {
            host: b.host, port: b.port, type: b.type, owner: b.owner,
            connected: b.connected, connecting: b.connecting,
            pos: b.pos, deathCount: b.deathCount, startTime: b.startTime,
            lastStatus: b.lastStatus 
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(cleanData, null, 2));
}

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// ==========================================
// 2. نظام الحركة العشوائية (Anti-AFK)
// ==========================================
function startAntiAFK(bot) {
    const afkLoop = () => {
        if (!bot.connected) return;

        if (bot.type === 'bedrock' && bot.client) {
            bot.client.queue('animate', { action_id: 1, runtime_entity_id: 1 });
        } else if (bot.client && bot.client.setControlState) {
            bot.client.setControlState('jump', true);
            setTimeout(() => { if (bot.connected) bot.client.setControlState('jump', false); }, 500);
        }

        const nextTime = Math.floor(Math.random() * (180000 - 120000 + 1)) + 120000;
        bot.afkTimeout = setTimeout(afkLoop, nextTime);
    };
    bot.afkTimeout = setTimeout(afkLoop, 5000);
}

function stopAntiAFK(bot) {
    if (bot.afkTimeout) {
        clearTimeout(bot.afkTimeout);
        bot.afkTimeout = null;
    }
}

// ==========================================
// 3. واجهة المستخدم (HTML)
// ==========================================
const layout = (title, content, lang = 'ar') => `
<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
        .dashboard-card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 900px; margin: auto; }
        .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #eee; }
        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
        .status-connecting { background: #fff3cd; color: #856404; animation: blink 1s infinite; }
        .status-online { background: #d4edda; color: #155724; }
        .status-offline { background: #f8d7da; color: #721c24; }
        @keyframes blink { 50% { opacity: 0.6; } }
        .coords-box { display: flex; gap: 15px; background: #f9f9f9; padding: 10px; border-radius: 10px; font-family: monospace; font-size: 0.9em; }
        .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-start { background: #28a745; color: white; }
        .btn-stop { background: #ffc107; color: #212529; }
        .btn-edit { background: #17a2b8; color: white; }
        .btn-delete { background: #dc3545; color: white; }
        .auth-card { background: white; padding: 35px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 380px; margin: 80px auto; text-align: center; }
        input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; box-sizing: border-box; }
        .edit-panel { display: none; background: #e9ecef; padding: 15px; border-radius: 10px; margin-top: 15px; }
        .error-msg { background: #f8d7da; color: #721c24; padding: 8px; border-radius: 8px; margin-top: 10px; font-size: 0.85em; font-weight: bold; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>${content}</body></html>`;

app.get('/login', (req, res) => {
    const isAr = (req.query.lang || 'ar') === 'ar';
    res.send(layout(isAr ? 'دخول' : 'Login', `
    <div class="auth-card">
        <h2 style="color:#1a73e8;">Kinga Pro 🚀</h2>
        <form action="/auth-login" method="POST">
            <input name="username" placeholder="${isAr ? 'اسم المستخدم' : 'Username'}" required>
            <input name="password" type="password" placeholder="${isAr ? 'كلمة المرور' : 'Password'}" required>
            <button class="btn btn-start" style="width:100%; background:#1a73e8; margin-top:15px;">${isAr ? 'دخول' : 'Login'}</button>
        </form>
        <p style="margin-top:20px; font-size:0.85em;"><a href="/register?lang=${isAr?'ar':'en'}">${isAr ? 'إنشاء حساب جديد' : 'Register'}</a></p>
    </div>`, isAr ? 'ar' : 'en'));
});

app.get('/register', (req, res) => {
    const isAr = (req.query.lang || 'ar') === 'ar';
    res.send(layout(isAr ? 'تسجيل' : 'Register', `
    <div class="auth-card">
        <h2 style="color:#1a73e8;">${isAr ? 'حساب جديد' : 'New Account'}</h2>
        <form action="/auth-register" method="POST">
            <input name="username" placeholder="${isAr ? 'اسم المستخدم' : 'Username'}" required>
            <input name="password" type="password" placeholder="${isAr ? 'كلمة المرور' : 'Password'}" required>
            <input name="confirm" type="password" placeholder="${isAr ? 'تأكيد كلمة المرور' : 'Confirm'}" required>
            <button class="btn btn-start" style="width:100%; background:#1a73e8; margin-top:15px;">${isAr ? 'إنشاء' : 'Register'}</button>
        </form>
        <p style="margin-top:20px; font-size:0.85em;"><a href="/login?lang=${isAr?'ar':'en'}">${isAr ? 'لديك حساب؟ دخول' : 'Login'}</a></p>
    </div>`, isAr ? 'ar' : 'en'));
});

app.get('/', checkAuth, (req, res) => {
    const lang = req.session.lang || 'ar';
    const isAr = lang === 'ar';
    let myBots = Object.keys(data.activeBots).filter(n => data.activeBots[n].owner === req.session.user);
    
    let botCards = myBots.map(name => {
        const b = data.activeBots[name];
        let statusClass = b.connecting ? 'status-connecting' : (b.connected ? 'status-online' : 'status-offline');
        let statusText = b.connecting ? (isAr ? 'جاري الانضمام...' : 'Connecting...') : (b.connected ? (isAr ? 'متصل' : 'Online') : (isAr ? 'متوقف' : 'Stopped'));
        let isBusy = b.connected || b.connecting;

        return `
        <div class="bot-card" style="border-${isAr?'right':'left'}: 6px solid ${b.connected?'#28a745':(b.connecting?'#ffc107':'#dc3545')};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">🤖 ${name} <small>(${b.type})</small></h3>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            
            ${b.lastStatus && !b.connected && !b.connecting ? `<div class="error-msg">⚠️ السبب: ${b.lastStatus}</div>` : ''}

            <div style="margin-top:15px; background:#f4f4f4; padding:15px; border-radius:12px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
                    <strong>📍 ${isAr?'الإحداثيات':'Coordinates'}:</strong>
                    <div class="coords-box">
                        <span>X: <b>${b.pos.x.toFixed(1)}</b></span>
                        <span>Y: <b>${b.pos.y.toFixed(1)}</b></span>
                        <span>Z: <b>${b.pos.z.toFixed(1)}</b></span>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>⏱️ ${isAr?'مدة الاتصال':'Uptime'}: <b id="timer-${name}" data-start="${b.startTime || ''}" style="color:#1a73e8;">---</b></span>
                    <span>💀 ${isAr?'الوفيات':'Deaths'}: <b>${b.deathCount}</b></span>
                </div>
            </div>

            <div id="edit-${name}" class="edit-panel">
                <form action="/edit" method="POST" style="display:flex; gap:10px; margin:0; align-items:center;">
                    <input type="hidden" name="botName" value="${name}">
                    <select name="type" style="margin:0; width:30%;"><option value="bedrock" ${b.type==='bedrock'?'selected':''}>Bedrock</option><option value="java" ${b.type==='java'?'selected':''}>Java</option></select>
                    <input name="address" value="${b.host}:${b.port}" style="margin:0; width:50%;" required>
                    <button class="btn btn-start" style="width:20%; padding:10px;">${isAr?'حفظ':'Save'}</button>
                </form>
            </div>

            <div style="margin-top:15px; display:flex; gap:10px;">
                <button onclick="ctl('${name}','start')" class="btn btn-start" style="flex:1;" ${isBusy ? 'disabled style="opacity:0.5"' : ''}>${isAr?'تشغيل':'Start'}</button>
                <button onclick="ctl('${name}','stop')" class="btn btn-stop" style="flex:1;" ${!isBusy ? 'disabled style="opacity:0.5"' : ''}>${isAr?'إيقاف':'Stop'}</button>
                <button onclick="toggleEdit('${name}')" class="btn btn-edit" style="flex:1;" ${isBusy ? 'disabled style="opacity:0.5"' : ''}>${isAr?'تعديل':'Edit'}</button>
                <button onclick="ctl('${name}','delete')" class="btn btn-delete" style="flex:1;">${isAr?'حذف':'Delete'}</button>
            </div>
        </div>`;
    }).join('');

    res.send(layout('Kinga Dashboard', `
    <div class="dashboard-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2>🚀 Kinga Live Manager</h2>
            <div style="display:flex; gap:15px; align-items:center;">
                <a href="/set-lang?l=${isAr ? 'en' : 'ar'}" style="text-decoration:none; font-weight:bold; color:#1a73e8;">${isAr ? 'English' : 'عربي'}</a>
                <a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">${isAr?'خروج':'Logout'}</a>
            </div>
        </div>
        
        <form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:20px 0;">
            <select name="type" id="tp"><option value="bedrock">Bedrock</option><option value="java">Java</option></select>
            <input name="botName" placeholder="${isAr?'اسم البوت':'Bot Name'}" required>
            <input name="address" placeholder="${isAr?'الآيبي (مثال: server.aternos.me:12345)':'IP:Port'}" required style="grid-column:span 2;">
            <button class="btn btn-start" style="grid-column:span 2; background:#1a73e8;">${isAr?'إضافة':'Add'}</button>
        </form>

        <div id="botList">${botCards || '<p style="text-align:center; color:#888;">لا توجد بوتات حالياً</p>'}</div>
    </div>
    <script>
        function toggleEdit(name) {
            const el = document.getElementById('edit-' + name);
            el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
        }

        function ctl(n,a){ 
            fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,action:a})})
            .then(()=>setTimeout(()=>location.reload(), 500));
        }
        
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

        setInterval(() => {
            if (document.body.innerText.includes('جاري الانضمام...')) {
                location.reload();
            }
        }, 3000);
    </script>`, isAr ? 'ar' : 'en'));
});

// ==========================================
// 4. العمليات الخلفية الأساسية 
// ==========================================

app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm) return res.send("<script>alert('❌ الباسورد غير متطابق'); window.location='/register';</script>");
    if (data.users.find(u => u.username === username)) return res.send("<script>alert('⚠️ اليوزر مستخدم بالفعل'); window.location='/register';</script>");
    
    data.users.push({ username, password });
    saveData();
    res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (user) { req.session.user = username; return res.redirect('/'); }
    res.send("<script>alert('❌ خطأ في اليوزر أو الباسورد'); window.location='/login';</script>");
});

app.post('/add', checkAuth, (req, res) => {
    const { type, address, botName } = req.body;
    if (data.activeBots[botName]) return res.send("<script>alert('⚠️ اسم البوت موجود مسبقاً'); window.location='/';</script>");

    let host = address.trim();
    let port = type === 'bedrock' ? 19132 : 25565;

    if (address.includes(':')) {
        const parts = address.split(':');
        host = parts[0].trim();
        port = parseInt(parts[1].trim());
    }

    data.activeBots[botName] = { host, port, type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, deathCount: 0, startTime: null, lastStatus: '' };
    saveData(); 
    res.redirect('/');
});

app.post('/edit', checkAuth, (req, res) => {
    const { botName, type, address } = req.body;
    const bot = data.activeBots[botName];
    if (!bot || bot.connected || bot.connecting) return res.redirect('/');

    let host = address.trim();
    let port = type === 'bedrock' ? 19132 : 25565;

    if (address.includes(':')) {
        const parts = address.split(':');
        host = parts[0].trim();
        port = parseInt(parts[1].trim());
    }

    bot.type = type; bot.host = host; bot.port = port; bot.lastStatus = '';
    saveData();
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = data.activeBots[name];
    
    if (action === 'start' && !bot.connected && !bot.connecting) {
        bot.connecting = true;
        bot.lastStatus = ''; 
        
        // زيادة مهلة الانتظار إلى 90 ثانية لتناسب بطء سيرفرات Aternos
        bot.connectTimeout = setTimeout(() => {
            if (bot.connecting) {
                bot.connecting = false; bot.connected = false;
                bot.lastStatus = 'انتهى الوقت (Timeout) - استغرق السيرفر أكثر من 90 ثانية للرد';
                if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
                saveData();
            }
        }, 90000); 

        const clearTimer = () => { if(bot.connectTimeout) clearTimeout(bot.connectTimeout); };

        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: bot.port, username: name, offline: true });
            
            bot.client.on('spawn', () => { 
                clearTimer();
                bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); bot.lastStatus = '';
                if(bot.client.startGameData) bot.pos = bot.client.startGameData.player_position;
                startAntiAFK(bot); 
            });
            bot.client.on('error', (err) => { clearTimer(); stopAntiAFK(bot); bot.connected = false; bot.connecting = false; bot.lastStatus = err.message; });
            bot.client.on('close', () => { clearTimer(); stopAntiAFK(bot); bot.connected = false; bot.connecting = false; });
            
        } else {
            try {
                bot.client = mineflayer.createBot({ 
                    host: bot.host, 
                    port: bot.port, 
                    username: name, 
                    auth: 'offline',
                    version: false,
                    keepAlive: true, // إرسال نبضات مستمرة لمنع السيرفر من قطع الاتصال
                    checkTimeoutInterval: 120000 // السماح لـ mineflayer بمهلة داخلية تصل لدقيقتين
                });
                
                bot.client.on('spawn', () => { 
                    clearTimer();
                    bot.connected = true; bot.connecting = false; bot.startTime = Date.now(); bot.lastStatus = '';
                    bot.pos = bot.client.entity.position;
                    startAntiAFK(bot); 
                });
                
                bot.client.on('kicked', (reason) => {
                    clearTimer(); stopAntiAFK(bot); 
                    bot.connected = false; bot.connecting = false;
                    bot.lastStatus = typeof reason === 'string' ? reason : JSON.stringify(reason);
                    saveData();
                });

                bot.client.on('error', (err) => { 
                    clearTimer(); stopAntiAFK(bot); 
                    bot.connected = false; bot.connecting = false; 
                    bot.lastStatus = 'مشكلة في الشبكة: ' + err.message;
                    saveData();
                });
                
                bot.client.on('end', () => { 
                    clearTimer(); stopAntiAFK(bot); 
                    bot.connected = false; bot.connecting = false; 
                    if(!bot.lastStatus) bot.lastStatus = "تم قطع الاتصال بالسيرفر";
                    saveData();
                });
                bot.client.on('death', () => bot.deathCount++);
            } catch (err) {
                clearTimer(); stopAntiAFK(bot); 
                bot.connected = false; bot.connecting = false;
                bot.lastStatus = 'خطأ داخلي: ' + err.message;
            }
        }
    } else if (action === 'stop') {
        if(bot.connectTimeout) clearTimeout(bot.connectTimeout); 
        stopAntiAFK(bot); 
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        bot.connected = false; bot.connecting = false; bot.startTime = null; bot.lastStatus = 'تم الإيقاف يدوياً';
        saveData();
    } else if (action === 'delete') {
        if(bot.connectTimeout) clearTimeout(bot.connectTimeout);
        stopAntiAFK(bot);
        if (bot.client) { bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit(); }
        delete data.activeBots[name];
        saveData();
    }
    res.sendStatus(200);
});

app.get('/set-lang', (req, res) => { req.session.lang = req.query.l; res.redirect('/'); });
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.listen(process.env.PORT || 10000, () => console.log('🚀 Dashboard is running with Extended Timeouts!'));
