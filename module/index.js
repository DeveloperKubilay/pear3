const ws = require('ws');
const { exec } = require("child_process");
const installer = require('./installer.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

module.exports = async function (app) {

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
        `--load-extension="${path.join(__dirname, 'extension')}"`,
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

    args.push("http://localhost:8191");

    const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    const SettingsJson = fs.readFileSync(path.join(__dirname, 'extension/settings.json'), 'utf-8');
    const server = http.createServer((req, res) => {
        if (req.url === "/") {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexHtml);
        } else if (req.url === "/settings.json") {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(SettingsJson);
        }
    });

    const wss = new ws.Server({ server });
    var firstConnection;
    var connections = {}

    wss.on('connection', (socket) => {
        if (!firstConnection) {
            console.log('\x1b[32m%s\x1b[0m', 'PearSystem started');
            firstConnection = socket;
        }
        socket.on('message', (message) => {
            if (globalThis.___PearDebug) console.log('Received message:', Buffer(message).toString());
            const data = JSON.parse(message);
            if (data.action === false) return;
            if (data.action === 'init') {
                connections[data.newid] = socket;
            }
            AsyncPromieses[data?.id]?.resolve(data);
            delete AsyncPromieses[data?.id];
        });
    });

    server.listen(8191, () => {
        console.log('\x1b[33m%s\x1b[0m', `Starting PearSystem`);
    });

    exec(`"${app.browserPath}" ${args.join(' ')}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing browser: ${error.message}`);
            return;
        }
        if (stderr) {
            wss.close();
            server.close();
            return;
        }
    });
    app.webserver = server;
    app.wss = wss;

    let id = 0;
    const AsyncPromieses = {};
    async function asyncSystem(session, command, options = {}) {
        if (!command) command = session, session = null;
        return new Promise((resolve, reject) => {
            if (!options.goto) command.id = id++;
            else command.id = session;

            if (!session) firstConnection.send(JSON.stringify(command));
            else if (connections[session]) {
                command.session = session;
                connections[session].send(JSON.stringify(command));
            }
            AsyncPromieses[command.id] = { resolve, reject };
        })
    }

    app.newPage = async function () {
        const newTabData = (await asyncSystem({ action: 'newTab' }));
        const id = newTabData.newid;

        const createMethod = (type) => async (...args) => {
            const command = { type, ...args };
            let result;

            if (type === 'goto') {
                command.url = args[0];
                result = await asyncSystem(id, command, { goto: true });
            } else {
                result = await asyncSystem(id, command);
            }

            if (type == "screenshot" && result.screenshot) return Buffer.from(result.screenshot.split(',').pop(), 'base64');

            if (result[type] !== undefined) {
                return result[type];
            }

            return result;
        };

        return {
            id,
            goto: createMethod('goto'),
            url: createMethod('url'),
            click: createMethod('click'),
            screenshot: createMethod('screenshot'),
            content: createMethod('content'),
            close: createMethod('close'),
            reload: createMethod('reload'),
            type: createMethod('type'),
            directType: createMethod('directType'),
        }
    }
    app.newTab = app.newPage
    app.close = function () {
        wss.close();
        server.close();
    }

    await new Promise(resolve => {
        const interval = setInterval(() => {
            if (firstConnection) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
    });
    return app
}