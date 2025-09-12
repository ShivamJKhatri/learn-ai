console.log("✅ content.js running on:", window.location.href);

// --- Utility functions ---
function getAllClickableElements() {
  return Array.from(
    document.querySelectorAll("a, button, div[role='button'], span[role='link']")
  )
    .map(el => {
      let text = Array.from(el.querySelectorAll("*"))
        .map(e => e.textContent?.trim())
        .filter(Boolean)
        .join(" ");
      text = text || el.textContent?.trim();
      return text ? { el, text } : null;
    })
    .filter(Boolean);
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function findBestMatch(target, elements) {
  target = target.toLowerCase().trim();
  return elements.find(el => cleanText(el.text).toLowerCase().includes(target));
}

// --- Wait for element using MutationObserver ---
function waitForElement(target, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const observer = new MutationObserver(() => {
      const elements = getAllClickableElements();
      const match = findBestMatch(target, elements);
      if (match) {
        observer.disconnect();
        resolve(match.el);
      } else if (Date.now() - start > timeout) {
        observer.disconnect();
        reject(`Element "${target}" not found within ${timeout}ms`);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial check in case element already exists
    const elements = getAllClickableElements();
    const match = findBestMatch(target, elements);
    if (match) {
      observer.disconnect();
      resolve(match.el);
    }
  });
}

// --- Execute actions sequentially ---
async function executeActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.action === "navigate" && action.url) {
      console.log("Navigating to URL:", action.url);

      const remaining = actions.slice(i + 1);
      if (remaining.length) chrome.storage.local.set({ pendingActions: remaining });

      // SPA-aware: use history.pushState if same-origin
      if (window.location.origin === new URL(action.url).origin) {
        history.pushState({}, "", action.url);
        window.dispatchEvent(new Event("locationchange"));
      } else {
        window.location.href = action.url;
      }
      return; // stop here, remaining actions resume on route change
    }

    if (action.action === "click" && action.text) {
      try {
        const el = await waitForElement(action.text);
        console.log("Clicking:", el.textContent.trim());
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.click();
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.warn(err);
      }
    }
  }
}

// --- Handle route changes for SPA ---
window.addEventListener("popstate", () => window.dispatchEvent(new Event("locationchange")));
const pushStateOrig = history.pushState;
history.pushState = function () {
  pushStateOrig.apply(this, arguments);
  window.dispatchEvent(new Event("locationchange"));
};

window.addEventListener("locationchange", async () => {
  console.log("SPA route changed:", window.location.href);

  chrome.storage.local.get("pendingActions", async ({ pendingActions }) => {
    if (Array.isArray(pendingActions) && pendingActions.length > 0) {
      console.log("Resuming actions after route change:", pendingActions);
      await executeActions(pendingActions);
      chrome.storage.local.remove("pendingActions");
    }
  });
});

// --- On initial page load, resume any pending actions ---
document.addEventListener("DOMContentLoaded", async () => {
  chrome.storage.local.get("pendingActions", async ({ pendingActions }) => {
    if (Array.isArray(pendingActions) && pendingActions.length > 0) {
      console.log("Resuming pending actions:", pendingActions);
      await executeActions(pendingActions);
      chrome.storage.local.remove("pendingActions");
    }
  });
});

// --- Listen for messages from popup ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "navigate") {
    console.log("Content received prompt:", msg.prompt);
    sendResponse({ status: "received" });

    chrome.runtime.sendMessage({ action: "parse", prompt: msg.prompt }, async (actions) => {
      if (!Array.isArray(actions)) actions = [];
      await executeActions(actions);
    });

    return false;
  }
});

// --- Gemini parsing function ---
async function parsePromptWithGemini(prompt) {
  const API_KEY = "YOUR_API_KEY_HERE";

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": API_KEY },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `
You are an assistant that outputs ONLY a JSON array of actions for navigating Waterloo LEARN.
Each action must be in order, and you can include multiple actions for a single user prompt.
Each action is either:
  {"action":"click","text":"..."} or
  {"action":"navigate","url":"..."}.
Do NOT include explanations or Markdown.
User prompt: "${prompt}"`
          }]
        }]
      })
    }
  );

  const data = await response.json();
  let text = data.candidates[0].content.parts[0].text;
  text = text.replace(/```json|```/g, "").trim();

  try {
    const actions = JSON.parse(text);
    return Array.isArray(actions) ? actions : [];
  } catch (err) {
    console.error("Error parsing Gemini output:", err);
    return [];
  }
}

// --- Handle parse requests ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "parse") {
    parsePromptWithGemini(msg.prompt).then(actions => sendResponse(actions));
    return true;
  }
});
