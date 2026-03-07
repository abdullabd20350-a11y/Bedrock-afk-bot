const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');
const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'kinga-ultra-secret', resave: false, saveUninitialized: true }));

let users = []; 
let activeBots = {}; 

// --- حماية الصفحات ---
function checkAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

// --- واجهة تسجيل الدخول ---
app.get('/login', (req, res) => {
    res.send(`
        <body style="font-family: sans-serif; direction: ltr; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; margin: 0;">
            <div style="background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); width: 350px;">
                <h2 style="text-align: center; color: #1a73e8;">Kinga Dash v3.0</h2>
                <form action="/auth" method="POST">
                    <input type="text" name="username" placeholder="Username" required style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    <input type="password" name="password" placeholder="Password" required style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box;">
                    <button type="submit" style="width: 100%; background: #1a73e8; color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-weight: bold;">Login / Enter</button>
                </form>
            </div>
        </body>
    `);
});

// --- لوحة التحكم (Dashboard) ---
app.get('/', checkAuth, (req, res) => {
    let myBotsNames = Object.keys(activeBots).filter(name => activeBots[name].owner === req.session.user);
    
    // دالة توليد الكروت التي طلبتها مدمجة هنا
    let botListHTML = myBotsNames.map(name => {
        const bot = activeBots[name];
        const uptime = Math.floor((Date.now() - bot.startTime) / 1000 / 60);
        return `
            <div style="border: 2px solid #1a73e8; padding: 20px; margin: 15px 0; border-radius: 15px; background: white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #1a73e8;">🤖 ${name} <span style="font-size: 0.6em; color: #666;">(${bot.type})</span></h3>
                    <span style="color: ${bot.connected ? 'green' : 'red'}; font-weight: bold;">● ${bot.connected ? 'Online' : 'Offline'}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; font-size: 0.85em; color: #444;">
                    <p><strong>📍 Coordinates:</strong> X: ${bot.pos.x.toFixed(1)}, Y: ${bot.pos.y.toFixed(1)}, Z: ${bot.pos.z.toFixed(1)}</p>
                    <p><strong>🎮 GameMode:</strong> ${bot.gamemode}</p>
                    <p><strong>💀 Deaths:</strong> ${bot.deathCount}</p>
                    <p><strong>⏱️ Uptime:</strong> ${uptime} min</p>
                    <p><strong>🌐 Server:</strong> ${bot.host}</p>
                    <p><strong>🔌 Port:</strong> ${bot.port}</p>
                </div>
                <div style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; display: flex; gap: 10px;">
                    <button onclick="stopBot('${name}')" style="background: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-weight: bold;">Stop & Delete</button>
                    <button onclick="location.reload()" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer;">🔄 Refresh Stats</button>
                </div>
            </div>`;
    }).join('');

    res.send(`
        <body style="font-family: sans-serif; direction: ltr; padding: 20px; background: #f8f9fa; color: #333;">
            <div style="max-width: 900px; margin: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>🚀 Kinga Dashboard</h2>
                    <a href="/logout" style="color: red; font-weight: bold; text-decoration: none;">Logout</a>
                </div>

                <div style="background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 30px;">
                    <h3>Launch New Bot</h3>
                    <form action="/start" method="POST" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                        <select name="type" id="v" onchange="u()" style="padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                            <option value="bedrock">Bedrock</option>
                            <option value="java">Java</option>
                        </select>
                        <input type="text" name="host" placeholder="Server IP" required style="padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                        <input type="number" name="port" id="p" placeholder="Port" required style="padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                        <input type="text" name="botName" placeholder="Bot Username" required style="padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                        <button type="submit" style="grid-column: span 2; background: #28a745; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Launch Bot 🚀</button>
                    </form>
                </div>

                <div id="botContainer">${botListHTML || '<p style="text-align: center; color: #888;">No bots active. Start one!</p>'}</div>
            </div>
            <script>
                function u(){ const v=document.getElementById('v').value; const p=document.getElementById('p'); p.placeholder=v==='java'?'Port (Opt: 25565)':'Port (Req)'; p.required=v!=='java';}
                function stopBot(n){ if(confirm('Stop '+n+'?')) fetch('/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n})}).then(()=>location.reload());}
            </script>
        </body>
    `);
});

// --- منطق تشغيل البوتات ---

app.post('/start', checkAuth, (req, res) => {
    const { host, port, botName, type } = req.body;
    if (activeBots[botName]) return res.send("Name taken!");

    const bPort = port ? parseInt(port) : (type === 'java' ? 25565 : 19132);
    
    // إنشاء كائن بيانات البوت
    activeBots[botName] = {
        host, port: bPort, type, owner: req.session.user,
        pos: { x: 0, y: 0, z: 0 }, gamemode: 'Connecting...',
        deathCount: 0, startTime: Date.now(), connected: false, interval: null
    };

    if (type === 'bedrock') {
        const client = bedrock.createClient({ host, port: bPort, username: botName, offline: true });
        activeBots[botName].client = client;
        
        client.on('spawn', () => {
            activeBots[botName].connected = true;
            activeBots[botName].interval = setInterval(() => {
                if(!client.startGameData) return;
                activeBots[botName].pos = client.startGameData.player_position;
                // حركة الدلع
                client.queue('player_auth_input', { 
                    pitch: 0, yaw: 0, head_yaw: 0, position: { x: activeBots[botName].pos.x + (Math.random()-0.5), y: activeBots[botName].pos.y, z: activeBots[botName].pos.z + (Math.random()-0.5) },
                    move_vector: { x: 0, z: 0 }, input_data: { _value: 0n }, tick: 0n, delta: { x: 0, y: 0, z: 0 }, input_mode: 'mouse', play_mode: 'normal'
                });
            }, 60000);
        });
    } else {
        const bot = mineflayer.createBot({ host, port: bPort, username: botName });
        activeBots[botName].client = bot;

        bot.on('spawn', () => {
            activeBots[botName].connected = true;
            activeBots[botName].gamemode = bot.game.gameMode;
            activeBots[botName].interval = setInterval(() => {
                activeBots[botName].pos = bot.entity.position;
                bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500);
            }, 60000);
        });
        bot.on('death', () => activeBots[botName].deathCount++);
    }
    res.redirect('/');
});

app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    let u = users.find(x => x.username === username);
    if(!u) { u = {username, password}; users.push(u); }
    else if(u.password !== password) return res.send("Wrong pass!");
    req.session.user = username; res.redirect('/');
});

app.post('/stop', checkAuth, (req, res) => {
    const { username } = req.body;
    const b = activeBots[username];
    if (b && b.owner === req.session.user) {
        clearInterval(b.interval);
        b.type === 'bedrock' ? b.client.disconnect() : b.client.quit();
        delete activeBots[username];
    }
    res.sendStatus(200);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Kinga Dash v3 Live on ${PORT}`));
