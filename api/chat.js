export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured.' });
  }

  const { prompt, imageBase64, mimeType } = req.body;

  try {
    const parts = [];

    // Multimodal image support
    if (imageBase64 && mimeType) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageBase64
        }
      });
    }

    // System instruction + user prompt for coding
    const systemPrompt = "You are NexusCode AI, an elite software architect and coding assistant. Write clean, production-ready, secure, and bug-free code. Format all code blocks with appropriate language tags in markdown. If analyzing images/UI/errors, pinpoint issues directly and provide corrected code.";
    
    parts.push({ text: `${systemPrompt}\n\nUser Query: ${prompt || "Analyze the provided image."}` });

    // Call Gemini 2.5 Flash (with fallback to 2.0-flash / 1.5-flash if needed)
    const model = 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(response.status).json({ error: data.error.message || 'Gemini API Error' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No code response generated.";
    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({ error: 'Server error processing request: ' + error.message });
  }
}
