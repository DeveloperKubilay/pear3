# 🍐 PearSystem

A Node.js-based automation framework that simplifies web automation, working with its own Chromium-based browser and extension.

## 🚀 Features
- Automatic Chromium installation and launch
- Fast communication via WebSocket
- Simulate keyboard and mouse events
- Wait for and interact with dynamic content
- File upload, screenshot capture, fetch content and URL
- Comprehensive API: `goto`, `click`, `type`, `scroll`, `waitForSelector`, `uploadFile`, `getAttribute`, `getText`, `screenshot`, and more

## 📦 Installation
```bash
npm install
```

## ⚡️ Usage
```js
const Pear = require('./module/index.js');

(async () => {
    const browser = await Pear({ headless: false });
    const page = await browser.newPage();
    await page.goto('http://localhost/test.html');
    await page.click('#inputField');
    await page.type('#inputField', 'Hello Pear!');
    await page.screenshot();
    browser.close();
})();
```

## 🧩 API
- `goto(url)` → Navigate to page
- `click(selector)` → Click element
- `type(selector, text)` → Type into element
- `scroll(selector, {x, y})` → Scroll on page
- `waitForSelector(selector, options)` → Wait for element
- `uploadFile(selector, filePath)` → Upload file
- `getAttribute(selector, attr)` → Get attribute
- `getText(selector)` → Get element text
- `screenshot()` → Take screenshot

## 🛠️ Developer Notes
- The `module/extension` folder contains the Chrome extension.
- Automation commands are sent via WebSocket.
- All operations are asynchronous and Promise-based.

## 👨‍💻 Contribution
You can open pull requests and issues. All feedback is welcome!

## 📄 License
MIT
