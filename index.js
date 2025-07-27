const Pear = require('./module/index.js');

async function main() {
    const browser = await Pear({
        viewport: { width: 1280, height: 800 },
        headless: false
    });
    
    const page = await browser.newPage();
    console.log('🍐 Browser started');
    
    try {
        await page.goto("http://localhost/test.html");
        console.log('✅ Page loaded');
        
        // Keyboard tests
        console.log('\n⌨️ Keyboard Tests...');
        await page.click('#inputField');
        await page.keydown('a');
        await page.keyup('a');
        await page.keypress('Enter');
        console.log('✅ Keyboard events tested');
        
        // Mouse tests
        console.log('\n🖱️ Mouse Tests...');
        await page.leftclick('#btn3sec');
        await page.rightclick('#updateBtn');
        await page.dblclick('#testDiv');
        console.log('✅ Mouse events tested');
        
        // Scroll test
        console.log('\n📜 Scroll Test...');
        await page.scroll(null, { x: 0, y: 200 });
        await page.scroll('#testDiv', { x: 0, y: -50 });
        console.log('✅ Scroll tested');
        
        // Wait for dynamic content
        await page.waitForSelector('#delayedContent', { timeout: 5000 });
        console.log('✅ Dynamic element found');
        
        // Type in delayed input
        await page.directType('#delayedInput', 'New events work!');
        console.log('✅ Text typed to dynamic element');
        
        await new Promise(r => setTimeout(r, 2000));
        
    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        browser.close();
    }
}

main().catch(console.error);