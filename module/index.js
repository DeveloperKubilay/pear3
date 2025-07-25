const ws = require('ws');
const { exec } = require("child_process");
const installer = require('./installer.js');
const fs = require('fs');
const path = require('path');

module.exports = async function (app) {
    /*const wss = new ws.Server({ port: app.port });
    
    wss.on('connection', (socket) => {
        console.log('WebSocket client connected');
        socket.on('message', (message) => {
            console.log('Received:', message);
        });
        socket.on('close', () => {
            console.log('WebSocket client disconnected');
        });
    });*/


    if (!app.browserPath) {
        if (!fs.existsSync(path.join(__dirname, 'chrome'))) await installer()
        const file = fs.readdirSync(path.join(__dirname, 'chrome'))[0]
        if (file == "chrome-win64") {
            app.browserPath = path.join(__dirname, 'chrome', file, 'chrome.exe')
        } else {
            app.browserPath = path.join(__dirname, 'chrome', file, 'chrome')
        }
    }

    const args = [
        // `--load-extension="${path.join(__dirname, 'extension')}"`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate",
        '--disable-translate',
        "--disable-infobars",
        "--disable-notifications",
        "--disable-popup-blocking",
        "--start-maximized",
        ...(app.args ? app.args : [])
    ]

    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'extension/settings.json'), 'utf-8') || '{}');
    if (app.cookies) {
        if (app.cookies.includes(".json"))
            app.cookies = JSON.parse(fs.readFileSync(app.cookies, 'utf-8'));
        else if (typeof app.cookies === 'string')
            app.cookies = JSON.parse(app.cookies);
        settings.cookies = app.cookies;
    }
    settings.port = app.port || 8172;

    fs.writeFileSync(path.join(__dirname, 'extension/settings.json'), JSON.stringify(settings, null, 2));

    if (app.userAgent)
        args.push(`--user-agent="${app.userAgent}"`);
    if (app.viewport) {
        if (typeof app.viewport === 'string') {
            const [width, height] = app.viewport.split('x').map(Number);
            args.push(`--window-size=${width},${height}`);
        }
        else if (typeof app.viewport === 'object') {
            const { width, height } = app.viewport;
            args.push(`--window-size=${width},${height}`);
        }
    }
    if (app.incognito) args.push('--incognito');
    if (app.headless) args.push('--headless');
    if (app.disableGpu) args.push('--disable-gpu');
    if (app.nosandbox) args.push('--no-sandbox');
    if (app.proxy) args.push(`--proxy-server=${app.proxy}`);
    if (app.profileDir) {
        if (!fs.existsSync(app.profileDir)) fs.mkdirSync(app.profileDir, { recursive: true });
        args.push(`--user-data-dir=${app.profileDir}`);
    }
    if (app.muteaudio) args.push('--mute-audio');


    args.push(path.join(__dirname, 'index.html'));
    const child = exec(`"${app.browserPath}" ${args.join(' ')}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing browser: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Browser stderr: ${stderr}`);
            return;
        }
    });

    // PID kodunu almak için:
    app.browserPid = child.pid;
    console.log(`Launched browser with PID: ${child.pid}`);

    console.log(app)



    return [{}, {}]


}