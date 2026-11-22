/* CornerWindow site. Draws the island's outline, not its contents:
   the springs and the outline follow the app (core/anim.py, ui/shape.py). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── springs: SwiftUI semantics, response in seconds, damping < 1 bounces ── */
  class Spring {
    constructor(x) { this.x = x; this.v = 0; this.t = x; this.resp = 0.4; this.damp = 0.8; }
    to(t, resp, damp) { this.t = t; this.resp = resp; this.damp = damp; }
    snap(x) { this.x = this.t = x; this.v = 0; }
    step(dt) {
      if (this.idle) return;
      if (reduceMotion) { this.snap(this.t); return; }
      const k = (2 * Math.PI / this.resp) ** 2;
      const c = 4 * Math.PI * this.damp / this.resp;
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = -k * (this.x - this.t) - c * this.v;
        this.v += a * h; this.x += this.v * h;
      }
      if (Math.abs(this.x - this.t) < 5e-4 && Math.abs(this.v) < 5e-3) this.snap(this.t);
    }
    get idle() { return this.x === this.t && this.v === 0; }
  }

  /* ── the outline: a quarter-circle collapsed, a panel with a rounded inner corner
     and concave "ears" open. Canonical frame: origin at the screen corner, x and y
     grow into the screen; `bw` mirrors x for a top-right corner. ── */
  const K = 0.5522847498;
  function outline(w, h, R, f, bw) {
    R = Math.max(0, Math.min(R, w, h));
    f = Math.max(0, Math.min(f, h - R, w - R));
    const P = (x, y) => `${(bw - x).toFixed(2)} ${y.toFixed(2)}`;
    let d = `M${P(0, 0)}L${P(w + f, 0)}`;
    if (f > 0.01) d += `C${P(w + f - f * K, 0)} ${P(w, f - f * K)} ${P(w, f)}`;
    d += `L${P(w, h - R)}C${P(w, h - R + R * K)} ${P(w - R + R * K, h)} ${P(w - R, h)}`;
    d += `L${P(f, h)}`;
    if (f > 0.01) d += `C${P(f - f * K, h)} ${P(0, h + f - f * K)} ${P(0, h + f)}`;
    return d + 'Z';
  }

  /* An outline that springs open and shut inside an SVG. Width and height have
     their own springs, like the app's open_response / open_height_response. */
  function morph({ host, svg, path, rest, radius, ears, margin, anim }) {
    const p = new Spring(0), q = new Spring(0);
    let open = false, raf = 0, last = 0, bw = 0, bh = 0;
    const size = () => {
      const r = host.getBoundingClientRect();
      bw = r.width; bh = r.height;
      svg.setAttribute('viewBox', `0 0 ${bw} ${bh}`);
      draw();
    };
    const draw = () => {
      const W = bw - ears - margin, H = bh - ears - margin;
      const pc = Math.max(0, p.x), qc = Math.max(0, q.x);
      const t = clamp(Math.min(pc, qc), 0, 1);
      const w = Math.min(rest + (W - rest) * pc, bw - ears * t);
      const h = Math.min(rest + (H - rest) * qc, bh - ears * t);
      path.setAttribute('d', outline(w, h, rest + (radius - rest) * t, ears * t, bw));
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      p.step(dt); q.step(dt); draw();
      raf = p.idle && q.idle ? 0 : requestAnimationFrame(frame);
    };
    const set = (v) => {
      open = v;
      const a = anim();
      if (open) { p.to(1, a.response, a.damping); q.to(1, a.response * 1.19, Math.min(1, a.damping + 0.1)); }
      else { p.to(0, 0.3, 1); q.to(0, 0.3, 1); }
      host.classList.toggle('open', open);
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    new ResizeObserver(size).observe(host);
    size();
    return { set, toggle: () => set(!open), get open() { return open; } };
  }

  /* ── spring settings, shared by the hero and the lab ── */
  const resp = $('#resp'), damp = $('#damp');
  const anim = () => ({ response: +resp.value, damping: +damp.value });

  /* ── hero: the outline springs out of the page corner once, then on click ── */
  const heroHost = $('#hero-shape');
  const hero = morph({
    host: heroHost, svg: $('#hero-svg'), path: $('#hero-path'),
    rest: 20, radius: 56, ears: 28, margin: 0, anim: () => ({ response: 0.42, damping: 0.78 }),
  });
  const syncHeroLabel = () => {
    heroHost.setAttribute('aria-pressed', String(hero.open));
    heroHost.setAttribute('aria-label', hero.open ? 'Fold the panel outline back into the corner' : 'Spring the panel outline open');
    $('.shape-caption').textContent = hero.open ? 'Click to fold it back into the corner.' : '';
  };
  const toggleHero = () => { hero.toggle(); syncHeroLabel(); };
  heroHost.addEventListener('click', toggleHero);
  heroHost.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHero(); } });
  setTimeout(() => { hero.set(true); syncHeroLabel(); }, reduceMotion ? 0 : 450);

  /* ── the quarter in "Closed": an arc and a value, as the trigger shows them ── */
  (function bigQuarter() {
    const arc = (frac) => {
      const rho = 262, pts = [];
      for (let i = 0; i <= 48; i++) { const th = (frac * i / 48) * Math.PI / 2; pts.push(`${(rho * Math.cos(th)).toFixed(1)} ${(rho * Math.sin(th)).toFixed(1)}`); }
      return 'M' + pts.join('L');
    };
    $('#bq-track').setAttribute('d', arc(1));
    $('#bq-val').setAttribute('d', arc(0.8));
  })();

  /* ── spring lab ── */
  const mini = morph({
    host: $('#mini-screen'), svg: $('#mini-svg'), path: $('#mini-path'),
    rest: 9, radius: 14, ears: 6, margin: 18, anim,
  });
  const miniHost = $('#mini-screen');
  miniHost.addEventListener('click', () => mini.toggle());
  miniHost.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mini.toggle(); } });

  function plotSpring() {
    const r = +resp.value, z = +damp.value;
    $('#resp-out').textContent = r.toFixed(2) + ' s';
    $('#damp-out').textContent = z.toFixed(2);
    const span = Math.max(1.5, r * 3.2);
    $('#plot-time').textContent = span.toFixed(1) + ' s';
    const k = (2 * Math.PI / r) ** 2, c = 4 * Math.PI * z / r;
    let x = 0, v = 0; const pts = []; const N = 260, dt = span / N;
    for (let i = 0; i <= N; i++) {
      pts.push(`${(i / N * 520).toFixed(1)},${(200 - x * 140).toFixed(1)}`);
      for (let j = 0; j < 4; j++) { const a = -k * (x - 1) - c * v; v += a * dt / 4; x += v * dt / 4; }
    }
    $('#spring-line').setAttribute('points', pts.join(' '));
  }
  resp.addEventListener('input', plotSpring);
  damp.addEventListener('input', plotSpring);
  plotSpring();

  /* ── glass lens ── */
  const lens = $('#lens'), stage = $('#glass-stage');
  let lensPos = null;
  function placeLens(x, y) {
    const r = stage.getBoundingClientRect(), lr = lens.offsetWidth / 2;
    lensPos = { x: clamp(x, lr * 0.4, r.width - lr * 0.4), y: clamp(y, lr * 0.4, r.height - lr * 0.4) };
    lens.style.left = lensPos.x + 'px'; lens.style.top = lensPos.y + 'px';
  }
  lens.addEventListener('pointerdown', (e) => {
    lens.setPointerCapture(e.pointerId);
    const r = stage.getBoundingClientRect();
    const ox = e.clientX - r.left - (lensPos?.x ?? r.width / 2), oy = e.clientY - r.top - (lensPos?.y ?? r.height / 2);
    const move = (ev) => placeLens(ev.clientX - r.left - ox, ev.clientY - r.top - oy);
    const up = () => { lens.removeEventListener('pointermove', move); lens.removeEventListener('pointerup', up); };
    lens.addEventListener('pointermove', move); lens.addEventListener('pointerup', up);
  });
  lens.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    placeLens((lensPos?.x ?? r.width / 2) + d[0], (lensPos?.y ?? r.height / 2) + d[1]);
  });
  $('#frost').addEventListener('input', (e) => lens.style.setProperty('--frost', e.target.value));
  $('#tint').addEventListener('input', (e) => lens.style.setProperty('--tint', e.target.value));

  /* ── copy buttons ── */
  const toastEl = $('#toast');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  };
  $$('.copy').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } catch { toast('Your browser blocked copying. Select the text instead.'); }
  }));
})();
