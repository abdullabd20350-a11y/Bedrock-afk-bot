const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسات (Sessions)
app.use(session({
    secret: 'kinga-super-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // جلسة لمدة يوم واحد
}));

// قاعدة بيانات وهمية للمستخدمين والبوتات (تصفر عند إعادة تشغيل Render)
let users = [];
let activeBots = {}; // { botName: { client, owner, type, interval, pos, gamemode, deathCount, startTime, connected } }

// --- وظائف الحماية (Authentication) ---
function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// --- تصميم الواجهة الرسومية (HTML & CSS) ---

// تصميم صفحة تسجيل الدخول/الإنشاء
app.get('/login', (req, res) => {
    res.send(`
        <html lang="ar" direction="rtl">
        <head>
            <meta charset="UTF-8">
            <title>تسجيل الدخول - Kinga Dash</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-box { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); width: 100%; max-width: 380px; text-align: center; }
                h2 { color: #1a73e8; margin-bottom: 30px; }
                input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
                button { width: 100%; background: #1a73e8; color: white; border: none; padding: 14px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.3s; margin-top: 15px; }
                button:hover { background: #1557b0; }
                .note { margin-top: 20px; color: #666; font-size: 0.9em; background: #fff3cd; padding: 10px; border-radius: 8px; border: 1px solid #ffeeba; }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h2>🚀 Kinga Bot Manager</h2>
                <form action="/auth" method="POST">
                    <input type="text" name="username" placeholder="اسم المستخدم" required>
                    <input type="password" name="password" placeholder="كلمة المرور" required>
                    <button type="submit">دخول / إنشاء حساب</button>
                </form>
                <div class="note">⚠️ الحسابات مؤقتة على الخطة المجانية. تأكد من حفظ بياناتك!</div>
            </div>
        </body>
        </html>
    `);
});

// تصميم لوحة التحكم الرئيسية (Dashboard)
app.get('/', checkAuth, (req, res) => {
    let myBotsNames = Object.keys(activeBots).filter(name => activeBots[name].owner === req.session.user);
    
    // توليد كروت البوتات المحدثة التي تحتوي على قائمة المعلومات الكاملة
    let botListHTML = myBotsNames.map(name => {
        const bot = activeBots[name];
        const uptime = bot.connected ? Math.floor((Date.now() - bot.startTime) / 1000 / 60) : 0; // بالدقائق
        return `
            <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 20px; border-left: 5px solid ${bot.connected ? '#28a745' : '#dc3545'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; color: #1a73e8;">🤖 ${name} <small style="color: #666; font-weight: normal; margin-right: 10px;">(${bot.type})</small></h3>
                    <span style="color: ${bot.connected ? '#28a745' : '#dc3545'}; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        <span style="height: 10px; width: 10px; background-color: ${bot.connected ? '#28a745' : '#dc3545'}; border-radius: 50%;"></span>
                        ${bot.connected ? 'متصل' : 'متوقف'}
                    </span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em; color: #444; background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                    <p style="margin: 0;"><strong>📍 الإحداثيات:</strong> X: ${bot.pos.x.toFixed(1)}, Y: ${bot.pos.y.toFixed(1)}, Z: ${bot.pos.z.toFixed(1)}</p>
                    <p style="margin: 0;"><strong>🎮 الجيم مود:</strong> ${bot.gamemode}</p>
                    <p style="margin: 0;"><strong>💀 الوفيات:</strong> ${bot.deathCount}</p>
                    <p style="margin: 0;"><strong>⏱️ وقت الاتصال:</strong> ${uptime} دقيقة</p>
                    <p style="margin: 0;"><strong>🌐 السيرفر:</strong> ${bot.host}</p>
                    <p style="margin: 0;"><strong>🔌 البورت:</strong> ${bot.port || 'مدمج'}</p>
                </div>

                <div style="display: flex; gap: 10px; border-top: 1px solid #eee; padding-top: 15px;">
                    <button onclick="controlBot('${name}', 'start')" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;" ${bot.connected ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>تشغيل</button>
                    <button onclick="controlBot('${name}', 'stop')" style="background: #ffc107; color: #212529; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;" ${!bot.connected ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>إيقاف</button>
                    <button onclick="controlBot('${name}', 'delete')" style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;">حذف</button>
                    <button onclick="location.reload()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;">🔄 تحديث البيانات</button>
                </div>
            </div>`;
    }).join('');

    res.send(`
        <html lang="ar" direction="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Kinga Bot Manager Pro</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f7f6; margin: 0; padding: 20px; color: #333; }
                .container { max-width: 950px; margin: auto; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
                .header h1 { margin: 0; color: #202124; }
                .logout-btn { color: #dc3545; text-decoration: none; font-weight: bold; font-size: 1.1em; }
                .add-bot-box { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 40px; }
                .add-bot-box h3 { margin-top: 0; margin-bottom: 20px; color: #202124; }
                .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                select, input { width: 100%; padding: 12px; border: 1px solid #dadce0; border-radius: 8px; font-size: 1em; outline: none; transition: border-color 0.2s; }
                select:focus, input:focus { border-color: #1a73e8; }
                .full-width { grid-column: span 2; }
                .save-btn { width: 100%; background: #1a73e8; color: white; border: none; padding: 14px; border-radius: 8px; font-weight: bold; font-size: 1.1em; cursor: pointer; transition: background 0.3s; grid-column: span 2; }
                .save-btn:hover { background: #1557b0; }
                .bots-list-title { margin-bottom: 20px; color: #202124; }
                @media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } .full-width, .save-btn { grid-column: span 1; } }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 Kinga Bot Manager Pro</h1>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span style="font-weight: bold; color: #1a73e8;">مرحباً، ${req.session.user}</span>
                        <a href="/logout" class="logout-btn">تسجيل الخروج</a>
                    </div>
                </div>

                <div class="add-bot-box">
                    <h3>إضافة بوت جديد</h3>
                    <form action="/add" method="POST">
                        <div class="form-grid">
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: bold;">نوع الإصدار:</label>
                                <select name="type" id="ver" onchange="u()" style="width: 100%;">
                                    <option value="bedrock">Bedrock Edition (PE/Win10)</option>
                                    <option value="java">Java Edition (PC)</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: bold;">اسم البوت (Username):</label>
                                <input type="text" name="botName" placeholder="مثال: Kinga_AFK" required>
                            </div>
                            <div class="full-width">
                                <label style="display: block; margin-bottom: 8px; font-weight: bold;">عنوان السيرفر (IP):</label>
                                <input type="text" name="host" id="ip_field" placeholder="مثال: play.host.com" required>
                            </div>
                            <div id="p_container" class="full-width">
                                <label style="display: block; margin-bottom: 8px; font-weight: bold;">البورت (Port):</label>
                                <input type="number" name="port" id="p_field" placeholder="مثال: 19132" required>
                            </div>
                            <button type="submit" class="save-btn">حفظ وإضافة البوت</button>
                        </div>
                    </form>
                </div>

                <h3 class="bots-list-title">قائمة البوتات النشطة:</h3>
                <div id="botContainer">
                    ${botListHTML || '<p style="text-align: center; color: #888; background: white; padding: 20px; border-radius: 15px;">لا توجد بوتات نشطة حالياً. أضف واحداً من الأعلى!</p>'}
                </div>
            </div>

            <script>
                // دالة تحديث الواجهة عند اختيار نوع السيرفر
                function u() {
                    const v = document.getElementById('ver').value;
                    const pC = document.getElementById('p_container');
                    const pF = document.getElementById('p_field');
                    const ipF = document.getElementById('ip_field');
                    
                    if (v === 'java') {
                        // في الجافا، نخفي البورت ونطلب كتابته مدمجاً في الآيبي
                        pC.style.display = 'none';
                        pF.required = false;
                        ipF.placeholder = "مثال: play.host.com:25565 (الآيبي مدمج مع البورت)";
                    } else {
                        // في البيدروك، نظهر البورت ونطلبه مفصلاً
                        pC.style.display = 'block';
                        pF.required = true;
                        pF.placeholder = "مثال: 19132";
                        ipF.placeholder = "مثال: play.host.com (الآيبي فقط)";
                    }
                }
                
                // دالة التحكم في البوت (تشغيل، إيقاف، حذف)
                function controlBot(n, a) {
                    if (a === 'delete' && !confirm('هل أنت متأكد من حذف البوت ' + n + '؟')) return;
                    
                    fetch('/control', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: n, action: a })
                    }).then(response => {
                        if (response.ok) {
                            // إعادة تحميل الصفحة لرؤية الحالة الجديدة
                            location.reload(); 
                        } else {
                            alert('حدث خطأ أثناء تنفيذ العملية.');
                        }
                    });
                }
                
                // تحديث الواجهة مرة واحدة عند تحميل الصفحة
                u();
            </script>
        </body>
        </html>
    `);
});

// --- منطق التحكم بالبوتات (Logic) ---

// 1. معالجة تسجيل الدخول / إنشاء الحساب
app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    let user = users.find(u => u.username === username);

    if (!user) {
        // إنشاء مستخدم جديد إذا لم يكن موجوداً
        user = { username, password };
        users.push(user);
        console.log(`👤 تم إنشاء حساب جديد: ${username}`);
    } else if (user.password !== password) {
        // كلمة مرور خاطئة
        return res.send("<body style='font-family:sans-serif; text-align:center; padding:50px;'><h2>⚠️ كلمة المرور خاطئة!</h2><a href='/login' style='background:#1a73e8; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;'>عودة لتسجيل الدخول</a></body>");
    }

    // تسجيل الدخول بنجاح
    req.session.user = username;
    res.redirect('/');
});

// 2. إضافة بوت جديد (حفظ الإعدادات فقط)
app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;

    // التحقق من تكرار اسم البوت
    if (activeBots[botName]) {
        return res.send("<body style='font-family:sans-serif; text-align:center; padding:50px;'><h2>⚠️ اسم البوت هذا مأخوذ مسبقاً!</h2><a href='/' style='background:#1a73e8; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;'>عودة للوحة التحكم</a></body>");
    }

    // إنشاء كائن بيانات البوت (حفظ مبدئي)
    activeBots[botName] = {
        host, port, type, owner: req.session.user,
        client: null, interval: null, startTime: null,
        connected: false, deathCount: 0, gamemode: 'Connecting...',
        pos: { x: 0, y: 0, z: 0 }
    };

    console.log(`📡 User [${req.session.user}] added bot: ${botName} (${type})`);
    res.redirect('/');
});

// 3. معالجة طلبات التحكم (Start, Stop, Delete)
app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = activeBots[name];

    // التأكد أن البوت موجود وأن المستخدم هو صاحبه
    if (!bot || bot.owner !== req.session.user) {
        return res.status(403).send("Unauthorized");
    }

    if (action === 'start') {
        if (bot.connected) return res.sendStatus(200); // متصل بالفعل
        
        console.log(`▶️ User [${req.session.user}] starting bot: ${name}`);
        
        if (bot.type === 'bedrock') {
            // --- Bedrock Protocol Bot ---
            const client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
            bot.client = client;
            
            client.on('spawn', () => {
                bot.connected = true; bot.startTime = Date.now(); bot.pos = { x: 0, y: 0, z: 0 };
                // مؤقت حركة الدلع وتحديث البيانات كل دقيقة
                bot.interval = setInterval(() => {
                    try {
                        if (!client.startGameData) return;
                        bot.pos = client.startGameData.player_position;
                        // حركة الدلع وتحديث الإحداثيات
                        client.queue('player_auth_input', { 
                            pitch: 0, yaw: 0, head_yaw: 0, position: { x: bot.pos.x + (Math.random()-0.5), y: bot.pos.y, z: bot.pos.z + (Math.random()-0.5) },
                            move_vector: { x: 0, z: 0 }, input_data: { _value: 0n }, tick: 0n, delta: { x: 0, y: 0, z: 0 }, input_mode: 'mouse', play_mode: 'normal'
                        });
                    } catch (e) {}
                }, 60000);
            });
            client.on('disconnect', () => { bot.connected = false; clearInterval(bot.interval); });
            
        } else {
            // --- Java Edition (Mineflayer) Bot ---
            const [h, p] = bot.host.split(':'); // فصل الآيبي عن البورت المدمج
            const javaPort = p ? parseInt(p) : 25565;
            
            const botJava = mineflayer.createBot({ host: h, port: javaPort, username: name });
            bot.client = botJava;
            
            botJava.on('spawn', () => {
                bot.connected = true; bot.startTime = Date.now(); bot.gamemode = botJava.game.gameMode;
                bot.pos = botJava.entity.position;
                // مؤقت حركة القفز وتحديث الإحداثيات كل دقيقة
                bot.interval = setInterval(() => {
                    if(!botJava.entity) return;
                    bot.pos = botJava.entity.position;
                    // قفزة الدلع
                    botJava.setControlState('jump', true); setTimeout(() => botJava.setControlState('jump', false), 500);
                }, 60000);
            });
            botJava.on('death', () => bot.deathCount++); // عداد الوفيات تلقائي للجافا
            botJava.on('end', () => { bot.connected = false; clearInterval(bot.interval); });
        }
        
    } else if (action === 'stop') {
        if (!bot.connected) return res.sendStatus(200); // متوقف بالفعل
        console.log(`⏹️ User [${req.session.user}] stopping bot: ${name}`);
        
        clearInterval(bot.interval);
        if (bot.client) {
            bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        }
        bot.connected = false;
        
    } else if (action === 'delete') {
        console.log(`🗑️ User [${req.session.user}] deleting bot: ${name}`);
        // إيقاف البوت أولاً
        clearInterval(bot.interval);
        if (bot.client && bot.connected) {
            bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        }
        // حذفه نهائياً من القائمة
        delete activeBots[name];
    }
    
    res.sendStatus(200);
});

// 4. تسجيل الخروج
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// تشغيل الخادم
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Kinga Bot Manager Pro v4.0 is Live!`);
    console.log(`🔗 Web Dashboard ready on port ${PORT}`);
    console.log(`==============================================\n`);
});
