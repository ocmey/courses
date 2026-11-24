// Recherche de produits sur migros.ch, pour les suggestions de l'app.
// Usage privé familial : une recherche à la demande quand on tape, résultats
// gardés 7 jours en base pour ne pas interroger Migros deux fois pour la même chose.
// Migros n'a pas d'API publique : ces adresses sont celles qu'utilise leur site
// et peuvent changer sans prévenir. Si ça casse, l'app continue sans Migros.
//
// Appel : GET /functions/v1/migros?q=yvette   (ajouter &debug=1 pour voir la réponse brute)

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BASE = "https://www.migros.ch";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CACHE_DAYS = 7;
const LANG = { "accept-language": "fr-CH,fr;q=0.9", "migros-language": "fr" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let guest: { token: string; at: number } | null = null;

async function guestToken(): Promise<string> {
  if (guest && Date.now() - guest.at < 20 * 60 * 1000) return guest.token;
  const r = await fetch(`${BASE}/authentication/public/v1/api/guest?authorizationNotRequired=true`, {
    headers: { accept: "application/json, text/plain, */*", "user-agent": UA, ...LANG },
  });
  const t = r.headers.get("leshopch");
  if (!t) throw new Error(`Jeton invité refusé par Migros (HTTP ${r.status})`);
  guest = { token: t, at: Date.now() };
  return t;
}

async function migros(path: string, body: unknown, token: string) {
  const r = await fetch(BASE + path + (path.includes("?") ? "&" : "?") + "lang=fr", {
    method: "POST",
    headers: { accept: "application/json, text/plain, */*", "content-type": "application/json", leshopch: token, "user-agent": UA, ...LANG },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} : HTTP ${r.status}`);
  return r.json();
}

// Va chercher un champ quel que soit l'endroit où Migros l'a rangé cette année
const pick = (o: any, ...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((a, p) => a?.[p], o); if (v) return v; } return null; };

function toProduct(p: any) {
  let img = pick(p, "images.0.url", "imageTransparent.url", "image.original", "image.url", "images.0.cdn.url");
  if (typeof img === "string") img = img.replace("{stack}", "original").replace("{width}", "120").replace("{height}", "120");
  const crumbs = pick(p, "breadcrumb", "productInformation.mainInformation.category", "categories") || [];
  const category = Array.isArray(crumbs) ? crumbs.map((c: any) => c?.name ?? c).filter(Boolean).join(" > ") : String(crumbs);
  const variant = pick(p, "versioning");
  const base = pick(p, "name", "title") ?? "";
  return {
    id: String(pick(p, "migrosId", "uid", "id") ?? ""),
    name: variant && !String(base).includes(variant) ? `${base} ${variant}` : base,
    brand: pick(p, "brand.name", "brand", "brandLine", "productInformation.mainInformation.brand.name") ?? null,
    size: pick(p, "productInformation.mainInformation.quantity", "quantity", "productInformation.mainInformation.unit") ?? null,
    image: typeof img === "string" ? img : null,
    category,
  };
}

async function search(q: string, debug: boolean) {
  const token = await guestToken();
  const s = await migros("/onesearch-oc-seaapi/public/v5/search", {
    regionId: "national", language: "fr", productIds: [], query: q, sortFields: [], sortOrder: "asc", algorithm: "DEFAULT", filters: {},
  }, token);
  const ids: string[] = (pick(s, "productIds", "products") || []).slice(0, 8).map((x: any) => String(x?.id ?? x));
  if (!ids.length) return debug ? { search: s, products: [] } : [];
  const today = new Date().toISOString().split("T")[0] + "T00:00:00";
  const cards = await migros("/product-display/public/v4/product-cards", {
    productFilter: { uids: ids },
    offerFilter: { storeType: "OFFLINE", region: "national", ongoingOfferDate: today },
  }, token);
  const list = Array.isArray(cards) ? cards : (pick(cards, "products", "productCards") || []);
  if (debug) return { search: s, cards };
  return list.map(toProduct).filter((p: any) => p.name);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);
  const debug = url.searchParams.get("debug") === "1";
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, "content-type": "application/json" } });
  if (q.length < 3) return json({ products: [] });

  // Cache en base (table migros_cache), avec les droits du service
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!debug) {
    const { data } = await db.from("migros_cache").select("results, fetched_at").eq("query", "fr:" + q).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_DAYS * 864e5) return json({ products: data.results, cached: true });
  }
  try {
    const res = await search(q, debug);
    if (debug) return json(res);
    await db.from("migros_cache").upsert({ query: "fr:" + q, results: res, fetched_at: new Date().toISOString() });
    return json({ products: res });
  } catch (e) {
    return json({ products: [], error: String((e as Error).message || e) }, 200);
  }
});
