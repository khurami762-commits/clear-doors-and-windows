/* Clear Windows and Doors — website behaviour: open/closed status, cookie banner,
   projects + products from the staff software, and the free-quote form. */
(function () {
  "use strict";
  // Direct link to the staff software: ...#staff opens it straight away.
  const toStaff = () => { if (/^#(staff|software)$/i.test(location.hash)) { location.replace("staff.html"); return true; } return false; };
  addEventListener("hashchange", toStaff);
  if (toStaff()) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const TZ = "America/Vancouver";
  const store = window.CWStore;
  const PAGE = (document.body.dataset.page || "index.html").replace(/\.html$/, "");
  // Note every editable text and photo spot now, before anything on the page changes.
  const EDIT = store ? store.content.editables(document, PAGE) : [];
  const SPOTS = store ? store.content.spots(document).map((sp) => ({ ...sp, html: sp.el.innerHTML })) : [];
  const SEO0 = { title: document.title, description: (document.querySelector('meta[name="description"]') || {}).content || "" };

  /* ---------- open / closed (Mon–Fri 8–6, Sat 9–3, Sun closed) ---------- */
  const HOURS = { 1: [480, 1080], 2: [480, 1080], 3: [480, 1080], 4: [480, 1080], 5: [480, 1080], 6: [540, 900], 0: null };
  const fmt = (m) => { const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
  function nowVan() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), mins: (+p.hour % 24) * 60 + +p.minute };
  }
  function status() {
    const { day, mins } = nowVan(), h = HOURS[day];
    if (h && mins >= h[0] && mins < h[1]) return { open: true, text: `Open now · until ${fmt(h[1])}` };
    for (let i = 0; i < 8; i++) {
      const d = (day + i) % 7, hh = HOURS[d];
      if (!hh) continue;
      if (i === 0 && mins < hh[0]) return { open: false, text: `Closed · opens ${fmt(hh[0])}` };
      if (i > 0) return { open: false, text: `Closed · opens ${i === 1 ? "tomorrow" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]} ${fmt(hh[0])}` };
    }
    return { open: false, text: "Closed" };
  }
  function paintStatus() {
    const s = status();
    $$("[data-open-status]").forEach((el) => { const d = el.querySelector(".dot"); d.classList.toggle("on", s.open); el.lastElementChild.textContent = s.text; });
    const today = nowVan().day;
    $$("[data-hours] tr").forEach((tr) => tr.classList.toggle("today", +tr.dataset.d === today));
  }
  paintStatus(); setInterval(paintStatus, 60000);
  $$("[data-year]").forEach((y) => (y.textContent = new Date().getFullYear()));

  /* ---------- reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("shown"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -8% 0px" });
    $$(".rv").forEach((el) => io.observe(el));
  } else $$(".rv").forEach((el) => el.classList.add("shown"));

  const hdr = $("header.top");
  const onScroll = () => { if (hdr) hdr.classList.toggle("scrolled", scrollY > 8); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- cookie banner ---------- */
  const CK = "cw-cookie-choice";
  const getChoice = () => { try { return JSON.parse(localStorage.getItem(CK) || "null"); } catch { return null; } };
  const setChoice = (c) => { try { localStorage.setItem(CK, JSON.stringify({ ...c, at: Date.now() })); } catch {} applyChoice(c); };
  // Hook for later: analytics would load here, and only when the visitor accepted it.
  function applyChoice(c) { window.CWConsent = { analytics: !!(c && c.analytics) }; document.dispatchEvent(new CustomEvent("cw-consent", { detail: window.CWConsent })); }
  function banner(showOptions) {
    $("#cookie")?.remove();
    const cur = getChoice() || { analytics: false };
    const el = document.createElement("div");
    el.id = "cookie"; el.className = "cookie"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Cookie choices");
    el.innerHTML = `<b><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5a3 3 0 0 0 4 3.5 3 3 0 0 0 5 5.5Z"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="14.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="9.5" cy="15.5" r=".9" fill="currentColor"/></svg>We use cookies</b>
      <p>We use only what this site needs to work. With your OK, we may also use cookies to see how the site is used so we can improve it. Read our <a class="link" href="privacy.html">privacy policy</a>.</p>
      <div class="opts${showOptions ? "" : " hide"}">
        <label class="opt"><input type="checkbox" checked disabled><span><strong>Necessary</strong>Remembers your choices. Always on.</span></label>
        <label class="opt"><input type="checkbox" id="ck-an"${cur.analytics ? " checked" : ""}><span><strong>Analytics</strong>Helps us understand which pages are useful.</span></label>
      </div>
      <div class="acts">${showOptions ? `<button class="btn btn-line btn-sm" type="button" data-ck="save">Save choices</button>` : `<button class="btn btn-line btn-sm" type="button" data-ck="opts">Settings</button><button class="btn btn-line btn-sm" type="button" data-ck="no">Decline</button>`}<button class="btn btn-red btn-sm" type="button" data-ck="yes">Accept all</button></div>`;
    document.body.appendChild(el);
    const close = () => { el.classList.remove("show"); document.body.classList.remove("has-cookie"); setTimeout(() => el.remove(), 450); };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ck]"); if (!b) return;
      const k = b.dataset.ck;
      if (k === "opts") { banner(true); return; }
      if (k === "yes") setChoice({ analytics: true });
      if (k === "no") setChoice({ analytics: false });
      if (k === "save") setChoice({ analytics: $("#ck-an", el).checked });
      close();
    });
    requestAnimationFrame(() => { el.classList.add("show"); document.body.classList.add("has-cookie"); document.body.style.setProperty("--cookie-h", (el.offsetHeight + 12) + "px"); });
  }
  const prior = getChoice();
  if (prior) applyChoice(prior); else setTimeout(() => banner(false), 600);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-cookie-settings]")) { e.preventDefault(); banner(true); } });

  /* ---------- live data from the staff software ---------- */
  const photo = (p) => (p && p.photos && p.photos[0] && p.photos[0].url) || "";
  async function live() {
    if (!store) return;
    await store.init();
    $$("[data-projects]").forEach((grid) => {
      const max = +grid.dataset.projects || 6, wrap = grid.closest("[data-projects-wrap]");
      store.sub("projects", (rows) => {
        const list = rows.filter((r) => r.visible !== false && photo(r)).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, max);
        if (wrap) wrap.classList.toggle("hide", !list.length);
        grid.innerHTML = list.map((p) => `<figure class="proj"><div class="ph"><img src="${esc(photo(p))}" alt="${esc(p.title || "Project")}" loading="lazy"></div>
          <figcaption><b>${esc(p.title || "Project")}</b><small>${esc([p.city, p.work].filter(Boolean).join(" · "))}</small></figcaption>
          ${(p.photos || []).length > 1 ? `<div class="more">${p.photos.slice(0, 8).map((x) => `<img src="${esc(x.url)}" alt="" loading="lazy" data-swap>`).join("")}</div>` : ""}</figure>`).join("");
      }, () => {});
    });
    grid_swap();
    // text, photo and Google-search edits made in the staff software
    store.sub("site", (rows) => {
      const doc = (id) => (rows.find((r) => r.id === id) || {});
      const texts = doc("texts").items || {}, photos = doc("photos").items || {}, seo = (doc("seo").items || {})[PAGE] || {};
      EDIT.forEach((e) => { const o = texts[e.key]; const want = o && o.d === e.text && typeof o.v === "string" ? o.v : e.text; const html = store.content.renderText(want); if (e.el.innerHTML !== html && (o || e.el.dataset.edited)) { e.el.innerHTML = html; e.el.dataset.edited = o ? "1" : ""; } });
      SPOTS.forEach((sp) => {
        const ph = photos[sp.n];
        if (ph && ph.url) { const img = sp.el.querySelector("img"); if (!img || img.getAttribute("src") !== ph.url) sp.el.innerHTML = `<img src="${esc(ph.url)}" alt="${esc(ph.alt || sp.label)}"${sp.hero ? "" : ' loading="lazy"'} decoding="async">`; }
        else if (sp.def) { const img = sp.el.querySelector("img"); if (img && img.getAttribute("src") !== sp.def) sp.el.innerHTML = sp.html; }
        else if (sp.el.querySelector("img")) sp.el.innerHTML = `<div class="spot"><div><b>Photo spot ${esc(sp.n)}</b>${esc(sp.label)}</div></div>`;
      });
      document.title = seo.title || SEO0.title;
      const md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute("content", seo.description || SEO0.description);
    }, () => {});
    $$("[data-lineup]").forEach((sec) => {
      const cat = sec.dataset.lineup; let prods = [], stock = [];
      const draw = () => {
        const a = prods.filter((r) => r.visible !== false && r.category === cat).sort((x, y) => (+x.order || 999) - (+y.order || 999) || String(x.name).localeCompare(String(y.name)));
        const b = stock.filter((i) => i.visible && i.category === cat && i.status !== "sold" && Number(i.qty) > 0).sort((x, y) => String(x.title).localeCompare(String(y.title)));
        sec.classList.toggle("hide", !a.length && !b.length);
        $(".lineup", sec).innerHTML = a.map((p) => `<article class="prod">${photo(p) ? `<div class="ph"><img src="${esc(photo(p))}" alt="${esc(p.name)}" loading="lazy"></div>` : ""}
          ${p.type ? `<span class="ty">${esc(p.type)}</span>` : ""}<h3>${esc(p.name)}</h3>${p.description ? `<p>${esc(p.description)}</p>` : ""}
          ${(p.features || []).length ? `<ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
          <a class="btn btn-line btn-sm" href="contact.html#quote" data-ask="${esc(p.name)}">Ask about this</a></article>`).join("")
          + b.map((i) => `<article class="prod">${photo(i) ? `<div class="ph"><img src="${esc(photo(i))}" alt="${esc(i.title)}" loading="lazy"></div>` : ""}
          <span class="ty instock">In stock${i.condition && i.condition !== "New" ? " · " + esc(i.condition) : ""}</span><h3>${esc(i.title)}</h3>
          <p>${esc([i.type, i.size, i.colour, i.glass].filter(Boolean).join(" · "))}</p>${i.description ? `<p>${esc(i.description)}</p>` : ""}
          <p class="price">${i.price != null && i.price !== "" ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(i.price) : "Call for price"}</p>
          <a class="btn btn-line btn-sm" href="contact.html#quote" data-ask="${esc(i.title)} (in stock)">Ask about this</a></article>`).join("");
      };
      store.sub("products", (rows) => { prods = rows; draw(); }, () => {});
      store.sub("inventory", (rows) => { stock = rows; draw(); }, () => {});
    });
  }
  function grid_swap() {
    document.addEventListener("click", (e) => { const t = e.target.closest("[data-swap]"); if (!t) return; const big = t.closest(".proj").querySelector(".ph img"); if (big) big.src = t.src; });
  }
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-ask]"); if (a) { try { sessionStorage.setItem("cw-ask", a.dataset.ask); } catch {} } });
  live().catch(() => {});

  /* ---------- free quote form ---------- */
  const form = $("#quote-form");
  if (form) {
    const files = []; const MAXF = 5;
    try { const ask = sessionStorage.getItem("cw-ask"); if (ask) { $("#q-msg").value = `I'd like a quote for: ${ask}\n`; sessionStorage.removeItem("cw-ask"); } } catch {}
    const thumbs = $("#q-thumbs"), drop = $("#q-drop"), pick = $("#q-photos");
    const drawThumbs = () => {
      thumbs.innerHTML = files.map((f, i) => `<div class="t"><img src="${f.preview}" alt="Photo ${i + 1}"><button type="button" data-rmf="${i}" aria-label="Remove photo ${i + 1}">×</button></div>`).join("");
      $$("[data-rmf]", thumbs).forEach((b) => b.onclick = () => { URL.revokeObjectURL(files[+b.dataset.rmf].preview); files.splice(+b.dataset.rmf, 1); drawThumbs(); });
    };
    const addFiles = (list) => {
      for (const f of list) { if (!/^image\//.test(f.type) || files.length >= MAXF) continue; if (f.size > 20 * 1024 * 1024) continue; files.push({ file: f, preview: URL.createObjectURL(f) }); }
      drawThumbs();
    };
    pick.addEventListener("change", () => { addFiles([...pick.files]); pick.value = ""; });
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles([...(e.dataTransfer?.files || [])]));
    let sending = false;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (sending) return;
      const err = $("#q-err"), btn = $("#q-send");
      const v = (id) => $(id).value.trim();
      $$(".in.bad", form).forEach((x) => x.classList.remove("bad"));
      const fail = (msg, el) => { err.textContent = msg; err.classList.remove("hide"); if (el) { el.classList.add("bad"); el.focus(); } };
      err.classList.add("hide");
      const phone = v("#q-phone"), email = v("#q-email");
      if (!v("#q-name")) return fail("Please add your name.", $("#q-name"));
      if (!phone && !email) return fail("Please add a phone number or an email so we can reach you.", $("#q-phone"));
      if (phone && !/^[+()\d\s.-]{7,}$/.test(phone)) return fail("Please check the phone number.", $("#q-phone"));
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Please check the email address.", $("#q-email"));
      if (!$("#q-ok").checked) return fail("Please tick the box so we can contact you about your request.", $("#q-ok"));
      const entry = {
        name: v("#q-name").slice(0, 120), phone: phone.slice(0, 40), email: email.slice(0, 160), contact: $("#q-contact").value,
        need: $$("input[name=need]:checked", form).map((i) => i.value), city: $("#q-city").value, address: v("#q-addr").slice(0, 200),
        count: $("#q-count").value, project: $("#q-type").value, sizes: v("#q-size").slice(0, 600), message: v("#q-msg").slice(0, 3000),
        how: $("#q-how").value, when: $("#q-when").value, date: $("#q-date").value, ref: $("#q-ref").value,
        consent: true, page: PAGE, photos: [],
      };
      sending = true; btn.disabled = true; const label = btn.innerHTML; btn.textContent = files.length ? "Uploading photos…" : "Sending…";
      let photoNote = "";
      try {
        if (!store) throw new Error("no store");
        await store.init();
        if (files.length) {
          if (!store.canUpload) photoNote = "We couldn't attach your photos here. You can text or email them to us.";
          else for (const f of files) { try { const up = await store.uploadImage(f.file, 1600); entry.photos.push({ url: up.url, id: up.id }); } catch { photoNote = "Some photos couldn't be attached. You can text or email them to us."; } }
        }
        btn.textContent = "Sending…";
        const r = await store.submitRequest(entry);
        form.classList.add("hide");
        const done = $("#q-done"); done.classList.remove("hide");
        $("#q-ref-no").textContent = "Reference " + String(r.id || "").slice(-6).toUpperCase();
        if (photoNote) { const p = document.createElement("p"); p.textContent = photoNote; p.style.fontSize = "15px"; $("#q-ref-no").after(p); }
        done.scrollIntoView({ block: "center", behavior: "smooth" }); done.focus({ preventScroll: true });
      } catch (x) {
        fail((x && x.message && !/no store/.test(x.message) ? x.message + " " : "") + "Your request didn't send. Please call us at (236) 989-8351.");
        btn.disabled = false; btn.innerHTML = label; sending = false;
      }
    });
  }
})();
