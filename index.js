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
    await page.goto("http://localhost/test.html");
     console.log('Clicked on the search icon');
     await page.directType("#inputField",'Hello World');
     await page.type("#inputField",'Hello World2');

     await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds to see the input
     browser.close()






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