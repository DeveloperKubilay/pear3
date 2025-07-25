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
        const text = data.text || '';
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
            [...text].forEach(char => {
                const event = new KeyboardEvent('keydown', {
                    key: char,
                    code: char,
                    charCode: char.charCodeAt(0),
                    keyCode: char.charCodeAt(0),
                    which: char.charCodeAt(0),
                    bubbles: true
                });
                el.dispatchEvent(event);
            });
            sendMessage(data, { action: 'type', success: true });
        } else {
            sendMessage(data, { action: 'type', success: false, error: 'No valid input element' });
        }
    } else if (data.type === "directType") {
        const text = data.text || '';
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
            const inputEvent = new InputEvent('input', { data: text });
            el.dispatchEvent(inputEvent);
            sendMessage(data, { action: 'directType', success: true });
        } else {
            sendMessage(data, { action: 'directType', success: false, error: 'No valid input element' });
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