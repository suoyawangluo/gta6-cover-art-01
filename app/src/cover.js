// Neon Coast Cover Studio — cover renderer.
// Draws a GTA-poster-style multi-panel cover at any size and aspect from a plain
// state object: photos, per-panel crop, layout, grade, lettering and effects.
// Everything is drawn with the 2D canvas API; no network, no library.
export const GRADES = {
  sunset: { name: 'Neon Sunset', sky: ['#ff9a3d', '#ff5e62', '#c724b1'], ink: '#1b1035', glow: '#ff7ad9' },
  violet: { name: 'Vice Violet', sky: ['#7b2ff7', '#c724b1', '#ff2e88'], ink: '#160a2e', glow: '#b678ff' },
  teal: { name: 'Palm Teal', sky: ['#00e5c0', '#00a8c6', '#ff7a3d'], ink: '#062a33', glow: '#4dfff0' },
  hotpink: { name: 'Hot Pink', sky: ['#ff2e88', '#ff7a3d', '#ffd23d'], ink: '#2e0a24', glow: '#ff5ea8' },
  noir: { name: 'Noir Nights', sky: ['#3d3d5c', '#14141f', '#ff5e62'], ink: '#0c0c14', glow: '#e8e8f0' },
};

export const LAYOUTS = {
  nine: { name: 'Nine-Panel Grid', cells: 9 },
  hero: { name: 'Hero + Three', cells: 4 },
  tilted: { name: 'Tilted Snapshots', cells: 4 },
  solo: { name: 'Full-Bleed Solo', cells: 1 },
};

export const TITLE_STYLES = {
  solid: 'Solid Block',
  halftone: 'Halftone Pop',
  neon: 'Neon Glow',
  outline: 'Outline Cut',
};

/** Default editor state (photos are Image objects, kept outside this JSON). */
export function defaultState() {
  return {
    layout: 'nine',
    grade: 'sunset',
    title: 'NEON COAST',
    subtitle: 'Vice City nights',
    badge: 'LAUNCH WEEK',
    stars: 4,
    titleStyle: 'halftone',
    grain: true,
    vignette: true,
    // one entry per panel slot: { photo, zoom, ox, oy } — ox/oy are -1..1 pan offsets.
    panels: Array.from({ length: 9 }, (_, i) => ({ photo: i % 2, zoom: 1, ox: 0, oy: 0 })),
  };
}

/** Seeded pseudo-random, so grain is identical on every render of a cover. */
function seededRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Draws one photo into a rect with cover-fit, zoom and pan. */
export function drawPhotoInto(ctx, photo, x, y, w, h, panel) {
  if (!photo) {
    ctx.fillStyle = '#241a33';
    ctx.fillRect(x, y, w, h);
    return;
  }
  const iw = photo.naturalWidth || photo.width;
  const ih = photo.naturalHeight || photo.height;
  const zoom = panel?.zoom ?? 1;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const pw = iw * scale;
  const ph = ih * scale;
  const cx = x + w / 2 + (panel?.ox ?? 0) * w * 0.25;
  const cy = y + h / 2 + (panel?.oy ?? 0) * h * 0.25;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(photo, cx - pw / 2, cy - ph / 2, pw, ph);
  ctx.restore();
}

/** Sunset / neon colour wash over a photo rect. */
function gradeWash(ctx, grade, x, y, w, h, strength = 0.28) {
  const g = GRADES[grade] ?? GRADES.sunset;
  const wash = ctx.createLinearGradient(x, y, x + w, y + h);
  wash.addColorStop(0, g.sky[0]);
  wash.addColorStop(0.55, g.sky[1]);
  wash.addColorStop(1, g.sky[2]);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  const warm = ctx.createLinearGradient(x, y + h * 0.55, x, y + h);
  warm.addColorStop(0, 'rgba(255,94,98,0)');
  warm.addColorStop(1, 'rgba(255,94,98,0.22)');
  ctx.fillStyle = warm;
  ctx.fillRect(x, y, w, h);
}

/** Film grain: deterministic speckles. */
function grain(ctx, w, h, amount) {
  const rand = seededRandom(20261119);
  ctx.save();
  for (let i = 0; i < amount; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(rand() * w, rand() * h, 1.6, 1.6);
  }
  ctx.restore();
}

/** Darkened corners. */
function vignette(ctx, w, h) {
  const r = Math.hypot(w, h) / 2;
  const v = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,4,24,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Halftone dots clipped inside the title text. */
function halftoneDots(ctx, text, x, y, size, color) {
  ctx.save();
  ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(text).width;
  ctx.beginPath();
  ctx.rect(x, y - size * 0.95, w, size * 1.15);
  ctx.clip();
  ctx.fillStyle = color;
  const step = Math.max(7, size * 0.09);
  for (let yy = y - size; yy < y + size * 0.14; yy += step) {
    for (let xx = x; xx < x + w; xx += step) {
      const r = step * 0.16 * (0.6 + 0.4 * Math.sin((xx + yy) * 0.05));
      ctx.beginPath();
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The big display title, in the chosen lettering style. */
export function drawTitle(ctx, state, x, y, w, maxSize, align = 'center') {
  const g = GRADES[state.grade] ?? GRADES.sunset;
  const text = (state.title || '').trim().toUpperCase();
  if (!text) return 0;
  let size = maxSize;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  const tx = align === 'center' ? x + w / 2 : x;
  const fit = () => {
    ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    return ctx.measureText(text).width;
  };
  while (fit() > w * 0.96 && size > 10) size -= 2;
  ctx.save();
  ctx.lineJoin = 'round';
  if (state.titleStyle === 'neon') {
    ctx.shadowColor = g.glow;
    ctx.shadowBlur = size * 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx, y);
    ctx.shadowBlur = size * 0.12;
    ctx.fillStyle = g.sky[1];
    ctx.fillText(text, tx, y);
  } else if (state.titleStyle === 'outline') {
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, tx, y);
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.strokeStyle = g.glow;
    ctx.strokeText(text, tx, y);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    ctx.fillText(text, tx, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (state.titleStyle === 'halftone') {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = 'source-atop';
      halftoneDots(ctx, text, align === 'center' ? tx - fit() / 2 : tx, y, size, g.sky[1]);
      ctx.restore();
    }
  }
  ctx.restore();
  return size;
}

/** Script subtitle under the title. */
function drawSubtitle(ctx, state, x, y, w, size) {
  const text = (state.subtitle || '').trim();
  if (!text) return;
  ctx.save();
  ctx.font = `${size}px Pacifico, cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = GRADES[state.grade].glow;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = size * 0.3;
  ctx.fillText(text, x + w / 2, y);
  ctx.restore();
}

/** Star heat meter, e.g. ★★★★☆. */
export function drawStars(ctx, state, x, y, size) {
  const full = '★'.repeat(Math.max(0, Math.min(5, state.stars | 0)));
  const empty = '☆'.repeat(5 - full.length);
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffd23d';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = size * 0.2;
  ctx.fillText(full + empty, x, y);
  ctx.restore();
}

/** Badge pill in the top-right corner, fully inside the cover. */
function drawBadge(ctx, state, w, h) {
  const text = (state.badge || '').trim().toUpperCase();
  if (!text) return;
  const g = GRADES[state.grade] ?? GRADES.sunset;
  const bh = h * 0.045;
  const bw = Math.min(w * 0.42, text.length * bh * 0.62 + bh * 1.2);
  const bx = w - bw - w * 0.015;
  const by = h * 0.015;
  ctx.save();
  ctx.fillStyle = g.sky[1];
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, h * 0.002);
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, bh / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(bh * 0.52)}px "Bebas Neue", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + bw / 2, by + bh * 0.54);
  ctx.restore();
}

/** Title block cell used by the nine-panel grid (centre cell). */
function drawTitleBlock(ctx, state, photos, x, y, w, h) {
  const g = GRADES[state.grade] ?? GRADES.sunset;
  const sky = ctx.createLinearGradient(x, y, x + w, y + h);
  sky.addColorStop(0, g.sky[0]);
  sky.addColorStop(0.55, g.sky[1]);
  sky.addColorStop(1, g.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  // Sun disc.
  ctx.save();
  ctx.fillStyle = 'rgba(255,240,180,0.95)';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.34, Math.min(w, h) * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // City-skyline silhouette along the foot of the title block (original art:
  // plain rectangles, no traced artwork), clipped inside the block.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(20,8,32,0.8)';
  const base = y + h * 0.98;
  const tops = [0.93, 0.9, 0.94, 0.89, 0.93, 0.91, 0.95];
  const bw = w / tops.length;
  tops.forEach((t, i) => {
    ctx.fillRect(x + i * bw + bw * 0.08, y + h * t, bw * 0.84, base - (y + h * t));
  });
  ctx.restore();
  const titleSize = drawTitle(ctx, state, x, y + h * 0.62, w, h * 0.24);
  drawSubtitle(ctx, state, x, y + h * 0.62 + titleSize * 0.62, w, Math.max(10, h * 0.085));
  drawStars(ctx, state, x + w / 2, y + h * 0.86, Math.max(10, h * 0.075));
}

/** Cell rectangles for each layout at size W x H. */
export function layoutCells(layout, W, H) {
  const gap = Math.round(Math.min(W, H) * 0.012);
  if (layout === 'nine') {
    const cw = (W - gap * 4) / 3;
    const ch = (H - gap * 4) / 3;
    const cells = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        cells.push({ x: gap + c * (cw + gap), y: gap + r * (ch + gap), w: cw, h: ch, title: r === 1 && c === 1 });
      }
    }
    return cells;
  }
  if (layout === 'hero') {
    const heroW = (W - gap * 3) * 0.62;
    const sideW = W - heroW - gap * 3;
    const sideH = (H - gap * 4) / 3;
    return [
      { x: gap, y: gap, w: heroW, h: H - gap * 2 },
      { x: gap * 2 + heroW, y: gap, w: sideW, h: sideH },
      { x: gap * 2 + heroW, y: gap * 2 + sideH, w: sideW, h: sideH },
      { x: gap * 2 + heroW, y: gap * 3 + sideH * 2, w: sideW, h: sideH },
    ];
  }
  if (layout === 'tilted') {
    const pw = W * 0.42;
    const ph = H * 0.46;
    return [
      { x: W * 0.06, y: H * 0.1, w: pw, h: ph, tilt: -0.09 },
      { x: W * 0.5, y: H * 0.06, w: pw, h: ph, tilt: 0.07 },
      { x: W * 0.12, y: H * 0.48, w: pw, h: ph, tilt: 0.06 },
      { x: W * 0.52, y: H * 0.44, w: pw, h: ph, tilt: -0.06 },
    ];
  }
  return [{ x: 0, y: 0, w: W, h: H }];
}

/**
 * Draws the whole cover onto `canvas` (its width/height are the export size).
 * `photos` is an array of Image objects; state.panels pick them by index.
 */
export function drawCover(canvas, photos, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const g = GRADES[state.grade] ?? GRADES.sunset;
  ctx.fillStyle = g.ink;
  ctx.fillRect(0, 0, W, H);
  const cells = layoutCells(state.layout, W, H);
  const frame = Math.max(2, Math.round(Math.min(W, H) * 0.006));

  if (state.layout === 'tilted') {
    const bg = photos[state.panels[0]?.photo ?? 0];
    drawPhotoInto(ctx, bg, 0, 0, W, H, { zoom: 1.15, ox: 0, oy: 0 });
    gradeWash(ctx, state.grade, 0, 0, W, H, 0.34);
    ctx.fillStyle = 'rgba(10,4,24,0.25)';
    ctx.fillRect(0, 0, W, H);
  }

  cells.forEach((cell, i) => {
    const panel = state.panels[i] ?? { photo: 0, zoom: 1, ox: 0, oy: 0 };
    const photo = photos[panel.photo] ?? photos[0] ?? null;
    ctx.save();
    ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
    if (cell.tilt) {
      ctx.rotate(cell.tilt);
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = Math.min(W, H) * 0.03;
      ctx.shadowOffsetY = Math.min(W, H) * 0.012;
    }
    ctx.translate(-cell.w / 2, -cell.h / 2);
    if (cell.title) {
      drawTitleBlock(ctx, state, photos, 0, 0, cell.w, cell.h);
    } else {
      // White snapshot border, then the photo, then its grade wash.
      ctx.fillStyle = '#fdf8f0';
      ctx.fillRect(0, 0, cell.w, cell.h);
      const inner = state.layout === 'tilted' ? Math.max(3, cell.w * 0.03) : frame;
      const bottom = state.layout === 'tilted' ? Math.max(10, cell.h * 0.1) : inner;
      drawPhotoInto(ctx, photo, inner, inner, cell.w - inner * 2, cell.h - inner - bottom, panel);
      gradeWash(ctx, state.grade, inner, inner, cell.w - inner * 2, cell.h - inner - bottom, 0.22);
      // Inked keyline around every panel, poster style.
      ctx.strokeStyle = g.ink;
      ctx.lineWidth = frame;
      ctx.strokeRect(frame / 2, frame / 2, cell.w - frame, cell.h - frame);
    }
    ctx.restore();
  });

  if (state.layout !== 'nine') {
    // Title band across the foot for hero / tilted / solo.
    const bandH = H * 0.2;
    const bandY = H - bandH;
    const band = ctx.createLinearGradient(0, bandY, 0, H);
    band.addColorStop(0, 'rgba(16,6,32,0)');
    band.addColorStop(0.35, 'rgba(16,6,32,0.82)');
    band.addColorStop(1, 'rgba(16,6,32,0.94)');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY, W, bandH);
    drawTitle(ctx, state, 0, bandY + bandH * 0.44, W, bandH * 0.5);
    drawSubtitle(ctx, state, 0, bandY + bandH * 0.7, W, Math.max(12, bandH * 0.18));
    drawStars(ctx, state, W / 2, bandY + bandH * 0.95, Math.max(12, bandH * 0.18));
  }

  drawBadge(ctx, state, W, H);
  if (state.grain) grain(ctx, W, H, Math.round((W * H) / 900));
  if (state.vignette) vignette(ctx, W, H);
}
