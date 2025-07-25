// window.open(window.location.href, '_blank');

let ws = null;

ws = new WebSocket(`ws://localhost:8191`);
ws.onopen = () => {
    console.log('WebSocket connection established');
   // ws.send(JSON.stringify({ id: sessionId, action: 'init' }));
};
ws.onmessage = onMsg;
ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};
ws.onclose = () => {
    console.log('WebSocket connection closed');
};

function sendMessage(session, data) {
    ws.send(JSON.stringify({ id: session.id, ...data }));
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
    }
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Burada mesajı yakalıyorsun
  // msg içeriğini kullan, ne istiyorsan yap
  console.log('Message received:', msg,sender);
  sendResponse({ ok: true });
});