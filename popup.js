document.addEventListener('DOMContentLoaded', () => {
  const statusBar = document.getElementById('status-bar');
  const submitBtn = document.querySelector('.submit'); // changed
  const userInput = document.getElementById('user-input'); // changed

  if (!statusBar || !submitBtn || !userInput) {
    console.error('Required elements missing in popup.html');
    return;
  }

  // --- Status check ---
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      statusBar.textContent = 'No active tab ❌';
      statusBar.classList.add('not-learn');
      return;
    }

    const url = tabs[0].url;

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

  // --- Disable submit if input is empty ---
  submitBtn.disabled = true;
  userInput.addEventListener('input', () => {
    submitBtn.disabled = userInput.value.trim() === '';
  });

  // --- Handle prompt submission ---
  submitBtn.addEventListener('click', async (e) => {
    e.preventDefault(); // prevent form submission
    const prompt = userInput.value.trim();
    if (!prompt) return;

    console.log("Popup: sending prompt:", prompt);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) return console.error("No active tab");

      const tabId = tabs[0].id;

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
});
