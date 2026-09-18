// Reads the quote Alpaca's signed-in tab can see and writes alpaca-touches.json.
// `alpaca_cost.mjs` reads that file; this script talks to the network.
//
// Stocks: SIP if the session has it, otherwise IEX (the free feed; `feed=sip`
// is 403 on a basic subscription). Crypto is Alpaca's own book and needs no
// paid tape.
//
//   node alpaca/alpaca-touches.mjs
//   node alpaca/alpaca-touches.mjs --only=AQLT,AAPL,BTC/USD
//   node alpaca/alpaca-touches.mjs --limit=200

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const CATALOGUE = new URL("alpaca-parsed.json", import.meta.url);
const OUT = new URL("alpaca-touches.json", import.meta.url);
const APP = "https://app.alpaca.markets/dashboard/overview";
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
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = (Array.isArray(catalogue) ? catalogue : catalogue.rows || []).filter((r) => r.ticker);
const wanted = rows.filter((r) => !ONLY.size || ONLY.has(String(r.ticker).toUpperCase()) || ONLY.has(String(r.ticker).split("/")[0].toUpperCase()));
const list = LIMIT > 0 ? wanted.slice(0, LIMIT) : wanted;
if (!list.length) throw new Error("aucun symbole à coter.");
const equities = list.filter((r) => !isCrypto(r));
const coins = list.filter(isCrypto);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const page = (await browser.pages()).find((p) => /app\.alpaca\.markets/i.test(p.url()));
if (!page) throw new Error("aucun onglet app.alpaca.markets ouvert sur 9222.");

const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
let token = null;
cdp.on("Network.requestWillBeSent", (e) => {
  const auth = e.request.headers.Authorization || e.request.headers.authorization;
  if (!token && auth?.startsWith("Bearer ")) token = auth.slice(7);
});
await page.reload({ waitUntil: "domcontentloaded" });
for (let i = 0; i < 24 && !token; i++) await sleep(500);
if (!token) throw new Error(`aucun jeton capturé : recharger ${APP} et réessayer.`);

async function api(url) {
  return page.evaluate(
    async (url, bearer) => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
        });
        const text = await res.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {}
        return { status: res.status, body: parsed, text: parsed ? null : text.slice(0, 400) };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    url,
    token
  );
}

async function pickStockFeed() {
  const probe = "https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=AAPL&feed=";
  const sip = await api(`${probe}sip`);
  if (sip.status === 200 && sip.body?.quotes?.AAPL) return "sip";
  const iex = await api(`${probe}iex`);
  if (iex.status === 200 && iex.body?.quotes?.AAPL) return "iex";
  throw new Error(
    `Alpaca ne cote pas AAPL (SIP ${sip.status}, IEX ${iex.status} : ${sip.text || iex.text || ""})`
  );
}

function store(byTicker, symbol, row, q, feed) {
  const bid = num(q?.bp ?? q?.bid);
  const ask = num(q?.ap ?? q?.ask);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
  const perShare = bid > 0 && ask > 0 && ask >= bid ? Number((ask - bid).toPrecision(8)) : null;
  const bp = perShare != null && mid > 0 ? Number(((1e4 * perShare) / mid).toPrecision(6)) : null;
  byTicker[symbol] = {
    isin: row?.isin || null,
    bid,
    ask,
    mid,
    perShare,
    bp,
    feed,
    bidVenue: q?.bx || null,
    askVenue: q?.ax || null,
    at: q?.t || q?.updatedAt || new Date().toISOString(),
  };
  return perShare != null;
}

const stockFeed = equities.length ? await pickStockFeed() : null;
console.error(stockFeed ? `flux actions : ${stockFeed}` : "aucun titre à coter");

const byTicker = {};
let quoted = 0;
let empty = 0;
let failed = 0;

const batches = [];
for (let i = 0; i < equities.length; i += BATCH) batches.push(equities.slice(i, i + BATCH));

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  const symbols = batch.map((r) => r.ticker).join(",");
  const url = `https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbols)}&feed=${stockFeed}`;
  let res = await api(url);
  if (res.status === 429) {
    await sleep(2000);
    res = await api(url);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Alpaca refuse la session (${res.status}). Se reconnecter sur ${APP}.`);
  }
  if (res.status !== 200) {
    failed += batch.length;
    console.error(`  lot ${i + 1}/${batches.length} : HTTP ${res.status} ${res.error || res.text || ""}`);
    await sleep(PAUSE);
    continue;
  }
  const quotes = res.body?.quotes || {};
  let got = 0;
  for (const r of batch) {
    const symbol = String(r.ticker).toUpperCase();
    const q = quotes[symbol] || quotes[r.ticker];
    if (q && store(byTicker, symbol, r, q, stockFeed)) {
      quoted += 1;
      got += 1;
    } else {
      empty += 1;
      if (!byTicker[symbol]) {
        byTicker[symbol] = {
          isin: r.isin || null,
          bid: null,
          ask: null,
          mid: null,
          perShare: null,
          bp: null,
          feed: stockFeed,
        };
      }
    }
  }
  console.error(
    `  lot ${i + 1}/${batches.length} : ${got}/${batch.length} touches, ` +
      `${quoted} au total, ${empty} vides, ${failed} erreurs`
  );
  if (i + 1 < batches.length) await sleep(PAUSE);
}

const missing = equities.filter((r) => byTicker[String(r.ticker).toUpperCase()]?.perShare == null);
if (missing.length && stockFeed === "iex") {
  const otcBatches = [];
  for (let i = 0; i < missing.length; i += BATCH) otcBatches.push(missing.slice(i, i + BATCH));
  for (let i = 0; i < otcBatches.length; i++) {
    const batch = otcBatches[i];
    const symbols = batch.map((r) => r.ticker).join(",");
    const url = `https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbols)}&feed=otc`;
    const res = await api(url);
    if (res.status !== 200) break;
    const quotes = res.body?.quotes || {};
    let got = 0;
    for (const r of batch) {
      const symbol = String(r.ticker).toUpperCase();
      const q = quotes[symbol] || quotes[r.ticker];
      if (q && store(byTicker, symbol, r, q, "otc")) {
        quoted += 1;
        empty = Math.max(0, empty - 1);
        got += 1;
      }
    }
    if (got) console.error(`  otc ${i + 1}/${otcBatches.length} : +${got}`);
    await sleep(PAUSE);
  }
}

if (coins.length) {
  for (let i = 0; i < coins.length; i += BATCH) {
    const batch = coins.slice(i, i + BATCH);
    const symbols = batch.map((r) => r.ticker).join(",");
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(symbols)}`;
    const res = await api(url);
    const quotes = res.body?.quotes || {};
    let got = 0;
    for (const r of batch) {
      const symbol = String(r.ticker).toUpperCase();
      const q = quotes[symbol] || quotes[symbol.replace("/", "")] || quotes[r.ticker];
      if (q && store(byTicker, symbol, r, q, "crypto")) {
        quoted += 1;
        got += 1;
      } else {
        empty += 1;
      }
    }
    console.error(`  crypto : ${got}/${batch.length} touches`);
  }
}

const asOf = new Date().toISOString();
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      asOf,
      source: "https://data.alpaca.markets/v2/stocks/quotes/latest",
      measure:
        stockFeed === "sip"
          ? "touche NBBO Alpaca (SIP), aller-retour (ask − bid)"
          : stockFeed === "iex"
            ? "touche IEX Alpaca, aller-retour (ask − bid) — pas le NBBO"
            : "touche Alpaca, aller-retour (ask − bid)",
      feed: stockFeed,
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

console.error(`écrit ${quoted} touches / ${list.length} (${stockFeed || "crypto"}) dans ${OUT.pathname}`);
await browser.disconnect();
