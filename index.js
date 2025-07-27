const Pear = require('./module/index.js');

async function main() {
    const browser = await Pear({
        viewport: { width: 1280, height: 800 },
        headless: false
    });

    const page = await browser.newPage();
    console.log('🍐 Browser started');

    await page.goto("https://google.com");
    console.log('🍐 Navigated to Google');
    await page.directType('textarea', 'New events work!');
    await page.keypress('Enter');

    await new Promise(r => setTimeout(r, 2000));

}

main()