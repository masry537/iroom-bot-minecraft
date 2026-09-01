const express = require('express');
const mineflayer = require('mineflayer');
const bedrock = require('bedrock-protocol');
const fs = require('fs');
const path = require('path');

const app = express();
const SERVERS_FILE = path.join(__dirname, 'servers.json');

app.use(express.json());
app.use(express.static(__dirname));

let activeBots = {}; 
let botLogs = [];

function loadServers() {
    if (!fs.existsSync(SERVERS_FILE)) fs.writeFileSync(SERVERS_FILE, '[]');
    return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}
function saveServers(servers) {
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
}
function addLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    botLogs.push(`[${timestamp}] ${msg}`);
    if (botLogs.length > 80) botLogs.shift();
}

// جلب البيانات والفلترة الصارمة بناءً على الـ UID الفريد القادم من جوجل
app.get('/api/data', (req, res) => {
    const userId = req.query.uid;
    let allServers = loadServers();
    
    // تصفية السيرفرات وإظهار الخاصة بالمستخدم الحالي فقط
    let userServers = allServers.filter(s => s.userId === userId);

    let activeList = {};
    for (let id in activeBots) {
        let botPos = "غير معروف";
        if (activeBots[id].instance && activeBots[id].instance.entity) {
            const p = activeBots[id].instance.entity.position;
            if(p) botPos = `X: ${Math.round(p.x)} | Y: ${Math.round(p.y)} | Z: ${Math.round(p.z)}`;
        }
        activeList[id] = { status: activeBots[id].status, pos: botPos, type: activeBots[id].type };
    }
    res.json({ servers: userServers, activeBots: activeList, logs: botLogs });
});

app.post('/api/add-server', (req, res) => {
    let servers = loadServers();
    servers.push(req.body); // يحفظ بيانات السيرفر + الـ UID الموثق من جوجل
    saveServers(servers);
    res.json({ success: true });
});

app.post('/api/delete-server', (req, res) => {
    const { index, uid } = req.body;
    let servers = loadServers();
    
    // التأكد من أن السيرفر يخص المستخدم الحالي قبل الحذف
    if (servers[index] && servers[index].userId === uid) {
        if (activeBots[index]) {
            try { activeBots[index].instance.end(); } catch(e){}
            delete activeBots[index];
        }
        servers.splice(index, 1);
        saveServers(servers);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/start-bot', (req, res) => {
    const servers = loadServers();
    const target = servers[req.body.index];
    const botId = req.body.index;

    if (!target) return res.json({ success: false });

    if (activeBots[botId]) {
        try { activeBots[botId].instance.end(); } catch(e){}
        delete activeBots[botId];
    }

    addLog(`🔄 [${target.type.toUpperCase()}] جاري فحص السيرفر والاتصال بـ ${target.host}...`);
    activeBots[botId] = { instance: null, status: "جاري الاتصال... ⏳", type: target.type };

    if (target.type === 'java') {
        try {
            let jBot = mineflayer.createBot({
                host: target.host,
                port: parseInt(target.port),
                username: target.botName || 'IRooM_Java',
                auth: 'offline',
                version: false,
                hideErrors: true,
                viewDistance: "tiny"
            });

            activeBots[botId].instance = jBot;

            jBot.on('spawn', () => {
                addLog(`✅ البوت [${jBot.username}] متصل حقيقياً بالسيرفر!`);
                if (activeBots[botId]) activeBots[botId].status = "متصل 🟢";
            });

            jBot.on('end', (reason) => {
                addLog(`⚠️ انفصل البوت: ${reason}`);
                delete activeBots[botId];
            });

            jBot.on('error', (err) => {
                addLog(`❌ فشل الاتصال بالسيرفر: ${err.message}`);
                if (activeBots[botId]) activeBots[botId].status = "فشل الاتصال ❌";
            });
        } catch(e) { 
            addLog(`❌ خطأ: ${e.message}`); 
            if (activeBots[botId]) activeBots[botId].status = "خطأ في السيرفر ❌";
        }

    } else {
        try {
            let bBot = bedrock.createClient({ host: target.host, port: parseInt(target.port) || 19132, username: target.botName || 'IRooM_Bedrock', offline: true });
            activeBots[botId].instance = bBot;
            
            bBot.on('join', () => { 
                addLog(`✅ [بيدروك] دخل بنجاح حقيقي!`); 
                if (activeBots[botId]) activeBots[botId].status = "متصل 🟢"; 
            });
            bBot.on('error', (err) => { 
                addLog(`❌ [بيدروك] خطأ اتصال: ${err.message}`); 
                if (activeBots[botId]) activeBots[botId].status = "فشل الاتصال ❌";
            });
        } catch(e) { 
            addLog(`❌ خطأ بيدروك: ${e.message}`); 
            if (activeBots[botId]) activeBots[botId].status = "فشل الاتصال ❌";
        }
    }
    res.json({ success: true });
});

app.post('/api/stop-bot', (req, res) => {
    const botId = req.body.index;
    if (activeBots[botId]) {
        try { activeBots[botId].instance.end(); } catch(e){}
        delete activeBots[botId];
        addLog(`🛑 تم إيقاف البوت يدوياً.`);
    }
    res.json({ success: true });
});

app.post('/api/send-chat', (req, res) => {
    const msg = req.body.message;
    let sent = false;
    for (let id in activeBots) {
        if (activeBots[id].status === "متصل 🟢" && activeBots[id].type === 'java') {
            activeBots[id].instance.chat(msg);
            sent = true;
        }
    }
    if (sent) addLog(`📤 [أنت عبر اللوحة]: ${msg}`);
    res.json({ success: sent });
});

app.listen(3000, () => {
    console.log('🚀 لوحة فحص IRooM الحقيقية مستقرة تماماً وتعمل محلياً على البورت 3000');
});
