export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || req.body.apiKey;
  if (!apiKey) {
    return res.status(400).json({ error: 'Gemini API Key missing. Please provide or set key.' });
  }

  const { prompt, imageBase64, mimeType } = req.body;

  try {
    const parts = [];

    if (imageBase64 && mimeType) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageBase64
        }
      });
    }

    const systemPrompt = "You are NexusCode AI, an expert programmer. Analyze the input, explain the logic/thinking briefly, and write clean, formatted, production-ready code with markdown tags.";
    parts.push({ text: `${systemPrompt}\n\n${prompt || "Analyze the attached image."}` });

    const models = ['gemini-3.8-flash', 'gemini-3.8-flash'];
    let resultData = null;
    let lastError = null;

    for (const m of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          resultData = data.candidates[0].content.parts[0].text;
          break;
        } else if (data.error) {
          lastError = data.error.message;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (resultData) {
      return res.status(200).json({ reply: resultData });
    } else {
      return res.status(500).json({ error: lastError || 'Failed to get response from Gemini.' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
}
