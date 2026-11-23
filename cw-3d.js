// Clear Windows & Doors — interactive 3D illustration of window and door styles.
// Illustrative only: proportions are typical, not a specific product's measurements.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DESC = {
  casement: "Casement: hinged at the side, cranks outward. Seals tightly when closed and opens fully for airflow.",
  awning: "Awning: hinged at the top, the bottom swings outward, so it can stay open in light rain.",
  slider: "Sliding: one sash glides past the other along a track. Good for wide openings.",
  tilt: "Tilt & turn: tilts inward at the top for ventilation. Turn the handle further and it swings in like a door.",
  fixed: "Picture (fixed): doesn't open. Lets in the most light and gives an unbroken view.",
  "patio-xo": "Sliding patio XO: one panel slides (X) past one fixed panel (O).",
  "patio-oxxo": "Sliding patio OXXO: four panels, the two in the middle slide apart.",
  french: "French doors: two hinged leaves that open for a wide, classic opening.",
  entry: "Entry door: a single hinged door with a glass insert and lever handle.",
};

function initViewer(root) {
  const canvas = root.querySelector("canvas");
  const stage = root.querySelector(".stage");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { root.querySelector(".fallback").classList.remove("hide"); root.querySelector(".hint").classList.add("hide"); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduce; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 0.8; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.62;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4cc, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2.5, 4, 3.5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 }); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-3, 1.5, -2); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.45, metalness: 0.02 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ee, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.3, metalness: 0.9 });
  const sealMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xebe7e1, roughness: 0.95 });

  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
  // rectangular frame (4 bars) centred on 0,0
  function ring(w, h, t, d, mat) {
    const g = new THREE.Group();
    g.add(box(w, t, d, mat, 0, h / 2 - t / 2, 0), box(w, t, d, mat, 0, -h / 2 + t / 2, 0), box(t, h - 2 * t, d, mat, -w / 2 + t / 2, 0, 0), box(t, h - 2 * t, d, mat, w / 2 - t / 2, 0, 0));
    return g;
  }
  // a sash: frame + glass + thin black gasket, origin at its centre
  function sash(w, h, opts = {}) {
    const g = new THREE.Group(), t = opts.t || 0.055, d = opts.d || 0.07;
    g.add(ring(w, h, t, d, frameMat));
    g.add(ring(w - 2 * t + 0.012, h - 2 * t + 0.012, 0.008, d * 0.6, sealMat));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * t, h - 2 * t), glassMat); g.add(glass);
    const glass2 = glass.clone(); glass2.position.z = -0.02; g.add(glass2); // second pane: double glazing
    return g;
  }
  const handle = (x, y, z, vertical = true) => { const g = new THREE.Group(); g.add(box(0.03, 0.08, 0.02, metalMat)); const lever = box(vertical ? 0.022 : 0.11, vertical ? 0.11 : 0.022, 0.022, metalMat, vertical ? 0 : 0.05, vertical ? -0.06 : 0, 0.025); g.add(lever); g.position.set(x, y, z); return g; };

  let model = null, anim = null, isOpen = false, style = null, wallW = 0, wallH = 0;
  const pivots = []; // {obj, axis:'x'|'y'|'z'|'px', from, to}

  function wall(w, h, ow, oh, cy) {
    // wall with an opening (ow × oh) whose centre is at cy
    const g = new THREE.Group(), d = 0.2, sideW = (w - ow) / 2;
    const top = h - (cy + oh / 2), bot = cy - oh / 2;
    g.add(box(sideW, h, d, wallMat, -ow / 2 - sideW / 2, h / 2, -0.03), box(sideW, h, d, wallMat, ow / 2 + sideW / 2, h / 2, -0.03));
    if (top > 0) g.add(box(ow, top, d, wallMat, 0, h - top / 2, -0.03));
    if (bot > 0) g.add(box(ow, bot, d, wallMat, 0, bot / 2, -0.03));
    g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    return g;
  }

  function build(kind) {
    if (model) { scene.remove(model); model.traverse((m) => m.geometry && m.geometry.dispose()); }
    pivots.length = 0; isOpen = false; style = kind;
    model = new THREE.Group();
    const isDoor = /patio|french|entry/.test(kind);
    const W = isDoor ? (kind === "patio-oxxo" ? 3.0 : kind === "entry" ? 1.0 : 1.8) : (kind === "slider" ? 1.5 : 1.0);
    const Hh = isDoor ? 2.1 : 1.2;
    const cy = isDoor ? Hh / 2 + 0.02 : 1.35;
    wallW = W + 1.6; wallH = Math.max(2.6, cy + Hh / 2 + 0.5);
    model.add(wall(wallW, wallH, W, Hh, cy));
    const outer = new THREE.Group(); outer.position.y = cy; model.add(outer);
    const ft = 0.075, fd = 0.14;
    outer.add(ring(W, Hh, ft, fd, frameMat));
    if (!isDoor) outer.add(box(W + 0.08, 0.03, 0.2, frameMat, 0, -Hh / 2 - 0.015, 0.05)); // sill
    const iw = W - 2 * ft, ih = Hh - 2 * ft;

    if (kind === "fixed") { const s = sash(iw, ih, { t: 0.03 }); outer.add(s); }
    if (kind === "casement") {
      const p = new THREE.Group(); p.position.set(-iw / 2, 0, 0.03); outer.add(p);
      const s = sash(iw, ih); s.position.x = iw / 2; p.add(s); s.add(handle(iw / 2 - 0.05, 0, -0.05));
      pivots.push({ obj: p, axis: "y", from: 0, to: -1.05 });
    }
    if (kind === "awning") {
      const p = new THREE.Group(); p.position.set(0, ih / 2, 0.03); outer.add(p);
      const s = sash(iw, ih); s.position.y = -ih / 2; p.add(s); s.add(handle(0, -ih / 2 + 0.06, -0.05, false));
      pivots.push({ obj: p, axis: "x", from: 0, to: -0.6 });
    }
    if (kind === "tilt") {
      const p = new THREE.Group(); p.position.set(0, -ih / 2, 0.0); outer.add(p);
      const s = sash(iw, ih); s.position.y = ih / 2; p.add(s); s.add(handle(iw / 2 - 0.05, 0, -0.05));
      pivots.push({ obj: p, axis: "x", from: 0, to: -0.28 });
    }
    if (kind === "slider") {
      const sw = iw / 2 + 0.03;
      const fixedS = sash(sw, ih); fixedS.position.set(iw / 4 + 0.015, 0, 0.035); outer.add(fixedS);
      const mov = sash(sw, ih); mov.position.set(-iw / 4 - 0.015, 0, -0.035); outer.add(mov); mov.add(handle(sw / 2 - 0.04, 0, 0.05));
      pivots.push({ obj: mov, axis: "px", from: mov.position.x, to: mov.position.x + iw * 0.42 });
    }
    if (kind === "patio-xo" || kind === "patio-oxxo") {
      const n = kind === "patio-xo" ? 2 : 4, pw = iw / n + 0.03;
      for (let i = 0; i < n; i++) {
        const x = -iw / 2 + iw / n * (i + 0.5);
        const moving = n === 2 ? i === 0 : i === 1 || i === 2;
        const p = sash(pw, ih, { t: 0.07, d: 0.06 }); p.position.set(x, 0, moving ? 0.04 : -0.04); outer.add(p);
        if (moving) {
          p.add(handle(n === 2 ? pw / 2 - 0.05 : (i === 1 ? pw / 2 - 0.05 : -pw / 2 + 0.05), 0, 0.045));
          const dx = n === 2 ? iw / 2 - 0.05 : (i === 1 ? -1 : 1) * (iw / 4 - 0.05);
          pivots.push({ obj: p, axis: "px", from: x, to: x + dx });
        }
      }
      outer.add(box(iw, 0.02, fd, metalMat, 0, -ih / 2 + 0.01, 0)); // track
    }
    if (kind === "french") {
      for (const side of [-1, 1]) {
        const p = new THREE.Group(); p.position.set(side * iw / 2, 0, 0.03); outer.add(p);
        const leaf = sash(iw / 2, ih, { t: 0.09 }); leaf.position.x = -side * iw / 4; p.add(leaf);
        leaf.add(handle(-side * (iw / 4 - 0.06), 0, -0.06));
        pivots.push({ obj: p, axis: "y", from: 0, to: side * 1.25 });
      }
    }
    if (kind === "entry") {
      const p = new THREE.Group(); p.position.set(-iw / 2, 0, 0.03); outer.add(p);
      const door = new THREE.Group(); door.position.x = iw / 2; p.add(door);
      const slabH = ih, slabW = iw, glassH = ih * 0.38;
      door.add(box(slabW, slabH - glassH - 0.25, 0.055, frameMat, 0, -(glassH + 0.25) / 2, 0));
      door.add(box(slabW, 0.25, 0.055, frameMat, 0, slabH / 2 - 0.125, 0));
      door.add(box(0.16, glassH, 0.055, frameMat, -slabW / 2 + 0.08, slabH / 2 - 0.25 - glassH / 2, 0), box(0.16, glassH, 0.055, frameMat, slabW / 2 - 0.08, slabH / 2 - 0.25 - glassH / 2, 0));
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(slabW - 0.32, glassH), glassMat); gl.position.set(0, slabH / 2 - 0.25 - glassH / 2, 0); door.add(gl);
      door.add(handle(slabW / 2 - 0.08, -0.05, -0.05, false));
      pivots.push({ obj: p, axis: "y", from: 0, to: -1.2 });
    }
    model.traverse((m) => { if (m.isMesh && m.material === frameMat) m.castShadow = true; });
    scene.add(model);
    const d = root.querySelector("[data-desc]"); if (d) d.textContent = DESC[kind] || "";
    const openBtn = root.querySelector('[data-act="open"]');
    if (openBtn) { openBtn.disabled = !pivots.length; openBtn.textContent = pivots.length ? "Open it" : "Doesn't open"; openBtn.setAttribute("aria-pressed", "false"); }
    resetView(true);
    kick();
  }

  // camera
  let camAnim = null;
  function view() {
    const isDoor = /patio|french|entry/.test(style);
    const tgt = new THREE.Vector3(0, isDoor ? 1.05 : 1.35, 0);
    const dist = isDoor ? (style === "patio-oxxo" ? 6.0 : 4.4) : 3.1;
    return { pos: new THREE.Vector3(dist * 0.42, tgt.y + 0.35, dist * 0.9), tgt };
  }
  function moveCam(pos, tgt, instant) {
    if (instant || reduce) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); kick(); return; }
    camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, start: performance.now(), dur: 900 };
    kick();
  }
  function resetView(instant) { const v = view(); moveCam(v.pos, v.tgt, instant); }
  function detail() {
    const v = view(); const W = /patio-oxxo/.test(style) ? 3 : /patio|french/.test(style) ? 1.8 : style === "slider" ? 1.5 : 1;
    const corner = new THREE.Vector3(W / 2, v.tgt.y + (/patio|french|entry/.test(style) ? 0.95 : 0.55), 0.05);
    moveCam(corner.clone().add(new THREE.Vector3(0.75, 0.2, 1.15)), corner.clone().add(new THREE.Vector3(-0.15, -0.12, 0)));
  }
  function toggleOpen() {
    if (!pivots.length) return;
    isOpen = !isOpen;
    anim = { start: performance.now(), dur: reduce ? 0 : 1300, dir: isOpen };
    const b = root.querySelector('[data-act="open"]'); if (b) { b.textContent = isOpen ? "Close it" : "Open it"; b.setAttribute("aria-pressed", String(isOpen)); }
    kick();
  }
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // render loop runs only while something is moving and the viewer is on screen
  let raf = 0, visible = true, lastChange = 0;
  function kick() { lastChange = performance.now(); if (!raf && visible) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (anim) {
      const t = anim.dur ? Math.min(1, (now - anim.start) / anim.dur) : 1, k = ease(anim.dir ? t : 1 - t);
      for (const p of pivots) { const v = p.from + (p.to - p.from) * k; if (p.axis === "px") p.obj.position.x = v; else p.obj.rotation[p.axis] = v; }
      if (t >= 1) anim = null;
    }
    if (camAnim) {
      const t = Math.min(1, (now - camAnim.start) / camAnim.dur), k = ease(t);
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, k); controls.target.lerpVectors(camAnim.t0, camAnim.t1, k);
      if (t >= 1) camAnim = null;
    }
    controls.update();
    renderer.render(scene, camera);
    if (anim || camAnim || now - lastChange < 600) raf = requestAnimationFrame(frame);
  }
  controls.addEventListener("change", kick);
  controls.addEventListener("start", kick);

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); kick();
  }
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(stage);

  // controls
  root.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-style]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); build(b.dataset.style);
  }));
  root.querySelectorAll("[data-colour]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-colour]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    frameMat.color.set(b.dataset.colour); kick();
  }));
  root.querySelector('[data-act="open"]').addEventListener("click", toggleOpen);
  root.querySelector('[data-act="detail"]').addEventListener("click", detail);
  root.querySelector('[data-act="reset"]').addEventListener("click", () => resetView(false));
  root.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => {
    const dir = camera.position.clone().sub(controls.target); const len = dir.length() * (b.dataset.zoom === "1" ? 0.8 : 1.25);
    dir.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, len)));
    moveCam(controls.target.clone().add(dir), controls.target.clone());
  }));

  build(root.querySelector("[data-style]").dataset.style);
  resize();
  root.dataset.ready = "1";
}
document.querySelectorAll("[data-viewer]").forEach(initViewer);
