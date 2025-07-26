const Pear = require('./module/index.js');
const fs = require('fs');
const path = require('path');

async function main() {
    const browser = await Pear({
        cookies: [],
        viewport: {
            width: 1280,
            height: 800
        },
        muteaudio: false,
        headless: false, // Görsel test için false yapıyoruz
    });
    
    const page = await browser.newPage();
    console.log('🍐 Browser launched successfully');
    
    try {
        // Test sayfasını yükle
        await page.goto("http://localhost/test.html");
        console.log('✅ Test sayfası yüklendi');
        
        // 1. Temel input testleri
        console.log('\n📝 Temel Input Testleri Başlıyor...');
        
        // DirectType test
        console.log('DirectType testi...');
        await page.directType("#inputField", 'Hello World - DirectType');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Type test (üzerine ekleme)
        console.log('Type testi...');
        await page.type("#inputField", ' + Type Test');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Textarea test
        console.log('Textarea testi...');
        await page.directType("#textArea", 'Bu bir textarea testidir.\nYeni satır da ekledik!');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 2. WaitForSelector testleri
        console.log('\n⏱️ WaitForSelector Testleri Başlıyor...');
        
        // 3 saniye gecikmeli buton test
        console.log('3 saniye gecikmeli element testi...');
        await page.click("#btn3sec");
        
        // 3 saniye bekleyip elementin gelmesini bekle
        const result = await page.waitForSelector("#delayedContent", { timeout: 5000 });
        if (result.success) {
            console.log('✅ Dinamik element başarıyla bulundu!');
            
            // Dinamik input'a yazı yaz
            await page.directType("#delayedInput", "Dinamik element bulundu ve yazı yazıldı!");
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log('❌ Dinamik element bulunamadı:', result.error);
        }
        
        // 3. getAttribute ve getText testleri
        console.log('\n🔍 Attribute ve Text Testleri Başlıyor...');
        
        // Test div'ini güncelle
        await page.click("#updateBtn");
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Attribute al
        const attribute = await page.getAttribute("#testDiv", "data-test");
        console.log('📊 data-test attribute:', attribute);
        
        // Text al
        const text = await page.getText("#testDiv");
        console.log('📝 Div text içeriği:', text);
        
        // Class attribute al
        const className = await page.getAttribute("#testDiv", "class");
        console.log('🎨 Class attribute:', className);
        
        // 4. File Upload testleri
        console.log('\n📁 File Upload Testleri Başlıyor...');
        
        // Test dosyası oluştur
        const testFileName = 'test-upload-file.txt';
        const testFileContent = 'Bu bir test dosyasıdır.\nPear browser automation ile yüklenmiştir.\nZaman: ' + new Date().toISOString();
        
        // Test dosyasını oluştur
        fs.writeFileSync(testFileName, testFileContent, 'utf8');
        console.log(`Test dosyası oluşturuldu: ${testFileName}`);
        
        try {
            // File upload - data URL ile
            const fileData = fs.readFileSync(testFileName, 'utf8');
            const dataUrl = 'data:text/plain;base64,' + Buffer.from(fileData).toString('base64');
            
            const uploadResult = await page.uploadFile("#fileInput", dataUrl);
            if (uploadResult.success) {
                console.log('✅ Dosya başarıyla yüklendi:', uploadResult.fileName);
            } else {
                console.log('❌ Dosya yüklenemedi:', uploadResult.error);
            }
            
        } catch (uploadError) {
            console.log('⚠️ File upload hatası:', uploadError.message);
        }
        
        // Dosya bilgilerini göster
        await page.click("button[onclick='showFileInfo()']");
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 5. Gelişmiş testler
        console.log('\n🧪 Gelişmiş Testler Başlıyor...');
        
        // Olmayan element test
        try {
            const nonExistentResult = await page.waitForSelector("#nonExistentElement", { timeout: 2000 });
            console.log('Olmayan element sonucu:', nonExistentResult);
        } catch (error) {
            console.log('✅ Olmayan element için timeout beklendiği gibi çalıştı');
        }
        
        // URL kontrolü
        const currentUrl = await page.url();
        console.log('📍 Mevcut URL:', currentUrl);
        
        // Screenshot al
        console.log('📸 Screenshot alınıyor...');
        const screenshot = await page.screenshot();
        fs.writeFileSync('test-result.png', screenshot);
        console.log('✅ Screenshot kaydedildi: test-result.png');
        
        // Sayfa içeriğini al
        const content = await page.content();
        console.log('📄 Sayfa içeriği uzunluğu:', content.length, 'karakter');
        
        console.log('\n🎉 Tüm testler tamamlandı!');
        
        // Test sonuçlarını bekle
        await new Promise(resolve => setTimeout(resolve, 3000));
        
    } catch (error) {
        console.error('❌ Test sırasında hata:', error);
    } finally {
        // Temizlik
        try {
            if (fs.existsSync('test-upload-file.txt')) {
                fs.unlinkSync('test-upload-file.txt');
                console.log('🧹 Test dosyası temizlendi');
            }
        } catch (cleanupError) {
            console.log('⚠️ Temizlik hatası:', cleanupError.message);
        }
        
        console.log('🔒 Browser kapatılıyor...');
        browser.close();
    }
}

main().then(() => {
    console.log('✅ Test suite başarıyla tamamlandı');
}).catch(err => {
    console.error('❌ Test suite hatası:', err);
});