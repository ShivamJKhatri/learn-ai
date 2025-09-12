document.addEventListener('DOMContentLoaded', () => {
	const statusBar = document.getElementById('status-bar');
	const submitBtn = document.querySelector('.submit');
	const userInput = document.getElementById('user-input');

	// --- Status check ---
	chrome.tabs.query(
		{ active: true, currentWindow: true },
		(tabs) => {
			if (!tabs || tabs.length === 0) {
				statusBar.textContent = 'No active tab ❌';
				statusBar.classList.add('not-learn');
				return;
			}

			const url = tabs[0].url;
			console.log('Active tab:', tabs[0]); // debug

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
		}
	);

	// --- Disable submit if input is empty ---
	submitBtn.disabled = true; // start disabled

	userInput.addEventListener('input', () => {
		if (userInput.value.trim() === '') {
			submitBtn.disabled = true;
		} else {
			submitBtn.disabled = false;
		}
	});
});
