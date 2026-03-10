const express = require('express');
const bedrock = require('bedrock-protocol');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ذاكرة لتخزين بيانات البوتات
let botsData = {};
let botClients = {};
let reconnectTimers = {};

// دالة لتشغيل البوت
function startBot(id) {
    const botInfo = botsData[id];
    if (!botInfo) return;

    // منع تشغيل نفس البوت أكثر من مرة في نفس الوقت
    if (botClients[id]) {
        botClients[id].disconnect();
    }

    try {
        botInfo.status = 'جاري الاتصال... (راجع الـ Logs في Render لتسجيل الدخول)';
        
        const client = bedrock.createClient({
            host: botInfo.host,
            port: botInfo.port,
            username: botInfo.username,
            offline: false // false تعني أنه سيدخل بحساب إكس بوكس أصلي لمنع الطرد
        });

        botClients[id] = client;
        botInfo.connectedAt = Date.now();

        // عند الدخول بنجاح
        client.on('join', () => {
            console.log(`Bot ${botInfo.username} joined ${botInfo.host}`);
            botInfo.status = 'متصل';
        });

        // التقاط الإحداثيات فور نزوله في الماب
        client.on('start_game', (packet) => {
            botInfo.coordinates = `X: ${Math.floor(packet.player_position.x)}, Y: ${Math.floor(packet.player_position.y)}, Z: ${Math.floor(packet.player_position.z)}`;
        });

        // تحديث الإحداثيات إذا تحرك
        client.on('move_player', (packet) => {
            if (packet.runtime_id === client.entityId) {
                botInfo.coordinates = `X: ${Math.floor(packet.position.x)}, Y: ${Math.floor(packet.position.y)}, Z: ${Math.floor(packet.position.z)}`;
            }
        });

        // التقاط رسالة الطرد إذا حدثت
        client.on('disconnect', (packet) => {
            console.log(`Bot ${botInfo.username} disconnected/kicked:`, packet);
            const reason = packet.message || packet.reason || 'مجهول';
            botInfo.status = `مفصول (السبب: ${reason})`;
            botInfo.coordinates = 'غير متوفر';
        });

        // عند إغلاق الاتصال
        client.on('close', () => {
            if (botInfo.status === 'متصل' || botInfo.status.includes('جاري')) {
                botInfo.status = 'غير متصل';
            }
        });

        // نظام الخروج والدخول التلقائي كل 20 دقيقة
        if (reconnectTimers[id]) clearInterval(reconnectTimers[id]);
        reconnectTimers[id] = setInterval(() => {
            console.log(`Auto-reconnecting bot ${botInfo.username}...`);
            botInfo.status = 'جاري إعادة الاتصال التلقائي...';
            client.disconnect();
            setTimeout(() => startBot(id), 5000); // ينتظر 5 ثواني ثم يدخل
        }, 20 * 60 * 1000);

    } catch (error) {
        console.error('Error starting bot:', error);
        botInfo.status = 'خطأ في الاتصال';
    }
}

// دالة لإيقاف البوت
function stopBot(id) {
    if (botClients[id]) {
        botClients[id].disconnect();
        delete botClients[id];
    }
    if (reconnectTimers[id]) {
        clearInterval(reconnectTimers[id]);
        delete reconnectTimers[id];
    }
    if (botsData[id]) {
        botsData[id].status = 'متوقف';
        botsData[id].coordinates = 'غير متوفر';
    }
}

// --- واجهات برمجة التطبيقات (API) للوحة التحكم ---

app.get('/api/bots', (req, res) => {
    const responseData = Object.keys(botsData).map(id => {
        const b = botsData[id];
        const uptime = b.connectedAt && b.status === 'متصل' ? Math.floor((Date.now() - b.connectedAt) / 60000) : 0;
        return { ...b, uptime: `${uptime} دقيقة` };
    });
    res.json(responseData);
});

app.post('/api/bots', (req, res) => {
    const { id, username, host, port } = req.body;
    const botId = id || Date.now().toString();
    
    if (!botsData[botId]) {
        botsData[botId] = {
            id: botId,
            username,
            host,
            port: parseInt(port) || 19132,
            status: 'مضاف (لم يعمل بعد)',
            coordinates: 'غير متوفر',
            connectedAt: null
        };
    }
    res.json({ success: true, bot: botsData[botId] });
});

app.post('/api/bots/:id/start', (req, res) => {
    startBot(req.params.id);
    res.json({ success: true });
});

app.post('/api/bots/:id/stop', (req, res) => {
    stopBot(req.params.id);
    res.json({ success: true });
});

// تشغيل خادم الموقع
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
