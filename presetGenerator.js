/**
 * Lightroom Preset Generator
 * Builds XMP preset values from lighting + color analysis data
 * and generates a downloadable .xmp file
 */
const PresetGenerator = (() => {

  function buildPresetValues(analysisData, colors) {
    const { lightType, colorTempK, shadowQuality, lightStyle } = analysisData;

    // Color temperature offset from 5500 (neutral)
    const tempOffset = ((colorTempK || 5500) - 5500) / 100;

    // Base values derived from analysis
    const preset = {
      // Basic
      Exposure:        guessExposure(lightStyle),
      Contrast:        guessContrast(shadowQuality),
      Highlights:      guessHighlights(lightType),
      Shadows:         guessShadows(shadowQuality),
      Whites:          guessWhites(lightStyle),
      Blacks:          guessBlacks(lightStyle),
      // Presence
      Clarity:         guessClarity(lightType),
      Dehaze:          0,
      Vibrance:        guessVibrance(lightStyle),
      Saturation:      guessSaturation(colors),
      // Color
      Temperature:     colorTempK || 5500,
      Tint:            guessTint(lightType),
      // Tone Curve
      ToneCurveName:   'Custom',
      // Detail
      Sharpness:       40,
      LuminanceNR:     guessNR(lightType),
      ColorNR:         25,
      // Effects
      Vignette:        guessVignette(lightStyle),
      // Split toning
      ShadowHue:       guessShadowHue(colors),
      ShadowSat:       guessColorGrade(lightStyle),
      HighlightHue:    guessHighlightHue(colors),
      HighlightSat:    guessColorGrade(lightStyle),
    };

    return preset;
  }

  // ── Heuristic helpers ──────────────────────────────────────

  function guessExposure(style) {
    if (!style) return 0;
    const s = style.toLowerCase();
    if (s.includes('high-key') || s.includes('bright')) return 0.5;
    if (s.includes('low-key') || s.includes('dark') || s.includes('dramatic')) return -0.3;
    return 0;
  }

  function guessContrast(shadow) {
    if (!shadow) return 10;
    const s = shadow.toLowerCase();
    if (s.includes('hard')) return 35;
    if (s.includes('soft')) return -5;
    return 15;
  }

  function guessHighlights(type) {
    if (!type) return -20;
    const t = type.toLowerCase();
    if (t.includes('natural') || t.includes('window')) return -30;
    if (t.includes('ring')) return -40;
    return -20;
  }

  function guessShadows(shadow) {
    if (!shadow) return 10;
    const s = shadow.toLowerCase();
    if (s.includes('hard') || s.includes('crisp')) return -15;
    if (s.includes('soft') || s.includes('fill')) return 30;
    return 10;
  }

  function guessWhites(style) {
    if (!style) return 5;
    if (style.toLowerCase().includes('high-key')) return 20;
    return 5;
  }

  function guessBlacks(style) {
    if (!style) return -10;
    if (style.toLowerCase().includes('low-key')) return -30;
    return -10;
  }

  function guessClarity(type) {
    if (!type) return 10;
    const t = type.toLowerCase();
    if (t.includes('beauty') || t.includes('ring')) return -15;
    if (t.includes('natural')) return 5;
    return 10;
  }

  function guessVibrance(style) {
    if (!style) return 10;
    const s = style.toLowerCase();
    if (s.includes('moody') || s.includes('cinematic')) return -5;
    if (s.includes('commercial')) return 15;
    return 10;
  }

  function guessSaturation(colors) {
    if (!colors || !colors.length) return 0;
    const dom = colors[0];
    const r = dom.r/255, g = dom.g/255, b = dom.b/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    const l = (max+min)/2;
    const s = max===min ? 0 : l<0.5 ? (max-min)/(max+min) : (max-min)/(2-max-min);
    // Map saturation 0-1 to -20 to +20
    return Math.round((s - 0.4) * 50);
  }

  function guessTint(type) {
    if (!type) return 0;
    if (type.toLowerCase().includes('led')) return 5;
    if (type.toLowerCase().includes('tungsten')) return -10;
    return 0;
  }

  function guessNR(type) {
    if (!type) return 15;
    if (type.toLowerCase().includes('natural')) return 30;
    return 15;
  }

  function guessVignette(style) {
    if (!style) return -10;
    const s = style.toLowerCase();
    if (s.includes('dramatic') || s.includes('moody')) return -35;
    if (s.includes('high-key')) return 0;
    return -10;
  }

  function guessShadowHue(colors) {
    if (!colors || colors.length < 3) return 220;
    const c = colors[colors.length - 1];
    return Math.round((Math.atan2(c.g - c.b, c.r - c.g) * 180 / Math.PI + 360) % 360);
  }

  function guessHighlightHue(colors) {
    if (!colors || !colors.length) return 40;
    const c = colors[0];
    return Math.round((Math.atan2(c.g - c.b, c.r - c.g) * 180 / Math.PI + 360) % 360);
  }

  function guessColorGrade(style) {
    if (!style) return 15;
    const s = style.toLowerCase();
    if (s.includes('cinematic') || s.includes('moody')) return 25;
    if (s.includes('clean') || s.includes('commercial')) return 5;
    return 15;
  }

  // ── XMP Generation ─────────────────────────────────────────

  function generateXMP(preset, presetName = 'LightLens AI Preset') {
    const {
      Exposure, Contrast, Highlights, Shadows, Whites, Blacks,
      Clarity, Dehaze, Vibrance, Saturation,
      Temperature, Tint,
      Sharpness, LuminanceNR, ColorNR,
      Vignette,
      ShadowHue, ShadowSat, HighlightHue, HighlightSat
    } = preset;

    return `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      crs:ProcessVersion="11.0"
      crs:WhiteBalance="Custom"
      crs:Temperature="${Temperature}"
      crs:Tint="${Tint}"
      crs:Exposure2012="${(Exposure).toFixed(2)}"
      crs:Contrast2012="${Contrast}"
      crs:Highlights2012="${Highlights}"
      crs:Shadows2012="${Shadows}"
      crs:Whites2012="${Whites}"
      crs:Blacks2012="${Blacks}"
      crs:Clarity2012="${Clarity}"
      crs:Dehaze="${Dehaze}"
      crs:Vibrance="${Vibrance}"
      crs:Saturation="${Saturation}"
      crs:ParametricShadows="0"
      crs:ParametricDarks="0"
      crs:ParametricLights="0"
      crs:ParametricHighlights="0"
      crs:ParametricShadowSplit="25"
      crs:ParametricMidtoneSplit="50"
      crs:ParametricHighlightSplit="75"
      crs:Sharpness="${Sharpness}"
      crs:SharpenRadius="+1.0"
      crs:SharpenDetail="25"
      crs:SharpenEdgeMasking="0"
      crs:LuminanceSmoothing="${LuminanceNR}"
      crs:ColorNoiseReduction="${ColorNR}"
      crs:ColorNoiseReductionDetail="50"
      crs:ColorNoiseReductionSmoothness="50"
      crs:VignetteAmount="${Vignette}"
      crs:SplitToningShadowHue="${ShadowHue}"
      crs:SplitToningShadowSaturation="${ShadowSat}"
      crs:SplitToningHighlightHue="${HighlightHue}"
      crs:SplitToningHighlightSaturation="${HighlightSat}"
      crs:SplitToningBalance="0"
      crs:ColorGradeMidtoneHue="0"
      crs:ColorGradeMidtoneSat="0"
      crs:ColorGradeShadowLum="0"
      crs:ColorGradeMidtoneLum="0"
      crs:ColorGradeHighlightLum="0"
      crs:ColorGradeBlending="50"
      crs:ColorGradeGlobalHue="0"
      crs:ColorGradeGlobalSat="0"
      crs:ColorGradeGlobalLum="0"
      crs:AutoTone="False"
      crs:HasSettings="True"
    >
      <crs:ToneCurvePV2012>
        <rdf:Seq>
          <rdf:li>0, 0</rdf:li>
          <rdf:li>64, ${Math.max(0, 55 + Shadows/4)}</rdf:li>
          <rdf:li>128, ${Math.min(255, 128 + Contrast/8)}</rdf:li>
          <rdf:li>192, ${Math.min(255, 190 + Highlights/10)}</rdf:li>
          <rdf:li>255, 255</rdf:li>
        </rdf:Seq>
      </crs:ToneCurvePV2012>
      <crs:PresetType>Normal</crs:PresetType>
      <crs:Cluster/>
      <crs:UUID>LightLens-${Date.now()}</crs:UUID>
      <crs:SupportsAmount>False</crs:SupportsAmount>
      <crs:SupportsColor>True</crs:SupportsColor>
      <crs:SupportsMonochrome>False</crs:SupportsMonochrome>
      <crs:SupportsHighDynamicRange>True</crs:SupportsHighDynamicRange>
      <crs:SupportsNormalDynamicRange>True</crs:SupportsNormalDynamicRange>
      <crs:SupportsSceneReferred>True</crs:SupportsSceneReferred>
      <crs:SupportsOutputReferred>False</crs:SupportsOutputReferred>
      <crs:CameraModelRestriction/>
      <crs:Copyright>LightLens AI — Generated Preset</crs:Copyright>
      <crs:ContactInfo/>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;
  }

  function download(preset, name = 'LightLens_Preset') {
    const xmp = generateXMP(preset, name);
    const blob = new Blob([xmp], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.xmp`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function valuesText(preset) {
    return Object.entries(preset)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  return { buildPresetValues, generateXMP, download, valuesText };
})();
