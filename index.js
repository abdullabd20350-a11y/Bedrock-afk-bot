const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const fs = require('fs'); 
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'kinga-king-of-bots-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==========================================
// 1. إدارة البيانات والحماية
// ==========================================
process.on('uncaughtException', (err) => { console.log('[Critical] Caught Exception:', err.message); });

const dbPath = './database.json';
let data = { users: [], activeBots: {} };

if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath)); } 
    catch (e) { console.log("DB Reset due to corruption"); }
}

function saveData() {
    const toSave = { users: data.users, activeBots: {} };
    for (let id in data.activeBots) {
        let b = data.activeBots[id];
        toSave.activeBots[id] = {
            id: b.id, host: b.host, port: b.port, type: b.type, owner: b.owner, botName: b.botName,
            connected: b.connected, connecting: b.connecting,
            pos: b.pos, startTime: b.startTime
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(toSave, null, 2));
}

function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// ==========================================
// 2. محرك الحركة (Anti-AFK Engine)
// ==========================================
function startAntiAFK(bot) {
    const afkLoop = () => {
        if (!bot.connected || !bot.client) return;

        if (bot.type === 'java') {
            const actions = ['forward', 'back', 'left', 'right', 'jump'];
            const action = actions[Math.floor(Math.random() * actions.length)];
            
            // التفات الرأس + حركة فيزيائية
            bot.client.look((Math.random() * 3.14), (Math.random() * 1.5));
            if (action === 'jump') {
                bot.client.setControlState('jump', true);
                setTimeout(() => { if (bot.connected) bot.client.setControlState('jump', false); }, 500);
            } else {
                bot.client.setControlState(action, true);
                setTimeout(() => { if (bot.connected) bot.client.setControlState(action, false); }, 1000);
            }
        } 
        else if (bot.type === 'bedrock') {
            try {
                let currentPos = { ...bot.pos };
                const isJump = Math.random() > 0.5;
                if (isJump) {
                    currentPos.y += 1.1;
                    setTimeout(() => {
                        if (bot.connected) {
                            currentPos.y -= 1.1;
                            bot.client.queue('move_player', { runtime_entity_id: bot.runtimeId, position: currentPos, pitch: 0, yaw: 0, head_yaw: 0, mode: 0, on_ground: true, teleporter_id: 0 });
                        }
                    }, 500);
                } else {
                    currentPos.x += (Math.random() - 0.5) * 1.5;
                    currentPos.z += (Math.random() - 0.5) * 1.5;
                }
                bot.client.queue('move_player', { runtime_entity_id: bot.runtimeId, position: currentPos, pitch: 0, yaw: 1, head_yaw: 1, mode: 0, on_ground: true, teleporter_id: 0 });
                bot.pos = currentPos;
            } catch (e) {}
        }
        bot.afkTimeout = setTimeout(afkLoop, 60000); // كل دقيقة
    };
    bot.afkTimeout = setTimeout(afkLoop, 15000);
}

// ==========================================
// 3. واجهة المستخدم (The Dashboard)
// ==========================================
const layout = (title, content) => `
<html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
    .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); max-width: 800px; margin: auto; }
    .bot-card { background: #fff; padding: 20px; border-radius: 15px; margin-bottom: 15px; border: 1px solid #eee; position: relative; }
    .status { padding: 6px 12px; border-radius: 20px; font-size: 0.85em; font-weight: bold; }
    .btn { padding: 10px 18px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .btn-start { background: #28a745; color: white; }
    .btn-stop { background: #ffc107; }
    .btn-del { background: #dc3545; color: white; }
    input, select { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 10px; }
    .coords { font-family: monospace; background: #f8f9fa; padding: 12px; border-radius: 10px; margin: 10px 0; display: flex; justify-content: space-around; border: 1px solid #eee; }
</style></head><body>${content}</body></html>`;

app.get('/login', (req, res) => res.send(layout('دخول', `<div class="card" style="max-width:380px; text-align:center;"><h2>دخول الملك كينجا 👑</h2><form action="/auth-login" method="POST"><input name="username" placeholder="اسم المستخدم" required><input name="password" type="password" placeholder="كلمة المرور" required><button class="btn btn-start" style="width:100%">دخول</button></form><p><a href="/register">حساب جديد</a></p></div>`)));
app.get('/register', (req, res) => res.send(layout('تسجيل', `<div class="card" style="max-width:380px; text-align:center;"><h2>إنشاء حساب جديد</h2><form action="/auth-register" method="POST"><input name="username" placeholder="اليوزر" required><input name="password" type="password" placeholder="الباسورد" required><input name="confirm" type="password" placeholder="تأكيد الباسورد" required><button class="btn btn-start" style="width:100%">إنشاء</button></form></div>`)));

app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(data.activeBots).filter(id => data.activeBots[id].owner === req.session.user);
    let cards = myBots.map(id => {
        const b = data.activeBots[id];
        let state = b.connecting ? 'جاري الانضمام...' : (b.connected ? 'متصل ✅' : 'متوقف ❌');
        return `<div class="bot-card" style="border-right: 6px solid ${b.connected?'#28a745':'#dc3545'};">
            <h3>🤖 ${b.botName} (${b.type})</h3>
            <span class="status" style="background:${b.connected?'#d4edda':'#f8d7da'}">${state}</span>
            <div class="coords">
                <span>X: <b>${b.pos.x.toFixed(1)}</b></span><span>Y: <b>${b.pos.y.toFixed(1)}</b></span><span>Z: <b>${b.pos.z.toFixed(1)}</b></span>
            </div>
            <p>⏱️ مدة الجلسة: <b id="timer-${id}" data-start="${b.startTime || ''}">---</b></p>
            <button onclick="ctl('${id}','start')" class="btn btn-start" ${b.connected || b.connecting ? 'disabled':''}>تشغيل</button>
            <button onclick="ctl('${id}','stop')" class="btn btn-stop" ${!b.connected && !b.connecting ? 'disabled':''}>إيقاف</button>
            <button onclick="ctl('${id}','delete')" class="btn btn-del">حذف</button>
        </div>`;
    }).join('');
    res.send(layout('الرئيسية', `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center;"><h2>🚀 لوحة التحكم</h2><a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">خروج</a></div><form action="/add" method="POST" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;"><select name="type"><option value="java">Java</option><option value="bedrock">Bedrock</option></select><input name="botName" placeholder="اسم البوت"><input name="address" placeholder="IP:Port" style="grid-column:span 2;"><button class="btn btn-start" style="grid-column:span 2;">إضافة</button></form>${cards}</div><script>function ctl(id,a){fetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:a})}).then(()=>setTimeout(()=>location.reload(), 1200));}setInterval(()=>{document.querySelectorAll('[id^="timer-"]').forEach(el=>{const s=el.getAttribute('data-start');if(s){const d=Math.floor((Date.now()-parseInt(s))/1000);const m=Math.floor(d/60);const sc=d%60;el.innerText=m+"m "+sc+"s";}else el.innerText="---";});},1000);setInterval(()=>{if(!document.body.innerText.includes('جاري الانضمام')) location.reload();}, 20000);</script>`));
});

// ==========================================
// 4. منطق التحكم (The Core Control)
// ==========================================
app.post('/auth-register', (req, res) => {
    const { username, password, confirm } = req.body;
    if (password !== confirm || data.users.find(u => u.username === username)) return res.send("Error in data");
    data.users.push({ username, password }); saveData(); res.redirect('/login');
});

app.post('/auth-login', (req, res) => {
    const user = data.users.find(u => u.username === req.body.username && u.password === req.body.password);
    if (user) { req.session.user = user.username; return res.redirect('/'); }
    res.send("Wrong Login");
});

app.post('/add', checkAuth, (req, res) => {
    const { type, address, botName } = req.body;
    const id = Date.now().toString();
    let [h, p] = address.trim().split(':');
    if (!p) p = type === 'java' ? 25565 : 19132;
    data.activeBots[id] = { id, botName, host: h, port: parseInt(p), type, owner: req.session.user, connected: false, connecting: false, pos: {x:0,y:0,z:0}, startTime: null };
    saveData(); res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { id, action } = req.body;
    const b = data.activeBots[id];
    if (!b) return res.sendStatus(404);

    if (action === 'start' && !b.connected) {
        b.connecting = true; saveData();
        if (b.type === 'java') {
            b.client = mineflayer.createBot({ host: b.host, port: b.port, username: b.botName, auth: 'offline' });
            b.client.once('spawn', () => { 
                b.connected = true; b.connecting = false; b.startTime = Date.now(); 
                b.pos = b.client.entity.position; saveData(); startAntiAFK(b); 
            });
            b.client.on('move', () => { if(b.client.entity) b.pos = b.client.entity.position; });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
            b.client.on('end', () => { b.connected = false; b.connecting = false; saveData(); });
        } else {
            b.client = bedrock.createClient({ host: b.host, port: b.port, username: b.botName, offline: true });
            b.client.once('start_game', (packet) => { b.runtimeId = packet.runtime_entity_id; });
            b.client.once('spawn', () => { 
                b.connected = true; b.connecting = false; b.startTime = Date.now();
                if(b.client.startGameData) b.pos = b.client.startGameData.player_position;
                saveData(); startAntiAFK(b); 
            });
            b.client.on('error', () => { b.connected = false; b.connecting = false; saveData(); });
        }
    } else if (action === 'stop' || action === 'delete') {
        if (b.client) { b.type === 'java' ? b.client.quit() : b.client.disconnect(); }
        if (b.afkTimeout) clearTimeout(b.afkTimeout);
        b.connected = false; b.connecting = false; b.startTime = null;
        if (action === 'delete') delete data.activeBots[id];
        saveData();
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.listen(process.env.PORT || 10000);
