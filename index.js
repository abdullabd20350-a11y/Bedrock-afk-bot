const bedrock = require('bedrock-protocol');
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active bots
let activeBots = {};

// --- Dashboard HTML (LTR Design) ---
app.get('/', (req, res) => {
    let botList = Object.keys(activeBots).map(name => `
        <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 10px 0; border-radius: 10px; background: #fafafa; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong style="color: #1a73e8;">🤖 Name: ${name}</strong> 
                <span style="margin-left: 15px; color: #28a745; font-size: 0.9em;">● Active</span>
            </div>
            <button onclick="stopBot('${name}')" style="background: #dc3545; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 6px; font-weight: bold;">Stop Bot</button>
        </div>
    `).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Kinga Dash - MC Bot Control</title>
        </head>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; direction: ltr; padding: 20px; background: #f4f7f9; color: #333;">
            <div style="max-width: 900px; margin: auto;">
                <h1 style="text-align: center; color: #202124; margin-bottom: 30px;">🚀 Minecraft Bot Manager (Kinga Dash)</h1>
                
                <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin-bottom: 40px;">
                    <h3 style="margin-top: 0; border-bottom: 2px solid #f1f3f4; padding-bottom: 10px;">Add New Bot</h3>
                    <form action="/start" method="POST" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Server IP:</label>
                            <input type="text" name="host" required placeholder="example.aternos.me" style="width: 95%; padding: 12px; border: 1px solid #dadce0; border-radius: 8px; outline: none;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Port:</label>
                            <input type="number" name="port" required placeholder="12345" style="width: 95%; padding: 12px; border: 1px solid #dadce0; border-radius: 8px; outline: none;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Bot Username:</label>
                            <input type="text" name="username" required placeholder="Bot_Name" style="width: 95%; padding: 12px; border: 1px solid #dadce0; border-radius: 8px; outline: none;">
                        </div>
                        <div style="display: flex; align-items: flex-end;">
                            <button type="submit" style="width: 100%; background: #1a73e8; color: white; border: none; padding: 14px; cursor: pointer; border-radius: 8px; font-weight: bold; font-size: 1em; transition: 0.3s;">Launch Bot</button>
                        </div>
                    </form>
                </div>

                <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                    <h3 style="margin-top: 0; border-bottom: 2px solid #f1f3f4; padding-bottom: 10px;">Currently Active</h3>
                    <div id="botList" style="margin-top: 10px;">
                        ${botList || '<p style="text-align: center; color: #70757a; padding: 20px;">No bots connected. Add one above! ⚡</p>'}
                    </div>
                </div>
                
                <p style="text-align: center; margin-top: 30px; color: #70757a; font-size: 0.85em;">Kinga Dash v2.0 | Keep your servers alive 24/7</p>
            </div>

            <script>
                function stopBot(name) {
                    if(confirm('Are you sure you want to disconnect ' + name + '?')) {
                        fetch('/stop', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({username: name})
                        }).then(() => location.reload());
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// --- Bot Logic & Control ---

function startNewBot(host, port, username) {
    if (activeBots[username]) return;

    console.log(`📡 [${username}] Attempting to connect to ${host}:${port}...`);
    
    const client = bedrock.createClient({
        host: host,
        port: parseInt(port),
        username: username,
        offline: true
    });

    activeBots[username] = { client: client, interval: null };

    client.on('spawn', () => {
        console.log(`✅ [${username}] Spawned successfully!`);
        
        // Anti-AFK Logic (Random Move) every 3 minutes
        activeBots[username].interval = setInterval(() => {
            try {
                if (!client.startGameData) return;
                const moveX = (Math.random() - 0.5) * 2;
                const moveZ = (Math.random() - 0.5) * 2;
                
                client.queue('player_auth_input', {
                    pitch: 0, yaw: 0,
                    position: { 
                        x: client.startGameData.player_position.x + moveX, 
                        y: client.startGameData.player_position.y, 
                        z: client.startGameData.player_position.z + moveZ 
                    },
                    move_vector: { x: moveX, z: moveZ },
                    head_yaw: 0, input_data: { _value: 0n },
                    input_mode: 'mouse', play_mode: 'normal', tick: 0n,
                    delta: { x: moveX, y: 0, z: moveZ }
                });
                console.log(`🏃‍♂️ [${username}] Performed AFK-prevent movement.`);
            } catch (e) { console.log(`❌ Error moving [${username}]:`, e.message); }
        }, 180000);
    });

    client.on('disconnect', (p) => {
        console.log(`🔌 [${username}] Disconnected: ${p.reason}`);
        if (activeBots[username]) {
            setTimeout(() => startNewBot(host, port, username), 10000);
        }
    });

    client.on('error', (e) => console.log(`⚠️ [${username}] Error:`, e.message));
}

// --- API Endpoints ---

app.post('/start', (req, res) => {
    const { host, port, username } = req.body;
    startNewBot(host, port, username);
    res.redirect('/');
});

app.post('/stop', (req, res) => {
    const { username } = req.body;
    if (activeBots[username]) {
        clearInterval(activeBots[username].interval);
        activeBots[username].client.disconnect();
        delete activeBots[username];
        console.log(`🛑 Bot [${username}] stopped manually.`);
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kinga Dash active on port ${PORT}`));
