
chrome.runtime.onInstalled.addListener(async () => {
    const response = await fetch(chrome.runtime.getURL("settings.json"));
    const settings = await response.json();
    const cookies = settings.cookies || [];

    for (const cookie of cookies) {
        await chrome.cookies.set(cookie);
    }
})