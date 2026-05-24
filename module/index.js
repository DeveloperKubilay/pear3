const ws = require('ws');
const { exec } = require("child_process");
const installer = require('./installer.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

function findBrowserPath(chromeDir) {
    if (!fs.existsSync(chromeDir)) return null;

    const executableName = os.platform() === 'win32' ? 'chrome.exe' : 'chrome';
    const stack = [chromeDir];

    while (stack.length) {
        const current = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (e) {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name === executableName) {
                return fullPath;
            }
        }
    }

    return null;
}

module.exports = async function (app) {

    if (!app.browserPath) {
        const chromeDir = path.join(__dirname, 'chrome');
        app.browserPath = findBrowserPath(chromeDir);

        if (!app.browserPath) {
            await installer({ installlog: app.installlog });
            app.browserPath = findBrowserPath(chromeDir);
        }

        if (!app.browserPath) {
            throw new Error(`Chrome executable not found under ${chromeDir}`);
        }
    }

    const args = [
        `--load-extension="${path.join(__dirname, 'extension')}"`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate,LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets,LocalNetworkAccessChecksWebTransport,LocalNetworkAccessChecksWebRTC",
        '--disable-translate',
        "--disable-infobars",
        "--disable-notifications",
        "--disable-popup-blocking",
        "--disable-session-crashed-bubble",
        "--password-store=basic",
        ...(app.restoreSession ? [] : ["--disable-restore-session-state"]),
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

        if (!app.restoreSession) {
            const defaultDir = path.join(app.profileDir, 'Default');
            if (fs.existsSync(defaultDir)) {
                const sessionFiles = ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs'];
                for (const sf of sessionFiles) {
                    const fp = path.join(defaultDir, sf);
                    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) {}
                }
                const sessionsDir = path.join(defaultDir, 'Sessions');
                try { if (fs.existsSync(sessionsDir)) fs.rmSync(sessionsDir, { recursive: true, force: true }); } catch (e) {}

                const prefsPath = path.join(defaultDir, 'Preferences');
                try {
                    if (fs.existsSync(prefsPath)) {
                        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
                        if (!prefs.session) prefs.session = {};
                        prefs.session.restore_on_startup = 5;
                        fs.writeFileSync(prefsPath, JSON.stringify(prefs));
                    }
                } catch (e) {}
            }
        }
    }
    if (app.muteaudio) args.push('--mute-audio');

    app.fullEndpoint = `${app.endpoint || "http://localhost"}:${app.port || 8191}`;
    args.push(app.fullEndpoint);

    if (app.codes && Array.isArray(app.codes) && app.codes.length) {
        const manifestPath = path.join(__dirname, 'extension', 'manifest.json');
        let manifest = {};
        if (fs.existsSync(manifestPath)) {
            try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { manifest = {}; }
        }

        if (!manifest.content_scripts) manifest.content_scripts = [{ matches: ["<all_urls>"], js: ["index.js"], run_at: "document_end" }];
        let csEntry = manifest.content_scripts.find(cs => Array.isArray(cs.js) && cs.js.includes('index.js')) || manifest.content_scripts[0];
        if (!csEntry.js) csEntry.js = [];

        for (const codeRel of app.codes) {
            if (!codeRel) continue;
            let source = codeRel;
            if (!path.isAbsolute(source)) source = path.join(process.cwd(), source);
            if (!fs.existsSync(source)) {
                const alt = path.join(__dirname, codeRel);
                if (fs.existsSync(alt)) source = alt;
            }
            if (!fs.existsSync(source)) {
                if (app.debug) console.warn('Pear: code file not found, skipping', codeRel);
                continue;
            }

            const destName = path.basename(source);
            const destPath = path.join(__dirname, 'extension', destName);
            try { fs.copyFileSync(source, destPath); } catch (e) { if (app.debug) console.error('Pear: copy code failed', e); }

            if (!csEntry.js.includes(destName)) csEntry.js.push(destName);
        }

        try { fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); } catch (e) { if (app.debug) console.error('Pear: write manifest failed', e); }
    }

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
        if (!firstConnection || firstConnection.readyState !== 1) {
            if (app.debug) console.log('\x1b[32m%s\x1b[0m', 'PearSystem started');
            firstConnection = socket;
        }
        socket.on('message', (message) => {
            if (globalThis.___PearDebug) console.log('Received message:', Buffer(message).toString());
            const data = JSON.parse(message);
            if (data.action === false) return;

            if (data.action === 'customEvent') {
                console.log('\x1b[36m%s\x1b[0m', `📥 Custom Event: ${data.eventName}`, data.data);

                if (app._eventListeners && app._eventListeners[data.eventName]) {
                    app._eventListeners[data.eventName].forEach(callback => {
                        try {
                            callback(data.data, data.id);
                        } catch (e) {
                            if (app.debug) console.error('Event listener error:', e);
                        }
                    });
                }

                if (app._eventListeners && app._eventListeners['*']) {
                    app._eventListeners['*'].forEach(callback => {
                        try {
                            callback(data.eventName, data.data, data.id);
                        } catch (e) {
                            if (app.debug) console.error('Wildcard listener error:', e);
                        }
                    });
                }
                return;
            }

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

            if (firstConnection === socket) {
                firstConnection = null;
                for (const client of wss.clients) {
                    if (client.readyState === 1) {
                        firstConnection = client;
                        break;
                    }
                }
            }
        });
    });

    server.listen(app.port || 8191, () => {
        if (app.debug) console.log('\x1b[33m%s\x1b[0m', `Starting PearSystem`);
    });

    let browserClosing = false;
    const browserProcess = exec(`"${app.browserPath}" ${args.join(' ')}`, (error, stdout, stderr) => {
        if (browserClosing) return;
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

    const createMethod = (type) => (session) => async (...args) => {
        const command = { type };
        let result;
        const requiresNavigationReady = !['goto', 'reload', 'setTimeout', 'close'].includes(type);

        if (requiresNavigationReady) {
            await waitForNavigationSettled(session);
        }

        switch (type) {
            case 'close':
                result = await asyncSystem(session, command, {
                    expectAck: false,
                    maxAttempts: 1
                });
                await new Promise(resolve => setTimeout(resolve, 300));
                break;

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
                result = await asyncSystem(session, command, {
                    // waitForSelector is intentionally long-running.
                    feedbackTimeout: Math.max(command.timeout + 1000, 5000),
                    overallTimeout: Math.max(command.timeout + 2000, 7000),
                    maxAttempts: 1
                });
                break;

            case 'screenshot':
                result = await asyncSystem(session, command, {
                    // html2canvas on heavy pages can take multiple seconds.
                    feedbackTimeout: 30000,
                    overallTimeout: 35000,
                    maxAttempts: 1
                });
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

    let _newPageQueue = Promise.resolve();

    app.newPage = function () {
        const pagePromise = _newPageQueue.then(async () => {
            const connWaitStart = Date.now();
            const connWaitTimeout = 15000;
            while ((!firstConnection || firstConnection.readyState !== 1) && (Date.now() - connWaitStart) < connWaitTimeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!firstConnection || firstConnection.readyState !== 1) {
                throw new Error('No active browser connection available to open new tab');
            }

            const newTabData = await asyncSystem({ action: 'newTab' }, undefined, {
                maxAttempts: 20,
                retryDelay: 500,
                feedbackTimeout: 10000,
                overallTimeout: 45000
            });

            if (newTabData.success === false) {
                throw new Error(newTabData.error || 'Could not create new tab');
            }

            const id = newTabData.newid ?? newTabData.id;
            if (id === undefined || id === null) {
                throw new Error('New tab did not return a session id');
            }

            const maxWait = 30000;
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
                goto: createMethod('goto')(id),
                url: createMethod('url')(id),
                reload: createMethod('reload')(id),
                close: createMethod('close')(id),
                screenshot: createMethod('screenshot')(id),
                content: createMethod('content')(id),
                keypress: createMethod('keypress')(id),
                keydown: createMethod('keydown')(id),
                keyup: createMethod('keyup')(id),
                click: createMethod('leftclick')(id),
                leftclick: createMethod('leftclick')(id),
                rightclick: createMethod('rightclick')(id),
                middleclick: createMethod('middleclick')(id),
                dblclick: createMethod('dblclick')(id),
                mousedown: createMethod('mousedown')(id),
                mouseup: createMethod('mouseup')(id),
                mousemove: createMethod('mousemove')(id),
                scroll: createMethod('scroll')(id),
                type: createMethod('type')(id),
                directType: createMethod('directType')(id),
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
        });

        _newPageQueue = pagePromise.catch(() => {});
        return pagePromise;
    }

    app.getPage = function (id) {
        return {
            id,
            goto: createMethod('goto')(id),
            url: createMethod('url')(id),
            reload: createMethod('reload')(id),
            close: createMethod('close')(id),
            screenshot: createMethod('screenshot')(id),
            content: createMethod('content')(id),
            keypress: createMethod('keypress')(id),
            keydown: createMethod('keydown')(id),
            keyup: createMethod('keyup')(id),
            click: createMethod('leftclick')(id),
            leftclick: createMethod('leftclick')(id),
            rightclick: createMethod('rightclick')(id),
            middleclick: createMethod('middleclick')(id),
            dblclick: createMethod('dblclick')(id),
            mousedown: createMethod('mousedown')(id),
            mouseup: createMethod('mouseup')(id),
            mousemove: createMethod('mousemove')(id),
            scroll: createMethod('scroll')(id),
            type: createMethod('type')(id),
            directType: createMethod('directType')(id),
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
        };
    }

    app.newTab = app.newPage
    app.setTimeout = (x) => new Promise((resolve) => setTimeout(resolve, x));

    app._eventListeners = {};

    app.on = function(eventName, callback) {
        if (!app._eventListeners[eventName]) {
            app._eventListeners[eventName] = [];
        }
        app._eventListeners[eventName].push(callback);
        return app;
    }

    app.off = function(eventName, callback) {
        if (!app._eventListeners[eventName]) return app;
        if (!callback) {
            delete app._eventListeners[eventName];
        } else {
            app._eventListeners[eventName] = app._eventListeners[eventName].filter(cb => cb !== callback);
        }
        return app;
    }

    app.once = function(eventName, callback) {
        const wrapper = (...args) => {
            callback(...args);
            app.off(eventName, wrapper);
        };
        return app.on(eventName, wrapper);
    }

    app.close = function () {
        return new Promise((resolve) => {
            browserClosing = true;
            for (const client of wss.clients) {
                try { client.close(); } catch (e) {}
            }
            try { wss.close(); } catch (e) {}
            try { server.close(); } catch (e) {}
            if (browserProcess && browserProcess.pid) {
                try {
                    if (os.platform() === 'win32') {
                        exec(`taskkill /pid ${browserProcess.pid} /T /F`, () => { resolve(); });
                        return;
                    } else {
                        process.kill(-browserProcess.pid);
                        resolve();
                        return;
                    }
                } catch (e) { resolve(); return; }
            }
            resolve();
        });
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
