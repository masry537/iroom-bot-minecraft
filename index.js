const express = require('express');
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const bedrock = require('bedrock-protocol');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'servers.json');
let activeBots = {}; // لتخزين البوتات النشطة برمجياً

function readServers() {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) { return []; }
}

function writeServers(servers) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 2));
}

// 🌐 1. مسار جلب السيرفرات الخاصة بالمستخدم الحالي فقط!
app.get('/api/servers', (req, res) => {
    const currentUser = req.query.user || 'guest'; // معرفة من يطلب البيانات
    const allServers = readServers();
    // تصفية السيرفرات ليعود فقط ما يخص المستخدم الحالي
    const userServers = allServers.filter(s => s.owner === currentUser);
    res.json(userServers);
});

// 💾 2. مسار إضافة بوت جديد وربطه بالمستخدم الحالي
app.post('/api/servers', (req, res) => {
    const servers = readServers();
    const currentUser = req.body.user || 'guest';
    
    const newServer = {
        owner: currentUser, // 🔥 ربط البوت بمالكه الحقيقي
        name: req.body.name,
        port: parseInt(req.body.port) || 25565,
        ip: req.body.ip,
        type: req.body.type || 'Java',
        active: false
    };

    // التحقق من عدم تكرار الاسم لنفس المستخدم
    if (servers.some(s => s.name === newServer.name && s.owner === currentUser)) {
        return res.status(400).json({ error: "اسم البوت مسجل لديك مسبقاً!" });
    }

    servers.push(newServer);
    writeServers(servers);
    res.json({ success: true });
});

// ⚙️ 3. مسار تشغيل وإيقاف البوت الفعلي مع فحص الملكية
app.post('/api/toggle-bot', (req, res) => {
    const servers = readServers();
    const currentUser = req.body.user || 'guest';
    // البحث عن البوت الذي يخص هذا المستخدم تحديداً
    const botConfig = servers.find(s => s.name === req.body.name && s.owner === currentUser);
    
    if (!botConfig) return res.status(404).json({ error: "البot غير موجود في قائمتك الشخصية" });

    const botKey = `${currentUser}_${botConfig.name}`; // مفتاح فريد لكل مستخدم وبوت

    if (!botConfig.active) {
        try {
            if (botConfig.type === 'Java') {
                activeBots[botKey] = mineflayer.createBot({
                    host: botConfig.ip,
                    port: botConfig.port,
                    username: botConfig.name,
                    version: false,
                    auth: 'offline'
                });
            } else {
                activeBots[botKey] = bedrock.createClient({
                    host: botConfig.ip,
                    port: botConfig.port,
                    username: botConfig.name,
                    offline: true
                });
            }
            botConfig.active = true;
        } catch (e) {
            botConfig.active = false;
        }
    } else {
        if (activeBots[botKey]) {
            if (typeof activeBots[botKey].quit === 'function') activeBots[botKey].quit();
            delete activeBots[botKey];
        }
        botConfig.active = false;
    }

    writeServers(servers);
    res.json({ success: true, active: botConfig.active });
});

// ❌ 4. مسار حذف السيرفر للمستخدم الحالي
app.post('/api/delete-server', (req, res) => {
    let servers = readServers();
    const currentUser = req.body.user || 'guest';
    const name = req.body.name;
    const botKey = `${currentUser}_${name}`;

    if (activeBots[botKey]) {
        if (typeof activeBots[botKey].quit === 'function') activeBots[botKey].quit();
        delete activeBots[botKey];
    }

    servers = servers.filter(s => !(s.name === name && s.owner === currentUser));
    writeServers(servers);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`[IRooM Multi-User] نظام الحسابات المستقلة يعمل على http://localhost:${PORT}`);
});
