let currentEl = null;
let lastText = "";
let stopTimer = null;
let activeObserver = null;
let copyObserver = null;
let doneSent = false;
const idleMs = 15000;

function clean(str) {
  return Array.from(str || "").join("");
}

function findJsonEnd(text, start) {
  let open = 0;
  let inString = false;
  let escape = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') open++;
      else if (ch === '}') {
        open--;
        if (open === 0) return j;
      }
    }
  }
  return -1;
}

function tryParseToolCandidate(candidate) {
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && parsed.tool && parsed.args) {
      return { tool: parsed.tool, args: parsed.args, raw: candidate };
    }
  } catch (e) {}

  const toolMatch = candidate.match(/"tool"\s*:\s*"([^"]+)"/);
  if (!toolMatch) return null;

  const tool = toolMatch[1];
  const args = {};
  const pathMatch = candidate.match(/"path"\s*:\s*"([^"]*)"/);
  if (pathMatch) args.path = pathMatch[1];

  const contentKey = '"content":"';
  const contentIdx = candidate.indexOf(contentKey);
  if (contentIdx !== -1) {
    let contentStart = contentIdx + contentKey.length;
    let end = candidate.lastIndexOf('"}}');
    if (end === -1) end = candidate.lastIndexOf('"}');
    if (end === -1) end = candidate.length;
    let raw = candidate.slice(contentStart, end);
    raw = raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    args.content = raw;
  }

  return { tool, args, raw: candidate, repaired: true };
}

function sendDone() {
  if (doneSent) return;
  doneSent = true;
  console.log("✅ done gönderiliyor");
  clearTimeout(stopTimer);
  if (activeObserver) { activeObserver.disconnect(); activeObserver = null; }
  if (copyObserver) { copyObserver.disconnect(); copyObserver = null; }
  if (window.pearData) window.pearData.send('done', {});
  currentEl = null;
}

function hasThinking(el) {
  if (!el) return false;
  if (el.querySelector('[data-writing-block]')) return true;
  const buttons = el.querySelectorAll('button');
  for (const b of buttons) {
    const t = (b.innerText || "").toLowerCase();
    if (t.includes('düşün') || t.includes('dusun') || t.includes('thinking')) return true;
  }
  return false;
}

function scheduleDone() {
  clearTimeout(stopTimer);
  stopTimer = setTimeout(() => {
    if (hasThinking(currentEl)) {
      scheduleDone();
      return;
    }
    console.log(`🛑 ${idleMs / 1000}sn sessizlik fallback, done`);
    sendDone();
  }, idleMs);
}

function watchCopyButton(el) {
  let section = el.closest('section[data-turn="assistant"]');
  if (!section) section = el.closest('[data-testid^="conversation-turn"]');
  if (!section) return;

  if (copyObserver) copyObserver.disconnect();

  function checkCopyButton() {
    if (doneSent) return false;
    const actionGroups = section.querySelectorAll('[role="group"]');
    for (const group of actionGroups) {
      const copyBtn = group.querySelector('[data-testid="copy-turn-action-button"]');
      if (!copyBtn) continue;
      const style = group.getAttribute('style') || '';
      if (style.includes('mask-position: 0%') || style.includes('mask-position:0%')) {
        console.log("📋 Copy button görünür oldu → mesaj bitti!");
        return true;
      }
    }
    return false;
  }

  if (checkCopyButton()) {
    sendDone();
    return;
  }

  copyObserver = new MutationObserver(() => {
    if (doneSent) { copyObserver.disconnect(); return; }
    if (checkCopyButton()) {
      copyObserver.disconnect();
      sendDone();
    }
  });

  copyObserver.observe(section, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
}

function watch(el) {
  const newText = clean(el.textContent || "");
  const isSameMessage = newText.length > 0 && (
    newText.startsWith(lastText) ||
    lastText.startsWith(newText) ||
    newText === lastText
  );

  if (isSameMessage && currentEl !== null) {
    console.log("🔄 Aynı mesaj, DOM element değişti, lastText korunuyor:", lastText.slice(0, 50));
  } else {
    lastText = "";
  }

  currentEl = el;
  doneSent = false;

  if (activeObserver) activeObserver.disconnect();

  let processedOffset = 0;

  activeObserver = new MutationObserver(() => {
    if (doneSent) return;
    const text = clean(el.textContent || "");
    if (!text) return;

    if (text.length < lastText.length && lastText.startsWith(text)) {
      return;
    }

    if (processedOffset > text.length) processedOffset = 0;

    let start = text.indexOf('{', processedOffset);
    while (start !== -1) {
      const end = findJsonEnd(text, start);
      if (end === -1) break;

      const candidate = text.slice(start, end + 1);
      console.log("📦 JSON BİTTİ:", candidate);

      if (window.pearData) {
        const toolPayload = tryParseToolCandidate(candidate);
        if (toolPayload) {
          window.pearData.send('tool', { tool: toolPayload.tool, args: toolPayload.args, raw: candidate });
        } else {
          try {
            const parsed = JSON.parse(candidate);
            window.pearData.send('stream', { type: 'json', content: candidate, parsed });
          } catch (e) {
            window.pearData.send('stream', { type: 'text', content: candidate });
          }
        }
      }
      processedOffset = end + 1;
      start = text.indexOf('{', processedOffset);
    }

    if (text.startsWith(lastText)) {
      const diff = text.slice(lastText.length);
      if (diff.trim()) {
        console.log("⚡", clean(diff));
        if (window.pearData) window.pearData.send('stream', { type: 'text', content: clean(diff) });
      }
      lastText = text;
    } else if (text.trim() !== lastText.trim()) {
      console.log("🔁 FULL:", clean(text));
      if (window.pearData) window.pearData.send('stream', { type: 'text', content: clean(text) });
      lastText = text;
    }

    scheduleDone();
  });

  activeObserver.observe(el, { childList: true, subtree: true, characterData: true });

  watchCopyButton(el);

  setTimeout(() => {
    console.log("⚠️ 120sn fallback, done");
    sendDone();
  }, 120000);
}

const globalObserver = new MutationObserver(() => {
  const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
  const last = msgs[msgs.length - 1];

  if (last && last !== currentEl) {
    console.log("🧠 yeni/değişen assistant element tespit edildi");
    watch(last);
  }
});

globalObserver.observe(document.body, { childList: true, subtree: true });

if (window.pearData) {
  window.pearData.send('askid', {});
}
