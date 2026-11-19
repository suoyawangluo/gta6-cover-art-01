// Fixed scenes for screenshots: ?shot=cover shows the exported cover alone at the
// window's size; ?shot=editor shows the editor with sample photos loaded.
// Query params: layout, grade, title, subtitle, stars. window.__shotReady is set
// once the scene has painted, so headless screenshots catch the finished frame.
export async function runShot(shot, query, ctx) {
  const { state, redraw, syncControls } = ctx;
  const layout = query.get('layout');
  const grade = query.get('grade');
  const title = query.get('title');
  const subtitle = query.get('subtitle');
  const stars = query.get('stars');
  if (layout) state.layout = layout;
  if (grade) state.grade = grade;
  if (title) state.title = title;
  if (subtitle) state.subtitle = subtitle;
  if (stars) state.stars = Number(stars);
  // Mix the two samples across the panels so every panel shows a photo.
  state.panels.forEach((p, i) => { p.photo = i % 2; p.zoom = 1; p.ox = 0; p.oy = 0; });
  if (shot === 'cover' || shot === 'story') {
    document.body.classList.add('shot-cover');
    const canvas = document.getElementById('cover');
    // Size the canvas to the viewport's aspect so the CSS stretch never distorts it.
    const size = shot === 'story'
      ? [1080, 1350]
      : window.innerWidth >= window.innerHeight
        ? [1920, Math.round(1920 * window.innerHeight / window.innerWidth)]
        : [Math.round(1920 * window.innerWidth / window.innerHeight), 1920];
    canvas.width = size[0];
    canvas.height = size[1];
  }
  syncControls();
  redraw();
  await document.fonts.ready;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    redraw();
    window.__shotReady = true;
  }));
}
