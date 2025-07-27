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

// Helper function for keyboard events
function createKeyboardEvent(type, key, options = {}) {
    return new KeyboardEvent(type, {
        key: key,
        code: options.code || key,
        charCode: key.charCodeAt ? key.charCodeAt(0) : 0,
        keyCode: key.charCodeAt ? key.charCodeAt(0) : 0,
        which: key.charCodeAt ? key.charCodeAt(0) : 0,
        bubbles: true,
        cancelable: true,
        ...options
    });
}

// Helper function for mouse events
function createMouseEvent(type, element, options = {}) {
    const rect = element.getBoundingClientRect();
    const x = options.x !== undefined ? options.x : rect.left + rect.width / 2;
    const y = options.y !== undefined ? options.y : rect.top + rect.height / 2;
    
    return new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        screenX: x + window.screenX,
        screenY: y + window.screenY,
        button: options.button || 0, // 0: left, 1: middle, 2: right
        buttons: options.buttons || 1,
        ...options
    });
}

function onMsg(event) {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);
    
    if (data.action === 'newTab') {
        window.open("#id=" + data.id, '_blank');
        return sendMessage(data, { action: false })
    } 
    
    // Keyboard events
    else if (data.type === 'keypress' || data.type === 'keydown' || data.type === 'keyup') {
        const key = data.key;
        const options = data.options || {};
        const event = createKeyboardEvent(data.type, key, options);
        const target = data.selector ? document.querySelector(data.selector) : document;
        target.dispatchEvent(event);
        sendMessage(data, { action: data.type, success: true });
    }
    
    // Mouse events
    else if (['rightclick', 'middleclick', 'leftclick', 'dblclick', 'mousedown', 'mouseup', 'mousemove'].includes(data.type)) {
        try {
            const element = document.querySelector(data.selector);
            if (!element) {
                sendMessage(data, { action: data.type, success: false, error: 'Element not found' });
                return;
            }
            
            const options = data.options || {};
            let eventType = data.type;
            
            if (data.type === 'rightclick') {
                options.button = 2;
                options.buttons = 2;
                eventType = 'click';
            } else if (data.type === 'middleclick') {
                options.button = 1;
                options.buttons = 4;
                eventType = 'click';
            } else if (data.type === 'leftclick') {
                options.button = 0;
                options.buttons = 1;
                eventType = 'click';
            }
            
            const event = createMouseEvent(eventType, element, options);
            element.dispatchEvent(event);
            sendMessage(data, { action: data.type, success: true });
        } catch (error) {
            sendMessage(data, { action: data.type, success: false, error: error.message });
        }
    }
    
    // Scroll event
    else if (data.type === 'scroll') {
        try {
            const element = data.selector ? document.querySelector(data.selector) : window;
            const options = data.options || {};
            
            if (element === window) {
                window.scrollBy(options.x || 0, options.y || 0);
            } else {
                element.scrollBy(options.x || 0, options.y || 0);
            }
            
            sendMessage(data, { action: 'scroll', success: true });
        } catch (error) {
            sendMessage(data, { action: 'scroll', success: false, error: error.message });
        }
    }
    
    // Legacy keypress handler
    else if (data.action === 'keypress') {
        const key = data.key;
        const event = createKeyboardEvent('keydown', key);
        document.dispatchEvent(event);
    }
    
    // Navigation
    else if (data.type === 'goto') {
        window.location.href = data.url;
    } else if (data.type === 'reload') {
        window.location.reload();
    }
    
    // Click (legacy)
    else if (data.type === 'click') {
        try {
            const element = document.querySelector(data[0]);
            element.click();
            sendMessage(data, { action: 'click', success: true });
        } catch {
            sendMessage(data, { action: 'click', success: false });
        }
    }
    
    // URL and content
    else if (data.type === "url") {
        sendMessage(data, { action: 'url', url: window.location.href });
    } else if (data.type === "content") {
        sendMessage(data, { action: 'content', content: document.documentElement.outerHTML });
    }
    
    // Screenshot
    else if (data.type === "screenshot") {
        html2canvas(document.body).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            sendMessage(data, { action: 'screenshot', screenshot: imgData });
        }).catch(err => {
            console.error('Screenshot error:', err);
            sendMessage(data, { action: 'screenshot', error: err.message });
        });
    }
    
    // Window management
    else if (data.type === 'close') {
        window.close();
    }
    
    // Text input
    else if (data.type === "type" || data.type === "directType") {
        const selector = data.selector;
        const text = data.text || '';
        
        let el;
        if (selector) {
            try {
                el = document.querySelector(selector);
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                    el.focus();
                } else {
                    sendMessage(data, { action: data.type, success: false, error: `Element not found or not typeable: ${selector}` });
                    return;
                }
            } catch (error) {
                sendMessage(data, { action: data.type, success: false, error: `Invalid selector: ${selector}` });
                return;
            }
        } else {
            el = document.activeElement;
            if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                sendMessage(data, { action: data.type, success: false, error: 'No valid input element' });
                return;
            }
        }
        
        if (data.type === "type") {
            [...text].forEach(char => {
                el.dispatchEvent(createKeyboardEvent('keydown', char));
                if (el.isContentEditable) {
                    el.innerText += char;
                } else {
                    el.value += char;
                }
                el.dispatchEvent(createKeyboardEvent('keyup', char));
                el.dispatchEvent(new InputEvent('input', { data: char, bubbles: true }));
            });
        } else {
            if (el.isContentEditable) {
                el.innerText = text;
            } else {
                el.value = text;
            }
            el.dispatchEvent(new InputEvent('input', { data: text, bubbles: true }));
        }
        
        sendMessage(data, { action: data.type, success: true });
    }
    
    // Wait for selector
    else if (data.type === "waitForSelector") {
        const selector = data.selector;
        const timeout = data.timeout || 30000;
        const checkInterval = data.checkInterval || 100;
        const startTime = Date.now();
        
        const checkElement = () => {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    sendMessage(data, { 
                        action: 'waitForSelector', 
                        success: true, 
                        found: true,
                        element: {
                            tagName: element.tagName,
                            id: element.id,
                            className: element.className,
                            textContent: element.textContent?.substring(0, 100)
                        }
                    });
                    return;
                }
                
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
        
        checkElement();
    }
    
    // File upload
    else if (data.type === "uploadFile") {
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
            
            fetch(filePath)
                .then(response => response.blob())
                .then(blob => {
                    const fileName = filePath.split('/').pop() || 'uploaded-file';
                    const file = new File([blob], fileName, { type: blob.type });
                    
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    
                    fileInput.files = dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    sendMessage(data, { 
                        action: 'uploadFile', 
                        success: true,
                        fileName: fileName,
                        fileSize: file.size
                    });
                })
                .catch(error => {
                    if (filePath.startsWith('file://') || !filePath.startsWith('http')) {
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
    }
    
    // Get attribute
    else if (data.type === "getAttribute") {
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
    }
    
    // Get text
    else if (data.type === "getText") {
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
    }
    
    else {
        console.warn('Unknown action:', data.action || data.type);
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