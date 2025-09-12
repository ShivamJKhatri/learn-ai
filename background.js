require('dotenv').config();

async function parsePromptWithGemini(prompt) {
  const API_KEY = process.env.GEMINI_API_KEY;

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
Each action is either:
  {"action":"click","text":"intent"} or
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "parse") {
    parsePromptWithGemini(msg.prompt).then(actions => sendResponse(actions));
    return true; // keep channel open
  }
});
