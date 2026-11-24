// Courses en famille : app web, sans framework.
// Les données vivent d'abord sur le téléphone (localStorage), puis partent
// vers Supabase dès qu'il y a du réseau. Les autres membres reçoivent les
// changements en temps réel.
(() => {
  const cfg = window.COURSES_CONFIG || {};
  const ONLINE = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const CATS = window.CATS, STORES = window.STORES, BASE_DICT = window.BASE_DICT;
  const KEY = "courses_v1";
  const $ = id => document.getElementById(id);
  let sb = null, channel = null;

  // ---------- État local ----------
  const defaults = () => ({ items: {}, dict: {}, order: {}, pos: {}, known: {}, queue: [], me: null, family: null, store: STORES[0].id, mode: "list" });
  let S = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return Object.assign(defaults(), s); } catch (e) {} return defaults(); })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const now = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s).toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/’/g, "'").trim();
  const catById = id => CATS.find(c => c.id === id);
  const catOptions = sel => CATS.map(c => `<option value="${c.id}"${c.id === sel ? " selected" : ""}>${esc(c.n)}</option>`).join("");

  // ---------- Classement automatique ----------
  function classify(name) {
    const t = norm(name);
    if (S.dict[t]) return S.dict[t];
    const dict = Object.assign({}, BASE_DICT, S.dict);
    const toks = t.split(/[^a-z0-9'-]+/).filter(Boolean);
    const sing = w => w.length > 3 ? w.replace(/(s|x)$/, "") : w;
    const raw = " " + toks.join(" ") + " ", one = " " + toks.map(sing).join(" ") + " ";
    const phrases = Object.keys(dict).filter(k => k.includes(" ")).sort((a, b) => b.length - a.length);
    for (const p of phrases) if (raw.includes(" " + p + " ") || one.includes(" " + p + " ")) return dict[p];
    for (const w of toks) { if (dict[w]) return dict[w]; if (dict[sing(w)]) return dict[sing(w)]; }
    return null;
  }

  // "2 l lait", "lait 2l", "500 g de gruyère"
  function parse(text) {
    let t = text.trim(), qty = null, m;
    const U = "(?:kg|g|l|dl|cl|ml|x|pce|pces|pcs|paquets?|boites?|bo[iî]tes?|bouteilles?|sachets?)";
    if ((m = t.match(new RegExp("^(\\d+(?:[.,]\\d+)?\\s*" + U + "?)\\s+(.+)$", "i")))) { qty = m[1]; t = m[2]; }
    else if ((m = t.match(new RegExp("^(.+?)\\s+(\\d+(?:[.,]\\d+)?\\s*" + U + "?)$", "i")))) { t = m[1]; qty = m[2]; }
    t = t.replace(/^(de |d'|d’)/i, "");
    return { name: t.charAt(0).toUpperCase() + t.slice(1), qty };
  }

  // ---------- Synchronisation ----------
  function enqueue(op) { if (!ONLINE) return; S.queue.push(op); save(); flush(); }
  const isNetErr = e => /fetch|network|load failed|timeout/i.test((e && (e.message || e.toString())) || "");
  let flushing = false;
  async function flush() {
    if (!ONLINE || flushing || !S.family || !navigator.onLine) return setSync();
    flushing = true; setSync();
    try {
      while (S.queue.length) {
        const q = S.queue[0];
        let r;
        try {
          r = q.op === "delete" ? await sb.from(q.table).delete().match(q.match)
                                : await sb.from(q.table).upsert(q.row);
        } catch (e) { r = { error: e }; }
        if (r.error) {
          if (isNetErr(r.error)) break;
          console.warn("Opération refusée, ignorée :", r.error);
        }
        S.queue.shift(); save();
      }
    } finally { flushing = false; setSync(); }
  }

  const strip = r => { const { family_id, ...rest } = r; return rest; };
  async function pull() {
    if (!ONLINE || !S.family || !navigator.onLine) return;
    const fid = S.family.id;
    const [it, dc, od] = await Promise.all([
      sb.from("items").select("*").eq("family_id", fid),
      sb.from("dictionary").select("*").eq("family_id", fid),
      sb.from("store_order").select("*").eq("family_id", fid)
    ]);
    if (it.error) return console.warn(it.error);
    const items = {};
    it.data.forEach(r => { items[r.id] = strip(r); });
    // Les changements locaux pas encore envoyés gagnent
    S.queue.filter(q => q.table === "items").forEach(q => {
      const id = q.op === "delete" ? q.match.id : q.row.id;
      if (S.items[id]) items[id] = S.items[id]; else delete items[id];
    });
    S.items = items;
    (dc.data || []).forEach(r => { S.dict[r.term] = r.category; });
    (od.data || []).forEach(r => { S.order[r.store] = r.categories; if (r.lat != null) S.pos[r.store] = { lat: r.lat, lng: r.lng }; });
    const kn = await sb.from("known_items").select("*").eq("family_id", fid);
    (kn.data || []).forEach(r => { const c = S.known[r.term]; if (!c || (c.last_used || "") <= r.last_used) S.known[r.term] = strip(r); });
    save(); render();
  }

  function subscribe() {
    if (!ONLINE || !S.family) return;
    if (channel) sb.removeChannel(channel);
    const f = "family_id=eq." + S.family.id;
    channel = sb.channel("famille-" + S.family.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: f }, p => {
        if (p.eventType === "DELETE") { if (p.old && p.old.id) delete S.items[p.old.id]; }
        else { const r = p.new, cur = S.items[r.id]; if (!cur || (cur.updated_at || "") <= (r.updated_at || "")) S.items[r.id] = strip(r); }
        save(); render();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "store_order", filter: f }, p => {
        if (p.new && p.new.store) { S.order[p.new.store] = p.new.categories; if (p.new.lat != null) S.pos[p.new.store] = { lat: p.new.lat, lng: p.new.lng }; save(); render(); }
      })
      .subscribe();
  }

  function setSync() {
    const el = $("sync"); if (!el) return;
    if (!ONLINE) el.textContent = "démo";
    else if (!navigator.onLine) el.textContent = "hors ligne";
    else if (S.queue.length) el.textContent = "envoi…";
    else el.textContent = "à jour";
  }

  // ---------- Actions ----------
  function saveItem(it) {
    it.updated_at = now(); S.items[it.id] = it;
    enqueue({ op: "upsert", table: "items", row: { ...it, family_id: S.family.id } });
    save(); render();
  }
  function deleteItem(id) {
    delete S.items[id];
    enqueue({ op: "delete", table: "items", match: { id } });
    save(); render();
  }
  function learn(name, cat) {
    const term = norm(name); S.dict[term] = cat;
    if (S.known[term]) { S.known[term].category = cat; pushKnown(term); }
    enqueue({ op: "upsert", table: "dictionary", row: { family_id: S.family.id, term, category: cat } });
  }
  function toggle(id) {
    const i = S.items[id]; if (!i) return;
    i.done = !i.done;
    if (i.done) {
      i.done_by = S.me ? S.me.name : null; i.done_at = now(); i.done_store = S.mode === "store" ? S.store : null;
      if (S.mode === "store") enqueue({ op: "upsert", table: "check_log", row: { id: uuid(), family_id: S.family.id, store: S.store, category: i.category, item_name: i.name, checked_by: i.done_by, checked_at: i.done_at } });
    } else { i.done_by = null; i.done_at = null; i.done_store = null; }
    saveItem(i);
  }
  function addFromText(v, extra) {
    const p = parse(v); if (!p.name) return;
    const ex = Object.values(S.items).find(i => !i.done && norm(i.name) === norm(p.name));
    if (ex) { if (p.qty) ex.qty = p.qty; saveItem(ex); return toast(`${ex.name} est déjà sur la liste`); }
    const old = Object.values(S.items).find(i => i.done && norm(i.name) === norm(p.name));
    if (old) { // déjà coché : on le remet sur la liste au lieu de le doubler
      old.done = false; old.done_by = null; old.done_at = null; old.done_store = null;
      if (p.qty) old.qty = p.qty; remember(old.name, old.category, p.qty); saveItem(old);
      return toast(`${old.name} remis sur la liste`);
    }
    if (S.known[norm(p.name)]) p.name = S.known[norm(p.name)].label;
    const k = S.known[norm(p.name)];
    const cat = (k && k.category) || (extra && extra.category) || classify(p.name);
    if (!p.qty && k && k.qty) p.qty = k.qty;
    const kk = S.known[norm(p.name)] || {};
    const img = (extra && extra.image) || kk.image || null, mid = (extra && extra.migros_id) || kk.migros_id || null;
    remember(p.name, cat, p.qty, { image: img, migros_id: mid });
    saveItem({ id: uuid(), name: p.name, qty: p.qty, category: cat, done: false, image: img, migros_id: mid,
      added_by: S.me ? S.me.name : null, done_by: null, done_at: null, done_store: null, created_at: now() });
    toast(cat ? `Ajouté dans ${catById(cat).n}` : "Ajouté. Choisis le rayon en haut de la liste.");
    if (!img) autoImage(norm(p.name));
  }
  function storeOrder(s) {
    const o = (S.order[s] || []).filter(id => catById(id));
    CATS.forEach(c => { if (!o.includes(c.id)) o.push(c.id); });
    return o;
  }
  function setOrder(arr) {
    S.order[S.store] = arr; save();
    pushStore(S.store);
  }

  // ---------- Articles connus et suggestions ----------
  function remember(label, category, qty, extra) {
    const term = norm(label), k = S.known[term];
    S.known[term] = { term, label: k ? k.label : label, category: category || (k && k.category) || null,
      qty: qty || (k && k.qty) || null, uses: (k ? k.uses : 0) + 1, last_used: now(),
      image: (extra && extra.image) || (k && k.image) || null, migros_id: (extra && extra.migros_id) || (k && k.migros_id) || null };
    save(); pushKnown(term);
  }
  function pushKnown(term) {
    const k = S.known[term]; if (!k || !S.family) return;
    enqueue({ op: "upsert", table: "known_items", row: { ...k, family_id: S.family.id } });
  }
  // « far fram » trouve « Farmer … Framboise » : chaque mot tapé commence un mot du libellé.
  const prefixMatch = (label, q) => {
    const ws = norm(label).split(/[^a-z0-9]+/).filter(Boolean);
    let qs = norm(q).split(/[^a-z0-9]+/).filter(Boolean);
    if (qs.length > 1) qs = qs.filter(x => x.length >= 3 || /\d/.test(x)); // ignore « de », « la »…
    return qs.length > 0 && qs.every(x => ws.some(w => w.startsWith(x)));
  };
  const onList = () => new Set(Object.values(S.items).filter(i => !i.done).map(i => norm(i.name)));
  function suggest(q) {
    const t = norm(q), taken = onList(), out = [], seen = new Set();
    const ok = term => !taken.has(term) && !seen.has(term);
    const match = label => norm(label).startsWith(t) || prefixMatch(label, t);
    const known = Object.values(S.known).sort((a, b) => b.uses - a.uses || (b.last_used > a.last_used ? 1 : -1));
    if (!t) { // champ vide : les habituels de la famille
      known.filter(k => ok(k.term)).slice(0, 8).forEach(k => { seen.add(k.term); out.push({ label: k.label, qty: k.qty, hist: true, image: k.image, migros_id: k.migros_id }); });
      return out;
    }
    known.filter(k => ok(k.term) && match(k.label)).slice(0, 6).forEach(k => { seen.add(k.term); out.push({ label: k.label, qty: k.qty, hist: true, image: k.image, migros_id: k.migros_id }); });
    (window.CATALOG || []).filter(l => ok(norm(l)) && match(l))
      .sort((a, b) => (norm(b).startsWith(t) - norm(a).startsWith(t)) || a.length - b.length)
      .slice(0, 8 - out.length).forEach(l => { seen.add(norm(l)); out.push({ label: l, hist: false }); });
    return out;
  }
  // Photo automatique : premier produit Migros qui contient tous les mots tapés.
  async function autoImage(term) {
    if (!ONLINE || !navigator.onLine || term.length < 3) return;
    try {
      const res = await fetchMigros(term);
      const words = term.split(/[^a-z0-9]+/).filter(w => w.length >= 3).map(w => w.replace(/(s|x)$/, ""));
      const m = res.find(r => r.image && words.every(w => norm(`${r.brand || ""} ${r.name} ${r.category || ""}`).includes(w)));
      if (!m) return;
      Object.values(S.items).filter(i => !i.image && norm(i.name) === term).forEach(i => { i.image = m.image; i.migros_id = m.id; saveItem(i); });
      if (S.known[term] && !S.known[term].image) { S.known[term].image = m.image; S.known[term].migros_id = m.id; pushKnown(term); }
    } catch (e) {}
  }

  // Produits migros.ch, via la fonction serveur. Si Migros ne répond pas, on fait sans.
  const migrosCache = {}; let migrosShown = [], migrosTimer = null, migrosOff = false;
  // Produits Migros déjà vus sur ce téléphone, pour retrouver « far fram » sans dépendre du moteur Migros.
  const POOL_KEY = "courses-migros-pool";
  let migPool = (() => { try { return JSON.parse(localStorage.getItem(POOL_KEY)) || []; } catch (e) { return []; } })();
  function addToPool(list) {
    const ids = new Set(list.map(m => m.id));
    migPool = list.filter(m => m.id && m.name).concat(migPool.filter(m => !ids.has(m.id))).slice(0, 400);
    try { localStorage.setItem(POOL_KEY, JSON.stringify(migPool)); } catch (e) {}
  }
  async function searchMigros(q) {
    const res = await fetchMigros(q);
    const words = norm(q).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    const extra = words.length > 1 ? await Promise.all(words.map(w => fetchMigros(w).catch(() => []))) : [];
    const seen = new Set(), out = [];
    const add = m => { const k = m.id || m.name; if (!seen.has(k)) { seen.add(k); out.push(m); } };
    [res, ...extra, migPool].flat().filter(m => prefixMatch(`${m.brand || ""} ${m.name}`, q)).forEach(add);
    if (words.length <= 1 || !out.length) res.forEach(add); // sinon on garde le classement Migros
    return out;
  }
  const migrosLabel = m => (m.brand && !norm(m.name).startsWith(norm(m.brand)) ? m.brand + " " : "") + m.name;
  async function fetchMigros(q) {
    const key = norm(q);
    if (migrosCache[key]) return migrosCache[key];
    const { data } = await sb.auth.getSession();
    const r = await fetch(`${cfg.supabaseUrl}/functions/v1/migros?q=${encodeURIComponent(key)}`, {
      headers: { apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + (data.session ? data.session.access_token : cfg.supabaseAnonKey) } });
    const j = await r.json();
    if (j.error) console.warn("Migros :", j.error);
    const list = j.products || []; addToPool(list);
    return (migrosCache[key] = list);
  }
  function queueMigros(q) {
    clearTimeout(migrosTimer);
    if (!ONLINE || migrosOff || !navigator.onLine || norm(q).length < 3) return;
    migrosTimer = setTimeout(async () => {
      try {
        const res = await searchMigros(q);
        if (parse($("new").value).name !== q) return; // l'utilisateur a continué à taper
        renderSugg(res);
      } catch (e) { console.warn(e); }
    }, 450);
  }
  // Photo Migros pour une suggestion : premier produit qui contient tous ses mots
  function photoFor(label, res) {
    const words = norm(label).split(/[^a-z0-9]+/).filter(w => w.length >= 3).map(w => w.replace(/(s|x)$/, ""));
    if (!words.length) return null;
    return (res || []).find(r => r.image && words.every(w => norm(`${r.brand || ""} ${r.name} ${r.category || ""}`).includes(w))) || null;
  }
  let lastMigros = { q: "", res: [] }, suggShown = [];
  function renderSugg(migrosRes) {
    const typed = parse($("new").value), q = typed.name || "";
    if (Array.isArray(migrosRes)) lastMigros = { q: norm(q), res: migrosRes };
    // en attendant la réponse, on réutilise les photos de la recherche précédente si elle commence pareil
    const pool = Array.isArray(migrosRes) ? migrosRes : (lastMigros.q && norm(q).startsWith(lastMigros.q.slice(0, 3)) ? lastMigros.res : []);
    const list = document.activeElement === $("new") || q ? suggest(q) : [];
    list.forEach(s => { if (!s.image) { const m = photoFor(s.label, pool); if (m) { s.image = m.image; s.migros_id = m.id; } } });
    suggShown = list;
    const taken = new Set(list.map(s => norm(s.label)).concat([...onList()]));
    migrosShown = Array.isArray(migrosRes) ? migrosRes.filter(m => !taken.has(norm(migrosLabel(m)))).slice(0, 6) : [];
    $("sugg").innerHTML = (list.length && !q ? `<span class="lbl">Habituels</span>` : "") + list.map((s, k) =>
      `<button type="button" class="${s.hist ? "hist" : ""}${s.image ? " mig" : ""}" data-l="${k}" data-s="${esc(s.label)}">${s.image ? imgTag(s.image) : ""}${esc(s.label)}${s.qty && !typed.qty ? `<small>${esc(s.qty)}</small>` : ""}</button>`).join("")
      + migrosShown.map((m, k) => `<button type="button" class="mig" data-m="${k}" data-s="${esc(migrosLabel(m))}">${m.image ? imgTag(m.image) : ""}${esc(migrosLabel(m))}${m.size ? `<small>${esc(m.size)}</small>` : ""}</button>`).join("");
    if (!Array.isArray(migrosRes)) queueMigros(q);
  }

  function pushStore(id) {
    const pos = S.pos[id] || {};
    enqueue({ op: "upsert", table: "store_order", row: { family_id: S.family.id, store: id, categories: storeOrder(id),
      lat: pos.lat ?? null, lng: pos.lng ?? null, updated_at: now() } });
  }

  // ---------- Géolocalisation ----------
  // Chaque magasin est localisé une fois, sur place, avec le bouton 📍.
  // Ensuite le mode magasin choisit tout seul le plus proche (à moins de 250 m).
  const dist = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const here = () => new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error("Pas de localisation sur cet appareil"));
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), ko,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
  async function detectStore() {
    if (!Object.keys(S.pos).length) return;
    try {
      const me = await here();
      const near = STORES.filter(s => S.pos[s.id]).map(s => ({ s, d: dist(me, S.pos[s.id]) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 250 && near.s.id !== S.store) {
        S.store = near.s.id; save(); render(); toast(`Magasin détecté : ${near.s.n}. Tu peux changer en haut.`);
      }
    } catch (e) { /* refus ou pas de signal : choix manuel */ }
  }
  $("b-here").onclick = async () => {
    const st = STORES.find(s => s.id === S.store);
    toast("Localisation…");
    try {
      const me = await here();
      S.pos[S.store] = { lat: me.lat, lng: me.lng }; save(); pushStore(S.store);
      toast(`Position de ${st.n} enregistrée (précision ${Math.round(me.acc)} m)`);
    } catch (e) { toast("Localisation refusée. Autorise-la dans Réglages > Safari > Position."); }
  };

  // Photos Migros : l'adresse contient un "stack" (taille d'image) que Migros ne documente pas.
  // On essaie plusieurs variantes jusqu'à en trouver une qui s'affiche.
  const STACKS = ["mo-boxed/v-w-120-h-120", "mo-custom/v-w-120-h-120", "dynamic/resize-width-120", "mo-boxed/v-w-480-h-480", "original"];
  const imgBase = u => String(u || "").replace(/\/d\/(original|\{stack\})\//, "/d/{stack}/");
  const imgCand = (u, k) => imgBase(u).includes("{stack}") ? (STACKS[k] ? imgBase(u).replace("{stack}", STACKS[k]) : null) : (k === 0 ? u : null);
  window.__imgOk = el => { if (el.naturalWidth > 2) { el.style.visibility = "visible"; return; } window.__imgKo(el); };
  window.__imgKo = el => { const k = +(el.dataset.k || 0) + 1, next = imgCand(el.dataset.u, k);
    if (next) { el.dataset.k = k; el.src = next; } else el.remove(); };
  const imgTag = (u, cls) => `<img${cls ? ` class="${cls}"` : ""} src="${esc(imgCand(u, 0))}" data-u="${esc(u)}" data-k="0" alt="" style="visibility:hidden" onload="__imgOk(this)" onerror="__imgKo(this)">`;

  // ---------- Affichage ----------
  function show(v) { ["login", "family", "main"].forEach(n => { $("v-" + n).hidden = n !== v; }); if (v === "main") render(); }

  function itemHtml(i, store) {
    return `<div class="row-wrap"><div class="del-bg" aria-hidden="true">Supprimer</div><div class="item${i.done ? " done" : ""}" data-id="${i.id}">
      <button class="chk" data-act="toggle" aria-label="${i.done ? "Décocher" : "Cocher"} ${esc(i.name)}"></button>
      ${i.image ? imgTag(i.image, "thumb") : ""}
      <div class="body" data-act="${store ? "toggle" : "edit"}">
        <span class="name">${esc(i.name)}</span>${i.qty ? `<span class="qty">${esc(i.qty)}</span>` : ""}
        ${!store && i.added_by ? `<span class="who">${esc(i.added_by)}</span>` : ""}
      </div></div></div>`;
  }

  function render() {
    if ($("v-main").hidden) return;
    const store = S.mode === "store";
    const L = $("list");
    L.classList.toggle("store", store);
    $("store-row").hidden = !store;
    $("m-list").setAttribute("aria-pressed", !store);
    $("m-store").setAttribute("aria-pressed", store);
    $("store").value = S.store;
    setSync();
    const items = Object.values(S.items).sort((a, b) => (a.created_at || "") < (b.created_at || "") ? -1 : 1);
    if (!items.length) { L.innerHTML = `<p class="empty">La liste est vide.<br>Ajoute un article en bas, par exemple « 2 l lait ».</p>`; return; }
    let h = "";
    const uns = items.filter(i => !catById(i.category));
    if (uns.length) {
      h += `<div class="cat"><h3>À classer</h3>` + uns.map(i =>
        `<div class="unsorted"><span><b>${esc(i.name)}</b> : choisis le rayon, l'app s'en souviendra.</span>
         <select data-fix="${i.id}" aria-label="Rayon pour ${esc(i.name)}"><option value="">Choisir un rayon…</option>${catOptions()}</select></div>`).join("") + `</div>`;
    }
    const order = store ? storeOrder(S.store) : CATS.map(c => c.id);
    order.forEach(cid => {
      let its = items.filter(i => i.category === cid);
      if (!its.length) return;
      its = [...its.filter(i => !i.done), ...its.filter(i => i.done)];
      const left = its.filter(i => !i.done).length;
      h += `<div class="cat"><h3>${esc(catById(cid).n)}<span class="n">${left || "✓"}</span></h3>${its.map(i => itemHtml(i, store)).join("")}</div>`;
    });
    L.innerHTML = h;
  }

  let toastT;
  function toast(t, undo) {
    const el = $("toast"); el.classList.toggle("undo", !!undo);
    el.innerHTML = esc(t) + (undo ? `<button type="button" id="b-undo">Annuler</button>` : "");
    if (undo) $("b-undo").onclick = () => { undo(); el.classList.remove("on", "undo"); };
    el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on", "undo"), undo ? 4000 : 2200);
  }
  function deleteWithUndo(id) {
    const it = S.items[id]; if (!it) return;
    const copy = { ...it }; deleteItem(id);
    toast(`${copy.name} supprimé`, () => saveItem(copy));
  }

  // ---------- Glisser vers la gauche pour supprimer ----------
  let sw = null;
  $("list").addEventListener("touchstart", e => {
    const it = e.target.closest(".item"); if (!it || e.touches.length > 1) return;
    sw = { el: it, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, on: false };
  }, { passive: true });
  $("list").addEventListener("touchmove", e => {
    if (!sw) return;
    const dx = e.touches[0].clientX - sw.x, dy = e.touches[0].clientY - sw.y;
    if (!sw.on) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5 && dx < 0) { sw.on = true; sw.el.classList.add("dragging"); } else if (Math.abs(dy) > 10) { sw = null; return; } else return; }
    sw.dx = Math.min(0, dx); sw.el.style.transform = `translateX(${sw.dx}px)`;
  }, { passive: true });
  $("list").addEventListener("touchend", () => {
    if (!sw) return; const s = sw; sw = null;
    if (!s.on) return;
    s.el.classList.remove("dragging");
    swipedAt = Date.now();
    if (s.dx < -Math.min(120, s.el.offsetWidth * 0.35)) {
      s.el.style.transform = "translateX(-100%)";
      setTimeout(() => deleteWithUndo(s.el.dataset.id), 160);
    } else s.el.style.transform = "";
  });
  let swipedAt = 0;

  // ---------- Fiche article ----------
  let editing = null, photoPick = null, photoList = [];
  function renderPhotos(i, list, failed) {
    photoList = list.slice(0, 8);
    $("it-photos").innerHTML = `<button type="button" class="none" data-p="-1" aria-pressed="${!photoPick.image}">Sans photo</button>` +
      photoList.map((m, k) => `<button type="button" data-p="${k}" aria-pressed="${photoPick.image === m.image}" title="${esc(m.name || "")}">${imgTag(m.image)}</button>`).join("") +
      (!ONLINE ? `<span class="muted">Photos Migros indisponibles en démo</span>` : failed ? `<span class="muted">Migros ne répond pas</span>` : !photoList.length ? `<span class="muted">Aucune photo trouvée</span>` : "");
  }
  $("it-photos").addEventListener("click", e => {
    const b = e.target.closest("button[data-p]"); if (!b) return;
    const k = +b.dataset.p, m = photoList[k];
    photoPick = k < 0 ? { image: null, migros_id: null } : { image: m.image, migros_id: m.id || null };
    $("it-photos").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  });
  function openItem(id) {
    const i = S.items[id]; if (!i) return; editing = id;
    $("it-name").value = i.name; $("it-qty").value = i.qty || "";
    $("it-cat").innerHTML = `<option value="">À classer</option>` + catOptions(i.category);
    photoPick = { image: i.image || null, migros_id: i.migros_id || null };
    renderPhotos(i, i.image ? [{ id: i.migros_id, image: i.image }] : []);
    $("d-item").showModal();
    if (ONLINE && navigator.onLine) fetchMigros(i.name).then(res => {
      if (editing !== id) return;
      const list = (i.image ? [{ id: i.migros_id, image: i.image }] : []).concat(res.filter(m => m.image && m.image !== i.image));
      renderPhotos(i, list);
    }).catch(() => renderPhotos(i, i.image ? [{ id: i.migros_id, image: i.image }] : [], true));
  }
  $("f-item").addEventListener("submit", e => {
    e.preventDefault();
    const i = S.items[editing]; if (!i) return $("d-item").close();
    const cat = $("it-cat").value || null;
    i.name = $("it-name").value.trim() || i.name; i.qty = $("it-qty").value.trim() || null;
    if (cat && cat !== i.category) learn(i.name, cat);
    i.category = cat; i.image = photoPick.image; i.migros_id = photoPick.migros_id;
    const term = norm(i.name); if (S.known[term]) { S.known[term].image = i.image; S.known[term].migros_id = i.migros_id; pushKnown(term); }
    saveItem(i); $("d-item").close();
  });
  $("it-cancel").onclick = () => $("d-item").close();
  $("it-del").onclick = () => { if (editing) deleteWithUndo(editing); $("d-item").close(); };

  // ---------- Ordre des rayons ----------
  function renderOrder() {
    const o = storeOrder(S.store);
    $("order-title").textContent = "Ordre des rayons, " + (STORES.find(s => s.id === S.store) || {}).n;
    $("order-list").innerHTML = o.map((id, k) => `<li><span class="k">${k + 1}</span><span>${esc(catById(id).n)}</span>
      <button type="button" data-mv="-1" data-k="${k}" aria-label="Monter" ${k === 0 ? "disabled" : ""}>↑</button>
      <button type="button" data-mv="1" data-k="${k}" aria-label="Descendre" ${k === o.length - 1 ? "disabled" : ""}>↓</button></li>`).join("");
  }
  $("order-list").addEventListener("click", e => {
    const b = e.target.closest("button[data-mv]"); if (!b) return;
    const o = storeOrder(S.store), k = +b.dataset.k, j = k + (+b.dataset.mv);
    if (j < 0 || j >= o.length) return;
    [o[k], o[j]] = [o[j], o[k]]; setOrder(o); renderOrder(); render();
  });
  $("b-order").onclick = () => { renderOrder(); $("d-order").showModal(); };
  $("order-done").onclick = () => $("d-order").close();

  // ---------- Réglages ----------
  $("b-menu").onclick = () => {
    $("menu-family").textContent = S.family ? `${S.family.name}. Code à partager avec la famille : ${S.family.code}` : "";
    $("b-logout").hidden = !ONLINE;
    $("d-menu").showModal();
  };
  $("menu-close").onclick = () => $("d-menu").close();
  $("b-clear").onclick = () => {
    const done = Object.values(S.items).filter(i => i.done);
    done.forEach(i => deleteItem(i.id));
    $("d-menu").close(); toast(done.length ? `${done.length} article(s) retiré(s)` : "Aucun article coché");
  };
  $("b-logout").onclick = async () => {
    try { await sb.auth.signOut(); } catch (e) {}
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };

  // ---------- Événements de la liste ----------
  $("list").addEventListener("click", e => {
    if (Date.now() - swipedAt < 350) return; // fin d'un glissement, pas un tap
    const a = e.target.closest("[data-act]"); if (!a) return;
    const id = a.closest(".item").dataset.id;
    if (a.dataset.act === "toggle") toggle(id); else openItem(id);
  });
  $("list").addEventListener("change", e => {
    const s = e.target.closest("select[data-fix]"); if (!s || !s.value) return;
    const i = S.items[s.dataset.fix]; if (!i) return;
    i.category = s.value; learn(i.name, s.value); saveItem(i);
    toast(`« ${i.name} » ira désormais dans ${catById(s.value).n}`);
  });
  $("f-add").addEventListener("submit", e => {
    e.preventDefault(); const v = $("new").value.trim(); if (!v) return;
    addFromText(v); $("new").value = ""; renderSugg();
  });
  $("new").addEventListener("input", renderSugg);
  $("new").addEventListener("focus", renderSugg);
  $("new").addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== $("new")) $("sugg").innerHTML = ""; }, 200));
  $("sugg").addEventListener("pointerdown", e => e.preventDefault()); // garde le clavier ouvert
  $("sugg").addEventListener("click", e => {
    const b = e.target.closest("button[data-s]"); if (!b) return;
    const typed = parse($("new").value);
    let extra = null;
    if (b.dataset.m !== undefined) {
      const m = migrosShown[+b.dataset.m];
      extra = { image: m.image, migros_id: m.id, category: classify(m.category || "") || classify(m.name) };
    } else if (b.dataset.l !== undefined) {
      const sg = suggShown[+b.dataset.l];
      if (sg && sg.image) extra = { image: sg.image, migros_id: sg.migros_id || null };
    }
    addFromText((typed.qty ? typed.qty + " " : "") + b.dataset.s, extra);
    $("new").value = ""; $("new").focus(); renderSugg();
  });
  $("m-list").onclick = () => { S.mode = "list"; save(); render(); };
  $("m-store").onclick = () => { S.mode = "store"; save(); render(); detectStore(); };
  $("store").innerHTML = [...new Set(STORES.map(s => s.g))].map(g => `<optgroup label="${esc(g)}">` +
    STORES.filter(s => s.g === g).map(s => `<option value="${s.id}">${esc(s.n)}</option>`).join("") + `</optgroup>`).join("");
  $("store").onchange = e => { S.store = e.target.value; save(); render(); };

  window.addEventListener("online", () => { flush(); pull(); });
  window.addEventListener("offline", setSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.mode === "store") detectStore();
    if (document.visibilityState === "visible" && ONLINE && S.family) { flush(); pull(); subscribe(); }
  });

  // ---------- Connexion ----------
  async function login(signup) {
    const email = $("login-email").value.trim(), password = $("login-pass").value;
    if (!email || password.length < 6) { $("login-msg").textContent = "E-mail et mot de passe de 6 caractères minimum."; return; }
    $("login-msg").textContent = signup ? "Création du compte…" : "Connexion…";
    const r = signup ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
    if (r.error) {
      const m = r.error.message || "";
      $("login-msg").textContent = /invalid login/i.test(m) ? "E-mail ou mot de passe incorrect." :
        /already registered/i.test(m) ? "Ce compte existe déjà : utilise « Se connecter »." : "Erreur : " + m;
      return;
    }
    if (!r.data.session) { $("login-msg").textContent = "Compte créé. Confirme ton e-mail (lien reçu), puis reviens ici et appuie sur « Se connecter »."; return; }
    afterLogin(r.data.user);
  }
  $("f-login").addEventListener("submit", e => { e.preventDefault(); login(false); });
  $("b-signup").onclick = () => login(true);
  $("f-family").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("fam-name").value.trim(), code = $("fam-code").value.trim();
    const r = code ? await sb.rpc("join_family", { p_code: code, p_display_name: name })
                   : await sb.rpc("create_family", { p_name: "Famille de " + name, p_display_name: name });
    if (r.error) { $("fam-msg").textContent = r.error.message; return; }
    const { data } = await sb.auth.getUser();
    afterLogin(data.user);
  });

  async function afterLogin(user) {
    const { data: m, error } = await sb.from("members")
      .select("display_name, family_id, families(id, name, code)").eq("user_id", user.id).maybeSingle();
    if (error) { if (S.family) show("main"); else $("login-msg").textContent = "Erreur : " + error.message; return; }
    if (!m) return show("family");
    const changed = !S.family || S.family.id !== m.families.id;
    S.me = { name: m.display_name }; S.family = m.families;
    if (changed) { S.items = {}; S.queue = []; S.dict = {}; S.order = {}; S.pos = {}; S.known = {}; }
    save(); show("main");
    await flush(); await pull(); subscribe();
  }

  async function boot() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (!ONLINE) {
      S.me = S.me || { name: "Moi" };
      S.family = S.family || { id: "demo", name: "Démo", code: "pas de code en mode démo" };
      save(); show("main"); return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    if (S.family && S.me) show("main");          // démarrage instantané, même hors ligne
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) {}
    if (!session) { if (!navigator.onLine && S.family) return; S.family = null; save(); return show("login"); }
    if (!navigator.onLine) return;
    afterLogin(session.user);
  }

  // Exposé pour les tests
  window.__courses = { classify, parse, suggest };
  boot();
})();
