/* Clear Windows & Doors: "About the Company" scroll film.
   The film stays pinned under the header while the copy scrolls up over it at normal speed.
   Scroll position maps straight to a frame: stop and it holds, scroll back and it reverses.
   Reduced-motion visitors (and no-script) get two still frames instead (see site.css). */
(() => {
  const film = document.getElementById("film");
  const root = document.documentElement;
  if (!film || !root.classList.contains("js") || root.classList.contains("rm")) return;
  const stage = film.querySelector(".film-stage");
  const canvas = film.querySelector(".film-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const header = document.querySelector("header.top");
  const N = +film.dataset.frames || 240;
  const set = innerWidth >= 900 ? "lg" : "sm";
  const src = (i) => `img/film/${set}/${String(i).padStart(3, "0")}.webp`;

  // Scroll stretches, in stage heights. Window opens while the first copy rises (0-1),
  // the camera glides out over the lake with no text (1-2.25), turns back (2.25-3),
  // settles on the window and patio door (3-3.5), then the closing copy rises in.
  const KEYS = [[0, 1], [1, 72], [2.25, 140], [3, 186], [3.5, N]];
  const frameAt = (y) => {
    if (y <= 0) return 1;
    for (let k = 1; k < KEYS.length; k++) {
      const [y0, f0] = KEYS[k - 1], [y1, f1] = KEYS[k];
      if (y <= y1) return f0 + (f1 - f0) * (y - y0) / (y1 - y0);
    }
    return N;
  };
  // Final composition: this part of the frame (window on the left, patio door and threshold on the right)
  const MUST = { x: 0.06, y: 0.19, w: 0.82, h: 0.68 };

  /* ---------- frames: load the first, then coarse-to-fine so any scroll position has a nearby frame ---------- */
  const imgs = new Array(N + 1);
  const order = [1];
  for (const step of [32, 16, 8, 4, 2, 1]) for (let i = 1; i <= N; i += step) if (!order.includes(i)) order.push(i);
  if (!order.includes(N)) order.splice(1, 0, N);
  let next = 0, inflight = 0;
  const pump = () => {
    while (inflight < 6 && next < order.length) {
      const i = order[next++], im = new Image();
      inflight++;
      im.decoding = "async";
      im.onload = () => { imgs[i] = im; inflight--; if (Math.abs(i - cur) < 40) need = true; pump(); };
      im.onerror = () => { inflight--; pump(); };
      im.src = src(i);
    }
  };
  const nearest = (f) => {
    for (let d = 0; d < N; d++) {
      if (imgs[f - d]) return imgs[f - d];
      if (imgs[f + d]) return imgs[f + d];
    }
    return null;
  };

  /* ---------- sizing ---------- */
  let W = 0, H = 0, S = 1, HH = 84, STRIP = 200, dpr = 1, mobile = false;
  const measure = () => {
    HH = header ? header.offsetHeight : 84;
    film.style.setProperty("--hh", HH + "px");
    mobile = innerWidth < 900;
    STRIP = parseFloat(getComputedStyle(film).getPropertyValue("--strip")) || 200;
    S = stage.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(stage.clientWidth * dpr); H = Math.round(S * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    need = true;
  };

  /* ---------- drawing ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let cur = 1, need = true, last = "";
  const draw = (fr, card, veil) => {
    const im = nearest(fr);
    if (!im) return;
    const iw = im.naturalWidth, ih = im.naturalHeight;
    // cover crop (focus a little right on phones so the opening sash stays in view)
    const fx = mobile ? 0.62 : 0.5;
    const sc = Math.max(W / iw, H / ih);
    const cw = W / sc, ch = H / sc;
    const c = { sx: Math.min(Math.max(iw * fx - cw / 2, 0), iw - cw), sy: (ih - ch) / 2, sw: cw, sh: ch, dx: 0, dy: 0, dw: W, dh: H };
    // final: a wide product view above the closing-copy strip that always contains
    // the casement window (left) and the patio door with its threshold (right)
    const pad = (mobile ? 14 : 24) * dpr, strip = STRIP * dpr;
    const aw = W - pad * 2, ah = H - strip - pad;
    const M = { sx: MUST.x * iw, sy: MUST.y * ih, sw: MUST.w * iw, sh: MUST.h * ih };
    const A = aw / ah;
    let sw = Math.max(M.sw, M.sh * A), sh = sw / A, f;
    if (sw <= iw && sh <= ih) {
      const sx = Math.min(Math.max(M.sx + M.sw / 2 - sw / 2, 0), iw - sw);
      const sy = Math.min(Math.max(M.sy + M.sh / 2 - sh / 2, 0), ih - sh);
      f = { sx, sy, sw, sh, dx: pad, dy: pad, dw: aw, dh: ah };
    } else {               // narrow screens: fit the full height of the shot across the width
      const rs = { sx: M.sx, sy: 0, sw: M.sw, sh: ih };
      const k = Math.min(aw / rs.sw, ah / rs.sh), dw = rs.sw * k, dh = rs.sh * k;
      f = { ...rs, dx: (W - dw) / 2, dy: pad + (ah - dh) / 2, dw, dh };
    }
    const t = ease(card);
    const r = (key) => lerp(c[key], f[key], t);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (t > 0) {
      const x = r("dx"), y = r("dy"), w = r("dw"), h = r("dh"), rad = 22 * dpr * t;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, rad) : ctx.rect(x, y, w, h);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, r("sx"), r("sy"), r("sw"), r("sh"), r("dx"), r("dy"), r("dw"), r("dh"));
    ctx.restore();
    stage.style.setProperty("--veil", veil.toFixed(3));
  };

  const tick = () => {
    raf = 0;
    const y = (HH - film.getBoundingClientRect().top) / S;   // stage heights scrolled into the film
    const fr = Math.min(N, Math.max(1, Math.round(frameAt(y))));
    const end = KEYS[KEYS.length - 1][0];
    const card = Math.min(1, Math.max(0, (y - end) / (STRIP / S)));
    const veil = Math.min(1, Math.max(0, 1 - y / 0.7));
    const key = fr + "|" + card.toFixed(3) + "|" + veil.toFixed(2) + "|" + W + "x" + H;
    cur = fr;
    if (key !== last || need) { last = key; need = false; draw(fr, card, veil); }
    film.dataset.frame = fr;            // exposed for testing
    film.dataset.card = card.toFixed(2);
  };
  let raf = 0;
  const go = () => { if (!raf) raf = requestAnimationFrame(tick); };

  measure();
  pump();
  addEventListener("scroll", go, { passive: true });
  addEventListener("resize", () => { measure(); go(); });
  if (window.ResizeObserver) new ResizeObserver(() => { measure(); go(); }).observe(stage);
  // redraw as soon as better frames arrive
  setInterval(() => { if (need) go(); }, 120);
  go();
})();
