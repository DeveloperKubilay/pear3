const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const EventEmitter = require('events');

module.exports = async function (app) {
  // Parametre doğrulama yardımcı fonksiyonu
  function validateConfig(config, defaultValue, validator = () => true) {
    return validator(config) ? config : defaultValue;
  }

  if (typeof app !== "object" || app === null || Array.isArray(app)) app = {};

  app = {
    browserPath: validateConfig(
      app.browserPath,
      process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : "/usr/bin/google-chrome",
      (val) => typeof val === "string"
    ),

    profileDir: validateConfig(
      app.profileDir,
      undefined,
      (val) => typeof val === "string"
    ),

    args: validateConfig(app.args, [], (val) => Array.isArray(val)),
    debug: validateConfig(app.debug, false, (val) => typeof val === "boolean"),
    useragent: validateConfig(app.useragent, "", (val) => typeof val === "string"),
    viewport: validateConfig(app.viewport, {}, (val) => typeof val === "object"),
    port: validateConfig(app.port, 9876, (val) => typeof val === "number"),
    incognito: validateConfig(app.incognito, false, (val) => typeof val === "boolean"),
    autoclose: validateConfig(app.autoclose, false, (val) => typeof val === "boolean"),
    server: validateConfig(app.server, null, (val) => val !== undefined),
    proxy: validateConfig(app.proxy, "", (val) => typeof val === "string"),
    nosandbox: validateConfig(app.nosandbox, false, (val) => typeof val === "boolean"),
    muteaudio: validateConfig(app.muteaudio, false, (val) => typeof val === "boolean"),
    useChromium: validateConfig(app.useChromium, false, (val) => typeof val === "boolean"),
  };
  if (app.useChromium) {
    app.browserPath = process.platform === "win32" ? path.join(__dirname, "./chrome/chrome-win64/chrome.exe") :
      process.platform === "darwin" ? path.join(__dirname, "./chrome/chrome-macos/Chromium.app/Contents/MacOS/Chromium") :
        path.join(__dirname, "./chrome/chrome-linux64/chrome");
    if (!fs.existsSync(app.browserPath)) await require("./installer").installChrome();
  }

  if (app.profileDir && typeof app.profileDir === "string") {
    app.profileDir = path.join(process.cwd(), app.profileDir);
    if (!fs.existsSync(app.profileDir)) {
      try {
        fs.mkdirSync(app.profileDir, { recursive: true });
      } catch (err) {
        console.error(
          `❌ [Pear] Profile creation failed file writing error: ${err.message}`
        );
        return;
      }
    }
  }

  const extensionDir = path.join(__dirname, "pearext");

  if (!fs.existsSync(extensionDir)) {
    console.error(
      `❌ Pear's core files have been deleted. Use the command "npm i pear"`
    );
    return;
  }

  // update settings.json with the current port
  function loadAndUpdateSettings() {
    const settingsPath = path.join(extensionDir, "settings.json");
    let settings = {};

    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }

    settings.port = app.port;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  loadAndUpdateSettings();

  const chromeFlags = [
    `--load-extension="${extensionDir}"`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-translate",
    "--disable-infobars",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--start-maximized",
    "--enable-features=ExtensionsManifestV2",
  ];

  if (app.profileDir)
    chromeFlags.push(`--user-data-dir="${app.profileDir}"`);

  if (app.viewport.width && app.viewport.height)
    chromeFlags.push(`--window-size=${app.viewport.width},${app.viewport.height}`);

  if (app.useragent)
    chromeFlags.push(`--user-agent=${app.useragent}`);

  if (app.incognito)
    chromeFlags.push(`--incognito`);

  if (app.nosandbox)
    chromeFlags.push(`--no-sandbox`);

  if (app.muteaudio)
    chromeFlags.push(`--mute-audio`);

  if (app.proxy)
    chromeFlags.push(`--proxy-server=${app.proxy}`);


  chromeFlags.push(...app.args);

  // Tarayıcıyı başlat
  exec(`"${app.browserPath}" ${chromeFlags.join(" ")}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ [Pear] failed to launch browser: ${error}`);
      return;
    }
    if (app.debug) {
      if (stdout) console.log(`[Pear] stdout: ${stdout}`);
      if (stderr) console.error(`[Pear] stderr: ${stderr}`);
    }
  });

  async function sendmsg(x) {
    const message = JSON.stringify(x);
    if (wss.clients.size > 0) {
      await wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          await client.send(message);
        }
      });
    }
  }

  // Çıkış işlemlerini yönetmek için ortak fonksiyon
  async function handleExit(exitCode = 0) {
    await sendmsg({ exit: true });
    process.exit(exitCode);
  }

  // Süreç olayları için tek bir yönetim yaklaşımı
  process.on('exit', async () => await sendmsg({ exit: true }));
  process.on('SIGINT', async () => await handleExit(0));
  process.on('SIGTERM', async () => await handleExit(0));
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    await handleExit(1);
  });

  let wss;
  if (app.server) {
    wss = new WebSocket.Server({ server: app.server });
    if (app.debug) console.log(`[Pear] WebSocket server integrated with HTTP server`);
  } else {
    wss = new WebSocket.Server({ port: app.port });
    if (app.debug) console.log(`[Pear] WebSocket server started on port ${app.port}`);
  }
  var browserStarted = false;

  let browserReadyResolve = null;
  const browserReadyPromise = new Promise((resolve) => {
    if (browserStarted) {
      resolve(true);
    } else {
      browserReadyResolve = resolve;
    }
  });

  const out = new EventEmitter();

  wss.on("connection", (ws) => {
    ws.on("message", (message) => {
      if (app.debug) console.log(`📩 I got a msg: ${message}\n\n`);
      var parsedMessage = {};
      try {
        parsedMessage = JSON.parse(message);
      } catch (error) { return; }

      if (parsedMessage.connected) {
        browserStarted = true;
        if (app.debug) console.log("[Pear] ✅ Browser started and connected");
        // Notify any waiting promises that the browser has started
        if (browserReadyResolve) {
          browserReadyResolve(true);
          browserReadyResolve = null;
        }
      }

      //events
      if (parsedMessage.event == "tabcreated") {
        out.emit("tabcreated", parsedMessage.tab);
      }

      if (callbackmap.has(parsedMessage.session)) {
        const { resolve } = callbackmap.get(parsedMessage.session);
        callbackmap.delete(parsedMessage.session);
        resolve(parsedMessage);
      }
    });

    ws.on("close", () => {
      if (app.debug) console.log("[Pear]🔌 Connection lost");
      if (wss.clients.size === 0) {
        wss.close(() => {
          if (app.debug) console.log("[Pear] WebSocket server has been closed");
          if (app.autoclose) process.exit(0);
        });
      }
    });

    ws.on("error", (error) => {
      if (app.debug) console.error(`[Pear] ❌ WebSocket error: ${error.message}`);
    });
  });

  const callbackmap = new Map();

  function randomidgenerator() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  async function callbackmsg(x, y) {
    const session = randomidgenerator();
    x.session = session;
    const promise = new Promise((resolve, reject) => {
      callbackmap.set(session, { resolve, reject });
      setTimeout(() => {
        if (callbackmap.has(session)) {
          callbackmap.delete(session);
          reject(new Error("Operation timed out after 30 seconds"));
        }
      }, y?.timeout || 30 * 1000);
    });
    await sendmsg(x);
    return await promise;
  }

  await browserReadyPromise;

  // Tab işlemleri için genişletilebilir yapı oluştur
  function createTabMethods(tabId) {
    return {
      close: async () => await out.closeTab(tabId),
      exit: async () => await out.closeTab(tabId),
      evaluate: async (fn, ...args) => {
        if (typeof fn != "function") throw new Error("fn must be a function");
        const result = await callbackmsg({
          evaluate: true,
          code: fn.toString(),
          args: args,
          tab: tabId
        });
        if (result.error) throw new Error(result.error);
        return result.result;
      },
      type: async (selector, text) => {
        if (!text) {
          text = selector;
          selector = null;
        }

        if (selector && typeof selector !== "string") throw new Error("Selector must be a string");
        if (typeof text !== "string") throw new Error("Text must be a string");

        const result = await callbackmsg({
          type: true,
          selector,
          text,
          tab: tabId
        });

        if (result.error) throw new Error(result.error);
        return result.result;
      },
      focus: async (selector) => {
        if (typeof selector !== "string") throw new Error("Selector must be a string");

        const result = await callbackmsg({
          focus: true,
          selector,
          tab: tabId
        });

        if (result.error) throw new Error(result.error);
        return result.result;
      },
      keyboard: {
        press: async (key) => {
          if (typeof key !== "string") throw new Error("Key must be a string");

          const result = await callbackmsg({
            keyboard: true,
            action: 'press',
            key,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result;
        },
        down: async (key) => {
          if (typeof key !== "string") throw new Error("Key must be a string");

          const result = await callbackmsg({
            keyboard: true,
            action: 'down',
            key,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result;
        },
        up: async (key) => {
          if (typeof key !== "string") throw new Error("Key must be a string");

          const result = await callbackmsg({
            keyboard: true,
            action: 'up',
            key,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result;
        }
      },
      mouse: {
        wheel: async (x) => {
          if (typeof x != "object" || x === null || Array.isArray(x)) x = {};
          const deltaX = typeof x.deltaX === "number" ? x.deltaX : (typeof x.x === "number" ? x.x : 0);
          const deltaY = typeof x.deltaY === "number" ? x.deltaY : (typeof x.y === "number" ? x.y : 0);
          return await callbackmsg({
            mouse: true,
            wheel: true,
            deltaX,
            deltaY,
            tab: tabId
          });
        },
        click: async (x, y) => {
          if (typeof x !== "number" || typeof y !== "number")
            throw new Error("X and Y coordinates must be numbers");
          return await callbackmsg({
            mouse: true,
            click: true,
            x,
            y,
            tab: tabId
          });
        },
        move: async (x, y) => {
          if (typeof x !== "number" || typeof y !== "number")
            throw new Error("X and Y coordinates must be numbers");
          return await callbackmsg({
            mouse: true,
            move: true,
            x,
            y,
            tab: tabId
          });
        },
        down: async (options = {}) => {
          const button = options.button || 0; // 0=left, 1=middle, 2=right
          return await callbackmsg({
            mouse: true,
            down: true,
            button,
            tab: tabId
          });
        },
        up: async (options = {}) => {
          const button = options.button || 0; // 0=left, 1=middle, 2=right
          return await callbackmsg({
            mouse: true,
            up: true,
            button,
            tab: tabId
          });
        }
      },
      waitForSelector: async (selector, options = {}) => {
        if (typeof selector != "string") throw new Error("Selector must be a string");
        const timeout = options.timeout || 30000;
        const result = await callbackmsg({
          waitForSelector: true,
          selector,
          timeout,
          tab: tabId
        });
        if (result.error) throw new Error(result.error);
        return result.found;
      },
      setViewport: async (viewport) => {
        if (typeof viewport != "object" || viewport === null || Array.isArray(viewport)) throw new Error("Viewport must be an object");
        const width = typeof viewport.width === "number" ? viewport.width : 800;
        const height = typeof viewport.height === "number" ? viewport.height : 600;
        return await callbackmsg({
          setViewport: true,
          width,
          height,
          tab: tabId
        });
      },
      uploadFile: async (selector, filePaths) => {
        if (typeof selector !== "string") throw new Error("Selector must be a string");
        if (typeof filePaths === "string") filePaths = [filePaths];
        if (!Array.isArray(filePaths)) throw new Error("File paths must be a string or an array of strings");

        const fileData = filePaths.map(filePath => {
          const fileName = path.basename(filePath);
          const fileContent = fs.readFileSync(filePath, { encoding: 'base64' });
          const ext = path.extname(filePath).toLowerCase();

          const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          };
          const fileType = mimeTypes[ext] || 'application/octet-stream';

          return {
            name: fileName,
            content: fileContent,
            type: fileType
          };
        });

        const result = await callbackmsg({
          uploadFile: true,
          selector,
          fileData,
          tab: tabId
        });

        if (result.error) throw new Error(result.error);
        return result.result;
      },
      select: {
        selectByValue: async (selector, value) => {
          if (typeof selector !== "string") throw new Error("Selector must be a string");
          if (typeof value !== "string") throw new Error("Value must be a string");

          const result = await callbackmsg({
            select: true,
            action: 'selectByValue',
            selector,
            value,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result;
        },
        selectByText: async (selector, text) => {
          if (typeof selector !== "string") throw new Error("Selector must be a string");
          if (typeof text !== "string") throw new Error("Text must be a string");

          const result = await callbackmsg({
            select: true,
            action: 'selectByText',
            selector,
            text,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result;
        },
        selectByIndex: async (selector, index) => {
          if (typeof selector !== "string") throw new Error("Selector must be a string");
          if (typeof index !== "number") throw new Error("Index must be a number");

          const result = await callbackmsg({
            select: true,
            action: 'selectByIndex',
            selector,
            index,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result;
        },
        getOptions: async (selector) => {
          if (typeof selector !== "string") throw new Error("Selector must be a string");

          const result = await callbackmsg({
            select: true,
            action: 'getOptions',
            selector,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result.options;
        },
        getSelected: async (selector) => {
          if (typeof selector !== "string") throw new Error("Selector must be a string");

          const result = await callbackmsg({
            select: true,
            action: 'getSelected',
            selector,
            tab: tabId
          });

          if (result.error) throw new Error(result.error);
          return result.result.selected;
        }
      },
      getPageSource: async () => {
        const result = await callbackmsg({
          getPageSource: true,
          tab: tabId
        });
        if (result.error) throw new Error(result.error);
        return result.source;
      },
      click: async (selector, options = {}) => {
        if (typeof selector !== "string") throw new Error("Selector must be a string");
        const button = options.button || 0; // 0=left, 2=right, 1=middle, 3=back, 4=forward
        const result = await callbackmsg({
          click: true,
          selector,
          button,
          tab: tabId
        });
        if (result.error) throw new Error(result.error);
        return result.result;
      },
      dragAndDrop: async (sourceSelector, targetSelector) => {
        if (typeof sourceSelector !== "string" || typeof targetSelector !== "string")
          throw new Error("Source and target selectors must be strings");

        const result = await callbackmsg({
          dragAndDrop: true,
          sourceSelector,
          targetSelector,
          tab: tabId
        });

        if (result.error) throw new Error(result.error);
        return result.success;
      },

      dragAndDropFile: async (filePath, targetSelector) => {
        if (typeof filePath !== "string" || typeof targetSelector !== "string")
          throw new Error("File path and target selector must be strings");

        const fileName = path.basename(filePath);
        const fileContent = fs.readFileSync(filePath, { encoding: 'base64' });
        const ext = path.extname(filePath).toLowerCase();

        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.pdf': 'application/pdf',
        };
        const fileType = mimeTypes[ext] || 'application/octet-stream';

        const result = await callbackmsg({
          dragAndDrop: true,
          fileName,
          fileContent,
          fileType,
          targetSelector,
          tab: tabId
        });

        if (result.error) throw new Error(result.error);
        return result.success;
      },
      waitForTimeout: async (timeout) => {
        if (typeof timeout !== "number" || timeout < 0) throw new Error("Timeout must be a positive number");
        return new Promise(resolve => setTimeout(resolve, timeout));
      },
      screenshot: async (options = {}) => {
        const result = await callbackmsg({
          screenshot: true,
          options: {
            path: options.path,
            type: options.type || 'png',
            quality: options.quality || 100
          },
          tab: tabId
        });

        if (result.error) throw new Error(result.error);
        if (result.data && options.path) {
          const buffer = Buffer.from(result.data, 'base64');
          fs.writeFileSync(options.path, buffer);
          return true;
        }
        return result.data ? Buffer.from(result.data, 'base64') : null;
      },
      waitForNavigation: async (options = {}) => {
        const timeout = options.timeout || 30000;
        const result = await callbackmsg({
          waitForNavigation: true,
          tab: tabId,
          timeout
        });
        
        if (result.error) throw new Error(result.error);
        return result.success;
      },

    }
  }

  Object.assign(out, {
    exit: async () => await handleExit(0),
    setUserAgent: async (userAgent) => {
      return await callbackmsg({
        setUserAgent: userAgent,
      });
    },
    newPage: async (x, y = {}) => {
      const data = await callbackmsg({
        newPage: x || "newPage",
        dontwaitLoad: y.dontwaitLoad
      }, y);

      Object.assign(data.tab, createTabMethods(data.tab.id));
      return data.tab;
    },
    closeTab: async (x) => {
      if (typeof x != "number") throw new Error("Tab ID must be a number");
      return await callbackmsg({ closetab: x });
    },
    getCookies: async (domain) => {
      if (typeof domain !== "string") throw new Error("Domain must be a string");
      const response = await callbackmsg({ getcookie: domain });
      return response.cookies;
    },
    getAllCookies: async () => {
      const response = await callbackmsg({ getallcookie: true });
      return response.cookies;
    },
    setCookies: async (cookies) => {
      if (!Array.isArray(cookies)) throw new Error("Cookies parameter must be an array");
      const response = await callbackmsg({ setcookies: cookies });
      return response.cookies;
    }
  });
  out.close = out.exit;

  return out;
};
