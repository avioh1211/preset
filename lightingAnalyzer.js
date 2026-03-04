/**
 * lightingAnalyzer.js
 * Uses Google Gemini Vision API to analyze lighting in a photo
 * Returns structured JSON with all lighting parameters
 */
const LightingAnalyzer = (() => {

  // ══════════════════════════════════════════════════════════════
  // DEFAULT MODEL
  // ══════════════════════════════════════════════════════════════
  let _model = 'gemini-2.0-flash';

  // ══════════════════════════════════════════════════════════════
  // SYSTEM PROMPT
  // ══════════════════════════════════════════════════════════════
  const SYSTEM_PROMPT = `You are an expert studio photographer and lighting technician with 20+ years of experience.

Analyze the provided photo carefully and return ONLY a valid JSON object.
No markdown. No code fences. No explanation. Just raw JSON.

Return exactly these keys:

{
  "lightType": "e.g. Strobe / Monolight / LED / Natural / Tungsten / Fluorescent / Mixed",
  "lightModifier": "e.g. Softbox / Beauty Dish / Ring Light / Umbrella (shoot-through) / Umbrella (reflective) / Bare Bulb / Natural Window / Reflector / Octobox / Parabolic / Strip Box / Snoot / Fresnel",
  "lightPosition": "e.g. Front-left / Front-right / Camera left / Camera right / Directly above / 45° above left / Behind subject (rim) / Side (90°)",
  "lightAngle": "e.g. 45° above / 90° side / 30° above / 0° eye level / 60° above / -15° below",
  "lightDistance": "e.g. Very close (under 1m) / Close (1-2m) / Medium (2-4m) / Far (4m+)",
  "shadowQuality": "e.g. Hard & defined / Soft & diffused / Moderate / Barely visible / Harsh with sharp edges / Feathered",
  "lightPattern": "e.g. Rembrandt / Butterfly / Loop / Split / Flat / Short / Broad / Rim / Clamshell",
  "colorTemperature": "e.g. 2700K (warm tungsten) / 5500K (daylight) / 6500K (cool daylight) / 4000K (neutral LED) / 3200K (tungsten)",
  "colorTempK": 5500,
  "fillLight": "e.g. None / Reflector fill (white) / Reflector fill (silver) / Second strobe fill / Natural bounce / Subtle fill card / Large fill panel",
  "lightingStyle": "e.g. High-key commercial / Low-key dramatic / Moody cinematic / Natural lifestyle / Editorial beauty / Rembrandt portrait / Fashion / Product / Sports",
  "hairLight": "e.g. None / Yes — kicker above / Yes — rim from behind / Yes — strip box above / Yes — bare bulb above",
  "numLights": "1",
  "backgroundLight": "e.g. None / Gradient / Colored gel / Natural / Overexposed white / Dark gradient / Seamless white",
  "description": "Write 2-3 sentences describing the overall lighting setup, what mood or aesthetic it creates, and why a photographer would choose this specific approach.",
  "setupInstructions": "Write 5-6 practical step-by-step instructions explaining exactly how to recreate this lighting setup from scratch. Be specific about equipment placement, angles, distances, and modifiers."
}

Important rules:
- numLights must be a plain number string: "1" or "2" or "3" — not "1 light" or "2 lights"
- colorTempK must be a plain integer number, not a string
- If you are uncertain about something, give your best estimate and add (estimated) after it
- Use proper photographer terminology throughout
- Return ONLY the raw JSON object — nothing else`;

  // ══════════════════════════════════════════════════════════════
  // SET MODEL — call this before analyzeWithModel()
  // ══════════════════════════════════════════════════════════════
  function setModel(modelName) {
    const validModels = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ];

    if (validModels.includes(modelName)) {
      _model = modelName;
      console.log(`[LightingAnalyzer] Model set to: ${_model}`);
    } else {
      console.warn(`[LightingAnalyzer] Unknown model "${modelName}", keeping: ${_model}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ANALYZE — uses current _model
  // ══════════════════════════════════════════════════════════════
  async function analyzeWithModel(imageBase64, apiKey) {

    // ── Validate inputs ──────────────────────────────────────────
    if (!apiKey || !apiKey.startsWith('AIza')) {
      throw new Error('Invalid Gemini API key. It should start with "AIza..."');
    }

    if (!imageBase64 || !imageBase64.startsWith('data:')) {
      throw new Error('Invalid image data. Expected a base64 data URL.');
    }

    // ── Split data URL into mime type + raw base64 ───────────────
    const matches = imageBase64.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length < 3) {
      throw new Error('Could not parse image data URL. The image may be corrupted.');
    }

    const mimeType = matches[1]; // e.g. "image/jpeg"
    const b64Data  = matches[2]; // pure base64 string

    // ── Validate mime type ───────────────────────────────────────
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
    if (!supportedTypes.includes(mimeType.toLowerCase())) {
      throw new Error(`Unsupported image type: ${mimeType}. Please use JPG, PNG, or WEBP.`);
    }

    // ── Build Gemini API URL ─────────────────────────────────────
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${_model}:generateContent?key=${apiKey}`;

    // ── Build request body ───────────────────────────────────────
    const requestBody = {
      system_instruction: {
        parts: [
          { text: SYSTEM_PROMPT }
        ]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data:      b64Data
              }
            },
            {
              text: 'Analyze the lighting in this photo and return ONLY the JSON object as described in your instructions.'
            }
          ]
        }
      ],
      generationConfig: {
        temperature:      0.2,    // Low = more consistent, structured output
        topP:             0.8,
        topK:             40,
        maxOutputTokens:  1500,
        responseMimeType: 'application/json'  // Ask Gemini to respond in JSON mode
      },
      safetySettings: [
        {
          category:  'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE'
        },
        {
          category:  'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE'
        },
        {
          category:  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE'
        },
        {
          category:  'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE'
        }
      ]
    };

    // ── Make the API call ────────────────────────────────────────
    console.log(`[LightingAnalyzer] Sending request to Gemini (${_model})...`);

    let response;
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
    } catch (networkErr) {
      throw new Error(
        'Network error — could not reach the Gemini API.\n' +
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
        errorData = { error: { message: `HTTP ${response.status} ${response.statusText}` } };
      }

      const errMsg = errorData?.error?.message || `HTTP ${response.status}`;

      // Specific error messages for common cases
      if (response.status === 400) {
        throw new Error(`Bad request to Gemini API: ${errMsg}`);
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'API key is invalid or does not have permission to use this model.\n' +
          'Please check your key at https://aistudio.google.com/app/apikey'
        );
      }
      if (response.status === 429) {
        throw new Error(
          'Gemini API quota exceeded.\n' +
          'Please wait a moment and try again, or check your quota at https://ai.google.dev'
        );
      }
      if (response.status === 500 || response.status === 503) {
        throw new Error(
          'Gemini API is temporarily unavailable.\n' +
          'Please try again in a few seconds.'
        );
      }

      throw new Error(`Gemini API error (${response.status}): ${errMsg}`);
    }

    // ── Parse the response ───────────────────────────────────────
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Could not parse the response from Gemini. Please try again.');
    }

    // ── Check for blocked content ─────────────────────────────────
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') {
      throw new Error(
        'The image was blocked by Gemini safety filters.\n' +
        'Please try a different photo.'
      );
    }

    // ── Extract text from response structure ─────────────────────
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error('[LightingAnalyzer] Full response:', JSON.stringify(data, null, 2));
      throw new Error(
        'Gemini returned an empty response.\n' +
        'This may be a temporary issue — please try again.'
      );
    }

    console.log('[LightingAnalyzer] Raw response received, parsing JSON...');

    // ── Clean and parse JSON ─────────────────────────────────────
    // Strip markdown code fences just in case (some models ignore responseMimeType)
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[LightingAnalyzer] Failed to parse JSON:', cleaned);
      throw new Error(
        'Gemini returned a response that could not be parsed as JSON.\n' +
        'Please try again — this is usually a temporary issue.\n\n' +
        'Raw response (first 200 chars):\n' +
        cleaned.slice(0, 200)
      );
    }

    // ── Validate the parsed object has expected fields ────────────
    const requiredFields = [
      'lightType',
      'lightModifier',
      'lightPosition',
      'lightAngle',
      'lightDistance',
      'shadowQuality',
      'lightPattern',
      'colorTemperature',
      'colorTempK',
      'fillLight',
      'lightingStyle',
      'hairLight',
      'numLights',
      'backgroundLight',
      'description',
      'setupInstructions'
    ];

    const missingFields = requiredFields.filter(f => !(f in parsed));
    if (missingFields.length > 0) {
      console.warn('[LightingAnalyzer] Missing fields in response:', missingFields);
      // Fill missing fields with fallback values rather than throwing
      missingFields.forEach(f => {
        if (f === 'colorTempK') {
          parsed[f] = 5500;
        } else if (f === 'numLights') {
          parsed[f] = '1';
        } else {
          parsed[f] = 'Not detected';
        }
      });
    }

    // ── Normalize colorTempK to a number ─────────────────────────
    if (typeof parsed.colorTempK === 'string') {
      const num = parseInt(parsed.colorTempK.replace(/[^0-9]/g, ''), 10);
      parsed.colorTempK = isNaN(num) ? 5500 : num;
    }

    // ── Normalize numLights to a plain string number ──────────────
    if (parsed.numLights) {
      const numMatch = String(parsed.numLights).match(/\d+/);
      parsed.numLights = numMatch ? numMatch[0] : '1';
    }

    console.log('[LightingAnalyzer] Analysis complete:', parsed);

    return parsed;
  }

  // ══════════════════════════════════════════════════════════════
  // ANALYZE — simple wrapper using default model
  // (kept for backwards compatibility)
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

    // Expose current model (read-only)
    get currentModel() {
      return _model;
    }
  };

})();