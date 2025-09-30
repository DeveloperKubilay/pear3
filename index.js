const Pear = require("./module");

async function main() {
  const browser = await Pear({
    viewport: { width: 1280, height: 800 },
    headless: false
  });

  const page = await browser.newPage();
  await page.goto("https://google.com");
  await new Promise(r => setTimeout(r, 2000)); // Wait for 5 seconds
  const html = await page.content();
  console.log(html);

  const screenshot = await page.screenshot();
  console.log(screenshot);

  await browser.close();
}

main().catch(console.error);