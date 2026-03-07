const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kinga-super-secret',
    resave: false,
    saveUninitialized: true
}));

// قاعدة بيانات وهمية (تُمسح عند إعادة تشغيل السيرفر في Render)
let users = []; 
let activeBots = {}; // { botName: { client, owner, type, interval } }

// حماية المسارات
function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// --- صفحات الواجهة ---

app.get('/login', (req, res) => {
    res.send(`
        <body style="font-family: 'Segoe UI', sans-serif; direction: ltr; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; margin: 0;">
            <div style="background: white; padding: 40px; border-radius: 15px; box-shadow: 0 8px 25px rgba(0,0,0,0.1); width: 360px;">
                <h2 style="text-align: center; color: #1a73e8; margin-bottom: 25px;">Kinga Manager Login</h2>
                <form action="/auth" method="POST">
                    <input type="text" name="username" placeholder="Username" required style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    <input type="password" name="password" placeholder="Password" required style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    <button type="submit" style="width: 100%; background: #1a73e8; color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 10px;">Login / Register</button>
                </form>
                <div style="margin-top: 20px; padding: 12px; background: #fff3cd; border: 1px solid #ffeeba; border-radius: 8px; color: #856404; font-size: 0.85em; line-height: 1.4;">
                    <strong>⚠️ IMPORTANT:</strong> Accounts are temporary on the free plan. Write down your credentials! No recovery available.
                </div>
            </div>
        </body>
    `);
});

app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(activeBots).filter(name => activeBots[name].owner === req.session.user);
    let botList = myBots.map(name => `
        <div style="border: 1px solid #eee; padding: 15px; margin: 10px 0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; background: #fff;">
            <div>
                <strong style="color: #1a73e8;">${name}</strong> 
                <span style="font-size: 0.8em; color: #666; margin-left: 10px;">[${activeBots[name].type}]</span>
            </div>
            <button onclick="stopBot('${name}')" style="background: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold;">Stop</button>
        </div>
    `).join('');

    res.send(`
        <body style="font-family: 'Segoe UI', sans-serif; direction: ltr; padding: 20px; background: #f8f9fa;">
            <div style="max-width: 850px; margin: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">🚀 Welcome, ${req.session.user}</h2>
                    <a href="/logout" style="color: #dc3545; text-decoration: none; font-weight: bold;">Logout</a>
                </div>

                <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 30px;">
                    <h3 style="margin-top: 0; color: #202124;">Add New Bot</h3>
                    <form action="/start" method="POST">
                        <div style="margin-bottom: 20px;">
                            <label style="font-weight: bold; display: block; margin-bottom: 8px;">Game Edition:</label>
                            <select name="type" id="ver" onchange="updateUI()" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ddd;">
                                <option value="bedrock">Bedrock Edition (PE/Win10)</option>
                                <option value="java">Java Edition (PC)</option>
                            </select>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <input type="text" name="host" placeholder="Server IP (e.g. play.host.com)" required style="padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                            <input type="number" name="port" id="p_field" placeholder="Port (e.g. 19132)" required style="padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                            <input type="text" name="botName" placeholder="Bot Name (e.g. Kinga_Bot)" required style="padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                            <button type="submit" style="background: #28a745; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 1em;">Launch Bot 🚀</button>
                        </div>
                    </form>
                </div>

                <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <h3 style="margin-top: 0;">Active Bots</h3>
                    ${botList || '<p style="color: #888; text-align: center;">No bots running. Launch one above!</p>'}
                </div>
            </div>

            <script>
                function updateUI() {
                    const v = document.getElementById('ver').value;
                    const p = document.getElementById('p_field');
                    if(v === 'java') {
                        p.placeholder = "Port (Optional: 25565)";
                        p.required = false;
                    } else {
                        p.placeholder = "Port (Required: 19132)";
                        p.required = true;
                    }
                }
                function stopBot(name) {
                    if(confirm('Stop ' + name + '?')) {
                        fetch('/stop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: name}) }).then(() => location.reload());
                    }
                }
            </script>
        </body>
    `);
});

// --- منطق التشغيل ---

app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    let user = users.find(u => u.username === username);
    if (!user) {
        user = { username, password };
        users.push(user);
    } else if (user.password !== password) {
        return res.send("Wrong password! <a href='/login'>Back</a>");
    }
    req.session.user = username;
    res.redirect('/');
});

app.post('/start', checkAuth, (req, res) => {
    const { host, port, botName, type } = req.body;

    if (activeBots[botName]) {
        return res.send(`⚠️ Name <b>${botName}</b> is taken! <a href='/'>Back</a>`);
    }

    const botPort = port ? parseInt(port) : (type === 'java' ? 25565 : 19132);

    if (type === 'bedrock') {
        // --- Bedrock Bot ---
        const client = bedrock.createClient({ host, port: botPort, username: botName, offline: true });
        activeBots[botName] = { client, type: 'Bedrock', owner: req.session.user, interval: null };

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
    } else {
        // --- Java Bot ---
        const bot = mineflayer.createBot({ host, port: botPort, username: botName });
        activeBots[botName] = { client: bot, type: 'Java', owner: req.session.user, interval: null };

        bot.on('spawn', () => {
            activeBots[botName].interval = setInterval(() => {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            }, 180000);
        });
    }

    res.redirect('/');
});

app.post('/stop', checkAuth, (req, res) => {
    const { username } = req.body;
    const bot = activeBots[username];
    if (bot && bot.owner === req.session.user) {
        clearInterval(bot.interval);
        bot.type === 'Bedrock' ? bot.client.disconnect() : bot.client.quit();
        delete activeBots[username];
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kinga Dash Multi-Version Live on port ${PORT}`));
