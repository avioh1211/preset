/**
 * app.js — Main controller for LightLens AI
 * Using Google Gemini API (gemini-2.0-flash)
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
  // INIT — restore saved API key from session
  // ══════════════════════════════════════════════════════════════
  const savedKey = sessionStorage.getItem('ll_apikey');
  if (savedKey) {
    apiKeyInput.value = savedKey;
  }

  // ══════════════════════════════════════════════════════════════
  // API KEY — Save button
  // ══════════════════════════════════════════════════════════════
  saveApiBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();

    if (!key.startsWith('AIza') || key.length < 30) {
      flashButton(saveApiBtn, 'Invalid key!', '#ef4444', '#fff');
      return;
    }

    sessionStorage.setItem('ll_apikey', key);
    flashButton(saveApiBtn, '✓ Saved', '#4ade80', '#000');
  });

  // ══════════════════════════════════════════════════════════════
  // API KEY — Toggle show / hide password
  // ══════════════════════════════════════════════════════════════
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';

      const icon = toggleKeyBtn.querySelector('i');
      if (icon) {
        icon.className = isPassword
          ? 'fa-solid fa-eye-slash'
          : 'fa-solid fa-eye';
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // UPLOAD ZONE — Click to open file picker
  // ══════════════════════════════════════════════════════════════
  uploadZone.addEventListener('click', (e) => {
    // Prevent double-trigger if clicking the label inside
    if (e.target.tagName === 'LABEL') return;
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // ══════════════════════════════════════════════════════════════
  // UPLOAD ZONE — Drag and drop
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
    // Only remove if leaving the zone itself, not a child element
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
  // HANDLE FILE — Main async flow
  // ══════════════════════════════════════════════════════════════
  async function handleFile(file) {

    // 1. Validate API key
    const apiKey = apiKeyInput.value.trim() || sessionStorage.getItem('ll_apikey') || '';

    if (!apiKey || !apiKey.startsWith('AIza') || apiKey.length < 30) {
      showError(
        'Please enter a valid Google Gemini API key.\n' +
        'It should start with "AIza..." and be at least 30 characters.\n\n' +
        'Get a free key at: https://aistudio.google.com/app/apikey'
      );
      apiKeyInput.focus();
      return;
    }

    // 2. Validate file size (20MB max)
    const maxSize = 20 * 1024 * 1024; // 20MB in bytes
    if (file.size > maxSize) {
      showError(
        `File is too large (${formatFileSize(file.size)}).\n` +
        'Maximum allowed size is 20MB.'
      );
      return;
    }

    // 3. Validate it is actually an image
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file (JPG, PNG, WEBP, BMP).');
      return;
    }

    // 4. Set the selected Gemini model
    if (modelSelect && LightingAnalyzer.setModel) {
      LightingAnalyzer.setModel(modelSelect.value);
    }

    // 5. Store file reference
    currentFile = file;

    // 6. Reset any previous results
    showResults(false);

    // 7. Show loading overlay
    showLoading(true);
    setLoadingText('Preparing your photo...');
    resetAllSteps();

    try {

      // ── STEP 1: Read file ──────────────────────────────────────
      setStep(1, 'active');
      setLoadingText('Reading your photo...');

      const base64 = await fileToBase64(file);

      // Set preview image source
      previewImg.src = base64;
      previewImg.alt = file.name || 'Uploaded photo';

      // Wait for the image to fully load so canvas can read pixels
      await waitForImage(previewImg);

      setStep(1, 'done');
      await sleep(150);

      // ── STEP 2: AI lighting analysis ───────────────────────────
      setStep(2, 'active');
      setLoadingText('AI is reading the light sources...');

      currentAnalysis = await LightingAnalyzer.analyzeWithModel(base64, apiKey);

      setStep(2, 'done');
      await sleep(150);

      // ── STEP 3: Color palette extraction ──────────────────────
      setStep(3, 'active');
      setLoadingText('Extracting color palette...');

      // Small delay so the UI can update before the heavy canvas work
      await sleep(50);
      currentColors = ColorExtractor.extract(previewImg, 8);

      setStep(3, 'done');
      await sleep(150);

      // ── STEP 4: Build Lightroom preset ─────────────────────────
      setStep(4, 'active');
      setLoadingText('Building Lightroom preset...');

      currentPreset = PresetGenerator.buildPresetValues(currentAnalysis, currentColors);

      await sleep(400);
      setStep(4, 'done');
      await sleep(300);

      // ── Render everything ──────────────────────────────────────
      renderResults(currentAnalysis, currentColors, currentPreset);

      // Hide loading, show results
      showLoading(false);
      showResults(true);

      // Draw lighting diagram on canvas
      await sleep(100); // let DOM paint first
      drawLightDiagram(currentAnalysis);

      // Smooth scroll down to results
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      showLoading(false);
      console.error('[LightLens] Error:', err);

      // Friendly error messages based on common issues
      let message = 'Something went wrong during analysis.\n\n';

      if (err.message.includes('API key')) {
        message += 'Your API key appears to be invalid or expired.\nPlease check it and try again.';
      } else if (err.message.includes('quota') || err.message.includes('429')) {
        message += 'You have exceeded your Gemini API quota.\nPlease wait a moment and try again, or upgrade your plan.';
      } else if (err.message.includes('network') || err.message.includes('fetch')) {
        message += 'A network error occurred.\nPlease check your internet connection and try again.';
      } else if (err.message.includes('JSON')) {
        message += 'The AI returned an unexpected response format.\nPlease try again — this is usually a temporary issue.';
      } else {
        message += 'Error details:\n' + err.message;
      }

      showError(message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER ALL RESULTS
  // ══════════════════════════════════════════════════════════════
  function renderResults(analysis, colors, preset) {
    if (!analysis || !colors || !preset) {
      console.warn('[LightLens] renderResults called with missing data');
      return;
    }

    renderLightingAnalysis(analysis);
    renderColorPalette(colors);
    renderPresetSliders(preset);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — Lighting Analysis Panel
  // ══════════════════════════════════════════════════════════════
  function renderLightingAnalysis(analysis) {

    // All 10 core fields
    setText('lightType',        analysis.lightType         || 'Not detected');
    setText('lightModifier',    analysis.lightModifier     || 'Not detected');
    setText('lightPosition',    analysis.lightPosition     || 'Not detected');
    setText('lightAngle',       analysis.lightAngle        || 'Not detected');
    setText('lightDistance',    analysis.lightDistance     || 'Not detected');
    setText('shadowQuality',    analysis.shadowQuality     || 'Not detected');
    setText('lightPattern',     analysis.lightPattern      || 'Not detected');
    setText('colorTemp',        analysis.colorTemperature  || 'Not detected');
    setText('fillLight',        analysis.fillLight         || 'None detected');
    setText('lightStyle',       analysis.lightingStyle     || 'Not detected');

    // Extra fields
    setText('hairLight',        analysis.hairLight         || 'None detected');
    setText('backgroundLight',  analysis.backgroundLight   || 'None detected');

    // Description paragraphs
    setText('aiDescription',    analysis.description       || 'No description available.');
    setText('setupRec',         analysis.setupInstructions || 'No instructions available.');
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — Color Palette
  // ══════════════════════════════════════════════════════════════
  function renderColorPalette(colors) {
    const swatchContainer = document.getElementById('paletteSwatches');
    const detailContainer = document.getElementById('paletteDetails');

    if (!swatchContainer || !detailContainer) return;

    // Clear previous content
    swatchContainer.innerHTML = '';
    detailContainer.innerHTML = '';

    colors.forEach((color, index) => {

      // ── Color swatch box ──────────────────────────────────────
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.style.background = color.hex;
      swatch.title = `Click to copy ${color.hex.toUpperCase()}`;
      swatch.setAttribute('role', 'button');
      swatch.setAttribute('tabindex', '0');
      swatch.setAttribute('aria-label', `Color ${color.hex.toUpperCase()} — click to copy`);

      // HEX label underneath
      const label = document.createElement('span');
      label.className = 'swatch-label';
      label.textContent = color.hex.toUpperCase();
      swatch.appendChild(label);

      // Click to copy hex value
      const copyHex = () => {
        const hexValue = color.hex.toUpperCase();
        navigator.clipboard.writeText(hexValue)
          .then(() => {
            const original = label.textContent;
            label.textContent = 'Copied!';
            swatch.style.outline = '2px solid #4ade80';
            setTimeout(() => {
              label.textContent = original;
              swatch.style.outline = '';
            }, 1200);
          })
          .catch(() => {
            // Fallback for browsers without clipboard API
            prompt('Copy this HEX color:', hexValue);
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

      // ── Detail chip (HEX + RGB) ───────────────────────────────
      const chip = document.createElement('div');
      chip.className = 'palette-chip';
      chip.innerHTML = `
        <div class="chip-dot" style="background: ${color.hex}"></div>
        <span class="chip-hex">${color.hex.toUpperCase()}</span>
        <span class="chip-rgb">${color.rgb}</span>
      `;
      detailContainer.appendChild(chip);
    });

    // ── Palette metadata ──────────────────────────────────────────
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

    // All slider definitions with their min/max ranges and display units
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
      const rawValue = preset[def.key] ?? 0;
      const value    = def.decimals
        ? parseFloat(rawValue.toFixed(def.decimals))
        : Math.round(rawValue);

      const range    = def.max - def.min;
      const pct      = ((value - def.min) / range) * 100;
      const clamped  = Math.max(0, Math.min(100, pct));

      // Negative = blue, positive/neutral = orange
      const isNeg    = def.min < 0 && value < 0 && def.key !== 'Temperature';
      const sign     = value > 0 ? '+' : '';
      const valClass = isNeg ? 'neg' : 'pos';
      const fillClass = isNeg ? 'negative' : '';

      const displayValue = def.decimals
        ? `${sign}${value.toFixed(def.decimals)}`
        : `${sign}${value}`;

      const item = document.createElement('div');
      item.className = 'preset-item';
      item.innerHTML = `
        <div class="preset-name">${def.label}</div>
        <div class="preset-slider-track">
          <div
            class="preset-slider-fill ${fillClass}"
            style="width: ${clamped}%"
          ></div>
        </div>
        <div class="preset-value ${valClass}">
          ${displayValue}${def.unit}
        </div>
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

    // Clear canvas
    ctx.clearRect(0, 0, W, H);

    // ── Background ──────────────────────────────────────────────
    ctx.fillStyle = '#1a1e2a';
    ctx.fillRect(0, 0, W, H);

    // ── Grid lines ──────────────────────────────────────────────
    ctx.strokeStyle = '#2a2f3e';
    ctx.lineWidth   = 1;

    for (let x = 0; x <= W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // ── Title ───────────────────────────────────────────────────
    ctx.fillStyle  = '#7a7f96';
    ctx.font       = '11px Inter, sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText('LIGHTING DIAGRAM — TOP VIEW', cx, 20);

    // ── Subject circle (center) ─────────────────────────────────
    const subjX = cx;
    const subjY = cy;

    // Outer glow
    const glowGrad = ctx.createRadialGradient(subjX, subjY, 20, subjX, subjY, 55);
    glowGrad.addColorStop(0, 'rgba(245,166,35,0.1)');
    glowGrad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(subjX, subjY, 55, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Subject circle
    ctx.beginPath();
    ctx.arc(subjX, subjY, 28, 0, Math.PI * 2);
    ctx.fillStyle   = '#2a2f3e';
    ctx.fill();
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Subject label
    ctx.fillStyle  = '#f5a623';
    ctx.font       = 'bold 10px Inter, sans-serif';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SUBJECT', subjX, subjY);
    ctx.textBaseline = 'alphabetic';

    // ── Camera icon (bottom center) ─────────────────────────────
    const camX = cx;
    const camY = H - 38;

    ctx.fillStyle = '#1e3a5f';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
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

    // ── Dashed line: camera → subject ──────────────────────────
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = '#3b4160';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(camX, camY - 15);
    ctx.lineTo(subjX, subjY + 28);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Key Light ───────────────────────────────────────────────
    const keyAngle = parsePositionToAngle(analysis.lightPosition);
    const keyDist  = parseDistanceToPx(analysis.lightDistance);

    drawLightSource(ctx, subjX, subjY, keyAngle, keyDist, '#f5a623', 'KEY');

    // ── Fill Light (opposite side of key) ───────────────────────
    const hasFill = analysis.fillLight &&
                    !analysis.fillLight.toLowerCase().includes('none');
    if (hasFill) {
      const fillAngle = keyAngle + 140;
      const fillDist  = keyDist * 0.75;
      drawLightSource(ctx, subjX, subjY, fillAngle, fillDist, '#e056fd', 'FILL');
    }

    // ── Hair / Rim Light (behind subject) ───────────────────────
    const hasHair = analysis.hairLight &&
                    !analysis.hairLight.toLowerCase().includes('none');
    if (hasHair) {
      const hairAngle = keyAngle + 175;
      const hairDist  = keyDist * 0.65;
      drawLightSource(ctx, subjX, subjY, hairAngle, hairDist, '#4ade80', 'HAIR');
    }

    // ── Background Light ────────────────────────────────────────
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

    // ── Legend ──────────────────────────────────────────────────
    drawDiagramLegend(ctx, W, H, analysis);
  }

  // ══════════════════════════════════════════════════════════════
  // CANVAS — Draw one light source
  // ══════════════════════════════════════════════════════════════
  function drawLightSource(ctx, subjX, subjY, angleDeg, distPx, color, label) {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const lx  = subjX + Math.cos(rad) * distPx;
    const ly  = subjY + Math.sin(rad) * distPx;

    // Beam from light → subject (thick, transparent)
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(subjX, subjY);
    ctx.strokeStyle  = color;
    ctx.globalAlpha  = 0.2;
    ctx.lineWidth    = 6;
    ctx.stroke();

    // Thinner, slightly more opaque beam on top
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(subjX, subjY);
    ctx.globalAlpha  = 0.5;
    ctx.lineWidth    = 1.5;
    ctx.stroke();
    ctx.globalAlpha  = 1;

    // Light source circle — outer glow
    const glow = ctx.createRadialGradient(lx, ly, 8, lx, ly, 30);
    glow.addColorStop(0, color + '33');
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(lx, ly, 30, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Light source circle — main
    ctx.beginPath();
    ctx.arc(lx, ly, 18, 0, Math.PI * 2);
    ctx.fillStyle   = color + '22';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Rays fanning outward from the light source
    const numRays = 8;
    for (let i = 0; i < numRays; i++) {
      const spread   = 0.55; // radians of fan spread
      const rayAngle = rad + (i / (numRays - 1) - 0.5) * spread * 2;
      const startX   = lx + Math.cos(rayAngle) * 20;
      const startY   = ly + Math.sin(rayAngle) * 20;
      const endX     = lx + Math.cos(rayAngle) * 36;
      const endY     = ly + Math.sin(rayAngle) * 36;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Label outside the rays
    const lblDistance = 52;
    const lblX = lx + Math.cos(rad) * lblDistance;
    const lblY = ly + Math.sin(rad) * lblDistance;

    ctx.fillStyle    = color;
    ctx.font         = 'bold 11px Inter, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lblX, lblY);
    ctx.textBaseline = 'alphabetic';
  }

  // ══════════════════════════════════════════════════════════════
  // CANVAS — Draw legend box
  // ══════════════════════════════════════════════════════════════
  function drawDiagramLegend(ctx, W, H, analysis) {
    const boxX = 10;
    const boxY = H - 82;
    const boxW = 200;
    const boxH = 72;

    // Legend background
    ctx.fillStyle = 'rgba(13,15,20,0.85)';
    ctx.strokeStyle = '#2a2f3e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    // Modifier + number of lights
    ctx.fillStyle    = '#7a7f96';
    ctx.font         = '10px Inter, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    const modifier  = (analysis.lightModifier || '—').slice(0, 26);
    const numLights = analysis.numLights || '?';

    ctx.fillText(`Modifier: ${modifier}`, boxX + 10, boxY + 18);
    ctx.fillText(`No. of Lights: ${numLights}`, boxX + 10, boxY + 34);

    // Color key
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
      ctx.font         = '10px Inter, sans-serif';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, dotX + 9, dotY);
    });

    ctx.textBaseline = 'alphabetic';
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS — Parse AI position text → canvas angle (degrees)
  // ══════════════════════════════════════════════════════════════
  function parsePositionToAngle(position) {
    if (!position) return -45;

    const p = position.toLowerCase();

    // Most specific matches first
    if (p.includes('front-left')   || p.includes('camera left'))  return -45;
    if (p.includes('front-right')  || p.includes('camera right')) return 45;
    if (p.includes('behind')       || p.includes('rim'))          return 178;
    if (p.includes('directly above') || p.includes('overhead'))   return -15;
    if (p.includes('above left'))  return -60;
    if (p.includes('above right')) return 60;

    // General matches
    if (p.includes('left'))  return -55;
    if (p.includes('right')) return 55;
    if (p.includes('front')) return 0;
    if (p.includes('above')) return -30;
    if (p.includes('side'))  return 90;

    return -45; // default: classic front-left
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS — Parse AI distance text → canvas pixels
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
  // DOWNLOAD XMP BUTTON
  // ══════════════════════════════════════════════════════════════
  downloadBtn.addEventListener('click', () => {
    if (!currentPreset) {
      showError('No preset available yet.\nPlease analyze a photo first.');
      return;
    }

    // Build filename from lighting style
    const rawStyle = currentAnalysis?.lightingStyle || 'Custom';
    const cleanStyle = rawStyle
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40); // max 40 chars

    const filename = `LightLens_${cleanStyle}`;

    PresetGenerator.download(currentPreset, filename);

    // Visual feedback
    const originalHTML = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '<i class="fa-solid fa-check"></i> Downloading...';
    downloadBtn.style.background = '#4ade80';
    downloadBtn.style.color = '#000';

    setTimeout(() => {
      downloadBtn.innerHTML = originalHTML;
      downloadBtn.style.background = '';
      downloadBtn.style.color = '';
    }, 2000);
  });

  // ══════════════════════════════════════════════════════════════
  // COPY PRESET VALUES BUTTON
  // ══════════════════════════════════════════════════════════════
  copyBtn.addEventListener('click', () => {
    if (!currentPreset) {
      showError('No preset available yet.\nPlease analyze a photo first.');
      return;
    }

    const text = PresetGenerator.valuesText(currentPreset);

    navigator.clipboard.writeText(text)
      .then(() => {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        copyBtn.style.borderColor = '#4ade80';
        copyBtn.style.color = '#4ade80';

        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.style.borderColor = '';
          copyBtn.style.color = '';
        }, 1800);
      })
      .catch(() => {
        // Fallback for unsupported browsers
        prompt('Copy all preset values below:', text);
      });
  });

  // ══════════════════════════════════════════════════════════════
  // RESET BUTTON
  // ══════════════════════════════════════════════════════════════
  resetBtn.addEventListener('click', () => {

    // Hide results and loading
    showResults(false);
    showLoading(false);

    // Clear all stored data
    currentFile     = null;
    currentAnalysis = null;
    currentColors   = null;
    currentPreset   = null;

    // Reset file input so the same file can be uploaded again
    fileInput.value = '';

    // Reset preview image
    previewImg.src = '';
    previewImg.alt = '';

    // Reset loading steps
    resetAllSteps();
    setLoadingText('Analyzing your photo...');

    // Clear the canvas
    const canvas = document.getElementById('lightDiagram');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Clear preset grid
    const presetGrid = document.getElementById('presetGrid');
    if (presetGrid) presetGrid.innerHTML = '';

    // Clear palette
    const swatches = document.getElementById('paletteSwatches');
    const details  = document.getElementById('paletteDetails');
    if (swatches) swatches.innerHTML = '';
    if (details)  details.innerHTML  = '';

    // Scroll back to top smoothly
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

  /**
   * Set a loading step state
   * @param {number} n       - Step number (1–4)
   * @param {string} state   - 'active' | 'done' | '' (reset)
   */
  function setStep(n, state) {
    const el = document.getElementById(`step${n}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (state) el.classList.add(state);
  }

  function resetAllSteps() {
    [1, 2, 3, 4].forEach(n => setStep(n, ''));
  }

  /**
   * Set text content of an element by ID
   * @param {string} id
   * @param {string} value
   */
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
  }

  /**
   * Flash a button with a temporary color + text
   */
  function flashButton(btn, text, bgColor, textColor = '#fff') {
    const originalText    = btn.innerHTML;
    const originalBg      = btn.style.background;
    const originalColor   = btn.style.color;

    btn.innerHTML         = text;
    btn.style.background  = bgColor;
    btn.style.color       = textColor;

    setTimeout(() => {
      btn.innerHTML         = originalText;
      btn.style.background  = originalBg;
      btn.style.color       = originalColor;
    }, 1600);
  }

  /**
   * Show an error alert (could be upgraded to a toast in the future)
   */
  function showError(message) {
    alert(message);
  }

  // ══════════════════════════════════════════════════════════════
  // UTILITY HELPERS
  // ══════════════════════════════════════════════════════════════

  /**
   * Read a File as a base64 data URL
   */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => reject(new Error('Failed to read the file. Please try again.'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Wait for an <img> element to fully load
   */
  function waitForImage(imgEl) {
    return new Promise((resolve) => {
      // Already loaded
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        resolve();
        return;
      }
      imgEl.onload  = () => resolve();
      imgEl.onerror = () => resolve(); // resolve anyway to avoid hanging
    });
  }

  /**
   * Sleep for a given number of milliseconds
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Format bytes into a readable string (KB / MB)
   */
  function formatFileSize(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

})();