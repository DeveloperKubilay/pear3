const pearBrowser = require("./Pear")

async function main() {
const browser = await pearBrowser({
    profileDir: "./profile",
    debug: false,
    nosandbox: true,
    useChromium: true,
    autoclose: false,
});

const newtab = await browser.newPage("https://www.google.com/search?q=test");


}
main().catch((error) => {
    console.error("Hata:", error);
});