# 🍐 pear-browser Browser Automation

> Powerful browser automation for Node.js. Automate Chrome/Chromium with ease.  
> For comprehensive documentation and examples, visit [our official website](https://developerkubilay.github.io/Pear/).

pear-browser is a powerful Node.js library for browser automation that provides programmatic control over Chrome/Chromium. It's designed to be intuitive and flexible, allowing you to automate browser tasks with minimal configuration.

## Features

- 🚀 Fast and lightweight browser automation
- 🔄 Seamless Chrome/Chromium integration
- 📸 Screenshot capture capabilities
- 🖱️ Complete mouse and keyboard control
- 📄 Form manipulation and submission
- 🧩 Built-in selector handling and DOM interaction
- 🍪 Cookie management
- 📤 File upload support

## Installation

```bash
npm install pear-browser
```

## Basic Usage

```javascript
const pearBrowser = require("pear-browser");

async function main() {
  const browser = await pearBrowser({
    useChromium: true
  });

  const page = await browser.newPage("https://www.google.com");

  await page.screenshot({ path: "search-results.png" });
  
  await browser.close();
}

main().catch(console.error);
```

## Configuration Options

```javascript
const browser = await pearBrowser({
  // Browser executable path (defaults to system Chrome)
  browserPath: "path/to/chrome", 
  
  // Chrome profile directory
  profileDir: "./profile",        
  
  // Additional Chrome arguments
  args: ["--disable-gpu"],        
  
  // Enable debug logging
  debug: false,                   
  
  // Set a custom user agent
  useragent: "Custom User Agent", 
  
  // Default viewport dimensions
  viewport: { width: 1280, height: 720 }, 
  
  // WebSocket port
  port: 9876,                     
  
  // Use incognito mode
  incognito: false,               
  
  // Close when WebSocket disconnects
  autoclose: false,               
  
  // Custom HTTP server integration
  server: httpServer,             
  
  // Use proxy
  proxy: "http://proxy:8080",     
  
  // Disable sandbox
  nosandbox: false,               
  
  // Mute audio
  muteaudio: false,               
  
  // Use bundled Chromium
  useChromium: false             
});
```

## Browser API

### Opening Pages

```javascript
// Open a new page with URL
const page = await browser.newPage("https://example.com");

// Open a page without waiting for it to load
const page = await browser.newPage("https://example.com", { dontwaitLoad: true });
```

### Browser Management

```javascript
// Close the browser and all tabs
await browser.close();

// Set a global user agent
await browser.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/90.0.4430.212 Safari/537.36");
```

### Cookie Management

```javascript
// Get cookies for specific domain
const cookies = await browser.getCookies("example.com");

// Get all browser cookies
const allCookies = await browser.getAllCookies();

// Set cookies
await browser.setCookies([{
  name: "session",
  value: "abc123",
  domain: "example.com",
  path: "/",
  secure: true,
  httpOnly: false,
  expirationDate: Math.floor(Date.now() / 1000) + 3600
}]);
```

### Events

```javascript
// Listen for new tab creation
browser.on("tabcreated", (tab) => {
  console.log("New tab created:", tab);
});
```

## Page API

### Page Interaction

```javascript
// Execute JavaScript in the page context
const result = await page.evaluate((a, b) => {
  return a + b;
}, 5, 10); // Returns 15

// Type text into a focused element
await page.type("Hello World");

// Type text into an element matching a selector
await page.type("input[name='search']", "Hello World");

// Focus on an element
await page.focus("input[name='search']");

// Click on an element
await page.click("#submit-button");
await page.click("#context-menu", { button: 2 }); // Right-click

// Wait for an element to appear
await page.waitForSelector(".results-container", { timeout: 5000 });

// Wait for a specific amount of time
await page.waitForTimeout(1000);

// Close the page/tab
await page.close();
```

### Page Content

```javascript
// Get the page's HTML source
const html = await page.getPageSource();

// Take a screenshot
await page.screenshot({ path: "screenshot.png" });
await page.screenshot({ 
  path: "screenshot.jpg", 
  type: "jpeg", 
  quality: 80 
});

// Get screenshot as buffer (don't save to file)
const screenshotBuffer = await page.screenshot();
```

### Page Configuration

```javascript
// Set viewport dimensions
await page.setViewport({ width: 1280, height: 720 });
```

## Mouse & Keyboard API

### Mouse Control

```javascript
// Move the mouse to coordinates
await page.mouse.move(100, 200);

// Click at the current position
await page.mouse.click(100, 200);

// Mouse down/up actions
await page.mouse.down(); // Left button by default
await page.mouse.down({ button: 2 }); // Right button
await page.mouse.up();

// Scroll the page
await page.mouse.wheel({ deltaY: 500 }); // Scroll down
await page.mouse.wheel({ deltaY: -500 }); // Scroll up
await page.mouse.wheel({ deltaX: 200 }); // Scroll right
```

### Keyboard Control

```javascript
// Press a key (down followed by up)
await page.keyboard.press("Enter");

// Press modifier keys
await page.keyboard.press("ArrowDown");

// Key down/up actions
await page.keyboard.down("Shift");
await page.keyboard.up("Shift");
```

## Select Element API

```javascript
// Get all options in a select element
const options = await page.select.getOptions("#dropdown");

// Get the currently selected option
const selected = await page.select.getSelected("#dropdown");

// Select by value
await page.select.selectByValue("#dropdown", "option2");

// Select by display text
await page.select.selectByText("#dropdown", "Option 3");

// Select by index (0-based)
await page.select.selectByIndex("#dropdown", 1);
```

## File Operations

```javascript
// Upload a file using a file input
await page.uploadFile("#fileInput", "/path/to/file.jpg");

// Upload multiple files
await page.uploadFile("#fileInput", [
  "/path/to/file1.jpg", 
  "/path/to/file2.pdf"
]);

// Drag and drop elements
await page.dragAndDrop("#source-element", "#target-element");

// Drag and drop a file onto an element
await page.dragAndDropFile("/path/to/file.jpg", "#dropzone");
```

## Advanced Examples

### Web Scraping

```javascript
const pearBrowser = require("pear-browser");
const fs = require("fs");

async function main() {
  const browser = await pearBrowser({ useChromium: true });
  const page = await browser.newPage("https://news-site.com");
  
  // Extract article data
  const articles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".article")).map(article => ({
      title: article.querySelector(".title").innerText,
      summary: article.querySelector(".summary").innerText,
      url: article.querySelector("a").href
    }));
  });
  
  // Save results to file
  fs.writeFileSync("articles.json", JSON.stringify(articles, null, 2));
  console.log(`Scraped ${articles.length} articles`);
  
  await browser.close();
}

main().catch(console.error);
```

### Form Submission

```javascript
const pearBrowser = require("pear-browser");

async function main() {
  const browser = await pearBrowser({ useChromium: true });
  const page = await browser.newPage("https://example.com/login");
  
  // Fill out form
  await page.type("input[name='username']", "user123");
  await page.type("input[name='password']", "password123");
  await page.click("#login-button");
  
  // Wait for navigation to complete
  await page.waitForSelector(".dashboard");
  console.log("Login successful!");
  
  await browser.close();
}

main().catch(console.error);
```

### Express Server Integration

```javascript
const pearBrowser = require("pear-browser");
const express = require("express");
const http = require("http");

async function main() {
  const app = express();
  const server = http.createServer(app);
  
  app.get('/', (req, res) => {
    res.send('pear-browser Browser API Server');
  });
  
  server.listen(3000, () => {
    console.log(`Server running on port 3000`);
  });
  
  const browser = await pearBrowser({
    server: server,
    port: 3000,
    debug: true
  });
  
  // Now browser is integrated with your Express server
  const page = await browser.newPage("https://example.com");
  // ...
}

main().catch(console.error);
```

---

# 🍐 pear-browser Tarayıcı Otomasyonu

> Node.js için güçlü tarayıcı otomasyonu. Chrome/Chromium'u kolayca otomatikleştirin.  
> Kapsamlı belgelendirme ve örnekler için [resmi web sitemizi](https://developerkubilay.github.io/Pear/) ziyaret edin.

pear-browser, Chrome/Chromium üzerinde programatik kontrol sağlayan güçlü bir Node.js tarayıcı otomasyon kütüphanesidir. Sezgisel ve esnek bir şekilde tasarlanmış olup, minimum konfigürasyonla tarayıcı görevlerini otomatikleştirmenize olanak tanır.

## Özellikler

- 🚀 Hızlı ve hafif tarayıcı otomasyonu
- 🔄 Chrome/Chromium ile sorunsuz entegrasyon
- 📸 Ekran görüntüsü yakalama yetenekleri
- 🖱️ Tam fare ve klavye kontrolü
- 📄 Form manipülasyonu ve gönderimi
- 🧩 Yerleşik seçici işleme ve DOM etkileşimi
- 🍪 Çerez yönetimi
- 📤 Dosya yükleme desteği

## Kurulum

```bash
npm install pear-browser
```

## Temel Kullanım

```javascript
const pearBrowser = require("pear-browser");

async function main() {
  const browser = await pearBrowser({
    useChromium: true
  });

  const page = await browser.newPage("https://www.google.com");

  await page.screenshot({ path: "search-results.png" });
  
  await browser.close();
}

main().catch(console.error);
```

## Yapılandırma Seçenekleri

```javascript
const browser = await pearBrowser({
  // Tarayıcı çalıştırılabilir dosya yolu (varsayılan: sistem Chrome'u)
  browserPath: "path/to/chrome", 
  
  // Chrome profil dizini
  profileDir: "./profile",        
  
  // Ek Chrome parametreleri
  args: ["--disable-gpu"],        
  
  // Hata ayıklama günlüğünü etkinleştir
  debug: false,                   
  
  // Özel kullanıcı ajanı ayarla
  useragent: "Custom User Agent", 
  
  // Varsayılan görünüm alanı boyutları
  viewport: { width: 1280, height: 720 }, 
  
  // WebSocket portu
  port: 9876,                     
  
  // Gizli mod kullan
  incognito: false,               
  
  // WebSocket bağlantısı kesildiğinde kapat
  autoclose: false,               
  
  // Özel HTTP sunucusu entegrasyonu
  server: httpServer,             
  
  // Proxy kullan
  proxy: "http://proxy:8080",     
  
  // Sandbox'ı devre dışı bırak
  nosandbox: false,               
  
  // Sesi kapat
  muteaudio: false,               
  
  // Paketlenmiş Chromium'u kullan
  useChromium: false             
});
```

## Tarayıcı API'si

### Sayfa Açma

```javascript
// URL ile yeni bir sayfa aç
const page = await browser.newPage("https://example.com");

// Yüklenmesini beklemeden bir sayfa aç
const page = await browser.newPage("https://example.com", { dontwaitLoad: true });
```

### Tarayıcı Yönetimi

```javascript
// Tarayıcıyı ve tüm sekmeleri kapat
await browser.close();

// Global kullanıcı ajanı ayarla
await browser.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/90.0.4430.212 Safari/537.36");
```

### Çerez Yönetimi

```javascript
// Belirli domain için çerezleri al
const cookies = await browser.getCookies("example.com");

// Tüm tarayıcı çerezlerini al
const allCookies = await browser.getAllCookies();

// Çerezleri ayarla
await browser.setCookies([{
  name: "session",
  value: "abc123",
  domain: "example.com",
  path: "/",
  secure: true,
  httpOnly: false,
  expirationDate: Math.floor(Date.now() / 1000) + 3600
}]);
```

### Olaylar

```javascript
// Yeni sekme oluşturma olayını dinle
browser.on("tabcreated", (tab) => {
  console.log("Yeni sekme oluşturuldu:", tab);
});
```

## Sayfa API'si

### Sayfa Etkileşimi

```javascript
// Sayfa bağlamında JavaScript çalıştır
const result = await page.evaluate((a, b) => {
  return a + b;
}, 5, 10); // 15 döndürür

// Odaklanmış elemana metin yaz
await page.type("Merhaba Dünya");

// Bir seçiciyle eşleşen elemana metin yaz
await page.type("input[name='search']", "Merhaba Dünya");

// Bir elemana odaklan
await page.focus("input[name='search']");

// Bir elemana tıkla
await page.click("#submit-button");
await page.click("#context-menu", { button: 2 }); // Sağ tıklama

// Bir elemanın görünmesini bekle
await page.waitForSelector(".results-container", { timeout: 5000 });

// Belirli bir süre bekle
await page.waitForTimeout(1000);

// Sayfayı/sekmeyi kapat
await page.close();
```

### Sayfa İçeriği

```javascript
// Sayfanın HTML kaynağını al
const html = await page.getPageSource();

// Ekran görüntüsü al
await page.screenshot({ path: "ekran-goruntusu.png" });
await page.screenshot({ 
  path: "ekran-goruntusu.jpg", 
  type: "jpeg", 
  quality: 80 
});

// Ekran görüntüsünü buffer olarak al (dosyaya kaydetme)
const screenshotBuffer = await page.screenshot();
```

### Sayfa Yapılandırması

```javascript
// Görünüm alanı boyutlarını ayarla
await page.setViewport({ width: 1280, height: 720 });
```

## Fare ve Klavye API'si

### Fare Kontrolü

```javascript
// Fareyi koordinatlara taşı
await page.mouse.move(100, 200);

// Mevcut konumda tıkla
await page.mouse.click(100, 200);

// Fare basma/bırakma işlemleri
await page.mouse.down(); // Varsayılan olarak sol düğme
await page.mouse.down({ button: 2 }); // Sağ düğme
await page.mouse.up();

// Sayfada kaydırma
await page.mouse.wheel({ deltaY: 500 }); // Aşağı kaydır
await page.mouse.wheel({ deltaY: -500 }); // Yukarı kaydır
await page.mouse.wheel({ deltaX: 200 }); // Sağa kaydır
```

### Klavye Kontrolü

```javascript
// Bir tuşa bas (basma ve bırakma)
await page.keyboard.press("Enter");

// Özel tuşlara bas
await page.keyboard.press("ArrowDown");

// Tuş basma/bırakma işlemleri
await page.keyboard.down("Shift");
await page.keyboard.up("Shift");
```

## Select Elementi API'si

```javascript
// Bir select elementindeki tüm seçenekleri al
const options = await page.select.getOptions("#dropdown");

// Şu anda seçili olan seçeneği al
const selected = await page.select.getSelected("#dropdown");

// Değere göre seç
await page.select.selectByValue("#dropdown", "option2");

// Görünen metne göre seç
await page.select.selectByText("#dropdown", "Option 3");

// İndekse göre seç (0'dan başlar)
await page.select.selectByIndex("#dropdown", 1);
```

## Dosya İşlemleri

```javascript
// Dosya giriş alanı kullanarak dosya yükle
await page.uploadFile("#fileInput", "/path/to/file.jpg");

// Birden fazla dosya yükle
await page.uploadFile("#fileInput", [
  "/path/to/file1.jpg", 
  "/path/to/file2.pdf"
]);

// Elementleri sürükle ve bırak
await page.dragAndDrop("#source-element", "#target-element");

// Bir dosyayı elemana sürükle ve bırak
await page.dragAndDropFile("/path/to/file.jpg", "#dropzone");
```

## Gelişmiş Örnekler

### Web Scraping

```javascript
const pearBrowser = require("pear-browser");
const fs = require("fs");

async function main() {
  const browser = await pearBrowser({ useChromium: true });
  const page = await browser.newPage("https://news-site.com");
  
  // Makale verilerini çıkart
  const articles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".article")).map(article => ({
      title: article.querySelector(".title").innerText,
      summary: article.querySelector(".summary").innerText,
      url: article.querySelector("a").href
    }));
  });
  
  // Sonuçları dosyaya kaydet
  fs.writeFileSync("articles.json", JSON.stringify(articles, null, 2));
  console.log(`${articles.length} makale çekildi`);
  
  await browser.close();
}

main().catch(console.error);
```

### Form Gönderme

```javascript
const pearBrowser = require("pear-browser");

async function main() {
  const browser = await pearBrowser({ useChromium: true });
  const page = await browser.newPage("https://example.com/login");
  
  // Formu doldur
  await page.type("input[name='username']", "user123");
  await page.type("input[name='password']", "password123");
  await page.click("#login-button");
  
  // Gezinmenin tamamlanmasını bekle
  await page.waitForSelector(".dashboard");
  console.log("Giriş başarılı!");
  
  await browser.close();
}

main().catch(console.error);
```

### Express Sunucu Entegrasyonu

```javascript
const pearBrowser = require("pear-browser");
const express = require("express");
const http = require("http");

async function main() {
  const app = express();
  const server = http.createServer(app);
  
  app.get('/', (req, res) => {
    res.send('pear-browser Tarayıcı API Sunucusu');
  });
  
  server.listen(3000, () => {
    console.log(`Sunucu 3000 portunda çalışıyor`);
  });
  
  const browser = await pearBrowser({
    server: server,
    port: 3000,
    debug: true
  });
  
  // Tarayıcı artık Express sunucunuzla entegre
  const page = await browser.newPage("https://example.com");
  // ...
}

main().catch(console.error);
```
