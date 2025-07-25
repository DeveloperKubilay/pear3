const Pear = require('./module/index.js');
async function main() {
    const [ browser, page] = await Pear({
        cookies: [],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
        viewport: {
            width: 1280,
            height: 800
        },
        args: [
            '--no-sandbox'
        ],
        profileDir: './profile',
        port: 8172,
        incognito: false,
        proxy: "",
        nosandbox: true,
        muteaudio: false,
        browserPath: "",
        //headless: true,
        //disableGpu: true,
    })
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