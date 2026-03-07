const bedrock = require('bedrock-protocol');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-secret-key',
    resave: false,
    saveUninitialized: true
}));

// بيانات وهمية للتخزين (في التطوير الحقيقي نستخدم MongoDB)
let users = []; 
let activeBots = {}; // { username: { client, interval, owner } }

// --- الأمان: التحقق من تسجيل الدخول ---
function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// --- واجهة تسجيل الدخول والتسجيل ---
app.get('/login', (req, res) => {
    res.send(`
        <body style="font-family: sans-serif; direction: ltr; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5;">
            <div style="background: white; padding: 40px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 350px;">
                <h2 style="text-align: center; color: #1a73e8;">Kinga Dash Login</h2>
                <form action="/auth" method="POST">
                    <input type="text" name="username" placeholder="Username" required style="width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px;">
                    <input type="password" name="password" placeholder="Password" required style="width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px;">
                    <button type="submit" style="width: 100%; background: #1a73e8; color: white; border: none; padding: 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">Login / Register</button>
                </form>
                <div style="margin-top: 20px; padding: 10px; background: #fff3cd; border: 1px solid #ffeeba; border-radius: 5px; color: #856404; font-size: 0.85em;">
                    <strong>⚠️ WARNING:</strong> There is no "Forgot Password" feature yet. Please write down your credentials. If you lose them, your account cannot be recovered!
                </div>
            </div>
        </body>
    `);
});

app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    let user = users.find(u => u.username === username);

    if (!user) {
        // تسجيل مستخدم جديد تلقائياً إذا لم يكن موجوداً
        user = { username, password };
        users.push(user);
    } else if (user.password !== password) {
        return res.send("Incorrect password! <a href='/login'>Try again</a>");
    }

    req.session.user = username;
    res.redirect('/');
});

// --- لوحة التحكم الرئيسية (بعد الدخول) ---
app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(activeBots).filter(name => activeBots[name].owner === req.session.user);
    let botList = myBots.map(name => `
        <div style="border: 1px solid #eee; padding: 15px; margin: 10px 0; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; background: #fafafa;">
            <strong>🤖 ${name}</strong>
            <button onclick="stopBot('${name}')" style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">Stop</button>
        </div>
    `).join('');

    res.send(`
        <body style="font-family: sans-serif; direction: ltr; padding: 20px; background: #f8f9fa;">
            <div style="max-width: 800px; margin: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>🚀 Welcome, ${req.session.user}</h2>
                    <a href="/logout" style="color: red; text-decoration: none;">Logout</a>
                </div>
                
                <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 30px;">
                    <h3>Add New Bot</h3>
                    <form action="/start" method="POST" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <input type="text" name="host" placeholder="Server IP" required style="padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        <input type="number" name="port" placeholder="Port" required style="padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        <input type="text" name="botName" placeholder="Bot Username" required style="padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        <button type="submit" style="background: #28a745; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">Launch Bot</button>
                    </form>
                </div>

                <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                    <h3>Your Active Bots:</h3>
                    ${botList || '<p style="color: #888;">No bots active. Start your first bot!</p>'}
                </div>
            </div>
            <script>
                function stopBot(name) {
                    fetch('/stop', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({username: name})
                    }).then(() => location.reload());
                }
            </script>
        </body>
    `);
});

// --- منطق تشغيل البوت ---
app.post('/start', checkAuth, (req, res) => {
    const { host, port, botName } = req.body;

    // تحذير إذا كان الاسم مأخوذاً
    if (activeBots[botName]) {
        return res.send(`⚠️ The name <b>${botName}</b> is already taken by another bot! <a href='/'>Go back</a>`);
    }

    console.log(`📡 User [${req.session.user}] is launching bot: ${botName}`);
    
    const client = bedrock.createClient({ host, port: parseInt(port), username: botName, offline: true });

    activeBots[botName] = { client, owner: req.session.user, interval: null };

    client.on('spawn', () => {
        activeBots[botName].interval = setInterval(() => {
            try {
                if (!client.startGameData) return;
                client.queue('player_auth_input', {
                    pitch: 0, yaw: 0, head_yaw: 0, input_mode: 'mouse', play_mode: 'normal', tick: 0n,
                    position: { x: client.startGameData.player_position.x + (Math.random()-0.5), y: client.startGameData.player_position.y, z: client.startGameData.player_position.z + (Math.random()-0.5) },
                    move_vector: { x: 0, z: 0 }, input_data: { _value: 0n }, delta: { x: 0, y: 0, z: 0 }
                });
            } catch (e) {}
        }, 180000);
    });

    client.on('disconnect', () => { if(activeBots[botName]) setTimeout(() => res.redirect('/'), 5000); });
    res.redirect('/');
});

app.post('/stop', checkAuth, (req, res) => {
    const { username } = req.body;
    if (activeBots[username] && activeBots[username].owner === req.session.user) {
        clearInterval(activeBots[username].interval);
        activeBots[username].client.disconnect();
        delete activeBots[username];
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kinga Dash Secure is live on port ${PORT}`));
