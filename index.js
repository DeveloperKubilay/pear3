const Pear = require('./module/index.js');

async function main() {
    const browser = await Pear({
        viewport: { width: 1280, height: 800 },
        headless: false
    });

    const page = await browser.newPage();

    await page.goto("https://yandex.com");
    await page.goto("https://google.com");
    await page.directType('textarea', 'Hello Pear!');
    await page.keypress('Enter');



}

main()