export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || req.body.fallbackKey;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing on Vercel.' });
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

    const systemInstruction = `You are NexusCode AI, an elite programmer and software architect.
Always structure your answers cleanly:
1. First, provide a brief 'Thinking & Approach' breakdown.
2. Provide clean, well-commented, production-ready code with exact markdown tags.
3. Provide a quick explanation of the logic or complexity calculation.`;

    parts.push({ text: `${systemInstruction}\n\nUser Question:\n${prompt || "Analyze this code/image in detail."}` });

    // Using gemini-2.5-flash with fallback to 1.5-flash
    let model = 'gemini-2.5-flash';
    let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: parts }] })
    });

    if (!response.ok) {
      model = 'gemini-1.5-flash';
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }] })
      });
    }

    const data = await response.json();

    if (data.error) {
      return res.status(response.status).json({ error: data.error.message || 'Gemini API Error' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No code response generated.";
    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({ error: 'Server error: ' + error.message });
  }
}
