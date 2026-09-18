// Reads the NBBO tastytrade shows (highest bid / lowest ask) and writes
// tastytrade-touches.json. `tastytrade_cost.mjs` reads that file; this
// script talks to the network.
//
// One call takes up to 100 symbols. The catalogue is ~11 000 US names,
// so a full run is a hundred-odd requests from the signed-in tab.
//
//   node tastytrade/tastytrade-touches.mjs
//   node tastytrade/tastytrade-touches.mjs --only=AQLT,AAPL
//   node tastytrade/tastytrade-touches.mjs --limit=200

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const CATALOGUE = new URL("tastytrade-parsed.json", import.meta.url);
const OUT = new URL("tastytrade-touches.json", import.meta.url);
const APP = "https://my.tastytrade.com/app.html";
const BATCH = 100;
const PAUSE = 150;

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const ONLY = new Set(
  (arg("only", "") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);
const LIMIT = Number(arg("limit", "0")) || 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = (Array.isArray(catalogue) ? catalogue : catalogue.rows || []).filter(
  (r) => String(r.type || "").toUpperCase() !== "CRYPTO" && r.ticker
);
const wanted = rows.filter((r) => !ONLY.size || ONLY.has(String(r.ticker).toUpperCase()));
const list = LIMIT > 0 ? wanted.slice(0, LIMIT) : wanted;
if (!list.length) throw new Error("aucun symbole à coter.");
const rowOf = new Map(list.map((r) => [String(r.ticker).toUpperCase(), r]));

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => /tastytrade|tastyworks/i.test(p.url()));
if (!page) throw new Error("aucun onglet tastytrade ouvert sur 9222.");

const token = await page.evaluate(() => sessionStorage.getItem("tw-session-id") || "");

async function api(path) {
  return page.evaluate(
    async (url, authorization) => {
      try {
        const headers = { Accept: "application/json", "X-Tastyworks-CSRF": "1" };
        if (authorization) headers.Authorization = authorization;
        const response = await fetch(url, { credentials: "include", headers });
        const text = await response.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {}
        return { status: response.status, body: parsed, text: parsed ? null : text.slice(0, 400) };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    `https://api.tastytrade.com${path}`,
    token
  );
}

const batches = [];
for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH));

const byTicker = {};
let quoted = 0;
let empty = 0;
let failed = 0;

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  const equity = batch.map((r) => encodeURIComponent(r.ticker)).join(",");
  let res = await api(`/market-data/by-type?equity=${equity}`);
  if (res.status === 429) {
    await sleep(2000);
    res = await api(`/market-data/by-type?equity=${equity}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`tastytrade refuse la session (${res.status}). Se reconnecter sur ${APP}.`);
  }
  if (res.status !== 200) {
    failed += batch.length;
    console.error(`  lot ${i + 1}/${batches.length} : HTTP ${res.status} ${res.error || res.text || ""}`);
    await sleep(PAUSE);
    continue;
  }

  const items = res.body?.data?.items || [];
  const seen = new Set();
  for (const item of items) {
    const symbol = String(item.symbol || "").toUpperCase();
    if (!symbol) continue;
    seen.add(symbol);
    const bid = num(item.bid);
    const ask = num(item.ask);
    const last = num(item.last);
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : num(item.mid);
    const perShare = bid > 0 && ask > 0 && ask >= bid ? Number((ask - bid).toPrecision(8)) : null;
    const bp = perShare != null && mid > 0 ? Number(((1e4 * perShare) / mid).toPrecision(6)) : null;
    const row = rowOf.get(symbol);
    byTicker[symbol] = {
      isin: row?.isin || null,
      bid,
      ask,
      last,
      mid,
      perShare,
      bp,
      at: item["updated-at"] || item.updatedAt || new Date().toISOString(),
    };
    if (perShare != null) quoted += 1;
    else empty += 1;
  }
  for (const r of batch) {
    const symbol = String(r.ticker).toUpperCase();
    if (!seen.has(symbol) && !byTicker[symbol]) {
      empty += 1;
      byTicker[symbol] = { isin: r.isin || null, bid: null, ask: null, last: null, mid: null, perShare: null, bp: null };
    }
  }
  console.error(
    `  lot ${i + 1}/${batches.length} : ${items.length}/${batch.length} réponses, ` +
      `${quoted} touches, ${empty} vides, ${failed} erreurs`
  );
  if (i + 1 < batches.length) await sleep(PAUSE);
}

const asOf = new Date().toISOString();
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      asOf,
      source: "https://api.tastytrade.com/market-data/by-type",
      measure: "touche NBBO tastytrade, aller-retour (ask − bid)",
      asked: list.length,
      quoted,
      empty,
      failed,
      byTicker,
    },
    null,
    2
  )
);

console.error(`écrit ${quoted} touches / ${list.length} dans ${OUT.pathname}`);
await browser.disconnect();
