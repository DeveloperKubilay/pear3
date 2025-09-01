// window.open(window.location.href, '_blank');

let ws = null;
let wsQueue = [];

ws = new WebSocket(`ws://${"__PEARSYSTEM_ENDPOINT__".replace("http://", "").replace("https://", "")}`);
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
    let keyCode = 0;
    if (typeof key === 'string') {
        if (key.length === 1) {
            keyCode = key.charCodeAt(0);
        } else {
            const keyMap = {
                Enter: 13,
                Tab: 9,
                Backspace: 8,
                Shift: 16,
                Control: 17,
                Alt: 18,
                Escape: 27,
                ArrowLeft: 37,
                ArrowUp: 38,
                ArrowRight: 39,
                ArrowDown: 40,
                Delete: 46,
                Space: 32
            };
            keyCode = keyMap[key] || 0;
        }
    }
    return new KeyboardEvent(type, {
        key: key,
        code: options.code || key,
        charCode: keyCode,
        keyCode: keyCode,
        which: keyCode,
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
        if (data.type === 'keypress') data.type = 'keydown'; // Normalize to keydown for consistency
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

    // Navigation
    else if (data.type === 'goto') {
        window.location.href = data.url;
    } else if (data.type === 'reload') {
        window.location.reload();
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

    // Evaluate
    else if (data.type === "evaluate") {
        try {
            const func = new Function('return ' + data.func)();
            const result = func(...data.args);
            sendMessage(data, { action: 'evaluate', result });
        } catch (error) {
            sendMessage(data, { action: 'evaluate', error: error.message });
        }
    }

    // Shadow click
    else if (data.type === "shadowClick") {
        try {
            const element = document.querySelector(data.selector);
            if (element && element.shadowRoot) {
                const shadowElement = element.shadowRoot.querySelector(data.shadowSelector);
                if (shadowElement) {
                    shadowElement.click();
                    sendMessage(data, { action: 'shadowClick', success: true });
                } else {
                    sendMessage(data, { action: 'shadowClick', success: false, error: 'Shadow element not found' });
                }
            } else {
                sendMessage(data, { action: 'shadowClick', success: false, error: 'Element or shadowRoot not found' });
            }
        } catch (error) {
            sendMessage(data, { action: 'shadowClick', success: false, error: error.message });
        }
    }

    else {
        console.warn('Unknown action:', data.action || data.type);
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "tabCreated") {
        const id = window.location.href.startsWith("__PEARSYSTEM_ENDPOINT__") ?
            window.location.hash?.split('=')[1] : msg.tabId;
        sendMessage(id, { action: 'init', id: id, newid: msg.tabId });
    }
    console.log("Message received:", msg);
    sendResponse({ ok: true });
});