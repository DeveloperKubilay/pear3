const ws = require('ws');
const { exec } = require("child_process");
const installer = require('./installer.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

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
    } else
        app.cookies = [];
    settings.cookies = app.cookies;

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
    if (!app.profileDir) {
        app.profileDir = path.join(os.tmpdir(), 'chrome-profile-' + crypto.randomBytes(8).toString('hex'));
    }
    if (app.profileDir) {
        if (app.profileDir == true) return;
        if (!path.isAbsolute(app.profileDir)) {
            app.profileDir = path.join(process.cwd(), app.profileDir);
        }
        if (!fs.existsSync(app.profileDir)) fs.mkdirSync(app.profileDir, { recursive: true });
        args.push(`--user-data-dir="${app.profileDir}"`);
    }
    if (app.muteaudio) args.push('--mute-audio');

    app.fullEndpoint = `${app.endpoint || "http://localhost"}:${app.port || 8191}`;
    args.push(app.fullEndpoint);
    const file = fs.readFileSync(path.join(__dirname, 'extension/Template_content.js'), 'utf-8');
    fs.writeFileSync(path.join(__dirname, 'extension/index.js'), file.replace(/__PEARSYSTEM_ENDPOINT__/g, app.fullEndpoint));

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
            if (app.debug) console.log('\x1b[32m%s\x1b[0m', 'PearSystem started');
            firstConnection = socket;
        }
        socket.on('message', (message) => {
            if (globalThis.___PearDebug) console.log('Received message:', Buffer(message).toString());
            const data = JSON.parse(message);
            if (data.action === false) return;
            if (data.action === 'init') {
                if (data.newid !== undefined) connections[data.newid] = socket;
                if (data.id !== undefined) connections[data.id] = socket;
                if (data.session !== undefined) connections[data.session] = socket;
                clearNavigationPending(data.id);
                clearNavigationPending(data.newid);
            }
            AsyncPromieses[data?.id]?.resolve(data);
            delete AsyncPromieses[data?.id];
        });

        socket.on('close', () => {
            Object.keys(connections).forEach((key) => {
                if (connections[key] === socket) delete connections[key];
            });
        });
    });

    server.listen(app.port || 8191, () => {
        if (app.debug) console.log('\x1b[33m%s\x1b[0m', `Starting PearSystem`);
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
    const navigationPending = new Map();

    const toSessionKey = (value) => {
        if (value === null || value === undefined) return null;
        return String(value);
    };

    const markNavigationPending = (session) => {
        const key = toSessionKey(session);
        if (!key) return;
        navigationPending.set(key, Date.now());
    };

    const clearNavigationPending = (session) => {
        const key = toSessionKey(session);
        if (!key) return;
        navigationPending.delete(key);
    };

    const waitForNavigationSettled = async (session, timeout = 15000, interval = 50) => {
        const key = toSessionKey(session);
        if (!key) return;
        if (!navigationPending.has(key)) return;
        const start = Date.now();
        while (navigationPending.has(key)) {
            if (Date.now() - start > timeout) {
                throw new Error(`Navigation pending for session ${key} exceeded ${timeout}ms`);
            }
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    };

    async function asyncSystem(session, command, options = {}) {
        if (!command) command = session, session = null;
        const maxAttempts = options.maxAttempts ?? 3;
        const retryDelay = options.retryDelay ?? 100;
        const expectAck = options.expectAck !== false;
        const feedbackTimeout = expectAck ? (options.feedbackTimeout ?? 500) : null;
        const overallTimeout = options.overallTimeout ?? null;

        return new Promise((resolve, reject) => {
            if (!options.goto) command.id = id++;
            else command.id = session;

            let attempts = 0;
            let responded = false;
            let feedbackTimer;
            let overallTimer;

            const cleanup = () => {
                if (feedbackTimer) clearTimeout(feedbackTimer);
                if (overallTimer) clearTimeout(overallTimer);
                if (expectAck) delete AsyncPromieses[command.id];
            };

            const fail = (error) => {
                if (responded) return;
                responded = true;
                cleanup();
                reject(error);
            };

            const succeed = (value = { success: true }) => {
                if (responded) return;
                responded = true;
                cleanup();
                resolve(value);
            };

            const scheduleRetry = (reason) => {
                if (responded) return;
                if (reason === 'feedback' && !expectAck) return;
                if (attempts >= maxAttempts) {
                    fail(new Error(`Command ${command.id} failed after ${maxAttempts} attempts`));
                    return;
                }
                setTimeout(dispatch, retryDelay);
            };

            const armFeedbackTimer = () => {
                if (!expectAck || feedbackTimeout === null) return;
                if (feedbackTimer) clearTimeout(feedbackTimer);
                feedbackTimer = setTimeout(() => {
                    scheduleRetry('feedback');
                }, feedbackTimeout);
            };

            const attemptSend = (target) => {
                attempts += 1;
                try {
                    target.send(JSON.stringify(command));
                    if (expectAck) {
                        armFeedbackTimer();
                    } else {
                        succeed({ sent: true });
                    }
                } catch (error) {
                    scheduleRetry('connection');
                }
            };

            const dispatch = () => {
                if (responded) return;

                if (!session) {
                    if (!firstConnection) {
                        scheduleRetry('connection');
                        return;
                    }
                    attemptSend(firstConnection);
                    return;
                }

                const target = connections[session];
                if (!target) {
                    scheduleRetry('connection');
                    return;
                }

                command.session = session;
                attemptSend(target);
            };

            if (expectAck) {
                AsyncPromieses[command.id] = {
                    resolve: (value) => {
                        succeed(value);
                    },
                    reject: (error) => {
                        fail(error);
                    }
                };
            }

            dispatch();

            if (overallTimeout && !responded) {
                overallTimer = setTimeout(() => {
                    fail(new Error(`Command ${command.id} timed out after ${overallTimeout}ms`));
                }, overallTimeout);
            }
        });
    }

    // Generic method creator for standard operations
    const createMethod = (type) => (session) => async (...args) => {
        const command = { type };
        let result;
        const requiresNavigationReady = !['goto', 'reload', 'setTimeout'].includes(type);

        if (requiresNavigationReady) {
            await waitForNavigationSettled(session);
        }

        switch (type) {
            case 'goto':
                command.url = args[0];
                if (session !== null && session !== undefined) markNavigationPending(session);
                result = await asyncSystem(session, command, {
                    goto: true,
                    maxAttempts: 6,
                    retryDelay: 300,
                    expectAck: false,
                    overallTimeout: 20000
                });
                break;
            case 'setTimeout':
                result = new Promise((resolve) => setTimeout(resolve, args[0]));
                break;

            case 'click':
                command[0] = args[0]; // CSS selector for legacy click
                result = await asyncSystem(session, command);
                break;

            // Keyboard events
            case 'keypress':
            case 'keydown':
            case 'keyup':
                command.key = args[0];
                command.selector = args[1]; // optional selector
                command.options = args[2] || {}; // optional options
                result = await asyncSystem(session, command);
                break;

            // Mouse events
            case 'leftclick':
            case 'rightclick':
            case 'middleclick':
            case 'dblclick':
            case 'mousedown':
            case 'mouseup':
            case 'mousemove':
                command.selector = args[0]; // CSS selector
                command.options = args[1] || {}; // optional options (x, y, etc.)
                result = await asyncSystem(session, command);
                break;

            case 'scroll':
                command.selector = args[0]; // optional selector (if null, scrolls window)
                command.options = args[1] || {}; // { x, y }
                result = await asyncSystem(session, command);
                break;

            case 'reload':
                if (session !== null && session !== undefined) markNavigationPending(session);
                result = await asyncSystem(session, command, {
                    maxAttempts: 6,
                    retryDelay: 300,
                    expectAck: false,
                    overallTimeout: 20000
                });
                break;

            case 'type':
            case 'directType':
                command.selector = args[0]; // CSS selector
                command.text = args[1]; // Text to type
                result = await asyncSystem(session, command);
                break;

            case 'waitForSelector':
                command.selector = args[0]; // CSS selector
                const options = args[1] || {}; // Options object
                command.timeout = options.timeout !== undefined ? options.timeout : 30000;
                command.checkInterval = options.checkInterval || 100;
                result = await asyncSystem(session, command);
                break;

            case 'uploadFile':
                command.selector = args[0]; // File input selector
                command.filePath = args[1]; // File path to upload
                result = await asyncSystem(session, command);
                break;

            case 'getAttribute':
                command.selector = args[0]; // CSS selector
                command.attribute = args[1]; // Attribute name
                result = await asyncSystem(session, command);
                break;

            case 'querySelector':
                command.selector = args[0]; // CSS selector
                result = await asyncSystem(session, command);
                break;

            case 'getText':
                command.selector = args[0]; // CSS selector
                result = await asyncSystem(session, command);
                break;

            case 'shadowClick':
                command.selector = args[0];
                command.shadowSelector = args[1];
                result = await asyncSystem(session, command);
                break;

            case 'shadowQuerySelector':
                command.selector = args[0];
                command.shadowSelector = args[1];
                result = await asyncSystem(session, command);
                break;

            case 'shadowGetAttribute':
                command.selector = args[0];
                command.shadowSelector = args[1];
                command.attribute = args[2];
                result = await asyncSystem(session, command);
                break;

            case 'evaluate':
                command.func = args[0];
                command.args = args[1] || [];
                result = await asyncSystem(session, command);
                break;

            default:
                result = await asyncSystem(session, command);
                break;
        }

        if (type === 'setTimeout') {
            return result;
        }

        const payload = result ?? {};

        if (type === 'screenshot' && payload.screenshot) {
            return Buffer.from(payload.screenshot.split(',').pop(), 'base64');
        }

        if (type === 'content' && payload.content !== undefined) {
            return payload.content;
        }

        if (type === 'url' && payload.url !== undefined) {
            return payload.url;
        }

        if (payload[type] !== undefined) {
            return payload[type];
        }

        return payload;
    };

    app.newPage = async function () {
        const newTabData = await asyncSystem({ action: 'newTab' }, undefined, {
            maxAttempts: 1,
            retryDelay: 0,
            feedbackTimeout: 7000
        });
        const id = newTabData.newid;

        // Extension init'ini bekle
        const maxWait = 10000;
        const checkInterval = 50;
        const startTime = Date.now();
        
        while (!connections[id] && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        if (!connections[id]) {
            throw new Error(`Extension connection not established for tab ${id} within ${maxWait}ms`);
        }

        return {
            id,
            // Navigation
            goto: createMethod('goto')(id),
            url: createMethod('url')(id),
            reload: createMethod('reload')(id),
            close: createMethod('close')(id),

            // Content & Screenshots
            screenshot: createMethod('screenshot')(id),
            content: createMethod('content')(id),

            // Legacy click (maintained for compatibility)
            click: createMethod('click')(id),

            // Keyboard events
            keypress: createMethod('keypress')(id),
            keydown: createMethod('keydown')(id),
            keyup: createMethod('keyup')(id),

            // Mouse events
            leftclick: createMethod('leftclick')(id),
            rightclick: createMethod('rightclick')(id),
            middleclick: createMethod('middleclick')(id),
            dblclick: createMethod('dblclick')(id),
            mousedown: createMethod('mousedown')(id),
            mouseup: createMethod('mouseup')(id),
            mousemove: createMethod('mousemove')(id),

            // Scroll
            scroll: createMethod('scroll')(id),

            // Text input
            type: createMethod('type')(id),
            directType: createMethod('directType')(id),

            // Utility methods
            waitForSelector: createMethod('waitForSelector')(id),
            uploadFile: createMethod('uploadFile')(id),
            getAttribute: createMethod('getAttribute')(id),
            getText: createMethod('getText')(id),
            querySelector: createMethod('querySelector')(id),
            shadowClick: createMethod('shadowClick')(id),
            shadowQuerySelector: createMethod('shadowQuerySelector')(id),
            shadowGetAttribute: createMethod('shadowGetAttribute')(id),
            evaluate: createMethod('evaluate')(id),
            setTimeout: createMethod('setTimeout')(id),
        }
    }

    app.newTab = app.newPage
    app.setTimeout = (x) => new Promise((resolve) => setTimeout(resolve, x));
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