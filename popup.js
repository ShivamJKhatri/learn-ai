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

  // --- Load stored page summary ---
  chrome.storage.local.get("pageSummary", ({ pageSummary }) => {
    summaryText.textContent = pageSummary || "No summary available.";
  });

  // --- Disable submit if input is empty ---
  submitBtn.disabled = true;
  userInput.addEventListener('input', () => {
    submitBtn.disabled = userInput.value.trim() === '';
  });

  // --- Handle prompt submission ---
  submitBtn.addEventListener('click', async (e) => {
    e.preventDefault(); 
    const prompt = userInput.value.trim();
    if (!prompt) return;

    console.log("Popup: sending prompt:", prompt);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (!tabId) return console.error("No active tab");

      const sendMsg = () => new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: "navigate", prompt }, (resp) => {
          if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
          else resolve({ success: true, response: resp });
        });
      });

      let result = await sendMsg();

      if (!result.success) {
        console.warn("SendMessage failed:", result.error);
        chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, async () => {
          setTimeout(async () => {
            const retry = await sendMsg();
            if (!retry.success) console.error("Retry failed:", retry.error);
            else console.log("Popup: response after retry:", retry.response);
          }, 100);
        });
      } else console.log("Popup: got response:", result.response);
    });
  });

  // --- Handle "Summarize Page" button ---
  if (summarizeBtn) {
    summarizeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;
        if (!tabId) return;

        // Tell content.js to generate a new summary
        chrome.tabs.sendMessage(tabId, { action: "summarize" });
      });
    });
  }
});
