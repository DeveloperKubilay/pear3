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
    console.log('Browser launched:');
    await page.goto("https://yandex.com.tr/");
    await page.click("body > main > div.body__container > div.body__view > form > div.search3__inner > div.search3__input-wrapper > div.search3__voice-wrapper > button");
    console.log('Clicked on the search icon');






    // await page.screenshot({ path: "search-results.png" });
    //await page.keyboard.press('Enter');
    // console.log('Page loaded:', await page.url());

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