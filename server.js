const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = new sqlite3.Database('./lunar_keys.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_code TEXT UNIQUE NOT NULL,
        expiry TEXT NOT NULL,
        days INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        hwid TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        activated_at DATETIME
    )`);
});

function generateKey() {
    const numbers = Math.floor(1000 + Math.random() * 9000);
    return `LUNAR-OFC-${numbers}`;
}

// API Routes
app.post('/generate_key.php', (req, res) => {
    const { days } = req.body;
    
    if (days !== 1 && days !== 2) {
        return res.json({ success: false, error: 'Only 1 or 2 days allowed' });
    }
    
    const key = generateKey();
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    const expiryStr = expiry.toISOString().slice(0, 19).replace('T', ' ');
    
    db.run(`INSERT INTO keys (key_code, expiry, days) VALUES (?, ?, ?)`, 
        [key, expiryStr, days], (err) => {
        if (err) {
            res.json({ success: false, error: err.message });
        } else {
            res.json({
                success: true,
                key: key,
                expiry: expiryStr,
                days: days
            });
        }
    });
});

app.post('/api.php', (req, res) => {
    const { action, key, hwid } = req.body;
    
    if (action === 'login') {
        if (!key || !hwid) {
            return res.json({ success: false, error: 'Missing parameters' });
        }
        
        db.get(`SELECT * FROM keys WHERE key_code = ?`, [key], (err, row) => {
            if (!row) {
                return res.json({ success: false, error: 'Key not found' });
            }
            
            const now = new Date();
            const expiry = new Date(row.expiry);
            
            if (expiry < now) {
                return res.json({ success: false, error: 'Key expired' });
            }
            
            if (row.used === 1) {
                if (row.hwid !== hwid) {
                    return res.json({ success: false, error: 'Key locked to another device' });
                }
            } else {
                db.run(`UPDATE keys SET used = 1, hwid = ?, activated_at = ? WHERE key_code = ?`, 
                    [hwid, new Date().toISOString().slice(0, 19).replace('T', ' '), key]);
            }
            
            const remainingDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            
            res.json({
                success: true,
                data: {
                    expiry: row.expiry,
                    remaining_days: remainingDays,
                    hwid: hwid
                }
            });
        });
    } else if (action === 'check') {
        db.get(`SELECT * FROM keys WHERE key_code = ?`, [key], (err, row) => {
            if (!row) {
                return res.json({ success: false, valid: false });
            }
            const now = new Date();
            const expiry = new Date(row.expiry);
            res.json({
                success: true,
                valid: (expiry >= now && row.used === 1)
            });
        });
    } else {
        res.json({ success: false, error: 'Invalid action' });
    }
});

// Serve the HTML page
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LUNAR OFC - Key Generator</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            min-height: 100vh;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a0a1a 50%, #0a0a0a 100%);
            font-family: 'Segoe UI', monospace;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at 50% 50%, rgba(255,51,153,0.1) 0%, transparent 70%);
            pointer-events: none;
        }

        .container {
            background: rgba(10, 10, 15, 0.9);
            backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 40px;
            width: 90%;
            max-width: 500px;
            border: 1px solid rgba(255,51,153,0.3);
            box-shadow: 0 0 50px rgba(255,51,153,0.1);
            animation: fadeIn 0.6s ease-out;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(-30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .logo {
            text-align: center;
            margin-bottom: 30px;
        }

        .logo h1 {
            font-size: 48px;
            font-weight: 800;
            background: linear-gradient(135deg, #fff 0%, #ff3399 50%, #ff6699 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            letter-spacing: 4px;
        }

        .logo p {
            color: rgba(255,255,255,0.6);
            font-size: 14px;
            margin-top: 8px;
        }

        .options {
            margin-bottom: 30px;
        }

        .option-group {
            background: rgba(0,0,0,0.4);
            border-radius: 16px;
            padding: 20px;
            border: 1px solid rgba(255,51,153,0.2);
        }

        .option-title {
            color: #ff3399;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .days-selector {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }

        .day-btn {
            background: rgba(20,20,30,0.8);
            border: 2px solid rgba(255,51,153,0.3);
            color: rgba(255,255,255,0.8);
            padding: 14px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s;
            text-align: center;
        }

        .day-btn:hover {
            background: rgba(255,51,153,0.2);
            border-color: #ff3399;
            transform: scale(1.02);
        }

        .day-btn.active {
            background: linear-gradient(135deg, #ff3399, #ff6699);
            border-color: #ff3399;
            color: white;
            box-shadow: 0 0 20px rgba(255,51,153,0.5);
        }

        .generate-btn {
            width: 100%;
            background: linear-gradient(135deg, #ff3399, #ff6699);
            border: none;
            color: white;
            padding: 16px;
            border-radius: 12px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 3px;
        }

        .generate-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(255,51,153,0.4);
        }

        .generate-btn:active {
            transform: translateY(0);
        }

        .result {
            background: rgba(0,0,0,0.6);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255,51,153,0.3);
            display: none;
        }

        .result.show {
            display: block;
            animation: slideDown 0.4s ease-out;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .result-label {
            color: #ff3399;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 8px;
        }

        .key-display {
            background: rgba(0,0,0,0.8);
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 16px;
            word-break: break-all;
            color: #ff6699;
            margin-bottom: 15px;
            border: 1px solid rgba(255,51,153,0.3);
            font-weight: bold;
            text-align: center;
        }

        .copy-btn {
            width: 100%;
            background: rgba(255,51,153,0.2);
            border: 2px solid #ff3399;
            color: #ff3399;
            padding: 10px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
        }

        .copy-btn:hover {
            background: #ff3399;
            color: white;
        }

        .info {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            color: rgba(255,255,255,0.4);
        }

        .status {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            color: #ff3399;
            border: 1px solid rgba(255,51,153,0.3);
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #fff;
            border-radius: 50%;
            border-top-color: #ff3399;
            animation: spin 0.6s linear infinite;
            margin-left: 10px;
            vertical-align: middle;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>LUNAR OFC</h1>
            <p>KEY GENERATOR SYSTEM</p>
        </div>

        <div class="options">
            <div class="option-group">
                <div class="option-title">⏱️ EXPIRATION TIME</div>
                <div class="days-selector">
                    <div class="day-btn" data-days="1">1 DAY</div>
                    <div class="day-btn" data-days="2">2 DAYS</div>
                </div>
            </div>
        </div>

        <button class="generate-btn" id="generateBtn">
            ✦ GENERATE KEY ✦
        </button>

        <div id="result" class="result">
            <div class="result-label">🔑 GENERATED KEY</div>
            <div class="key-display" id="keyDisplay"></div>
            <button class="copy-btn" onclick="copyKey()">📋 COPY TO CLIPBOARD</button>
            <div style="margin-top: 12px; font-size: 12px; color: #ff6699; text-align: center;" id="expiryInfo"></div>
        </div>

        <div class="info">
            ⚡ Each key is one-time use and HWID locked<br>
            📱 Keys work for single device only<br>
            🔗 @lunar_ofc
        </div>
    </div>
    <div class="status" id="status">🟢 SYSTEM READY</div>

    <script>
        let selectedDays = 1;
        let currentKey = null;

        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                selectedDays = parseInt(this.dataset.days);
            });
        });

        document.getElementById('generateBtn').addEventListener('click', async function() {
            const btn = this;
            const originalText = btn.innerHTML;
            btn.innerHTML = '✦ GENERATING ✦ <span class="loading"></span>';
            btn.disabled = true;
            
            updateStatus('🟡 GENERATING KEY...', '#ffaa00');
            
            try {
                const response = await fetch('/generate_key.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        days: selectedDays
                    })
                });
                
                const data = await response.json();
                
                if(data.success) {
                    currentKey = data.key;
                    document.getElementById('keyDisplay').innerHTML = '<span style="font-family: monospace; font-size: 18px; font-weight: bold;">' + data.key + '</span>';
                    document.getElementById('expiryInfo').innerHTML = '📅 Expires: ' + data.expiry + ' (' + data.days + ' day' + (data.days > 1 ? 's' : '') + ')';
                    document.getElementById('result').classList.add('show');
                    updateStatus('✅ KEY GENERATED SUCCESSFULLY', '#33ff66');
                    
                    setTimeout(() => {
                        updateStatus('🟢 SYSTEM READY', '#ff3399');
                    }, 3000);
                } else {
                    updateStatus('❌ ERROR: ' + data.error, '#ff3333');
                }
            } catch(error) {
                updateStatus('❌ NETWORK ERROR', '#ff3333');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });

        function copyKey() {
            if(currentKey) {
                navigator.clipboard.writeText(currentKey);
                updateStatus('📋 KEY COPIED TO CLIPBOARD', '#33ff66');
                setTimeout(() => {
                    updateStatus('🟢 SYSTEM READY', '#ff3399');
                }, 2000);
            }
        }

        function updateStatus(message, color) {
            const status = document.getElementById('status');
            status.innerHTML = message;
            status.style.borderColor = color;
            status.style.color = color;
        }

        document.querySelector('.day-btn[data-days="1"]').classList.add('active');
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`🌙 LUNAR OFC KEYGEN running on port ${PORT}`);
});