export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. EXTRACT PROMPT & HISTORY (Handles both Direct Gemini & Custom format)
  let prompt = req.body.prompt || req.body.message || '';
  let rawContents = req.body.contents;
  let history = req.body.history || [];
  let settings = req.body.settings || {};

  if (!prompt && Array.isArray(rawContents) && rawContents.length > 0) {
    try {
      const lastItem = rawContents[rawContents.length - 1];
      prompt = lastItem.parts?.[0]?.text || '';
      history = rawContents.slice(0, -1).map(c => ({
        sender: c.role === 'model' ? 'model' : 'user',
        text: c.parts?.[0]?.text || ''
      }));
    } catch(e) {}
  }

  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  const platform = settings.platform || 'mobile';
  const skill = settings.skill || 'senior';
  const focus = settings.focus || 'single_file';

  // 2. KEYS POOL (From Vercel Env)
  const defaultFallbackKey = Buffer.from("QVEuQWI4Uk42S21oSGdUcVNzRkZhM0dxemxqVjFaVG9XNms0eE5qZ0JhTExsbEU4RzUyQkE=", "base64").toString("utf-8");

  const geminiKeys = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4,
    defaultFallbackKey
  ].filter(Boolean);

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const grokKey = process.env.GROK_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  const huggingFaceKey = process.env.HUGGINGFACE_API_KEY;

  let platformGuide = platform === 'mobile'
    ? "User is on MOBILE (Termux/Acode/Android). Provide self-contained code (single index.html with Tailwind) and clean Termux commands."
    : "User is on DESKTOP (VS Code/Terminal). Provide production modular files and terminal steps.";

  let skillGuide = skill === 'beginner'
    ? "User is a BEGINNER. Explain step-by-step where to paste and run the code."
    : "User is a SENIOR ENGINEER. Direct, clean, production-grade code with zero fluff.";

  const systemInstruction = `You are DevAI Coder, an elite multi-agent AI coding intelligence.
${platformGuide}
${skillGuide}
STRICT RULE: Do NOT use weird dramatic punctuation, excessive ellipses (...), or unnecessary symbols. Output complete, bug-free code inside proper markdown codeblocks.`;

  const conversation = [
    { role: 'user', parts: [{ text: systemInstruction }] },
    { role: 'model', parts: [{ text: 'Ready. DevAI Coder active.' }] },
    ...history.slice(-6).map(m => ({
      role: m.sender === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }]
    })),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  let generatedText = null;
  let engineUsed = null;

  // Failover 1: Gemini Keys Rotation
  for (let i = 0; i < geminiKeys.length; i++) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKeys[i]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: conversation,
          generationConfig: { temperature: 0.25, maxOutputTokens: 8192 }
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t) {
          generatedText = t;
          engineUsed = `Gemini 2.0 Flash (Core #${i + 1})`;
          break;
        }
      }
    } catch(e) {}
  }

  // Failover 2: Grok xAI
  if (!generatedText && grokKey) {
    try {
      const resp = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }]
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        generatedText = d.choices?.[0]?.message?.content;
        engineUsed = 'Grok (xAI)';
      }
    } catch(e) {}
  }

  // Failover 3: Mistral
  if (!generatedText && mistralKey) {
    try {
      const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mistralKey}` },
        body: JSON.stringify({
          model: 'codestral-latest',
          messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }]
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        generatedText = d.choices?.[0]?.message?.content;
        engineUsed = 'Mistral Codestral';
      }
    } catch(e) {}
  }

  // Failover 4: OpenRouter (DeepSeek / Qwen)
  if (!generatedText && openRouterKey) {
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterKey}` },
        body: JSON.stringify({
          model: 'qwen/qwen-2.5-coder-32b-instruct',
          messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }]
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        generatedText = d.choices?.[0]?.message?.content;
        engineUsed = 'OpenRouter (Qwen Coder)';
      }
    } catch(e) {}
  }

  // Failover 5: Hugging Face
  if (!generatedText && huggingFaceKey) {
    try {
      const resp = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Coder-32B-Instruct/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${huggingFaceKey}` },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
          messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }]
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        generatedText = d.choices?.[0]?.message?.content;
        engineUsed = 'HuggingFace Qwen-Coder';
      }
    } catch(e) {}
  }

  if (!generatedText) {
    return res.status(500).json({ error: "All AI engines in the failover pool are currently busy. Please retry in a moment." });
  }

  // Returns both Custom & Google Gemini format so frontend never breaks
  return res.status(200).json({
    success: true,
    response: generatedText,
    provider: engineUsed,
    candidates: [{ content: { parts: [{ text: generatedText }] } }],
    choices: [{ message: { content: generatedText } }]
  });
}
