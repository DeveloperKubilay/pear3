const Pear = require('./module/index.js');
async function main() {
    const browser = await Pear({
        cookies: [],
        //userAgent: '',
        viewport: {
            width: 1280,
            height: 800
        },
        /*args: [
            '--no-sandbox'
        ],*/
        //profileDir: './profile',
        //port: 8172,
        //incognito: false,
        //proxy: "",
        //nosandbox: true,
        muteaudio: false,
        //browserPath: "",
        //headless: true,
        //disableGpu: true,
    })
    const page = await browser.newPage();
    await page.goto("https://www.google.com");
     await page.screenshot({ path: "search-results.png" });
    //await page.keyboard.press('Enter');
    console.log('Page loaded:', page.url());

    /*await page.goto('https://www.example.com')
    console.log('Page loaded:', page.url());
    await page.close();
    await browser.close();
*/
console.log("loaed")
}

main().then(() => {
    console.log('Main dw launched successfully');
}).catch(err => {
    console.error('Error launching browser:', err);
});