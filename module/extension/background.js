
chrome.runtime.onInstalled.addListener(async () => {
    const response = await fetch(chrome.runtime.getURL("settings.json"));
    const settings = await response.json();
    const cookies = settings.cookies || [];

    for (const cookie of cookies) {
        console.log(cookie);
        const protocol = cookie.secure ? 'https://' : 'http://';
        const domain = cookie.domain.replace(/^\./, '');
        const url = protocol + domain;
        const validCookie = {
            url: url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            expirationDate: cookie.expirationDate,
            storeId: cookie.storeId
        };
        await chrome.cookies.set(validCookie);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        chrome.tabs.sendMessage(tab.id, { tabId: tab.id, action: "tabCreated" });
    }
});