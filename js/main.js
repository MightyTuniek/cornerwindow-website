/* CornerWindow site: a working island in the page corner.
   Springs and the outline follow the app (core/anim.py, ui/shape.py). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cw.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('cw.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  /* ── springs: SwiftUI semantics, response in seconds, damping < 1 bounces ── */
  class Spring {
    constructor(x) { this.x = x; this.v = 0; this.t = x; this.resp = 0.4; this.damp = 0.8; }
    to(t, resp, damp) { this.t = t; this.resp = resp; this.damp = damp; }
    snap(x) { this.x = this.t = x; this.v = 0; }
    step(dt, eps = 5e-4) {
      if (this.x === this.t && this.v === 0) return;
      if (reduceMotion) { this.snap(this.t); return; }
      const k = (2 * Math.PI / this.resp) ** 2;
      const c = 4 * Math.PI * this.damp / this.resp;
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = -k * (this.x - this.t) - c * this.v;
        this.v += a * h; this.x += this.v * h;
      }
      if (Math.abs(this.x - this.t) < eps && Math.abs(this.v) < eps * 10) this.snap(this.t);
    }
    get idle() { return this.x === this.t && this.v === 0; }
  }

  const ANIM = {
    open_response: 0.42, open_damping: 0.78, open_height_response: 0.5,
    close_response: 0.30, close_damping: 1.0, hover_response: 0.25, hover_damping: 0.9,
  };

  /* ── the outline: quarter-circle collapsed, panel with inner corner + concave ears open ──
     Canonical frame: origin at the screen corner, x and y grow into the screen.
     `bw` mirrors x for a top-right corner. */
  const K = 0.5522847498;
  function outline(w, h, R, f, bw) {
    R = Math.max(0, Math.min(R, w, h));
    f = Math.max(0, Math.min(f, h - R, w - R));
    const X = (x) => (bw - x).toFixed(2), Y = (y) => y.toFixed(2);
    const P = (x, y) => `${X(x)} ${Y(y)}`;
    let d = `M${P(0, 0)}L${P(w + f, 0)}`;
    if (f > 0.01) d += `C${P(w + f - f * K, 0)} ${P(w, f - f * K)} ${P(w, f)}`;
    d += `L${P(w, h - R)}C${P(w, h - R + R * K)} ${P(w - R + R * K, h)} ${P(w - R, h)}`;
    d += `L${P(f, h)}`;
    if (f > 0.01) d += `C${P(f - f * K, h)} ${P(0, h + f - f * K)} ${P(0, h + f)}`;
    return d + 'Z';
  }
  function arcPath(rho, frac, bw, from = 0) {
    const pts = [], n = 28;
    for (let i = 0; i <= n; i++) {
      const th = (from + (frac - from) * (i / n)) * Math.PI / 2;
      pts.push(`${(bw - rho * Math.cos(th)).toFixed(2)} ${(rho * Math.sin(th)).toFixed(2)}`);
    }
    return frac - from <= 0.001 ? '' : 'M' + pts.join('L');
  }

  /* ── state ── */
  const PRESETS = {
    day: { brightness: 80, contrast: 60, night: false },
    evening: { brightness: 45, contrast: 50, night: true },
    night: { brightness: 15, contrast: 45, night: true },
    movie: { brightness: 60, contrast: 70, night: false },
  };
  const S = {
    brightness: 80, contrast: 60, volume: 55, muted: false, mic: false, awake: false,
    night: false, dark: false, glass: false, wifi: true, bt: true, dnd: false, playing: true,
    frost: 0.5, tint: 0.5,
  };
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  S.dark = store.get('dark', prefersDark.matches);

  const root = document.documentElement;
  const page = $('#page');
  const veil = $('#night-veil');
  const cw = $('#cw');
  const pathEl = $('#cw-path');
  const content = $('#cw-content');
  const inner = $('#cw-inner');
  const trigger = $('#cw-trigger');
  const cmd = $('#cw-cmd');
  const cmdHint = $('#cw-cmd-hint');

  /* ── icons ── */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    micoff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16"/>',
    speaker: '<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="14" r="3"/><path d="M12 7h.01"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    prev: '<path d="M18 6l-8 6 8 6zM6 6v12"/>',
    next: '<path d="M6 6l8 6-8 6zM18 6v12"/>',
    play: '<path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor"/>',
    pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3"/>',
    pin: '<path d="M9 3.5h6l-1 6 3.5 3.5h-11L10 9.5zM12 13v7.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.6a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
    bt: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    half: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
    focus: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
    cup: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M12 3.5v2.5"/>',
    drop: '<path d="M12 3.5c3.5 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.5-6.3 6-10.5z"/><path d="M9.2 14.5a3 3 0 0 0 2.3 2.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    sleep: '<path d="M14 4h5l-5 6h5M17.5 15A7 7 0 1 1 9 6.5"/>',
    restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4v5h5"/>',
    power: '<path d="M12 3v8"/><path d="M6.8 6.5a7.5 7.5 0 1 0 10.4 0"/>',
  };
  const setIcon = (el, name) => { el.setAttribute('viewBox', '0 0 24 24'); el.innerHTML = ICONS[name] || ''; el.dataset.icon = name; };
  $$('svg[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));

  /* ── toast ── */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  /* ══════════════ the island ══════════════ */
  const R_REST = 20, R_HOVER = 26, R_ACTIVE = 46, INNER_R = 28, EARS = 10;
  const p = new Spring(0);   // width progress
  const q = new Spring(0);   // height progress
  const rS = new Spring(R_REST);
  let open = false, pinned = false, hover = false;
  let W = 640, H = 600, BW = 720, BH = 680;
  let activity = null;       // { kind, value, until }
  let rafId = 0, last = 0;

  function measure() {
    cw.style.width = innerWidth + 'px';
    cw.style.height = innerHeight + 'px';
    inner.style.height = 'auto';
    inner.style.width = 'auto';
    const natW = inner.offsetWidth, natH = inner.scrollHeight;
    W = Math.min(natW, innerWidth - 12);
    H = Math.min(natH, innerHeight - 16);
    inner.style.width = W + 'px';
    inner.style.height = H + 'px';
    BW = Math.min(innerWidth, W + 70);
    BH = Math.min(innerHeight, H + 70);
    cw.style.width = BW + 'px';
    cw.style.height = BH + 'px';
    // pour out of the corner: nearest card first
    const box = inner.getBoundingClientRect();
    const cards = $$('.cw-card', inner).map((c) => {
      const r = c.getBoundingClientRect();
      return { c, d: Math.hypot(box.right - r.right, r.top - box.top) };
    }).sort((a, b) => a.d - b.d);
    cards.forEach(({ c }, i) => c.style.setProperty('--i', i));
  }
  function sizeCollapsed() {
    BW = BH = 80;
    cw.style.width = BW + 'px'; cw.style.height = BH + 'px';
  }

  function kick() { if (!rafId) { last = performance.now(); rafId = requestAnimationFrame(frame); } }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    p.step(dt); q.step(dt); rS.step(dt, 0.01);
    draw();
    const actLive = activity && now < activity.until;
    if (activity && !actLive) { activity = null; updateR(); }
    if (p.idle && q.idle && rS.idle && !actLive) {
      rafId = 0;
      if (!open && p.x === 0) { sizeCollapsed(); draw(); }
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function draw() {
    const r = rS.x;
    const pc = Math.max(0, p.x), qc = Math.max(0, q.x);
    const t = clamp(Math.min(pc, qc), 0, 1);
    let w = r + (W - r) * pc, h = r + (H - r) * qc;
    const f = EARS * t;
    w = Math.min(w, BW - f); h = Math.min(h, BH - f);
    const R = r + (INNER_R - r) * t;
    const d = outline(w, h, R, f, BW);
    pathEl.setAttribute('d', d);
    content.style.clipPath = `path('${d}')`;
    cw.classList.toggle('shadowed', t > 0.02);
    drawActivity(r, t);
  }

  const act = { track: $('#act-track'), val: $('#act-val'), ring: $('#act-ring'), num: $('#act-num'), mic: $('#dot-mic'), awake: $('#dot-awake') };
  function drawActivity(r, t) {
    const show = t < 0.04;
    const live = show && activity && performance.now() < activity.until;
    const grow = clamp((r - R_HOVER) / (R_ACTIVE - R_HOVER), 0, 1);
    if (live && grow > 0.05) {
      const rho = r - 10;
      act.track.setAttribute('d', arcPath(rho, 1, BW));
      act.val.setAttribute('d', arcPath(rho, clamp(activity.value / 100, 0.001, 1), BW));
      act.num.textContent = activity.label;
      act.num.setAttribute('x', (BW - r * 0.3).toFixed(1));
      act.num.setAttribute('y', (r * 0.36 + 3).toFixed(1));
      act.track.style.opacity = act.val.style.opacity = act.num.style.opacity = grow;
    } else {
      act.track.setAttribute('d', ''); act.val.setAttribute('d', ''); act.num.textContent = '';
    }
    const tf = timerFraction();
    act.ring.setAttribute('d', show && tf != null && !live ? arcPath(r - 4.5, tf, BW) : '');
    const dotsOn = show && !live;
    act.mic.setAttribute('cx', BW - 6.5); act.mic.setAttribute('cy', 6.5);
    act.awake.setAttribute('cx', BW - (S.mic ? 13.5 : 6.5)); act.awake.setAttribute('cy', S.mic ? 4 : 6.5);
    act.mic.style.display = dotsOn && S.mic ? '' : 'none';
    act.awake.style.display = dotsOn && S.awake ? '' : 'none';
  }

  function updateR() {
    const live = activity && performance.now() < activity.until;
    const target = live ? R_ACTIVE : (hover && !open ? R_HOVER : (timerRunning() && !open ? 23 : R_REST));
    rS.to(target, ANIM.hover_response, live ? 0.72 : ANIM.hover_damping);
    kick();
  }

  function showActivity(kind, value, label) {
    if (open) return;
    if (BW < 80) sizeCollapsed();
    activity = { kind, value, label: label ?? String(Math.round(value)), until: performance.now() + 1500 };
    updateR();
    setTimeout(kick, 1550);
  }

  function setOpen(v) {
    if (v === open) return;
    open = v;
    cw.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? 'Close CornerWindow' : 'Open CornerWindow');
    if (open) {
      activity = null;
      measure();
      p.to(1, ANIM.open_response, ANIM.open_damping);
      q.to(1, ANIM.open_height_response, Math.min(1, ANIM.open_damping + 0.1));
      startTicks();
      $('.corner-note')?.classList.add('gone');
      inner.scrollTop = 0;
    } else {
      p.to(0, ANIM.close_response, ANIM.close_damping);
      q.to(0, ANIM.close_response, ANIM.close_damping);
      stopTicks();
      if (inner.contains(document.activeElement)) trigger.focus({ preventScroll: true });
      cmd.value = ''; cmdHint.textContent = '';
    }
    updateR();
    kick();
  }
  const toggleOpen = () => setOpen(!open);

  trigger.addEventListener('click', toggleOpen);
  trigger.addEventListener('pointerenter', () => { hover = true; cw.classList.add('lit'); updateR(); });
  trigger.addEventListener('pointerleave', () => { hover = false; cw.classList.remove('lit'); updateR(); });
  trigger.addEventListener('focus', () => cw.classList.add('focus-ring'));
  trigger.addEventListener('blur', () => cw.classList.remove('focus-ring'));
  trigger.addEventListener('contextmenu', (e) => { e.preventDefault(); togglePlay(); showActivity('media', S.playing ? 100 : 0, S.playing ? '▶' : 'II'); });
  trigger.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); setMuted(!S.muted); } });
  trigger.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

  function wheelStep(e) {
    e.preventDefault();
    const dir = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
    if (e.shiftKey) set('volume', S.volume + dir * 5, true);
    else set('brightness', S.brightness + dir * 5, true);
  }
  trigger.addEventListener('wheel', (e) => { if (!open) wheelStep(e); }, { passive: false });

  document.addEventListener('pointerdown', (e) => {
    if (!open || pinned) return;
    if (inner.contains(e.target) || trigger.contains(e.target)) return;
    if (e.target.closest('[data-keep-open]')) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#overlay').hidden) return;
    if (e.key === 'Escape' && open) { setOpen(false); return; }
    const typing = e.target.closest('input, textarea, [contenteditable]');
    if (e.key === '\\' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleOpen(); return; }
    if (open && !typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      cmd.focus({ preventScroll: true });
    }
  });
  addEventListener('resize', () => { if (open) { measure(); kick(); } });

  /* ── applying state to the page ── */
  function applyPage() {
    const b = 0.28 + 0.72 * (S.brightness / 80);
    const c = 0.62 + 0.38 * (S.contrast / 60);
    page.style.filter = (Math.abs(b - 1) < 0.001 && Math.abs(c - 1) < 0.001) ? '' : `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)})`;
    veil.classList.toggle('on', S.night);
    root.classList.toggle('dark', S.dark);
    $('meta[name=theme-color]').setAttribute('content', S.dark ? '#1E252C' : '#D9DFE5');
    cw.classList.toggle('glass', S.glass);
    cw.classList.toggle('light', S.glass && !S.dark);
    cw.style.setProperty('--g-frost', S.frost);
    cw.style.setProperty('--g-tint', S.tint);
  }

  function syncUI() {
    $$('.cw-slider').forEach((el) => {
      const k = el.dataset.key, v = Math.round(S[k]);
      el.querySelector('.cw-fill').style.width = `calc(${v}% + ${34 * (1 - v / 100)}px)`;
      el.querySelector('.cw-sval').textContent = k === 'volume' && S.muted ? 'Muted' : v;
      el.setAttribute('aria-valuenow', v);
    });
    const volIcon = $('.cw-slider[data-key=volume] .cw-i');
    if (volIcon.dataset.icon !== (S.muted ? 'mute' : 'volume')) setIcon(volIcon, S.muted ? 'mute' : 'volume');
    $$('[data-toggle]').forEach((el) => el.setAttribute('aria-pressed', String(!!S[el.dataset.toggle])));
    const preset = Object.entries(PRESETS).find(([, v]) => v.brightness === S.brightness && v.contrast === S.contrast && v.night === S.night);
    $$('[data-preset]').forEach((el) => el.classList.toggle('on', !!preset && preset[0] === el.dataset.preset));
    const playIcon = $('#cw-play .cw-i');
    setIcon(playIcon, S.playing ? 'pause' : 'play');
    $('#cw-play').setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
    $('#glass-panel-btn').textContent = S.glass ? 'Back to the black island' : 'Use glass on the panel';
    drawBigQuarter();
    draw();
  }

  function set(key, value, fromGesture = false) {
    S[key] = clamp(Math.round(value), 0, 100);
    if (key === 'volume' && S.muted && fromGesture) S.muted = false;
    applyPage(); syncUI();
    if (fromGesture) {
      const label = key === 'volume' ? 'Volume' : key === 'contrast' ? 'Contrast' : 'Brightness';
      lastBig = { key, label };
      showActivity(key, S[key]);
      drawBigQuarter();
    }
  }
  function setMuted(m) { S.muted = m; syncUI(); showActivity('volume', m ? 0 : S.volume, m ? '×' : undefined); }
  function applyPreset(name) {
    Object.assign(S, PRESETS[name]); applyPage(); syncUI();
    showActivity('brightness', S.brightness);
  }
  function toggle(key, v = !S[key]) {
    S[key] = v;
    if (key === 'dark') store.set('dark', v);
    applyPage(); syncUI(); draw();
    if (!open) kick();
  }

  /* pill sliders */
  $$('.cw-slider').forEach((el) => {
    const k = el.dataset.key;
    const fromX = (x) => { const r = el.getBoundingClientRect(); return clamp((x - r.left - 17) / (r.width - 34), 0, 1) * 100; };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      if (k === 'volume') S.muted = false;
      set(k, fromX(e.clientX));
      const move = (ev) => set(k, fromX(ev.clientX));
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    el.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 20, PageDown: -20 }[e.key];
      if (d) { e.preventDefault(); set(k, S[k] + d); }
      if (e.key === 'Home') { e.preventDefault(); set(k, 0); }
      if (e.key === 'End') { e.preventDefault(); set(k, 100); }
    });
  });

  $$('[data-preset]').forEach((el) => el.addEventListener('click', () => applyPreset(el.dataset.preset)));
  $$('[data-toggle]').forEach((el) => el.addEventListener('click', () => toggle(el.dataset.toggle)));

  const DEVICES = [['Speakers', 'speaker'], ['Headphones', 'headphones']];
  let dev = 0;
  $('#cw-device').addEventListener('click', () => {
    dev = (dev + 1) % DEVICES.length;
    $('#cw-device-name').textContent = DEVICES[dev][0];
    setIcon($('#cw-device .cw-i'), DEVICES[dev][1]);
  });

  /* ── now playing ── */
  const TRACKS = [
    ['Low Tide', 'Quarter Circle Band', 'linear-gradient(150deg, #2E5E7E, #E6A25A 60%, #C2473A)', 214],
    ['Night Light', 'The Presets', 'linear-gradient(150deg, #1A1B3A, #5B3E8C 55%, #E68A5A)', 187],
    ['Hold to Confirm', 'Spring Physics', 'linear-gradient(150deg, #0E3B2E, #5FA779 55%, #E9E3A1)', 242],
  ];
  let track = 0, pos = 64;
  function showTrack() {
    const [title, artist, art] = TRACKS[track];
    $('#cw-track').textContent = title; $('#cw-artist').textContent = artist;
    $('#cw-art').style.background = art;
    $('#cw-prog').style.width = (pos / TRACKS[track][3] * 100) + '%';
  }
  function togglePlay() { S.playing = !S.playing; syncUI(); }
  $('#cw-play').addEventListener('click', togglePlay);
  $('#cw-next').addEventListener('click', () => { track = (track + 1) % TRACKS.length; pos = 0; showTrack(); });
  $('#cw-prev').addEventListener('click', () => { if (pos > 3) pos = 0; else track = (track + TRACKS.length - 1) % TRACKS.length; pos = 0; showTrack(); });

  /* ── system sparklines (they tick only while open, like the app) ── */
  const series = { cpu: [], gpu: [], mem: [], net: [] };
  const seed = { cpu: 14, gpu: 5, mem: 62, net: 30 };
  Object.keys(series).forEach((k) => { let v = seed[k]; for (let i = 0; i < 40; i++) { v = walk(k, v); series[k].push(v); } });
  function walk(k, v) {
    const jump = k === 'net' ? 18 : k === 'mem' ? 1.2 : 7;
    v += (Math.random() - 0.5) * jump;
    if (k === 'cpu' && Math.random() < 0.06) v += 30;
    return clamp(v, k === 'mem' ? 55 : 1, k === 'mem' ? 70 : 96);
  }
  function drawGlance() {
    Object.entries(series).forEach(([k, arr]) => {
      $('#s-' + k).setAttribute('points', arr.map((v, i) => `${(i / (arr.length - 1) * 100).toFixed(1)},${(23 - v / 100 * 22).toFixed(1)}`).join(' '));
    });
    const l = (k) => series[k][series[k].length - 1];
    $('#g-cpu').textContent = Math.round(l('cpu')) + '%';
    $('#g-gpu').textContent = Math.round(l('gpu')) + '%';
    $('#g-mem').textContent = (l('mem') / 100 * 8.2).toFixed(1) + ' GB';
    $('#g-net').textContent = Math.round(l('net') * 12) + ' KB/s';
  }
  const bootAt = Date.now() - (3 * 3600 + 12 * 60) * 1000;
  function tickClock() {
    const d = new Date();
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#cw-clock').textContent = hm; $('#ov-clock').textContent = hm;
    $('#cw-date').textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    const up = Math.floor((Date.now() - bootAt) / 60000);
    $('#g-up').textContent = `${Math.floor(up / 60)} h ${up % 60} min`;
  }
  let tickId = 0;
  function tick() {
    Object.keys(series).forEach((k) => { const a = series[k]; a.push(walk(k, a[a.length - 1])); a.shift(); });
    drawGlance(); tickClock();
    if (S.playing) { pos += 1; if (pos >= TRACKS[track][3]) { track = (track + 1) % TRACKS.length; pos = 0; } }
    showTrack();
  }
  function startTicks() { tick(); clearInterval(tickId); tickId = setInterval(tick, 1000); }
  function stopTicks() { clearInterval(tickId); tickId = 0; }
  drawGlance(); tickClock(); showTrack();

  /* ── drawer ── */
  function selectTab(name) {
    $$('.cw-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.cw-pane').forEach((pn) => { pn.hidden = pn.dataset.pane !== name; });
    if (open) { measure(); kick(); }
  }
  $$('.cw-tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

  // timer
  let timer = null; // { end, total }
  const timerRunning = () => !!timer && Date.now() < timer.end;
  const timerFraction = () => (timerRunning() ? (timer.end - Date.now()) / timer.total : null);
  let timerTick = 0;
  function startTimer(min) {
    const ms = Math.max(1, min) * 60000;
    timer = { end: Date.now() + ms, total: ms };
    clearInterval(timerTick); timerTick = setInterval(updateTimer, 250);
    updateTimer(); updateR(); kick();
  }
  function stopTimer(done) {
    timer = null; clearInterval(timerTick); updateTimer(); updateR();
    if (done) { toast('Timer done'); showActivity('timer', 100, '✓'); }
  }
  function updateTimer() {
    const ms = timer ? Math.max(0, timer.end - Date.now()) : 0;
    const s = Math.ceil(ms / 1000);
    $('#cw-timer-read').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (timer && ms <= 0) stopTimer(true);
    else if (!open && !rafId) draw();
  }
  $$('[data-min]').forEach((b) => b.addEventListener('click', () => startTimer(+b.dataset.min)));
  $('#cw-timer-stop').addEventListener('click', () => stopTimer(false));

  // clipboard history
  const clips = store.get('clips', []);
  function addClip(text) {
    text = String(text || '').trim();
    if (!text) return;
    const i = clips.indexOf(text); if (i >= 0) clips.splice(i, 1);
    clips.unshift(text); clips.length = Math.min(clips.length, 12);
    store.set('clips', clips); renderClips();
  }
  function renderClips() {
    const ul = $('#cw-clips'); ul.innerHTML = '';
    if (!clips.length) { ul.innerHTML = '<li class="empty">Copy something on this page and it shows up here.</li>'; return; }
    clips.forEach((c) => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.textContent = c.replace(/\s+/g, ' '); b.title = 'Copy again';
      b.addEventListener('click', () => copyText(c));
      li.append(b); ul.append(li);
    });
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy blocked by the browser'); }
    addClip(text);
  }
  document.addEventListener('copy', () => { const s = String(getSelection() || ''); if (s) setTimeout(() => addClip(s), 0); });
  renderClips();

  // notes
  const notes = $('#cw-notes');
  notes.value = store.get('notes', '');
  notes.addEventListener('input', () => store.set('notes', notes.value));

  /* ── header buttons ── */
  $('#cw-pin').addEventListener('click', () => { pinned = !pinned; $('#cw-pin').setAttribute('aria-pressed', String(pinned)); toast(pinned ? 'Stays open until you click the corner' : 'Closes when you click elsewhere'); });
  $('#cw-gear').addEventListener('click', () => { setOpen(false); $('#config').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); });

  /* ── power, press and hold ── */
  const overlay = $('#overlay');
  function showOverlay(kind) {
    overlay.classList.toggle('blank', kind !== 'lock');
    $('#ov-text').textContent = kind === 'lock' ? 'Click or press a key to unlock.' : kind === 'sleep' ? 'Asleep. Click or press a key to wake.' : 'Shut down. Click or press a key to start again.';
    tickClock(); setOpen(false); overlay.hidden = false;
    const armed = Date.now() + 500;
    const wake = (e) => {
      if (Date.now() < armed) return;
      if (e.type === 'keydown') e.preventDefault();
      overlay.hidden = true;
      overlay.removeEventListener('click', wake); document.removeEventListener('keydown', wake, true);
      trigger.focus({ preventScroll: true });
    };
    overlay.addEventListener('click', wake); document.addEventListener('keydown', wake, true);
  }
  const POWER = { lock: () => showOverlay('lock'), sleep: () => showOverlay('sleep'), off: () => showOverlay('off'), restart: () => location.reload() };
  $$('.cw-hold').forEach((b) => {
    let start = 0, raf = 0;
    const HOLD = 800;
    const loop = () => {
      const k = clamp((performance.now() - start) / HOLD, 0, 1);
      b.style.setProperty('--hold', k);
      if (k >= 1) { reset(); POWER[b.dataset.power](); return; }
      raf = requestAnimationFrame(loop);
    };
    const begin = (e) => { if (e.type === 'keydown' && (e.repeat || (e.key !== 'Enter' && e.key !== ' '))) return; e.preventDefault(); start = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const reset = () => { cancelAnimationFrame(raf); raf = 0; b.style.setProperty('--hold', 0); };
    const cancel = () => { if (raf) { reset(); $('#cw-power-hint').textContent = 'Keep holding to confirm.'; } };
    b.addEventListener('pointerdown', begin); b.addEventListener('keydown', begin);
    ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach((ev) => b.addEventListener(ev, cancel));
  });

  /* ══════════════ command bar ══════════════ */
  function parse(raw) {
    const t = raw.trim().toLowerCase();
    if (!t) return null;
    let m;
    const num = (s) => clamp(parseInt(s, 10), 0, 100);
    if ((m = t.match(/^b(?:right(?:ness)?)?\s+(\d{1,3})$/))) return { hint: `Set brightness to ${num(m[1])}`, run: () => set('brightness', num(m[1])) };
    if ((m = t.match(/^c(?:ontrast)?\s+(\d{1,3})$/))) return { hint: `Set contrast to ${num(m[1])}`, run: () => set('contrast', num(m[1])) };
    if ((m = t.match(/^v(?:ol(?:ume)?)?\s+(\d{1,3})$/))) return { hint: `Set volume to ${num(m[1])}`, run: () => { S.muted = false; set('volume', num(m[1])); } };
    if ((m = t.match(/^t(?:imer)?\s+(\d+(?:\.\d+)?)$/))) { const n = parseFloat(m[1]); return { hint: `Start a ${n}-minute timer`, run: () => { startTimer(n); selectTab('timer'); } }; }
    if (PRESETS[t]) return { hint: `Apply the ${t[0].toUpperCase() + t.slice(1)} preset`, run: () => applyPreset(t) };
    const simple = {
      mute: ['Mute output', () => setMuted(true)],
      unmute: ['Unmute output', () => setMuted(false)],
      mic: [S.mic ? 'Unmute the mic' : 'Mute the mic', () => toggle('mic')],
      lock: ['Lock the screen', () => showOverlay('lock')],
      glass: [S.glass ? 'Turn Liquid Glass off' : 'Turn Liquid Glass on', () => toggle('glass')],
      dark: [S.dark ? 'Turn dark mode off' : 'Turn dark mode on', () => toggle('dark')],
      awake: [S.awake ? 'Let the screen sleep' : 'Keep the screen awake', () => toggle('awake')],
      focus: [S.dnd ? 'Turn focus off' : 'Turn focus on', () => toggle('dnd')],
      play: ['Play or pause media', togglePlay], pause: ['Play or pause media', togglePlay],
      next: ['Next track', () => $('#cw-next').click()],
      c: ['Open clipboard history', () => selectTab('clipboard')],
      t: ['Open the timer', () => selectTab('timer')],
      n: ['Open notes', () => { selectTab('notes'); setTimeout(() => notes.focus(), 0); }],
    };
    if (simple[t]) return { hint: simple[t][0], run: simple[t][1] };
    if (/^[\d\s+\-*/().,%^]+$/.test(t) && /\d/.test(t) && /[+\-*/%^]/.test(t)) {
      try {
        const v = Function('"use strict";return (' + t.replace(/\^/g, '**').replace(/,/g, '.') + ')')();
        if (typeof v === 'number' && Number.isFinite(v)) {
          const s = String(+v.toPrecision(12));
          return { hint: `= ${s}`, calc: true, run: () => copyText(s) };
        }
      } catch { /* not a sum yet */ }
      return { hint: 'Keep typing the sum', none: true };
    }
    return { hint: 'No command matches. Try b 40, night or 2*(3+4).', none: true };
  }

  function wireCommand(input, hintEl, opts = {}) {
    const update = () => {
      const r = parse(input.value);
      hintEl.textContent = r ? (r.calc ? `${r.hint}, Enter copies` : r.hint) : (opts.empty || '');
      hintEl.classList.toggle('ok', !!r && !r.none);
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const r = parse(input.value);
      if (!r || r.none) return;
      e.preventDefault();
      r.run();
      if (!r.calc) { const msg = r.hint; input.value = ''; hintEl.textContent = opts.done ? `Done: ${msg.toLowerCase()}.` : ''; hintEl.classList.remove('ok'); }
    });
    return update;
  }
  wireCommand(cmd, cmdHint);
  const demoCmd = $('#demo-cmd'), demoHint = $('#demo-hint');
  const demoUpdate = wireCommand(demoCmd, demoHint, { empty: 'Try one of these:', done: true });
  $$('[data-try]').forEach((b) => b.addEventListener('click', () => {
    demoCmd.value = b.dataset.try; demoUpdate(); demoCmd.focus();
  }));

  /* ══════════════ the big quarter on the "closed" section ══════════════ */
  let lastBig = { key: 'brightness', label: 'Brightness' };
  function bigArc(frac) {
    const rho = 262, pts = [];
    const n = 48;
    for (let i = 0; i <= n; i++) { const th = (frac * i / n) * Math.PI / 2; pts.push(`${(rho * Math.cos(th)).toFixed(1)} ${(rho * Math.sin(th)).toFixed(1)}`); }
    return frac <= 0.001 ? '' : 'M' + pts.join('L');
  }
  function drawBigQuarter() {
    const v = lastBig.key === 'volume' && S.muted ? 0 : S[lastBig.key];
    $('#bq-track').setAttribute('d', bigArc(1));
    $('#bq-val').setAttribute('d', bigArc(clamp(v / 100, 0.001, 1)));
    $('#bq-num').textContent = lastBig.key === 'volume' && S.muted ? 'Muted' : v;
    $('#bq-label').textContent = lastBig.label;
  }
  const bq = $('#big-quarter');
  bq.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
    const key = e.shiftKey ? 'volume' : 'brightness';
    if (key === 'volume') S.muted = false;
    lastBig = { key, label: key === 'volume' ? 'Volume' : 'Brightness' };
    set(key, S[key] + dir * 5);
  }, { passive: false });
  // touch: drag up/down on the quarter
  let dragY = null;
  bq.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { dragY = e.clientY; } });
  bq.addEventListener('pointermove', (e) => {
    if (dragY == null) return;
    const dy = dragY - e.clientY;
    if (Math.abs(dy) > 12) { lastBig = { key: 'brightness', label: 'Brightness' }; set('brightness', S.brightness + Math.sign(dy) * 5); dragY = e.clientY; }
  });
  ['pointerup', 'pointercancel'].forEach((ev) => bq.addEventListener(ev, () => { dragY = null; }));

  /* ══════════════ glass section ══════════════ */
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
  $('#frost').addEventListener('input', (e) => { S.frost = +e.target.value; lens.style.setProperty('--frost', S.frost); applyPage(); });
  $('#tint').addEventListener('input', (e) => { S.tint = +e.target.value; lens.style.setProperty('--tint', S.tint); applyPage(); });
  const glassBtn = $('#glass-panel-btn');
  glassBtn.dataset.keepOpen = '';
  glassBtn.addEventListener('click', () => { toggle('glass'); if (S.glass && !open) setOpen(true); });

  /* ══════════════ spring lab ══════════════ */
  const resp = $('#resp'), damp = $('#damp');
  function plotSpring() {
    const r = +resp.value, z = +damp.value;
    $('#resp-out').textContent = r.toFixed(2) + ' s';
    $('#damp-out').textContent = z.toFixed(2);
    ANIM.open_response = r; ANIM.open_damping = z; ANIM.open_height_response = r * 1.19;
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
  resp.addEventListener('input', plotSpring); damp.addEventListener('input', plotSpring);
  plotSpring();
  const springBtn = $('#spring-open');
  springBtn.dataset.keepOpen = '';
  springBtn.addEventListener('click', () => { if (open) { setOpen(false); setTimeout(() => setOpen(true), 380); } else setOpen(true); });

  /* ── copy buttons ── */
  $$('.copy').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));

  /* ── go ── */
  applyPage(); syncUI(); sizeCollapsed(); draw();
  prefersDark.addEventListener('change', (e) => { if (store.get('dark', null) == null) toggle('dark', e.matches); });
})();
