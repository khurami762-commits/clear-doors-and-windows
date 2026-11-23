/* Clear Windows and Doors — shared data layer.
 * One small API for the website and the staff software, with three backends:
 *   "artifact" — the Claude preview's shared database + photo uploads (window.claude)
 *   "api"      — a Vercel deployment's own server (/api/*) and Postgres database
 *   "local"    — this browser only (offline testing)
 * Public collections (the website reads them): products, projects, site (text, photo and Google-search edits).
 * Website quote requests go to "requests" (visitors can add, only staff can read).
 * Staff-only: leads, appointments, quotes, jobs, invoices, service, contracts, settings.
 */
(function () {
  const PUBLIC = ["products", "projects", "site", "inventory"];
  const STAFF = ["leads", "customers", "activity", "appointments", "quotes", "jobs", "itemnotes", "sales", "deliveries", "pickups", "invoices", "service", "contracts", "settings"];
  const state = { mode: null, db: null, assets: null, user: null, canWrite: false, ready: null, staff: false, role: "none" };
  const listeners = new Map(); // local + api: name -> Set(cb)
  const cache = new Map();     // api: name -> last JSON

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const col = (name) => (PUBLIC.includes(name) || name === "requests" ? name : "staff/main/" + name);
  const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

  async function detect() {
    if (window.claude && typeof window.claude.use === "function") {
      const db = await withTimeout(window.claude.use("db"), 10000, null);
      if (db) {
        state.mode = "artifact"; state.db = db;
        state.user = await withTimeout(window.claude.use("user"), 10000, null);
        state.assets = await withTimeout(window.claude.use("assets"), 10000, null);
        // Roles: owner (the artifact owner), manager (Editor), employee (Contributor).
        let owner = false, edit = false, write = false;
        try { owner = state.user ? !!(await state.user.isOwner()) : false; } catch {}
        try { edit = state.user ? !!(await state.user.canEdit()) : false; } catch {}
        try { write = state.user ? (await state.user.can("data.write")) === true : false; } catch {}
        state.role = owner ? "owner" : edit ? "manager" : write ? "employee" : "none";
        state.staff = state.role !== "none"; state.canWrite = state.staff;
        return;
      }
      // In the preview but the database isn't available (e.g. signed out): read-only, no data.
      state.mode = "none"; return;
    }
    if (location.protocol.startsWith("http")) {
      try {
        const r = await withTimeout(fetch("/api/me", { credentials: "same-origin", cache: "no-store" }), 6000, null);
        if (r && r.ok && (r.headers.get("content-type") || "").includes("json")) {
          const me = await r.json();
          state.mode = "api"; state.staff = !!me.staff; state.canWrite = !!me.staff; state.role = me.staff ? (me.role || "owner") : "none"; state.who = me.name || ""; return;
        }
      } catch {}
    }
    state.mode = "local"; state.staff = true; state.canWrite = true;
    let r = "owner"; try { r = localStorage.getItem("cw-local-role") || "owner"; } catch {}  // offline testing of roles
    state.role = ["owner", "manager", "employee"].includes(r) ? r : "owner";
  }
  function init() { if (!state.ready) state.ready = detect(); return state.ready; }

  // ---------- local ----------
  const lkey = (name) => "cw-local:" + name;
  const lread = (name) => { try { return JSON.parse(localStorage.getItem(lkey(name)) || "{}") || {}; } catch { return {}; } };
  const lwrite = (name, obj) => { localStorage.setItem(lkey(name), JSON.stringify(obj)); emit(name); };
  const toList = (obj) => Object.entries(obj).map(([id, d]) => ({ id, ...d }));
  function emit(name) {
    const set = listeners.get(name); if (!set) return;
    const list = state.mode === "local" ? toList(lread(name)) : JSON.parse(cache.get(name) || "[]");
    set.forEach((cb) => { try { cb(list); } catch (e) { console.error(e); } });
  }
  addEventListener("storage", (e) => { if (state.mode === "local" && e.key && e.key.startsWith("cw-local:")) emit(e.key.slice(9)); });

  // ---------- api ----------
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opts, headers: { ...(opts.body && !(opts.body instanceof Blob) ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) } });
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error || m; } catch {} const e = new Error(m); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  }
  async function refresh(name) {
    const list = await api("/api/docs?col=" + encodeURIComponent(name));
    const json = JSON.stringify(list.docs || []);
    if (cache.get(name) !== json) { cache.set(name, json); emit(name); }
  }

  // ---------- public surface ----------
  const Store = {
    init, newId,
    get role() { return state.role; },
    /** the preview's file-download helper, or null where downloads aren't available */
    async downloads() { if (state.mode !== "artifact") return null; if (state.dl === undefined) state.dl = await withTimeout(window.claude.use("downloads"), 6000, null); return state.dl; },
    /** opaque id of the signed-in person, for the activity history */
    async userId() { try { return state.user ? await state.user.id() : state.mode === "local" ? "local-" + state.role : "staff"; } catch { return "staff"; } },
    /** names for user ids (preview only; elsewhere returns {}) */
    async profiles(ids) { try { return state.user && state.user.profiles ? await state.user.profiles(ids) : {}; } catch { return {}; } },
    get mode() { return state.mode; },
    get canWrite() { return state.canWrite; },
    get isStaff() { return state.staff; },
    async isOwner() { try { return state.user ? !!(await state.user.isOwner()) : state.mode === "local"; } catch { return false; } },

    /** Subscribe to a whole collection; cb receives an array of {id, ...data}. Returns unsubscribe. */
    sub(name, cb, onError) {
      if (state.mode === "artifact") {
        let timer = setTimeout(() => onError && onError({ code: "slow", message: "Still loading…" }), 10000);
        const un = state.db.collection(col(name)).onSnapshot(
          (snap) => { if (!snap.metadata.fromCache) clearTimeout(timer); cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
          (e) => { clearTimeout(timer); onError && onError(e); });
        return () => { clearTimeout(timer); un(); };
      }
      if (state.mode === "none") { cb([]); return () => {}; }
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(cb);
      if (state.mode === "local") { cb(toList(lread(name))); return () => listeners.get(name).delete(cb); }
      // api: poll
      let stopped = false;
      const tick = async () => { if (stopped) return; try { await refresh(name); } catch (e) { onError && onError({ code: e.status === 401 ? "auth" : "unavailable", message: e.message }); } };
      if (cache.has(name)) cb(JSON.parse(cache.get(name)));
      tick();
      const iv = setInterval(tick, 8000);
      const vis = () => document.visibilityState === "visible" && tick();
      document.addEventListener("visibilitychange", vis);
      return () => { stopped = true; clearInterval(iv); document.removeEventListener("visibilitychange", vis); listeners.get(name).delete(cb); };
    },

    async get(name, id) {
      if (state.mode === "artifact") { const s = await state.db.doc(col(name) + "/" + id).get(); return s.exists ? { id, ...s.data() } : null; }
      if (state.mode === "local") { const o = lread(name); return o[id] ? { id, ...o[id] } : null; }
      if (state.mode === "api") { const r = await api(`/api/docs?col=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`); return r.doc || null; }
      return null;
    },

    /** Create or replace a document. */
    async save(name, id, data) {
      const body = JSON.parse(JSON.stringify({ ...data, updatedAt: Date.now() }));
      delete body.id;
      if (state.mode === "artifact") return state.db.doc(col(name) + "/" + id).set(body);
      if (state.mode === "local") { const o = lread(name); o[id] = body; lwrite(name, o); return; }
      if (state.mode === "api") { await api(`/api/docs?col=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }); return refresh(name); }
      throw new Error("Saving isn't available here");
    },

    /** Merge fields into an existing document. */
    async patch(name, id, data) {
      const body = JSON.parse(JSON.stringify({ ...data, updatedAt: Date.now() }));
      if (state.mode === "artifact") return state.db.doc(col(name) + "/" + id).update(body);
      if (state.mode === "local") { const o = lread(name); if (!o[id]) throw new Error("Not found"); o[id] = { ...o[id], ...body }; lwrite(name, o); return; }
      if (state.mode === "api") { await api(`/api/docs?col=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); return refresh(name); }
      throw new Error("Saving isn't available here");
    },

    async remove(name, id) {
      if (state.mode === "artifact") return state.db.doc(col(name) + "/" + id).delete();
      if (state.mode === "local") { const o = lread(name); delete o[id]; lwrite(name, o); return; }
      if (state.mode === "api") { await api(`/api/docs?col=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`, { method: "DELETE" }); return refresh(name); }
      throw new Error("Deleting isn't available here");
    },

    /** Resize a photo in the browser, then store it. Resolves {id, url}. */
    async uploadImage(file, max) {
      const blob = await shrink(file, max || 1400, 0.82);
      if (state.mode === "artifact") {
        if (!state.assets) throw new Error("Photo uploads need editor access");
        const a = await state.assets.upload(blob);
        return { id: a.id, url: a.url || "/_blob/" + a.id };
      }
      if (state.mode === "api") {
        const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(blob); });
        return api("/api/files", { method: "POST", body: JSON.stringify({ type: blob.type || "image/webp", data }) });
      }
      if (state.mode === "local") { const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); return { id: "local-" + newId(), url }; }
      throw new Error("Uploads aren't available here");
    },

    /** Website quote form. Visitors can add a request but can't read anyone's. Resolves the new entry id. */
    async submitRequest(entry) {
      // Same person + same details within 15 minutes counts as one request (double clicks, resubmits).
      const fp = [entry.name, entry.phone, entry.email, entry.message, (entry.need || []).join(",")].map((x) => String(x || "").trim().toLowerCase()).join("|");
      const e = JSON.parse(JSON.stringify({ ...entry, id: newId(), at: Date.now(), fp }));
      const dupOf = (items) => items.find((x) => x.fp === fp && Date.now() - (x.at || 0) < 15 * 60 * 1000);
      if (state.mode === "artifact") {
        const uid = state.user ? await state.user.id() : null;
        if (!uid) throw new Error("Please sign in to send a request from the preview, or call us.");
        const ref = state.db.doc("requests/" + uid);
        let items = [];
        try { const s = await ref.get(); if (s.exists) items = s.data().items || []; } catch {}
        const dup = dupOf(items); if (dup) return { id: dup.id, duplicate: true };
        // keep every request staff haven't picked up yet; trim only old, already-imported ones
        const keep = items.filter((x) => !x.imported).concat(items.filter((x) => x.imported).slice(-10));
        try { await ref.set({ items: [...keep, e], updatedAt: Date.now() }); }
        catch (x) { const m = String((x && (x.code || x.message)) || ""); if (/perm|denied|forbidden|invalid/i.test(m)) throw new Error("In this preview, only people the owner has invited can send the form."); throw x; }
        return { id: e.id };
      }
      if (state.mode === "local") { const o = lread("requests"); const d = o.visitor || { items: [] }; const dup = dupOf(d.items); if (dup) return { id: dup.id, duplicate: true }; d.items.push(e); d.updatedAt = Date.now(); o.visitor = d; lwrite("requests", o); return { id: e.id }; }
      if (state.mode === "api") { const r = await api("/api/request", { method: "POST", body: JSON.stringify(e) }); return { id: (r && r.id) || e.id, duplicate: !!(r && r.duplicate) }; }
      throw new Error("Requests can't be sent from here. Please call us instead.");
    },
    /** Can this visitor attach photos to a request? (preview: invited people only) */
    get canUpload() { return state.mode === "local" || !!state.assets; },

    // api mode only
    async login(password) { const r = await api("/api/login", { method: "POST", body: JSON.stringify({ password }) }); state.staff = state.canWrite = true; return r; },
    async logout() { try { await api("/api/logout", { method: "POST" }); } catch {} state.staff = state.canWrite = false; },
    STAFF, PUBLIC,
  };


  /* ---------- editable website content ----------
     The website and the software both run this on a page, so they agree on which
     texts can be edited and on each one's key ("index:12"). */
  const ALLOWED = new Set(["I", "B", "EM", "STRONG", "BR"]);
  const SEL = "main h1, main h2, main h3, main p, main li, main summary, main td, main th, main figcaption, main .eyebrow, main .svc .num, main .person b, main .person span, main .chips span, footer.foot .cols > div > p";
  const SKIP = "[data-projects],[data-projects-wrap],[data-lineup],form,.crumbs,.done,.status,[data-hours],.draft,.v3d,.subnav,.meta,.ctas,.side ul,.invite .small";
  function toText(html) {
    const t = String(html)
      .replace(/<br\s*\/?>/gi, "\u0001")
      .replace(/<\/?(b|strong)>/gi, "**").replace(/<\/?(i|em)>/gi, "*")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
      .replace(/\s+/g, " ").trim();
    return t.replace(/\s*\u0001\s*/g, "\n");
  }
  function renderText(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/\n/g, "<br>");
  }
  function editables(root, page) {
    const out = []; let section = "Top of the page"; let i = 0;
    root.querySelectorAll(SEL).forEach((el) => {
      if (el.closest(SKIP)) return;
      if ([...el.children].some((c) => !ALLOWED.has(c.tagName))) return;
      const text = toText(el.innerHTML); if (!text) return;
      if (el.tagName === "H1" || el.tagName === "H2") section = text.replace(/\*/g, "");
      out.push({ el, key: page + ":" + i++, text, tag: el.tagName, section: el.closest("footer") ? "Footer" : section });
    });
    return out;
  }
  function spots(root) {
    return [...root.querySelectorAll("[data-spot]")].filter((el) => !el.closest("[data-projects]"))
      .map((el) => ({ el, n: el.dataset.spot, label: el.dataset.label || (el.querySelector(".spot") || el).textContent.replace(/^\s*Photo spot \d+\s*/, "").trim(), hero: !!el.closest(".hero"), def: (el.querySelector("img") || {}).getAttribute ? el.querySelector("img").getAttribute("src") : "" }));
  }
  Store.content = { toText, renderText, editables, spots };

  async function shrink(file, max, q) {
    if (!/^image\//.test(file.type) || file.type === "image/svg+xml") return file;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return file;
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, "image/webp", q));
    return out && out.size < file.size ? out : (out || file);
  }

  window.CWStore = Store;
})();
