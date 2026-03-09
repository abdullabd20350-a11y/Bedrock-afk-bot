const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');
const app = express();

// 🔥 سطر الحماية لمنع انهيار الموقع
process.on('uncaughtException', (err) => { console.log('[System Safe Guard]:', err.message); });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. إدارة البيانات
// ==========================================
const dbPath = './database.json';
let data = { bots: {} };

if (fs.existsSync(dbPath)) {
    try { 
        data = JSON.parse(fs.readFileSync(dbPath));
        for (let id in data.bots) {
            data.bots[id].connected = false;
            data.bots[id].connecting = false;
            data.bots[id].shouldRun = false; 
            data.bots[id].retryCount = 0;
            data.bots[id].verifyLink = null; 
            data.bots[id].lastError = null;
            if (data.bots[id].health === undefined) data.bots[id].health = 20;
            if (data.bots[id].hunger === undefined) data.bots[id].hunger = 20;
        }
    } catch (e) { data = { bots: {} }; }
}

function saveDB() {
    const toSave = { bots: {} };
    for (let id in data.bots) {
        let b = data.bots[id];
        toSave.bots[id] = {
            id: b.id, host: b.host, port: b.port, botName: b.botName,
            pos: b.pos, connected: b.connected, connecting: b.connecting,
            verifyLink: b.verifyLink, health: b.health, hunger: b.hunger,
            lastError: b.lastError 
        };
    }
    fs.writeFileSync(dbPath, JSON.stringify(toSave, null, 2));
}

let activeClients = {}; 

// 🔥 إغلاق آمن للبوتات لمنع تعليقها كلاعب وهمي
function gracefulShutdown() {
    console.log('\n[System]: جاري إغلاق البوتات بشكل آمن...');
    for (let id in activeClients) {
        try { activeClients[id].disconnect(); } catch(e) {}
    }
    setTimeout(() => process.exit(0), 1000); 
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ==========================================
// 2. محرك الاتصال 
// ==========================================
function connectBot(id) {
    const b = data.bots[id];
    if (!b || !b.shouldRun) return;

    b.connecting = true;
    b.connected = false;
    b.verifyLink = null; 
    b.lastError = null; 
    b.health = 20;
    b.hunger = 20;
    saveDB();

    console.log(`[${b.botName}] جاري محاولة الاتصال بـ ${b.host}:${b.port}...`);

    try {
        if (activeClients[id]) {
            try { activeClients[id].disconnect(); } catch(e) {}
            delete activeClients[id];
        }

        activeClients[id] = bedrock.createClient({ 
            host: b.host, 
            port: b.port, 
            username: b.botName, 
            offline: true
        });
        
        const client = activeClients[id];

        client.on('start_game', (pkt) => { 
            b.runtimeId = pkt.runtime_entity_id; 
            if (pkt.player_position) b.pos = pkt.player_position;
            client.queue('request_chunk_radius', { chunk_radius: 2 });
        });

        // التقاط رابط التحقق
        client.on('text', (packet) => {
            const msg = packet.message;
            if (msg && msg.includes('falixnodes.net/verify')) {
                const match = msg.match(/(https:\/\/client\.falixnodes\.net\/verify\?t=[a-zA-Z0-9]+)/);
                if (match) {
                    b.verifyLink = match[1]; 
                    saveDB();
                }
            }
            if (msg && msg.includes('Thanks for verifying')) {
                b.verifyLink = null;
                saveDB();
            }
        });

        client.on('spawn', () => {
            console.log(`[${b.botName}] دخل السيرفر بنجاح!`);
            b.connected = true;
            b.connecting = false;
            b.retryCount = 0; 
            b.lastError = null;
            saveDB();

            client.queue('set_local_player_as_initialized', { runtime_entity_id: b.runtimeId });

            if (b.moveInterval) clearInterval(b.moveInterval);
            b.moveInterval = setInterval(() => {
                if (!b.connected) return clearInterval(b.moveInterval);
                try {
                    client.queue('animate', { action_id: 1, runtime_entity_id: b.runtimeId }); 
                } catch (e) {}
            }, 30000);

            // دورة الخروج كل 20 دقيقة (تم إعادتها للصيغة الأصلية)
            if (b.reloginTimer) clearTimeout(b.reloginTimer);
            b.reloginTimer = setTimeout(() => {
                console.log(`[${b.botName}] الخروج التلقائي (20 دقيقة)...`);
                b.isRelogging = true; 
                client.disconnect();
            }, 20 * 60 * 1000); 
        });

        client.on('update_attributes', (pkt) => {
            if (pkt.runtime_entity_id === b.runtimeId) {
                let updated = false;
                for (const attr of pkt.attributes) {
                    if (attr.name === 'minecraft:health') { b.health = attr.current; updated = true; } 
                    else if (attr.name === 'minecraft:player.hunger') { b.hunger = attr.current; updated = true; }
                }
                if (updated) saveDB();
            }
        });

        client.on('move_player', (pkt) => {
            if (pkt.runtime_entity_id === b.runtimeId) {
                b.pos = pkt.position;
                saveDB();
            }
        });

        client.on('disconnect', (pkt) => {
            const reason = pkt.reason || "غير معروف";
            console.log(`[${b.botName}] تم الطرد: ${reason}`);
            b.lastError = `طرد من السيرفر: ${reason}`;
            saveDB();
            handleDisconnect(id);
        });

        client.on('error', (err) => { 
            console.log(`[${b.botName}] رسالة خطأ: ${err.message}`);
            b.lastError = `فشل الاتصال: ${err.message}`;
            saveDB();
            handleDisconnect(id); 
        });
        
        client.on('close', () => { handleDisconnect(id); });

    } catch (e) {
        console.log(`[${b.botName}] خطأ في السكريبت: ${e.message}`);
        b.lastError = `خطأ في الكود: ${e.message}`;
        saveDB();
        handleDisconnect(id);
    }
}

// تنظيف عميق
function handleDisconnect(id) {
    const b = data.bots[id];
    if (!b) return;

    if (b.moveInterval) clearInterval(b.moveInterval);
    if (b.reloginTimer) clearTimeout(b.reloginTimer);
    
    if (activeClients[id]) {
        try { activeClients[id].disconnect(); } catch(e) {}
        delete activeClients[id]; 
    }

    b.connected = false;
    b.connecting = false;
    saveDB();

    if (!b.shouldRun) return; 

    if (b.isRelogging) {
        b.isRelogging = false;
        setTimeout(() => connectBot(id), 5000); 
        return;
    }

    if (b.retryCount === 0) {
        b.retryCount = 1;
        setTimeout(() => connectBot(id), 30000);
    } 
    else if (b.retryCount === 1) {
        b.retryCount = 2;
        setTimeout(() => connectBot(id), 60000);
    } 
    else {
        b.shouldRun = false; 
        b.retryCount = 0;
        saveDB();
    }
}

// ==========================================
// 3. الواجهة (HTML)
// ==========================================
const ui = (content) => `
<html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>لوحة الملك كينجا</title>
<style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; padding: 20px; text-align: center; }
    .container { max-width: 900px; margin: auto; background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
    .bot-card { background: #f8f9fa; border-radius: 15px; padding: 15px; margin: 15px 0; border: 1px solid #eee; display: flex; flex-direction: column; text-align: right; border-right: 6px solid #dc3545; position: relative; }
    .bot-card.online { border-right-color: #28a745; }
    .top-row { display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 10px;}
    .status-on { color: #28a745; font-weight: bold; background: #d4edda; padding: 5px 10px; border-radius: 10px; }
    .status-off { color: #dc3545; font-weight: bold; background: #f8d7da; padding: 5px 10px; border-radius: 10px; }
    .btn { padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; margin: 2px; transition: 0.2s; text-decoration: none; display: inline-block; }
    .btn-start { background: #28a745; color: white; }
    .btn-stop { background: #ffc107; color: #222; }
    .btn-del { background: #dc3545; color: white; }
    .btn-refresh { background: #17a2b8; color: white; margin-bottom: 20px; font-size: 1.1em; padding: 12px 25px;}
    .btn-verify { background: #e74c3c; color: white; animation: blink 1s infinite; width: 100%; display: block; margin-top: 10px; text-align: center; font-size: 1.1em; }
    .error-box { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 10px; margin-top: 10px; font-weight: bold; border: 1px solid #f5c6cb; text-align: center; }
    @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
    input { padding: 12px; border: 1px solid #ddd; border-radius: 10px; margin: 5px; width: 100%; max-width: 180px; }
    .xyz { background: #2c3e50; color: #34e7e4; padding: 10px; border-radius: 10px; font-family: 'Courier New', monospace; font-weight: bold; text-align: left; direction: ltr; margin: 0 15px; }
    .stats-box { background: #fff3cd; color: #856404; padding: 10px; border-radius: 10px; margin-top: 15px; font-weight: bold; display: flex; justify-content: space-around; border: 1px solid #ffeeba;}
</style></head><body><div class="container">${content}</div>
<script>
    function ctl(id, action) {
        fetch('/control', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id, action})
        }).then(() => setTimeout(() => location.reload(), 800));
    }
</script></body></html>`;

app.get('/', (req, res) => {
    let botList = Object.values(data.bots).map(b => {
        let statusText = b.connecting ? 'جاري الاتصال...' : (b.connected ? 'متصل ✅' : 'متوقف ❌');
        let verifyBtn = b.verifyLink ? `<a href="${b.verifyLink}" target="_blank" class="btn btn-verify" onclick="setTimeout(()=>location.reload(), 5000)">⚠️ السيرفر يطلب التحقق! اضغط هنا ⚠️</a>` : '';
        let errorBox = b.lastError ? `<div class="error-box">⚠️ ${b.lastError}</div>` : '';
        
        let healthVal = b.health !== undefined ? Math.round(b.health) : 20;
        let hungerVal = b.hunger !== undefined ? Math.round(b.hunger) : 20;

        return `
        <div class="bot-card ${b.connected ? 'online' : ''}">
            <div class="top-row">
                <div style="flex: 1;">
                    <strong>🤖 ${b.botName}</strong> <br>
                    <small style="color: #666;">${b.host}:${b.port}</small> <br><br>
                    <span class="${b.connected ? 'status-on' : 'status-off'}">${statusText}</span>
                </div>
                <div class="xyz">X: ${b.pos && b.pos.x ? b.pos.x.toFixed(1) : 0}<br>Y: ${b.pos && b.pos.y ? b.pos.y.toFixed(1) : 0}<br>Z: ${b.pos && b.pos.z ? b.pos.z.toFixed(1) : 0}</div>
                <div>
                    <button class="btn btn-start" onclick="ctl('${b.id}', 'start')" ${b.connected || b.connecting ? 'disabled style="opacity:0.5"':''}>تشغيل</button>
                    <button class="btn btn-stop" onclick="ctl('${b.id}', 'stop')" ${!b.connected && !b.connecting ? 'disabled style="opacity:0.5"':''}>إيقاف</button>
                    <button class="btn btn-del" onclick="ctl('${b.id}', 'delete')">حذف</button>
                </div>
            </div>
            ${errorBox}
            ${verifyBtn}
            <div class="stats-box">
                <span>❤️ الهيل: ${healthVal} / 20</span>
                <span>🍗 الجوع: ${hungerVal} / 20</span>
            </div>
        </div>`
    }).join('');

    res.send(ui(`
        <h1 style="color: #2c3e50;">🚀 مدير بوتات كينجا برو</h1>
        
        <form action="/add" method="POST" style="background:#f1f2f6; padding:20px; border-radius:15px; margin-bottom:20px; display: flex; flex-wrap: wrap; justify-content: center;">
            <input name="botName" placeholder="اسم البوت" required>
            <input name="host" placeholder="IP السيرفر" required>
            <input name="port" placeholder="البورت" value="19132" required>
            <button class="btn btn-start">إضافة بوت</button>
        </form>
        
        <button class="btn btn-refresh" onclick="location.reload()">🔄 تحديث الإحداثيات والحالة</button>
        
        <div id="botList">${botList || '<p style="color: #999;">لا توجد بوتات مضافة حالياً</p>'}</div>
    `));
});

app.post('/add', (req, res) => {
    const id = Date.now().toString();
    data.bots[id] = { 
        id, botName: req.body.botName, host: req.body.host, port: parseInt(req.body.port), 
        pos: { x: 0, y: 0, z: 0 }, connected: false, connecting: false, shouldRun: false, retryCount: 0, verifyLink: null,
        health: 20, hunger: 20, lastError: null
    };
    saveDB(); res.redirect('/');
});

app.post('/control', (req, res) => {
    const { id, action } = req.body;
    const b = data.bots[id];
    if (!b) return res.sendStatus(404);

    if (action === 'start' && !b.shouldRun) {
        b.shouldRun = true;
        b.retryCount = 0;
        b.verifyLink = null;
        b.lastError = null; 
        connectBot(id);
    } else if (action === 'stop' || action === 'delete') {
        b.shouldRun = false;
        b.isRelogging = false;
        b.verifyLink = null;
        
        if (activeClients[id]) {
            try { activeClients[id].disconnect(); } catch(e) {}
            delete activeClients[id];
        }
        
        if (action === 'delete') {
            delete data.bots[id];
            saveDB();
        }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
