/**
 * Color Extractor — k-means clustering on canvas pixel data
 * Returns an array of dominant colors as { hex, rgb, r, g, b }
 */
const ColorExtractor = (() => {

  function hexify(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function rgbStr(r, g, b) {
    return `rgb(${r}, ${g}, ${b})`;
  }

  function distance(a, b) {
    return Math.sqrt(
      (a.r - b.r) ** 2 +
      (a.g - b.g) ** 2 +
      (a.b - b.b) ** 2
    );
  }

  function kMeans(pixels, k = 8, iterations = 20) {
    // Pick k random centroids
    let centroids = [];
    for (let i = 0; i < k; i++) {
      const p = pixels[Math.floor(Math.random() * pixels.length)];
      centroids.push({ ...p });
    }

    let assignments = new Array(pixels.length).fill(0);

    for (let iter = 0; iter < iterations; iter++) {
      // Assign pixels to nearest centroid
      for (let i = 0; i < pixels.length; i++) {
        let minDist = Infinity;
        let minIdx = 0;
        for (let c = 0; c < centroids.length; c++) {
          const d = distance(pixels[i], centroids[c]);
          if (d < minDist) { minDist = d; minIdx = c; }
        }
        assignments[i] = minIdx;
      }

      // Recalculate centroids
      const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, count: 0 }));
      for (let i = 0; i < pixels.length; i++) {
        const c = assignments[i];
        sums[c].r += pixels[i].r;
        sums[c].g += pixels[i].g;
        sums[c].b += pixels[i].b;
        sums[c].count++;
      }
      centroids = sums.map((s, i) =>
        s.count > 0
          ? { r: Math.round(s.r / s.count), g: Math.round(s.g / s.count), b: Math.round(s.b / s.count) }
          : centroids[i]
      );
    }

    // Count cluster sizes for sorting
    const counts = new Array(k).fill(0);
    assignments.forEach(a => counts[a]++);

    // Build result sorted by frequency
    return centroids
      .map((c, i) => ({ ...c, count: counts[i] }))
      .sort((a, b) => b.count - a.count)
      .map(c => ({
        r: c.r, g: c.g, b: c.b,
        hex: hexify(c.r, c.g, c.b),
        rgb: rgbStr(c.r, c.g, c.b),
        count: c.count
      }));
  }

  function extract(imageEl, numColors = 8) {
    const canvas = document.getElementById('hiddenCanvas');
    const ctx = canvas.getContext('2d');

    // Scale down for performance
    const maxSize = 200;
    const scale = Math.min(maxSize / imageEl.naturalWidth, maxSize / imageEl.naturalHeight);
    canvas.width  = Math.round(imageEl.naturalWidth  * scale);
    canvas.height = Math.round(imageEl.naturalHeight * scale);

    ctx.drawImage(imageEl, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    // Sample every 4th pixel for speed
    const pixels = [];
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue; // skip transparent
      pixels.push({ r, g, b });
    }

    return kMeans(pixels, numColors);
  }

  function getMoodFromColors(colors) {
    const dom = colors[0];
    const { r, g, b } = dom;

    // HSL conversion
    const rn = r/255, gn = g/255, bn = b/255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const s = max === min ? 0 : l < 0.5 ? (max-min)/(max+min) : (max-min)/(2-max-min);

    if (l < 0.2) return 'Dark & Dramatic';
    if (l > 0.8) return 'Light & Airy';
    if (s < 0.15) return 'Moody & Desaturated';
    if (r > g && r > b) return 'Warm & Vibrant';
    if (b > r && b > g) return 'Cool & Cinematic';
    if (g > r && g > b) return 'Natural & Fresh';
    return 'Balanced & Neutral';
  }

  function getToneFromColors(colors) {
    const avg = colors.slice(0, 4).reduce((a, c) => ({
      r: a.r + c.r, g: a.g + c.g, b: a.b + c.b
    }), { r: 0, g: 0, b: 0 });
    const l = (avg.r + avg.g + avg.b) / 3 / 255 * colors.slice(0,4).length;
    if (l < 0.33) return 'Low-Key (Dark)';
    if (l > 0.66) return 'High-Key (Bright)';
    return 'Mid-Tone';
  }

  function getSaturationLevel(colors) {
    const sat = colors.slice(0, 4).reduce((acc, c) => {
      const r = c.r/255, g = c.g/255, b = c.b/255;
      const max = Math.max(r,g,b), min = Math.min(r,g,b);
      const l = (max+min)/2;
      const s = max===min ? 0 : l<0.5 ? (max-min)/(max+min) : (max-min)/(2-max-min);
      return acc + s;
    }, 0) / 4;
    if (sat < 0.15) return 'Low — Desaturated';
    if (sat < 0.4)  return 'Medium — Natural';
    return 'High — Vivid';
  }

  return { extract, getMoodFromColors, getToneFromColors, getSaturationLevel };
})();
