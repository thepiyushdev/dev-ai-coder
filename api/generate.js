export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { prompt, history = [], settings = {} } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  const platform = settings.platform || 'mobile';
  const skill = settings.skill || 'senior';
  const focus = settings.focus || 'single_file';

  // 1. PROVIDERS & KEYS POOL (From Vercel Environment Variables)
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

  // 2. ADAPTIVE SYSTEM PROMPT BASED ON SKILLS & PLATFORM
  let platformContext = "";
  if (platform === 'mobile') {
    platformContext = "The user is coding on a MOBILE DEVICE (Termux, Acode, or Android browser). Keep code completely self-contained (HTML/CSS/JS in single index.html whenever possible) so they can test without complex local servers. Provide clean Termux commands when execution is needed.";
  } else {
    platformContext = "The user is coding on a DESKTOP / LAPTOP in VS Code. Provide clean file architectures, terminal installation steps (npm/pip/git), and production-grade project layouts.";
  }

  let skillContext = "";
  if (skill === 'beginner') {
    skillContext = "The user is a BEGINNER. Provide clear, simple, step-by-step guidance on where to paste and run the code without overwhelming jargon.";
  } else {
    skillContext = "The user is a SENIOR DEVELOPER. Be direct, production-focused, and provide clean code with zero fluff.";
  }

  let focusContext = focus === 'single_file' 
    ? "Preferred format: Complete, runnable, single-file code with Tailwind CSS CDN and modern Vanilla JS."
    : "Preferred format: Production modular structure.";

  const systemInstruction = `You are DevAI Coder, an elite multi-agent AI coding intelligence.
${platformContext}
${skillContext}
${focusContext}

STRICT WRITING RULES:
1. Do NOT use weird dramatic punctuation marks, unnecessary ellipses (...), excessive colons, or random emojis.
2. Keep explanations crisp, direct, and cleanly formatted.
3. Output fully written, complete code. Never use placeholders like "// implement later".
4. Always wrap code in proper markdown backticks with language tags (e.g. \`\`\`html, \`\`\`bash).`;

  // Format history for LLM
  const conversation = [
    { role: 'user', parts: [{ text: systemInstruction }] },
    { role: 'model', parts: [{ text: 'Understood. DevAI Coder ready. Writing production code tailored to user platform and experience.' }] },
    ...history.slice(-8).map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    })),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  // 3. FAILOVER EXECUTION PIPELINE
  let generatedCode = null;
  let providerEngine = null;

  // Attempt 1: Gemini Keys Pool
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
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          generatedCode = text;
          providerEngine = `Gemini 2.0 Flash (Core #${i + 1})`;
          break;
        }
      }
    } catch (e) {}
  }

  // Attempt 2: Grok (xAI) Fallback
  if (!generatedCode && grokKey) {
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
        const data = await resp.json();
        generatedCode = data.choices?.[0]?.message?.content;
        providerEngine = 'Grok (xAI Engine)';
      }
    } catch (e) {}
  }

  // Attempt 3: Mistral AI Fallback
  if (!generatedCode && mistralKey) {
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
        const data = await resp.json();
        generatedCode = data.choices?.[0]?.message?.content;
        providerEngine = 'Mistral Codestral';
      }
    } catch (e) {}
  }

  // Attempt 4: OpenRouter (DeepSeek / Free Models)
  if (!generatedCode && openRouterKey) {
    const freeModels = ['qwen/qwen-2.5-coder-32b-instruct', 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct:free'];
    for (const m of freeModels) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterKey}` },
          body: JSON.stringify({
            model: m,
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }]
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          generatedCode = data.choices?.[0]?.message?.content;
          if (generatedCode) {
            providerEngine = `OpenRouter (${m.split('/')[1]})`;
            break;
          }
        }
      } catch (e) {}
    }
  }

  // Attempt 5: Hugging Face Inference
  if (!generatedCode && huggingFaceKey) {
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
        const data = await resp.json();
        generatedCode = data.choices?.[0]?.message?.content;
        providerEngine = 'HuggingFace Qwen-Coder';
      }
    } catch (e) {}
  }

  if (!generatedCode) {
    return res.status(500).json({ error: "All AI providers in the failover pool are temporarily busy. Please retry in a few moments." });
  }

  return res.status(200).json({
    success: true,
    response: generatedCode,
    provider: providerEngine
  });
}
