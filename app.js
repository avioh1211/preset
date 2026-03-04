/**
 * app.js — Main controller for LightLens AI
 * Using Groq Vision API (free)
 * Get your key at https://console.groq.com
 */
(() => {

  // ══════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════
  let currentFile     = null;
  let currentAnalysis = null;
  let currentColors   = null;
  let currentPreset   = null;

  // ══════════════════════════════════════════════════════════════
  // DOM ELEMENTS
  // ══════════════════════════════════════════════════════════════
  const uploadZone     = document.getElementById('uploadZone');
  const fileInput      = document.getElementById('fileInput');
  const apiKeyInput    = document.getElementById('apiKey');
  const saveApiBtn     = document.getElementById('saveApiKey');
  const toggleKeyBtn   = document.getElementById('toggleKeyVis');
  const modelSelect    = document.getElementById('modelSelect');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const results        = document.getElementById('results');
  const previewImg     = document.getElementById('previewImg');
  const downloadBtn    = document.getElementById('downloadXMP');
  const copyBtn        = document.getElementById('copyPreset');
  const resetBtn       = document.getElementById('resetBtn');

  // ══════════════════════════════════════════════════════════════
  // INIT — restore saved key
  // ══════════════════════════════════════════════════════════════
  const savedKey = sessionStorage.getItem('ll_apikey') || '';
  if (savedKey) {
    apiKeyInput.value = savedKey;
  }

  // ══════════════════════════════════════════════════════════════
  // SAVE API KEY
  // ══════════════════════════════════════════════════════════════
  saveApiBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();

    // Groq keys start with gsk_
    if (!key.startsWith('gsk_') || key.length < 20) {
      flashButton(saveApiBtn, 'Invalid key!', '#ef4444', '#fff');
      return;
    }

    sessionStorage.setItem('ll_apikey', key);
    flashButton(saveApiBtn, '✓ Saved', '#4ade80', '#000');
  });

  // ══════════════════════════════════════════════════════════════
  // TOGGLE KEY VISIBILITY
  // ══════════════════════════════════════════════════════════════
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      const icon = toggleKeyBtn.querySelector('i');
      if (icon) {
        icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // UPLOAD ZONE — Click
  // ══════════════════════════════════════════════════════════════
  uploadZone.addEventListener('click', (e) => {
    if (e.target.tagName === 'LABEL') return;
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // ══════════════════════════════════════════════════════════════
  // UPLOAD ZONE — Drag and Drop
  // ══════════════════════════════════════════════════════════════
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.add('dragging');
  });

  uploadZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragging');
  });

  uploadZone.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    if (!uploadZone.contains(e.relatedTarget)) {
      uploadZone.classList.remove('dragging');
    }
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove('dragging');

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Please drop an image file (JPG, PNG, WEBP, BMP).');
      return;
    }

    handleFile(file);
  });

  // ══════════════════════════════════════════════════════════════
  // HANDLE FILE — Main Flow
  // ══════════════════════════════════════════════════════════════
  async function handleFile(file) {

    // ── Get API key ──────────────────────────────────────────────
    const apiKey = apiKeyInput.value.trim() || sessionStorage.getItem('ll_apikey') || '';

    // Groq key validation — starts with gsk_
    if (!apiKey || !apiKey.startsWith('gsk_') || apiKey.length < 20) {
      showError(
        'Please enter a valid Groq API key.\n\n' +
        'Your key should start with "gsk_..."\n\n' +
        'Get a FREE key at:\nhttps://console.groq.com'
      );
      apiKeyInput.focus();
      return;
    }

    // ── File size check ──────────────────────────────────────────
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      showError(
        `File is too large (${formatFileSize(file.size)}).\n` +
        'Maximum allowed size is 20MB.\n\n' +
        'Tip: For best results keep images under 4MB.'
      );
      return;
    }

    // ── File type check ──────────────────────────────────────────
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file (JPG, PNG, WEBP, BMP).');
      return;
    }

    // ── Set selected model ───────────────────────────────────────
    if (modelSelect && LightingAnalyzer.setModel) {
      LightingAnalyzer.setModel(modelSelect.value);
    }

    currentFile = file;
    showResults(false);
    showLoading(true);
    setLoadingText('Preparing your photo...');
    resetAllSteps();

    try {

      // ── STEP 1: Read file ────────────────────────────────────────
      setStep(1, 'active');
      setLoadingText('Reading your photo...');

      const base64 = await fileToBase64(file);

      previewImg.src = base64;
      previewImg.alt = file.name || 'Uploaded photo';
      await waitForImage(previewImg);

      setStep(1, 'done');
      await sleep(150);

      // ── STEP 2: AI Analysis ──────────────────────────────────────
      setStep(2, 'active');
      setLoadingText('AI is reading the light sources...');

      currentAnalysis = await LightingAnalyzer.analyzeWithModel(base64, apiKey);

      setStep(2, 'done');
      await sleep(150);

      // ── STEP 3: Color Extraction ─────────────────────────────────
      setStep(3, 'active');
      setLoadingText('Extracting color palette...');

      await sleep(50);
      currentColors = ColorExtractor.extract(previewImg, 8);

      setStep(3, 'done');
      await sleep(150);

      // ── STEP 4: Build Preset ─────────────────────────────────────
      setStep(4, 'active');
      setLoadingText('Building Lightroom preset...');

      currentPreset = PresetGenerator.buildPresetValues(currentAnalysis, currentColors);

      await sleep(400);
      setStep(4, 'done');
      await sleep(300);

      // ── Render ───────────────────────────────────────────────────
      renderResults(currentAnalysis, currentColors, currentPreset);

      showLoading(false);
      showResults(true);

      await sleep(100);
      drawLightDiagram(currentAnalysis);

      results.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      showLoading(false);
      console.error('[LightLens] Error:', err);

      let message = 'Something went wrong.\n\n';

      if (err.message.includes('429') || err.message.includes('rate') || err.message.includes('quota')) {
        message =
          'Rate limit reached on all models.\n\n' +
          'Please wait 60 seconds and try again.\n\n' +
          'Or switch to a different model in the dropdown.';
      } else if (err.message.includes('401') || err.message.includes('Invalid Groq')) {
        message =
          'Invalid API key.\n\n' +
          'Please check your Groq key.\n' +
          'It should start with "gsk_..."\n\n' +
          'Get a free key at: https://console.groq.com';
      } else if (err.message.includes('network') || err.message.includes('fetch') || err.message.includes('Network')) {
        message =
          'Network error.\n\n' +
          'Please check your internet connection and try again.';
      } else if (err.message.includes('JSON') || err.message.includes('parse')) {
        message =
          'The AI returned an unexpected response.\n\n' +
          'Please try again — this is usually temporary.';
      } else {
        message += err.message;
      }

      showError(message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER ALL RESULTS
  // ══════════════════════════════════════════════════════════════
  function renderResults(analysis, colors, preset) {
    if (!analysis || !colors || !preset) return;
    renderLightingAnalysis(analysis);
    renderColorPalette(colors);
    renderPresetSliders(preset);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — Lighting Analysis
  // ══════════════════════════════════════════════════════════════
  function renderLightingAnalysis(analysis) {
    setText('lightType',       analysis.lightType         || 'Not detected');
    setText('lightModifier',   analysis.lightModifier     || 'Not detected');
    setText('lightPosition',   analysis.lightPosition     || 'Not detected');
    setText('lightAngle',      analysis.lightAngle        || 'Not detected');
    setText('lightDistance',   analysis.lightDistance     || 'Not detected');
    setText('shadowQuality',   analysis.shadowQuality     || 'Not detected');
    setText('lightPattern',    analysis.lightPattern      || 'Not detected');
    setText('colorTemp',       analysis.colorTemperature  || 'Not detected');
    setText('fillLight',       analysis.fillLight         || 'None detected');
    setText('lightStyle',      analysis.lightingStyle     || 'Not detected');
    setText('hairLight',       analysis.hairLight         || 'None detected');
    setText('backgroundLight', analysis.backgroundLight   || 'None detected');
    setText('aiDescription',   analysis.description       || 'No description available.');
    setText('setupRec',        analysis.setupInstructions || 'No instructions available.');
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — Color Palette
  // ══════════════════════════════════════════════════════════════
  function renderColorPalette(colors) {
    const swatchContainer = document.getElementById('paletteSwatches');
    const detailContainer = document.getElementById('paletteDetails');
    if (!swatchContainer || !detailContainer) return;

    swatchContainer.innerHTML = '';
    detailContainer.innerHTML = '';

    colors.forEach((color) => {

      // Swatch
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.style.background = color.hex;
      swatch.title = `Click to copy ${color.hex.toUpperCase()}`;
      swatch.setAttribute('role', 'button');
      swatch.setAttribute('tabindex', '0');

      const label = document.createElement('span');
      label.className = 'swatch-label';
      label.textContent = color.hex.toUpperCase();
      swatch.appendChild(label);

      const copyHex = () => {
        navigator.clipboard.writeText(color.hex.toUpperCase())
          .then(() => {
            const orig = label.textContent;
            label.textContent = 'Copied!';
            swatch.style.outline = '2px solid #4ade80';
            setTimeout(() => {
              label.textContent = orig;
              swatch.style.outline = '';
            }, 1200);
          })
          .catch(() => {
            prompt('Copy this HEX color:', color.hex.toUpperCase());
          });
      };

      swatch.addEventListener('click', copyHex);
      swatch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          copyHex();
        }
      });

      swatchContainer.appendChild(swatch);

      // Detail chip
      const chip = document.createElement('div');
      chip.className = 'palette-chip';
      chip.innerHTML = `
        <div class="chip-dot" style="background: ${color.hex}"></div>
        <span class="chip-hex">${color.hex.toUpperCase()}</span>
        <span class="chip-rgb">${color.rgb}</span>
      `;
      detailContainer.appendChild(chip);
    });

    setText('paletteMood',       ColorExtractor.getMoodFromColors(colors));
    setText('paletteTone',       ColorExtractor.getToneFromColors(colors));
    setText('paletteSaturation', ColorExtractor.getSaturationLevel(colors));
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — Preset Sliders
  // ══════════════════════════════════════════════════════════════
  function renderPresetSliders(preset) {
    const grid = document.getElementById('presetGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const sliderDefs = [
      { key: 'Exposure',    label: 'Exposure',     min: -5,   max: 5,    unit: ' EV', decimals: 2 },
      { key: 'Contrast',    label: 'Contrast',     min: -100, max: 100,  unit: ''    },
      { key: 'Highlights',  label: 'Highlights',   min: -100, max: 100,  unit: ''    },
      { key: 'Shadows',     label: 'Shadows',      min: -100, max: 100,  unit: ''    },
      { key: 'Whites',      label: 'Whites',       min: -100, max: 100,  unit: ''    },
      { key: 'Blacks',      label: 'Blacks',       min: -100, max: 100,  unit: ''    },
      { key: 'Clarity',     label: 'Clarity',      min: -100, max: 100,  unit: ''    },
      { key: 'Dehaze',      label: 'Dehaze',       min: -100, max: 100,  unit: ''    },
      { key: 'Vibrance',    label: 'Vibrance',     min: -100, max: 100,  unit: ''    },
      { key: 'Saturation',  label: 'Saturation',   min: -100, max: 100,  unit: ''    },
      { key: 'Temperature', label: 'Temp',         min: 2000, max: 9000, unit: ' K'  },
      { key: 'Tint',        label: 'Tint',         min: -150, max: 150,  unit: ''    },
      { key: 'Vignette',    label: 'Vignette',     min: -100, max: 100,  unit: ''    },
      { key: 'Sharpness',   label: 'Sharpness',    min: 0,    max: 150,  unit: ''    },
      { key: 'LuminanceNR', label: 'Luminance NR', min: 0,    max: 100,  unit: ''    },
      { key: 'ColorNR',     label: 'Color NR',     min: 0,    max: 100,  unit: ''    },
    ];

    sliderDefs.forEach((def) => {
      const rawValue  = preset[def.key] ?? 0;
      const value     = def.decimals
        ? parseFloat(rawValue.toFixed(def.decimals))
        : Math.round(rawValue);
      const range     = def.max - def.min;
      const pct       = ((value - def.min) / range) * 100;
      const clamped   = Math.max(0, Math.min(100, pct));
      const isNeg     = def.min < 0 && value < 0 && def.key !== 'Temperature';
      const sign      = value > 0 ? '+' : '';
      const valClass  = isNeg ? 'neg' : 'pos';
      const fillClass = isNeg ? 'negative' : '';
      const displayValue = def.decimals
        ? `${sign}${value.toFixed(def.decimals)}`
        : `${sign}${value}`;

      const item = document.createElement('div');
      item.className = 'preset-item';
      item.innerHTML = `
        <div class="preset-name">${def.label}</div>
        <div class="preset-slider-track">
          <div class="preset-slider-fill ${fillClass}" style="width: ${clamped}%"></div>
        </div>
        <div class="preset-value ${valClass}">${displayValue}${def.unit}</div>
      `;
      grid.appendChild(item);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // CANVAS — Draw Lighting Diagram
  // ══════════════════════════════════════════════════════════════
  function drawLightDiagram(analysis) {
    const canvas = document.getElementById('lightDiagram');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;
    const cx  = W / 2;
    const cy  = H / 2 + 20;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#1a1e2a';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#2a2f3e';
    ctx.lineWidth   = 1;
    for (let x = 0; x <= W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Title
    ctx.fillStyle    = '#7a7f96';
    ctx.font         = '11px Inter, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('LIGHTING DIAGRAM — TOP VIEW', cx, 20);

    // Subject glow
    const glowGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 55);
    glowGrad.addColorStop(0, 'rgba(245,166,35,0.1)');
    glowGrad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, 55, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Subject circle
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle   = '#2a2f3e';
    ctx.fill();
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.fillStyle    = '#f5a623';
    ctx.font         = 'bold 10px Inter, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SUBJECT', cx, cy);
    ctx.textBaseline = 'alphabetic';

    // Camera
    const camX = cx;
    const camY = H - 38;

    ctx.fillStyle   = '#1e3a5f';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect(camX - 26, camY - 15, 52, 30, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle    = '#60a5fa';
    ctx.font         = 'bold 10px Inter, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📷 CAM', camX, camY);
    ctx.textBaseline = 'alphabetic';

    // Camera → Subject dashed line
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = '#3b4160';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(camX, camY - 15);
    ctx.lineTo(cx, cy + 28);
    ctx.stroke();
    ctx.setLineDash([]);

    // Key light
    const keyAngle = parsePositionToAngle(analysis.lightPosition);
    const keyDist  = parseDistanceToPx(analysis.lightDistance);
    drawLightSource(ctx, cx, cy, keyAngle, keyDist, '#f5a623', 'KEY');

    // Fill light
    const hasFill = analysis.fillLight &&
                    !analysis.fillLight.toLowerCase().includes('none');
    if (hasFill) {
      drawLightSource(ctx, cx, cy, keyAngle + 140, keyDist * 0.75, '#e056fd', 'FILL');
    }

    // Hair light
    const hasHair = analysis.hairLight &&
                    !analysis.hairLight.toLowerCase().includes('none');
    if (hasHair) {
      drawLightSource(ctx, cx, cy, keyAngle + 175, keyDist * 0.65, '#4ade80', 'HAIR');
    }

    // Background light
    const hasBg = analysis.backgroundLight &&
                  !analysis.backgroundLight.toLowerCase().includes('none');
    if (hasBg) {
      const bgX = cx;
      const bgY = cy - 150;
      ctx.beginPath();
      ctx.arc(bgX, bgY, 16, 0, Math.PI * 2);
      ctx.fillStyle   = 'rgba(96,165,250,0.12)';
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.fillStyle    = '#60a5fa';
      ctx.font         = 'bold 9px Inter, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BG', bgX, bgY);
      ctx.textBaseline = 'alphabetic';
    }

    drawDiagramLegend(ctx, W, H, analysis);
  }

  // ══════════════════════════════════════════════════════════════
  // CANVAS — Draw one light source
  // ══════════════════════════════════════════════════════════════
  function drawLightSource(ctx, subjX, subjY, angleDeg, distPx, color, label) {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const lx  = subjX + Math.cos(rad) * distPx;
    const ly  = subjY + Math.sin(rad) * distPx;

    // Beam thick transparent
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(subjX, subjY);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth   = 6;
    ctx.stroke();

    // Beam thin
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(subjX, subjY);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Glow
    const glow = ctx.createRadialGradient(lx, ly, 8, lx, ly, 30);
    glow.addColorStop(0, color + '33');
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(lx, ly, 30, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Circle
    ctx.beginPath();
    ctx.arc(lx, ly, 18, 0, Math.PI * 2);
    ctx.fillStyle   = color + '22';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Rays
    for (let i = 0; i < 8; i++) {
      const rayAngle = rad + (i / 7 - 0.5) * 1.1;
      ctx.beginPath();
      ctx.moveTo(lx + Math.cos(rayAngle) * 20, ly + Math.sin(rayAngle) * 20);
      ctx.lineTo(lx + Math.cos(rayAngle) * 36, ly + Math.sin(rayAngle) * 36);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Label
    ctx.fillStyle    = color;
    ctx.font         = 'bold 11px Inter, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + Math.cos(rad) * 52, ly + Math.sin(rad) * 52);
    ctx.textBaseline = 'alphabetic';
  }

  // ══════════════════════════════════════════════════════════════
  // CANVAS — Legend
  // ══════════════════════════════════════════════════════════════
  function drawDiagramLegend(ctx, W, H, analysis) {
    const boxX = 10;
    const boxY = H - 82;

    ctx.fillStyle   = 'rgba(13,15,20,0.85)';
    ctx.strokeStyle = '#2a2f3e';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, 200, 72, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle    = '#7a7f96';
    ctx.font         = '10px Inter, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillText(`Modifier: ${(analysis.lightModifier || '—').slice(0, 26)}`, boxX + 10, boxY + 18);
    ctx.fillText(`No. of Lights: ${analysis.numLights || '?'}`, boxX + 10, boxY + 34);

    const dotY  = boxY + 56;
    const items = [
      { color: '#f5a623', label: 'Key'  },
      { color: '#e056fd', label: 'Fill' },
      { color: '#4ade80', label: 'Hair' },
    ];

    items.forEach((item, i) => {
      const dotX = boxX + 10 + i * 62;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.fillStyle    = '#7a7f96';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, dotX + 9, dotY);
    });

    ctx.textBaseline = 'alphabetic';
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS — Position text → angle
  // ══════════════════════════════════════════════════════════════
  function parsePositionToAngle(position) {
    if (!position) return -45;
    const p = position.toLowerCase();
    if (p.includes('front-left')   || p.includes('camera left'))  return -45;
    if (p.includes('front-right')  || p.includes('camera right')) return 45;
    if (p.includes('behind')       || p.includes('rim'))          return 178;
    if (p.includes('directly above') || p.includes('overhead'))   return -15;
    if (p.includes('above left'))  return -60;
    if (p.includes('above right')) return 60;
    if (p.includes('left'))        return -55;
    if (p.includes('right'))       return 55;
    if (p.includes('front'))       return 0;
    if (p.includes('above'))       return -30;
    if (p.includes('side'))        return 90;
    return -45;
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS — Distance text → pixels
  // ══════════════════════════════════════════════════════════════
  function parseDistanceToPx(distance) {
    if (!distance) return 130;
    const d = distance.toLowerCase();
    if (d.includes('very close') || d.includes('under 1')) return 80;
    if (d.includes('close')      || d.includes('1-2'))     return 110;
    if (d.includes('medium')     || d.includes('2-4'))     return 145;
    if (d.includes('far')        || d.includes('4m'))      return 175;
    return 130;
  }

  // ══════════════════════════════════════════════════════════════
  // DOWNLOAD XMP
  // ══════════════════════════════════════════════════════════════
  downloadBtn.addEventListener('click', () => {
    if (!currentPreset) {
      showError('No preset available yet.\nPlease analyze a photo first.');
      return;
    }

    const rawStyle   = currentAnalysis?.lightingStyle || 'Custom';
    const cleanStyle = rawStyle
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40);

    PresetGenerator.download(currentPreset, `LightLens_${cleanStyle}`);

    const orig = downloadBtn.innerHTML;
    downloadBtn.innerHTML      = '<i class="fa-solid fa-check"></i> Downloading...';
    downloadBtn.style.background = '#4ade80';
    downloadBtn.style.color      = '#000';
    setTimeout(() => {
      downloadBtn.innerHTML        = orig;
      downloadBtn.style.background = '';
      downloadBtn.style.color      = '';
    }, 2000);
  });

  // ══════════════════════════════════════════════════════════════
  // COPY PRESET VALUES
  // ══════════════════════════════════════════════════════════════
  copyBtn.addEventListener('click', () => {
    if (!currentPreset) {
      showError('No preset available yet.\nPlease analyze a photo first.');
      return;
    }

    const text = PresetGenerator.valuesText(currentPreset);

    navigator.clipboard.writeText(text)
      .then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML        = '<i class="fa-solid fa-check"></i> Copied!';
        copyBtn.style.borderColor = '#4ade80';
        copyBtn.style.color       = '#4ade80';
        setTimeout(() => {
          copyBtn.innerHTML        = orig;
          copyBtn.style.borderColor = '';
          copyBtn.style.color       = '';
        }, 1800);
      })
      .catch(() => {
        prompt('Copy all preset values:', text);
      });
  });

  // ══════════════════════════════════════════════════════════════
  // RESET
  // ══════════════════════════════════════════════════════════════
  resetBtn.addEventListener('click', () => {
    showResults(false);
    showLoading(false);

    currentFile     = null;
    currentAnalysis = null;
    currentColors   = null;
    currentPreset   = null;

    fileInput.value  = '';
    previewImg.src   = '';
    previewImg.alt   = '';

    resetAllSteps();
    setLoadingText('Analyzing your photo...');

    const canvas = document.getElementById('lightDiagram');
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    const presetGrid = document.getElementById('presetGrid');
    if (presetGrid) presetGrid.innerHTML = '';

    const swatches = document.getElementById('paletteSwatches');
    const details  = document.getElementById('paletteDetails');
    if (swatches) swatches.innerHTML = '';
    if (details)  details.innerHTML  = '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ══════════════════════════════════════════════════════════════
  // UI HELPERS
  // ══════════════════════════════════════════════════════════════
  function showLoading(show) {
    if (loadingOverlay) loadingOverlay.hidden = !show;
  }

  function showResults(show) {
    if (results) results.hidden = !show;
  }

  function setLoadingText(text) {
    const el = document.getElementById('loadingText');
    if (el) el.textContent = text;
  }

  function setStep(n, state) {
    const el = document.getElementById(`step${n}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (state) el.classList.add(state);
  }

  function resetAllSteps() {
    [1, 2, 3, 4].forEach(n => setStep(n, ''));
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
  }

  function flashButton(btn, text, bgColor, textColor = '#fff') {
    const origHTML  = btn.innerHTML;
    const origBg    = btn.style.background;
    const origColor = btn.style.color;
    btn.innerHTML        = text;
    btn.style.background = bgColor;
    btn.style.color      = textColor;
    setTimeout(() => {
      btn.innerHTML        = origHTML;
      btn.style.background = origBg;
      btn.style.color      = origColor;
    }, 1600);
  }

  function showError(message) {
    alert(message);
  }

  // ══════════════════════════════════════════════════════════════
  // UTILITY HELPERS
  // ══════════════════════════════════════════════════════════════
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader   = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => reject(new Error('Failed to read the file.'));
      reader.readAsDataURL(file);
    });
  }

  function waitForImage(imgEl) {
    return new Promise((resolve) => {
      if (imgEl.complete && imgEl.naturalWidth > 0) { resolve(); return; }
      imgEl.onload  = () => resolve();
      imgEl.onerror = () => resolve();
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function formatFileSize(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

})();
