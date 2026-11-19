// Neon Coast Cover Studio — editor wiring.
// Owns the state, the controls, undo/redo, drag-to-pan per panel and PNG export.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { GRADES, LAYOUTS, TITLE_STYLES, defaultState, drawCover, layoutCells } from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const previewSize = 720;
canvas.width = previewSize;
canvas.height = previewSize;

const state = defaultState();
let photos = []; // Image objects: [boulevard sample, pier sample, ...uploads]
let photoNames = [];
let selectedPanel = 0;
let history = [];
let future = [];

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function snapshot() {
  return JSON.stringify({ ...state, panels: state.panels });
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > 60) history.shift();
  future = [];
  updateUndoButtons();
}

function applySnapshot(json) {
  const saved = JSON.parse(json);
  Object.assign(state, saved);
  state.panels = saved.panels;
  syncControls();
  redraw();
}

function updateUndoButtons() {
  $('undo').disabled = history.length === 0;
  $('redo').disabled = future.length === 0;
}

function redraw() {
  drawCover(canvas, photos, state);
  renderPanelPicker();
}

function renderPanelPicker() {
  const wrap = $('panels');
  wrap.innerHTML = '';
  const cells = layoutCells(state.layout, 100, 100);
  cells.forEach((cell, i) => {
    if (cell.title) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'panel-chip' + (i === selectedPanel ? ' selected' : '');
    b.textContent = `Panel ${i + 1} · ${photoNames[state.panels[i]?.photo ?? 0] ?? '—'}`;
    b.addEventListener('click', () => {
      selectedPanel = i;
      syncPanelControls();
      redraw();
    });
    wrap.appendChild(b);
  });
}

function syncPanelControls() {
  const panel = state.panels[selectedPanel] ?? state.panels[0];
  $('panelPhoto').value = String(panel.photo);
  $('zoom').value = String(panel.zoom);
  $('zoomVal').textContent = `${Math.round(panel.zoom * 100)}%`;
}

function syncControls() {
  $('title').value = state.title;
  $('subtitle').value = state.subtitle;
  $('badge').value = state.badge;
  $('stars').value = String(state.stars);
  $('starsVal').textContent = `${state.stars} ★`;
  document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('active', b.dataset.layout === state.layout));
  document.querySelectorAll('[data-grade]').forEach((b) => b.classList.toggle('active', b.dataset.grade === state.grade));
  document.querySelectorAll('[data-titlestyle]').forEach((b) => b.classList.toggle('active', b.dataset.titlestyle === state.titleStyle));
  $('grain').checked = state.grain;
  $('vignette').checked = state.vignette;
  syncPanelControls();
}

function buildControlGroups() {
  const layoutWrap = $('layouts');
  Object.entries(LAYOUTS).forEach(([key, def]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.layout = key;
    b.textContent = def.name;
    b.addEventListener('click', () => {
      pushHistory();
      state.layout = key;
      selectedPanel = 0;
      syncControls();
      redraw();
    });
    layoutWrap.appendChild(b);
  });
  const gradeWrap = $('grades');
  Object.entries(GRADES).forEach(([key, def]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.grade = key;
    b.textContent = def.name;
    b.addEventListener('click', () => {
      pushHistory();
      state.grade = key;
      syncControls();
      redraw();
    });
    gradeWrap.appendChild(b);
  });
  const styleWrap = $('titleStyles');
  Object.entries(TITLE_STYLES).forEach(([key, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.titlestyle = key;
    b.textContent = label;
    b.addEventListener('click', () => {
      pushHistory();
      state.titleStyle = key;
      syncControls();
      redraw();
    });
    styleWrap.appendChild(b);
  });
  const photoSel = $('panelPhoto');
  photoNames.forEach((name, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = name;
    photoSel.appendChild(o);
  });
}

function downloadCanvas(off, filename) {
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve();
    }, 'image/png');
  });
}

/** Renders the current cover at W x H and downloads it as a PNG. */
export async function exportCover(w, h) {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  drawCover(off, photos, state);
  await downloadCanvas(off, `neon-coast-${w}x${h}.png`);
  return off;
}

function setStatus(text) {
  $('status').textContent = text;
}

function bindEvents() {
  $('photo').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    for (const file of files) {
      const img = await loadImage(URL.createObjectURL(file));
      photos.push(img);
      photoNames.push(file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Photo');
      const o = document.createElement('option');
      o.value = String(photos.length - 1);
      o.textContent = photoNames[photoNames.length - 1];
      $('panelPhoto').appendChild(o);
    }
    if (files.length) {
      pushHistory();
      // New photos fill the first panels so the cover updates at once.
      files.forEach((_, k) => {
        if (k < state.panels.length) state.panels[k].photo = photos.length - files.length + k;
      });
      redraw();
      setStatus(`Loaded ${files.length} photo${files.length > 1 ? 's' : ''}.`);
    }
    e.target.value = '';
  });
  $('sampleBoulevard').addEventListener('click', async () => {
    pushHistory();
    state.panels.forEach((p) => { p.photo = 0; });
    redraw();
    setStatus('Sample photo: boulevard.');
  });
  $('samplePier').addEventListener('click', async () => {
    pushHistory();
    state.panels.forEach((p) => { p.photo = 1; });
    redraw();
    setStatus('Sample photo: pier.');
  });
  const editTitle = (key, input) => {
    input.addEventListener('input', () => {
      state[key] = input.value;
      redraw();
    });
    input.addEventListener('change', pushHistory);
  };
  editTitle('title', $('title'));
  editTitle('subtitle', $('subtitle'));
  editTitle('badge', $('badge'));
  $('stars').addEventListener('input', () => {
    state.stars = Number($('stars').value);
    $('starsVal').textContent = `${state.stars} ★`;
    redraw();
  });
  $('stars').addEventListener('change', pushHistory);
  $('grain').addEventListener('change', () => { pushHistory(); state.grain = $('grain').checked; redraw(); });
  $('vignette').addEventListener('change', () => { pushHistory(); state.vignette = $('vignette').checked; redraw(); });
  $('panelPhoto').addEventListener('change', () => {
    pushHistory();
    state.panels[selectedPanel].photo = Number($('panelPhoto').value);
    redraw();
  });
  $('zoom').addEventListener('input', () => {
    state.panels[selectedPanel].zoom = Number($('zoom').value);
    $('zoomVal').textContent = `${Math.round(state.panels[selectedPanel].zoom * 100)}%`;
    redraw();
  });
  $('zoom').addEventListener('change', pushHistory);
  $('fillAll').addEventListener('click', () => {
    pushHistory();
    const photo = state.panels[selectedPanel].photo;
    state.panels.forEach((p) => { p.photo = photo; });
    redraw();
  });
  $('shuffle').addEventListener('click', () => {
    pushHistory();
    state.panels.forEach((p, i) => { p.photo = (p.photo + 1) % Math.max(1, photos.length); p.ox = 0; p.oy = 0; });
    redraw();
  });
  $('undo').addEventListener('click', () => {
    if (!history.length) return;
    future.push(snapshot());
    applySnapshot(history.pop());
    updateUndoButtons();
  });
  $('redo').addEventListener('click', () => {
    if (!future.length) return;
    history.push(snapshot());
    applySnapshot(future.pop());
    updateUndoButtons();
  });

  // Drag on the preview pans the selected panel's photo.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    // Pick the panel under the pointer.
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const cells = layoutCells(state.layout, canvas.width, canvas.height);
    const hit = cells.findIndex((c) => !c.title && px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h);
    if (hit >= 0) {
      selectedPanel = hit;
      syncPanelControls();
      redraw();
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const panel = state.panels[selectedPanel];
    panel.ox += ((e.clientX - lastX) / rect.width) * 2;
    panel.oy += ((e.clientY - lastY) / rect.height) * 2;
    panel.ox = Math.max(-1, Math.min(1, panel.ox));
    panel.oy = Math.max(-1, Math.min(1, panel.oy));
    lastX = e.clientX;
    lastY = e.clientY;
    redraw();
  });
  canvas.addEventListener('pointerup', () => {
    if (dragging) pushHistory();
    dragging = false;
  });

  document.querySelectorAll('[data-export]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [w, h] = b.dataset.export.split('x').map(Number);
      setStatus(`Exporting ${w} x ${h}…`);
      await exportCover(w, h);
      setStatus(`Saved neon-coast-${w}x${h}.png`);
    });
  });
  $('exportAll').addEventListener('click', async () => {
    setStatus('Exporting all three sizes…');
    for (const [w, h] of [[1080, 1080], [1080, 1350], [1920, 1080]]) {
      await exportCover(w, h);
      await new Promise((r) => setTimeout(r, 120));
    }
    setStatus('Saved all three PNGs: 1080 x 1080, 1080 x 1350, 1920 x 1080.');
  });
}

async function boot() {
  // Load in order so photos[0] is always the boulevard sample.
  photos[0] = await loadImage('samples/boulevard.jpg');
  photoNames[0] = 'Boulevard sample';
  photos[1] = await loadImage('samples/pier.jpg');
  photoNames[1] = 'Pier sample';
  await document.fonts.ready;
  buildControlGroups();
  bindEvents();
  syncControls();
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    await runShot(shot, new URLSearchParams(location.search), { state, photos, photoNames, redraw, pushHistory, syncControls });
  } else {
    redraw();
  }
  updateUndoButtons();
}

boot();
