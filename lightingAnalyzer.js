/**
 * lightingAnalyzer.js
 * Uses Groq Vision API to analyze lighting in a photo
 * Free API — get your key at https://console.groq.com
 */
const LightingAnalyzer = (() => {

  // ══════════════════════════════════════════════════════════════
  // DEFAULT MODEL
  // ══════════════════════════════════════════════════════════════
  let _model = 'meta-llama/llama-4-scout-17b-16e-instruct';

  // ══════════════════════════════════════════════════════════════
  // AVAILABLE GROQ VISION MODELS
  // ══════════════════════════════════════════════════════════════
  const GROQ_MODELS = [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llava-v1.5-7b-4096-preview',
  ];

  // ══════════════════════════════════════════════════════════════
  // SYSTEM PROMPT
  // ══════════════════════════════════════════════════════════════
  const SYSTEM_PROMPT = `You are an expert studio photographer and lighting technician with 20+ years of experience.

Analyze the provided photo carefully and return ONLY a valid JSON object.
No markdown. No code fences. No explanation. Just raw JSON.

Return exactly these keys:

{
  "lightType": "e.g. Strobe / Monolight / LED / Natural / Tungsten / Fluorescent / Mixed",
  "lightModifier": "e.g. Softbox / Beauty Dish / Ring Light / Umbrella shoot-through / Umbrella reflective / Bare Bulb / Natural Window / Reflector / Octobox / Parabolic / Strip Box / Snoot / Fresnel",
  "lightPosition": "e.g. Front-left / Front-right / Camera left / Camera right / Directly above / 45 above left / Behind subject rim / Side 90",
  "lightAngle": "e.g. 45 above / 90 side / 30 above / 0 eye level / 60 above / -15 below",
  "lightDistance": "e.g. Very close under 1m / Close 1-2m / Medium 2-4m / Far 4m+",
  "shadowQuality": "e.g. Hard and defined / Soft and diffused / Moderate / Barely visible / Harsh with sharp edges / Feathered",
  "lightPattern": "e.g. Rembrandt / Butterfly / Loop / Split / Flat / Short / Broad / Rim / Clamshell",
  "colorTemperature": "e.g. 2700K warm tungsten / 5500K daylight / 6500K cool daylight / 4000K neutral LED / 3200K tungsten",
  "colorTempK": 5500,
  "fillLight": "e.g. None / Reflector fill white / Reflector fill silver / Second strobe fill / Natural bounce / Subtle fill card / Large fill panel",
  "lightingStyle": "e.g. High-key commercial / Low-key dramatic / Moody cinematic / Natural lifestyle / Editorial beauty / Rembrandt portrait / Fashion / Product / Sports",
  "hairLight": "e.g. None / Yes kicker above / Yes rim from behind / Yes strip box above / Yes bare bulb above",
  "numLights": "1",
  "backgroundLight": "e.g. None / Gradient / Colored gel / Natural / Overexposed white / Dark gradient / Seamless white",
  "description": "Write 2-3 sentences describing the overall lighting setup, what mood or aesthetic it creates, and why a photographer would choose this approach.",
  "setupInstructions": "Write 5-6 practical step-by-step instructions explaining exactly how to recreate this lighting setup from scratch. Be specific about equipment placement, angles, distances, and modifiers."
}

Important rules:
- numLights must be a plain number string like 1 or 2 or 3
- colorTempK must be a plain integer number not a string
- If uncertain give your best estimate and add estimated after it
- Use proper photographer terminology
- Return ONLY the raw JSON object nothing else`;

  // ══════════════════════════════════════════════════════════════
  // SET MODEL
  // ══════════════════════════════════════════════════════════════
  function setModel(modelName) {
    _model = modelName;
    console.log(`[LightingAnalyzer] Model set to: ${_model}`);
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN ANALYZE FUNCTION WITH FALLBACK
  // ══════════════════════════════════════════════════════════════
  async function analyzeWithModel(imageBase64, apiKey) {

    // ── Validate API key ─────────────────────────────────────────
    if (!apiKey || apiKey.length < 20) {
      throw new Error(
        'Invalid Groq API key.\n' +
        'Get a free key at https://console.groq.com\n' +
        'Your key should start with gsk_...'
      );
    }

    // ── Validate image ───────────────────────────────────────────
    if (!imageBase64 || !imageBase64.startsWith('data:')) {
      throw new Error('Invalid image data. Expected a base64 data URL.');
    }

    // ── Build fallback chain ─────────────────────────────────────
    // Try selected model first, then fall back to others on rate limit
    const modelsToTry = [
      _model,
      ...GROQ_MODELS.filter(m => m !== _model)
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    let lastError = null;

    for (let attempt = 0; attempt < modelsToTry.length; attempt++) {

      const modelToTry = modelsToTry[attempt];
      const isRetry    = attempt > 0;

      if (isRetry) {
        console.log(`[LightingAnalyzer] Retrying with fallback model: ${modelToTry}`);
        await sleep(1500);
      } else {
        console.log(`[LightingAnalyzer] Calling Groq API (${modelToTry})...`);
      }

      try {
        const result = await callGroq(imageBase64, apiKey, modelToTry);

        if (isRetry) {
          console.log(`[LightingAnalyzer] Success with fallback model: ${modelToTry}`);
        }

        return result;

      } catch (err) {
        lastError = err;
        console.warn(`[LightingAnalyzer] Error on ${modelToTry}:`, err.message);

        // Only try next model if rate limited
        if (
          err.message.includes('429') ||
          err.message.includes('rate') ||
          err.message.includes('quota') ||
          err.message.includes('limit')
        ) {
          if (attempt < modelsToTry.length - 1) {
            console.log(`[LightingAnalyzer] Rate limited — trying next model...`);
            continue;
          }
        }

        // For any other error throw immediately
        throw err;
      }
    }

    // All models failed with rate limit
    throw new Error(
      'All Groq models are currently rate limited.\n\n' +
      'Please wait 60 seconds and try again.\n\n' +
      'Last error: ' + (lastError?.message || 'Unknown error')
    );
  }

  // ══════════════════════════════════════════════════════════════
  // CORE GROQ API CALL
  // ══════════════════════════════════════════════════════════════
  async function callGroq(imageBase64, apiKey, model) {

    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const requestBody = {
      model:       model,
      max_tokens:  1500,
      temperature: 0.2,
      messages: [
        {
          role:    'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url:    imageBase64,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: 'Analyze the lighting in this photo and return ONLY the JSON object as described in your instructions.'
            }
          ]
        }
      ]
    };

    // ── Make the API call ────────────────────────────────────────
    let response;
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
    } catch (networkErr) {
      throw new Error(
        'Network error — could not reach Groq API.\n' +
        'Please check your internet connection.\n\n' +
        'Details: ' + networkErr.message
      );
    }

    // ── Handle HTTP errors ───────────────────────────────────────
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = {};
      }

      const errMsg = errorData?.error?.message || `HTTP ${response.status}`;

      if (response.status === 429) {
        throw new Error(`429: Rate limited — ${errMsg}`);
      }
      if (response.status === 401) {
        throw new Error(
          'Invalid Groq API key.\n' +
          'Please check your key at https://console.groq.com\n' +
          'Your key should start with gsk_...'
        );
      }
      if (response.status === 400) {
        throw new Error(
          `Bad request: ${errMsg}\n` +
          'This might be because the image is too large. Try a smaller image.'
        );
      }
      if (response.status === 413) {
        throw new Error(
          'Image is too large for Groq API.\n' +
          'Please try a smaller image (under 4MB recommended).'
        );
      }
      if (response.status === 500 || response.status === 503) {
        throw new Error(
          'Groq API is temporarily unavailable.\n' +
          'Please try again in a few seconds.'
        );
      }

      throw new Error(`Groq API error (${response.status}): ${errMsg}`);
    }

    // ── Parse response ────────────────────────────────────────────
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Could not parse the response from Groq. Please try again.');
    }

    const rawText = data?.choices?.[0]?.message?.content || '';

    if (!rawText) {
      console.error('[LightingAnalyzer] Full response:', JSON.stringify(data, null, 2));
      throw new Error(
        'Groq returned an empty response.\n' +
        'Please try again — this is usually temporary.'
      );
    }

    console.log('[LightingAnalyzer] Raw response received, parsing JSON...');

    // ── Clean and parse JSON ──────────────────────────────────────
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[LightingAnalyzer] Failed to parse JSON. Raw text:', cleaned);
      throw new Error(
        'Could not parse the AI response as JSON.\n' +
        'Please try again — this is usually a temporary issue.\n\n' +
        'Raw response (first 200 chars):\n' +
        cleaned.slice(0, 200)
      );
    }

    // ── Fill any missing fields ───────────────────────────────────
    const requiredFields = [
      'lightType', 'lightModifier', 'lightPosition', 'lightAngle',
      'lightDistance', 'shadowQuality', 'lightPattern', 'colorTemperature',
      'colorTempK', 'fillLight', 'lightingStyle', 'hairLight',
      'numLights', 'backgroundLight', 'description', 'setupInstructions'
    ];

    const missingFields = requiredFields.filter(f => !(f in parsed));
    if (missingFields.length > 0) {
      console.warn('[LightingAnalyzer] Missing fields, filling with fallbacks:', missingFields);
      missingFields.forEach(f => {
        if (f === 'colorTempK')  parsed[f] = 5500;
        else if (f === 'numLights') parsed[f] = '1';
        else parsed[f] = 'Not detected';
      });
    }

    // ── Normalize colorTempK to a number ─────────────────────────
    if (typeof parsed.colorTempK === 'string') {
      const num = parseInt(parsed.colorTempK.replace(/[^0-9]/g, ''), 10);
      parsed.colorTempK = isNaN(num) ? 5500 : num;
    }

    // ── Normalize numLights to plain number string ────────────────
    if (parsed.numLights) {
      const numMatch = String(parsed.numLights).match(/\d+/);
      parsed.numLights = numMatch ? numMatch[0] : '1';
    }

    console.log('[LightingAnalyzer] Analysis complete:', parsed);
    return parsed;
  }

  // ══════════════════════════════════════════════════════════════
  // SLEEP UTILITY
  // ══════════════════════════════════════════════════════════════
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ══════════════════════════════════════════════════════════════
  // BACKWARDS COMPAT WRAPPER
  // ══════════════════════════════════════════════════════════════
  async function analyze(imageBase64, apiKey) {
    return analyzeWithModel(imageBase64, apiKey);
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════
  return {
    analyze,
    analyzeWithModel,
    setModel,
    get currentModel() { return _model; }
  };

})();
