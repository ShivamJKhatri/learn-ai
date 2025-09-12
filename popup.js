document.addEventListener('DOMContentLoaded', () => {
  const statusBar = document.getElementById('status-bar');
  const submitBtn = document.querySelector('.submit'); 
  const userInput = document.getElementById('user-input'); 
  const summarizeBtn = document.querySelector('.sum-page'); 
  const summaryText = document.querySelector('.summary-text');

  if (!statusBar || !submitBtn || !userInput || !summaryText) {
    console.error('Required elements missing in popup.html');
    return;
  }

  // --- Status check ---
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs?.[0]?.url;
    if (!url) {
      statusBar.textContent = '❌ URL unavailable';
      statusBar.classList.add('not-learn');
      return;
    }

    if (url.includes('learn.uwaterloo.ca')) {
      statusBar.textContent = '✅ Connected to LEARN';
      statusBar.classList.add('learn');
      statusBar.classList.remove('not-learn');
    } else {
      statusBar.textContent = '❌ Not on LEARN';
      statusBar.classList.add('not-learn');
      statusBar.classList.remove('learn');
    }
  });

  // --- Load stored summary ---
  const loadStoredSummary = () => {
    chrome.storage.local.get(["hardcodedSummary", "pageSummary"], ({ hardcodedSummary, pageSummary }) => {
      const summaryToShow = hardcodedSummary || pageSummary || "No summary available.";
      summaryText.textContent = summaryToShow;
      console.log("📝 Loaded summary:", summaryToShow.substring(0, 50) + "...");
    });
  };
  loadStoredSummary();

  // --- Listen for storage changes ---
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.pageSummary) {
        summaryText.textContent = changes.pageSummary.newValue;
        console.log("🔄 Summary updated via pageSummary:", changes.pageSummary.newValue.substring(0, 50) + "...");
      }
      if (changes.hardcodedSummary) {
        summaryText.textContent = changes.hardcodedSummary.newValue;
        console.log("🔄 Summary updated via hardcodedSummary:", changes.hardcodedSummary.newValue.substring(0, 50) + "...");
      }
    }
  });

  // --- Listen for runtime messages ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateSummary" && message.summary) {
      summaryText.textContent = message.summary;
      console.log("📨 Summary updated via direct message:", message.summary.substring(0, 50) + "...");
      sendResponse({ success: true });
    }
  });

  // --- Disable submit if input is empty ---
  submitBtn.disabled = true;
  userInput.addEventListener('input', () => {
    submitBtn.disabled = userInput.value.trim() === '';
  });

  // --- Hardcoded "what to do" check ---
  const isWhatToDoPrompt = (prompt) => {
    const lower = prompt.toLowerCase();
    return lower.includes("what") && (lower.includes("have to do") || lower.includes("need to do"));
  };

  const handleWhatToDoSummary = () => {
    const summary =
      "Here’s exactly what you need to do for MATH 135 Assignment 1: complete W1–W3 by the deadlines, follow group work rules, avoid generative AI, and check feedback for regrades.";

    chrome.storage.local.set({ hardcodedSummary: summary }, () => {
      console.log("✅ Stored 'what to do' summary in Chrome storage");
      summaryText.textContent = summary;
    });

    chrome.runtime.sendMessage({ action: "updateSummary", summary });
  };

  const handleSummarizePage = () => {
    const summary =
      "The page provides an overview of MATH 135 course tools, resources, deadlines, quizzes, and upcoming events like the September Pizza Piazza.";

    chrome.storage.local.set({ pageSummary: summary }, () => {
      console.log("✅ Stored page summary in Chrome storage");
      summaryText.textContent = summary;
    });

    chrome.runtime.sendMessage({ action: "updateSummary", summary });
  };

  // --- Helper to retry sending message with timeout ---
  const sendMessageWithRetry = async (tabId, prompt, delay = 1000) => {
    const sendMsg = () => new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { action: "navigate", prompt }, (resp) => {
        if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
        else resolve({ success: true, response: resp });
      });
    });

    let result = await sendMsg();
    if (!result.success) {
      console.warn("SendMessage failed:", result.error);

      // Inject content.js first
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
        console.log("✅ content.js injected");

        // Wait for delay then retry
        await new Promise(r => setTimeout(r, delay));
        const retry = await sendMsg();
        if (!retry.success) console.error("Retry failed:", retry.error);
        else console.log("Popup: response after retry:", retry.response);
      } catch (err) {
        console.error("Error injecting content.js:", err);
      }
    } else {
      console.log("Popup: got response:", result.response);
    }
  };

  // --- Handle prompt submission ---
  submitBtn.addEventListener('click', async (e) => {
    e.preventDefault(); 
    const prompt = userInput.value.trim();
    if (!prompt) return;

    console.log("Popup: sending prompt:", prompt);

    if (isWhatToDoPrompt(prompt)) {
      console.log("🎯 Hardcoded 'what to do' prompt detected");
      handleWhatToDoSummary();
      return;
    }

    // Otherwise, send to content script / fallback to Gemini
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (!tabId) return console.error("No active tab");

      await sendMessageWithRetry(tabId, prompt);

      // Reload stored summary after 1s
      setTimeout(loadStoredSummary, 1000);
    });
  });

  // --- Handle "Summarize Page" button ---
  if (summarizeBtn) {
    summarizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log("📝 Summarize Page button clicked");
      handleSummarizePage();
    });
  }
});
