const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'kinga-pro-secret', resave: false, saveUninitialized: true }));

let users = []; 
let activeBots = {}; 

function checkAuth(req, res, next) { if (!req.session.user) return res.redirect('/login'); next(); }

// --- الواجهة الرسومية المحدثة ---
app.get('/', checkAuth, (req, res) => {
    let myBots = Object.keys(activeBots).filter(name => activeBots[name].owner === req.session.user);
    let botCards = myBots.map(name => {
        const bot = activeBots[name];
        return `
            <div style="border: 1px solid #ddd; padding: 20px; margin: 15px 0; border-radius: 12px; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between;">
                    <h3 style="margin:0;">🤖 ${name} <small style="color:#777;">(${bot.type})</small></h3>
                    <span style="color: ${bot.connected ? 'green' : 'red'}; font-weight: bold;">● ${bot.connected ? 'Running' : 'Stopped'}</span>
                </div>
                <hr style="border:0; border-top:1px solid #eee; margin:15px 0;">
                <div style="display: flex; gap: 10px;">
                    <button onclick="controlBot('${name}', 'start')" style="background:#28a745; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Start</button>
                    <button onclick="controlBot('${name}', 'stop')" style="background:#ffc107; color:black; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Stop</button>
                    <button onclick="controlBot('${name}', 'delete')" style="background:#dc3545; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Delete</button>
                    <button onclick="location.reload()" style="background:#6c757d; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Refresh Stats</button>
                </div>
            </div>`;
    }).join('');

    res.send(`
        <body style="font-family: sans-serif; direction: ltr; padding: 20px; background: #f4f7f6;">
            <div style="max-width: 800px; margin: auto;">
                <h2>🚀 Kinga Bot Manager Pro</h2>
                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px;">
                    <h3>Add New Bot</h3>
                    <form action="/add" method="POST">
                        <select name="type" id="type" onchange="toggleFields()" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px;">
                            <option value="bedrock">Bedrock Edition</option>
                            <option value="java">Java Edition</option>
                        </select>
                        <div id="fields" style="display: grid; gap: 10px;">
                            <input type="text" name="host" id="host" placeholder="Server IP" required style="padding:10px; border-radius:5px; border:1px solid #ddd;">
                            <input type="number" name="port" id="port" placeholder="Port (19132)" style="padding:10px; border-radius:5px; border:1px solid #ddd;">
                            <input type="text" name="botName" placeholder="Bot Username" required style="padding:10px; border-radius:5px; border:1px solid #ddd;">
                        </div>
                        <button type="submit" style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; margin-top:10px; border-radius:5px; font-weight:bold; cursor:pointer;">Save Bot</button>
                    </form>
                </div>
                <div>${botCards || '<p style="text-align:center; color:#999;">No saved bots.</p>'}</div>
            </div>
            <script>
                function toggleFields() {
                    const type = document.getElementById('type').value;
                    const port = document.getElementById('port');
                    const host = document.getElementById('host');
                    if(type === 'java') {
                        port.style.display = 'none';
                        host.placeholder = "Server IP:Port (e.g. play.example.com:25565)";
                    } else {
                        port.style.display = 'block';
                        host.placeholder = "Server IP";
                    }
                }
                function controlBot(name, action) {
                    fetch('/control', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name, action})
                    }).then(() => location.reload());
                }
            </script>
        </body>
    `);
});

// --- منطق التحكم ---
app.post('/add', checkAuth, (req, res) => {
    const { type, host, port, botName } = req.body;
    activeBots[botName] = { type, host, port, owner: req.session.user, connected: false, client: null };
    res.redirect('/');
});

app.post('/control', checkAuth, (req, res) => {
    const { name, action } = req.body;
    const bot = activeBots[name];
    if (!bot || bot.owner !== req.session.user) return res.sendStatus(403);

    if (action === 'start') {
        if (bot.connected) return res.sendStatus(200);
        if (bot.type === 'bedrock') {
            bot.client = bedrock.createClient({ host: bot.host, port: parseInt(bot.port), username: name, offline: true });
        } else {
            const [h, p] = bot.host.split(':');
            bot.client = mineflayer.createBot({ host: h, port: p ? parseInt(p) : 25565, username: name });
        }
        bot.connected = true;
    } else if (action === 'stop') {
        if (bot.client) {
            bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
            bot.connected = false;
        }
    } else if (action === 'delete') {
        if (bot.client) bot.type === 'bedrock' ? bot.client.disconnect() : bot.client.quit();
        delete activeBots[name];
    }
    res.sendStatus(200);
});

// (أضف أكواد /auth و /login و /logout كما في النسخة السابقة)
app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    let u = users.find(x => x.username === username);
    if(!u) { u = {username, password}; users.push(u); }
    else if(u.password !== password) return res.send("Wrong password!");
    req.session.user = username; res.redirect('/');
});
app.get('/login', (req, res) => { res.send('<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;"><form action="/auth" method="POST" style="padding:20px; border:1px solid #ddd; border-radius:10px;"><h2>Login</h2><input name="username" placeholder="User" required><br><br><input name="password" type="password" placeholder="Pass" required><br><br><button type="submit">Enter</button></form></body>'); });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Kinga Pro v4 running on port ${PORT}`));
