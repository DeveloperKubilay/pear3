const Pear = require('./module/index.js');

async function main() {
    const browser2 = await Pear({
        viewport: { width: 1280, height: 800 },
        headless: false,
        debug:true
    });
    const browser = await Pear({
        viewport: { width: 1280, height: 800 },
        headless: false,
        port: 9222,
        debug:true
    });

    const page = await browser.newPage();
    const page2 = await browser2.newPage();

    await page.goto("https://google.com");
    await page2.goto("https://google.com");
    await page.directType('textarea', 'Hello Pear!');
    await page.keypress('Enter');


    await page2.directType('textarea', 'Hello Pear from Browser 2!');
    await page2.keypress('Enter');



}

main()