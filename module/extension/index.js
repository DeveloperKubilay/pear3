// window.open(window.location.href, '_blank');

const sessionId = sessionStorage.getItem('PearSystemid')

let ws = null;
fetch(window.location.origin + '/settings.json')
    .then(response => {
        if (!response.ok) {
            throw new Error('settings.json not found');
        }
        return response.json();
    })
    .then(settings => {
        ws = new WebSocket(`ws://localhost:${settings.port}`);
        ws.onopen = () => {
            console.log('WebSocket connection established');
            ws.send(JSON.stringify({ id: sessionId, action: 'init' }));
        };
        ws.onmessage = onMsg;
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        ws.onclose = () => {
            console.log('WebSocket connection closed');
        };
    })
    .catch(error => {
        console.error('Error loading settings.json:', error);
    });

function sendMessage(session, data) {
    ws.send(JSON.stringify({ id: session.id, ...data }));
}

function onMsg(event) {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);
    if (data.action === 'newTab') {
        window.open("#id="+data.id, '_blank');
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