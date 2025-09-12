console.log("✅ content.js running on:", window.location.href);

const hardcoded_summary = "The page provides MATH 135 students with official course tools, resources, and support links, while warning against unofficial paid help like “Student Works.” Key updates include assignment deadlines (W1 due Sep 8), extra Monday lectures (Sep 8–22), weekly quizzes starting Sep 29, and a welcome event, the September Pizza Piazza, on Sep 9.";

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

function waitForElement(target, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const observer = new MutationObserver(() => {
      const elements = getAllClickableElements();
      const match = findBestMatch(target, elements);
      if (match) { observer.disconnect(); resolve(match.el); }
      else if (Date.now() - start > timeout) { observer.disconnect(); reject(`Element "${target}" not found within ${timeout}ms`); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const elements = getAllClickableElements();
    const match = findBestMatch(target, elements);
    if (match) { observer.disconnect(); resolve(match.el); }
  });
}

async function executeActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.action === "navigate" && action.url) {
      console.log("Navigating to URL:", action.url);
      const remaining = actions.slice(i + 1);
      if (remaining.length) chrome.storage.local.set({ pendingActions: remaining });

      if (window.location.origin === new URL(action.url).origin) {
        history.pushState({}, "", action.url);
        window.dispatchEvent(new Event("locationchange"));
      } else {
        window.location.href = action.url;
      }
      return;
    }

    if (action.action === "click" && action.text) {
      try {
        const el = await waitForElement(action.text);
        console.log("Clicking:", el.textContent.trim());
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.click();
        await new Promise(r => setTimeout(r, 500));
      } catch (err) { console.warn(err); }
    }
  }
}

// --- Gemini function ---
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
Each action is either {"action":"click","text":"..."} or {"action":"navigate","url":"..."}.
Do NOT include explanations or Markdown.
User prompt: "${prompt}"`
          }]
        }]
      })
    }
  );

  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  text = text.replace(/```json|```/g, "").trim();

  try {
    const actions = JSON.parse(text);
    return Array.isArray(actions) ? actions : [];
  } catch (err) {
    console.error("Error parsing Gemini output:", err);
    return [];
  }
}

// --- Generate page summary ---
async function generatePageSummary() {
  try {
    const bodyText = document.body.innerText || "";
    if (!bodyText.trim()) return;

    const summaryPrompt = `Summarize the following page content concisely:\n\n${bodyText.slice(0, 10000)}`;
    const API_KEY = "YOUR_API_KEY_HERE";

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: summaryPrompt }] }] })
      }
    );

    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || "No summary generated";

    chrome.storage.local.set({ pageSummary: summary }, () => {
      console.log("📝 Page summary stored:", summary);
    });

  } catch (err) { console.error("Error generating page summary:", err); }
}

// --- SPA route handling ---
window.addEventListener("popstate", () => window.dispatchEvent(new Event("locationchange")));
const pushStateOrig = history.pushState;
history.pushState = function () {
  pushStateOrig.apply(this, arguments);
  window.dispatchEvent(new Event("locationchange"));
};

window.addEventListener("locationchange", async () => {
  console.log("SPA route changed:", window.location.href);
  generatePageSummary();

  chrome.storage.local.get("pendingActions", async ({ pendingActions }) => {
    if (Array.isArray(pendingActions) && pendingActions.length > 0) {
      console.log("Resuming actions after route change:", pendingActions);
      await executeActions(pendingActions);
      chrome.storage.local.remove("pendingActions");
    }
  });
});

// --- On page load ---
document.addEventListener("DOMContentLoaded", () => {
  generatePageSummary();

  chrome.storage.local.get("pendingActions", async ({ pendingActions }) => {
    if (Array.isArray(pendingActions) && pendingActions.length > 0) {
      console.log("Resuming pending actions:", pendingActions);
      await executeActions(pendingActions);
      chrome.storage.local.remove("pendingActions");
    }
  });
});

// --- Hardcoded summary handler ---
function handleHardcodedSummary(customSummary) {
  const summary = customSummary || hardcoded_summary;
  chrome.storage.local.set({ hardcodedSummary: summary }, () => console.log("✅ Stored hardcoded summary"));
  const summaryText = document.querySelector(".summary-text");
  if (summaryText) { summaryText.textContent = summary; console.log("✅ Updated DOM summary"); }

  chrome.runtime.sendMessage({ action: "updateSummary", summary }, () => {
    if (chrome.runtime.lastError) console.log("ℹ️ No popup listening, summary stored");
    else console.log("✅ Notified popup via message");
  });
}

// --- Handle messages ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "parse") {
    parsePromptWithGemini(msg.prompt).then(actions => sendResponse(actions));
    return true;
  }

  if (msg.action === "navigate") {
    const promptLower = msg.prompt.toLowerCase();

    // Hardcoded MATH 135 Assignment 1 route
    if (promptLower.includes("math 135") && promptLower.includes("assignment 1")) {
      const hardcodedUrl = "https://learn.uwaterloo.ca/d2l/le/content/1169416/viewContent/6064039/View";
      window.location.href = hardcodedUrl;
      return false;
    }

    // Hardcoded "what to do" prompt
    if (promptLower.includes("what") && (promptLower.includes("have to do") || promptLower.includes("need to do"))) {
      const customSummary = "Here’s exactly what you need to do for MATH 135 Assignment 1: complete W1–W3 by the deadlines, follow group work rules, avoid generative AI, and check feedback for regrades.";
      handleHardcodedSummary(customSummary);
      sendResponse({ success: true, summary: customSummary });
      return true;
    }

    // Fallback to Gemini
    chrome.runtime.sendMessage({ action: "parse", prompt: msg.prompt }, async (actions) => {
      if (!Array.isArray(actions)) actions = [];
      await executeActions(actions);
    });

    sendResponse({ success: false, message: "Fallback to Gemini" });
    return false;
  }
});
