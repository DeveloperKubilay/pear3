// window.open(window.location.href, '_blank');

let ws = null;
let wsQueue = [];

ws = new WebSocket(`ws://localhost:8191`);
ws.onopen = () => {
    while (wsQueue.length) ws.send(wsQueue.shift());
    console.log('WebSocket connection established');
};
ws.onmessage = onMsg;
ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};
ws.onclose = () => {
    console.log('WebSocket connection closed');
    window.close();
};

function sendMessage(session, data) {
    const msg = JSON.stringify({ id: session.id, ...data });
    if (ws.readyState === 1) {
        ws.send(msg);
    } else {
        wsQueue.push(msg);
    }
}

function onMsg(event) {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);
    if (data.action === 'newTab') {
        window.open("#id=" + data.id, '_blank');
        return sendMessage(data, { action: false })
    } else if (data.action === 'keypress') {
        const key = data.key;
        const event = new KeyboardEvent('keydown', {
            key: key,
            code: key,
            charCode: key.charCodeAt(0),
            keyCode: key.charCodeAt(0),
            which: key.charCodeAt(0),
            bubbles: true
        });
        document.dispatchEvent(event);
    } else if (data.type === 'goto') {
        const url = data.url;
        window.location.href = url;
    } else if (data.type === 'reload') {
        window.location.reload();
    } else if (data.type === 'click') {
        try {
            const element = document.querySelector(data[0]);
            element.click();
            sendMessage(data, { action: 'click', success: true });
        } catch {
            sendMessage(data, { action: 'click', success: false  });
        }
    }else if(data.type === "url"){
        sendMessage(data, { action: 'url', url: window.location.href });
    } else if(data.type === "content"){
        sendMessage(data, { action: 'content', content: document.documentElement.outerHTML });
    } else if(data.type === "screenshot"){
        html2canvas(document.body).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            sendMessage(data, { action: 'screenshot', screenshot: imgData });
        }).catch(err => {
            console.error('Screenshot error:', err);
            sendMessage(data, { action: 'screenshot', error: err.message });
        });
    } else if (data.type === 'close') {
        window.close();
    } else if (data.type === "reload") {
        window.location.reload();
    } else if (data.type === "type") {
        const selector = data.selector;
        const text = data.text || '';
        
        let el;
        if (selector) {
            // Seçici kullanılarak element bul
            try {
                el = document.querySelector(selector);
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                    el.focus(); // Elemente focus ver
                } else {
                    sendMessage(data, { action: 'type', success: false, error: `Element not found or not typeable: ${selector}` });
                    return;
                }
            } catch (error) {
                sendMessage(data, { action: 'type', success: false, error: `Invalid selector: ${selector}` });
                return;
            }
        } else {
            // Aktif elementi kullan
            el = document.activeElement;
            if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                sendMessage(data, { action: 'type', success: false, error: 'No valid input element' });
                return;
            }
        }
        
        // Yazı yazma işlemi
        [...text].forEach(char => {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            if (el.isContentEditable) {
                el.innerText += char;
            } else {
                el.value += char;
            }
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            el.dispatchEvent(new InputEvent('input', { data: char, bubbles: true }));
        });
        sendMessage(data, { action: 'type', success: true });
        
    } else if (data.type === "directType") {
        const selector = data.selector;
        const text = data.text || '';
        
        let el;
        if (selector) {
            // Seçici kullanılarak element bul
            try {
                el = document.querySelector(selector);
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                    el.focus(); // Elemente focus ver
                } else {
                    sendMessage(data, { action: 'directType', success: false, error: `Element not found or not typeable: ${selector}` });
                    return;
                }
            } catch (error) {
                sendMessage(data, { action: 'directType', success: false, error: `Invalid selector: ${selector}` });
                return;
            }
        } else {
            // Aktif elementi kullan
            el = document.activeElement;
            if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                sendMessage(data, { action: 'directType', success: false, error: 'No valid input element' });
                return;
            }
        }
        
        // Direkt yazma işlemi
        if (el.isContentEditable) {
            el.innerText = text;
        } else {
            el.value = text;
        }
        el.dispatchEvent(new InputEvent('input', { data: text, bubbles: true }));
        sendMessage(data, { action: 'directType', success: true });
        
    } else if (data.type === "waitForSelector") {
        const selector = data.selector;
        const timeout = data.timeout || 30000; // Default 30 saniye
        const checkInterval = data.checkInterval || 100; // Default 100ms
        
        const startTime = Date.now();
        
        const checkElement = () => {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    // Element bulundu
                    sendMessage(data, { 
                        action: 'waitForSelector', 
                        success: true, 
                        found: true,
                        element: {
                            tagName: element.tagName,
                            id: element.id,
                            className: element.className,
                            textContent: element.textContent?.substring(0, 100) // İlk 100 karakter
                        }
                    });
                    return;
                }
                
                // Timeout kontrolü
                if (timeout > 0 && Date.now() - startTime > timeout) {
                    sendMessage(data, { 
                        action: 'waitForSelector', 
                        success: false, 
                        found: false,
                        error: `Timeout: Element not found after ${timeout}ms`,
                        selector: selector
                    });
                    return;
                }
                
                // Tekrar kontrol et
                setTimeout(checkElement, checkInterval);
                
            } catch (error) {
                sendMessage(data, { 
                    action: 'waitForSelector', 
                    success: false, 
                    found: false,
                    error: `Invalid selector: ${selector}`,
                    originalError: error.message
                });
            }
        };
        
        // İlk kontrolü başlat
        checkElement();
        
    } else if (data.type === "uploadFile") {
        const selector = data.selector;
        const filePath = data.filePath;
        
        try {
            const fileInput = document.querySelector(selector);
            
            if (!fileInput || fileInput.type !== 'file') {
                sendMessage(data, { 
                    action: 'uploadFile', 
                    success: false, 
                    error: `File input not found or invalid: ${selector}` 
                });
                return;
            }
            
            // Dosya yolu ile DataTransfer oluştur
            fetch(filePath)
                .then(response => response.blob())
                .then(blob => {
                    const fileName = filePath.split('/').pop() || 'uploaded-file';
                    const file = new File([blob], fileName, { type: blob.type });
                    
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    
                    fileInput.files = dataTransfer.files;
                    
                    // Change event'ini tetikle
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    sendMessage(data, { 
                        action: 'uploadFile', 
                        success: true,
                        fileName: fileName,
                        fileSize: file.size
                    });
                })
                .catch(error => {
                    // Yerel dosya yolu ise farklı yaklaşım
                    if (filePath.startsWith('file://') || !filePath.startsWith('http')) {
                        // Tarayıcı güvenlik kısıtlamaları nedeniyle yerel dosya erişimi sınırlı
                        sendMessage(data, { 
                            action: 'uploadFile', 
                            success: false, 
                            error: `Cannot access local file: ${filePath}. Use URL or base64 data.` 
                        });
                    } else {
                        sendMessage(data, { 
                            action: 'uploadFile', 
                            success: false, 
                            error: `Failed to load file: ${error.message}` 
                        });
                    }
                });
                
        } catch (error) {
            sendMessage(data, { 
                action: 'uploadFile', 
                success: false, 
                error: `Upload error: ${error.message}` 
            });
        }
        
    } else if (data.type === "getAttribute") {
        const selector = data.selector;
        const attribute = data.attribute;
        
        try {
            const element = document.querySelector(selector);
            
            if (!element) {
                sendMessage(data, { 
                    action: 'getAttribute', 
                    success: false, 
                    error: `Element not found: ${selector}` 
                });
                return;
            }
            
            const value = element.getAttribute(attribute);
            
            sendMessage(data, { 
                action: 'getAttribute', 
                success: true,
                value: value,
                selector: selector,
                attribute: attribute
            });
            
        } catch (error) {
            sendMessage(data, { 
                action: 'getAttribute', 
                success: false, 
                error: `Error getting attribute: ${error.message}` 
            });
        }
        
    } else if (data.type === "getText") {
        const selector = data.selector;
        
        try {
            const element = document.querySelector(selector);
            
            if (!element) {
                sendMessage(data, { 
                    action: 'getText', 
                    success: false, 
                    error: `Element not found: ${selector}` 
                });
                return;
            }
            
            const text = element.textContent || element.innerText || '';
            
            sendMessage(data, { 
                action: 'getText', 
                success: true,
                text: text.trim(),
                selector: selector
            });
            
        } catch (error) {
            sendMessage(data, { 
                action: 'getText', 
                success: false, 
                error: `Error getting text: ${error.message}` 
            });
        }
        
    } else {
        console.warn('Unknown action:', data.action);
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "tabCreated") {
        const id = window.location.href.startsWith("http://localhost:8191/") ?
            window.location.hash?.split('=')[1] : msg.tabId;
        sendMessage(id, { action: 'init', id: id, newid: msg.tabId });
    }
    console.log("Message received:", msg);
    sendResponse({ ok: true });
});