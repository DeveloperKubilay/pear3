
chrome.runtime.onInstalled.addListener(async () => {
    const response = await fetch(chrome.runtime.getURL("settings.json"));
    const settings = await response.json();
    const cookies = settings.cookies || [];

    for (const cookie of cookies) {
        await chrome.cookies.set(cookie);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        chrome.tabs.sendMessage(tab.id, { tabId: tab.id, action: "tabCreated" });
    }
});