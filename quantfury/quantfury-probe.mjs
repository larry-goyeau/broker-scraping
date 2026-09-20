// Reconnaissance on the Quantfury web platform, read only.
//
// `quantfury_cost.mjs` prices 281 European lines on a book that is not theirs.
// Quantfury names "Cboe Europe" for all of them, `spread.json` collects no Cboe
// Europe tape, so the cost file reads the primary's book and says so. What it
// cannot say is how far the two sit apart — that is the last weak joint left in
// the file, and the header admits it in as many words.
//
// It does not need an order to close. Quantfury's own price endpoint publishes
// the bid and the ask it shows the client, line by line, and that is the Cboe
// Europe touch itself. So this script attaches to the tab already open, asks for
// every line in the catalogue, and sets what Quantfury quotes beside what the
// cost file assumed.
//
// Each quote also carries `r`, the rate Quantfury uses to put the line in
// dollars. Against the mid of the currency pair it quotes separately, that is a
// second reading of the conversion — the one the cash account prices at 0 % for
// the euro and 1 % for the real.
//
// Two things to know before trusting the numbers. The touch is only a touch
// while the market is open: outside the session every line comes back with the
// bid equal to the ask and a volume of zero, which is a close and not a spread.
// This script counts those and refuses to average them. And a touch is one
// instant, where `spread.json` is a month of tape, so a single wide line means
// less than the shape of the whole shelf.
//
// Two-sided prints are merged into `quantfury-touches.json` for `roundTrip`.
// Closed prints (bid = ask) are left out, so a stale open touch survives the
// close. It places no orders and touches no balance.
//
//   node quantfury/quantfury-probe.mjs                  (les lignes en euros)
//   node quantfury/quantfury-probe.mjs --currency=USD
//   node quantfury/quantfury-probe.mjs --all
//   node quantfury/quantfury-probe.mjs --limit=40
//
// Chrome must already be listening: --remote-debugging-port=9222, signed in at
// https://trading.quantfury.com/

import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { roundTrip } from "./quantfury_cost.mjs";

const CATALOGUE = new URL("quantfury-parsed.json", import.meta.url);
const OUT = new URL("quantfury-probe.json", import.meta.url);
const TOUCHES = new URL("quantfury-touches.json", import.meta.url);
const HOST = /trading\.quantfury\.com/i;
const PRICE = "https://l1.trdngbcknd.com/v13/price";

// The token that signs a price request is not the one that signs an account
// request: l1 answers DataTokenExpired to e1's. So headers are kept per host.
const PRICE_HOST = "l1.trdngbcknd.com";

// The session refreshes its token a few seconds after the page settles, and the
// first one captured is often already dead.
const SETTLE_MS = 14000;
const BATCH = 100;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const bpOf = (b, a) => (b > 0 && a > 0 ? ((a - b) / ((a + b) / 2)) * 1e4 : null);

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Quantfury's own identifier is the first token of the catalogue string it was
// scraped from: "ACSe.CHI Actividades de Construcción y Servicios S.A. Cboe…".
const shortNameOf = (row) => String(row.raw || "").split(/\s+/)[0] || null;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
if (!catalogue) {
  console.error("aucun catalogue Quantfury : lancer `node quantfury/quantfury_scraping.mjs`");
  process.exit(2);
}

const wanted = process.argv.includes("--all") ? null : (arg("currency") || "EUR").toUpperCase();
const limit = Number(arg("limit")) || 0;

let rows = (Array.isArray(catalogue) ? catalogue : catalogue.rows || []).filter(shortNameOf);
if (wanted) rows = rows.filter((r) => String(r.currency || "").toUpperCase() === wanted);
if (limit) rows = rows.slice(0, limit);

if (!rows.length) {
  console.error(`aucune ligne ${wanted || ""} dans le catalogue`);
  process.exit(2);
}

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => HOST.test(p.url()));

if (!page) {
  console.error("aucun onglet Quantfury ouvert : ouvrir https://trading.quantfury.com/ et se connecter");
  await browser.disconnect();
  process.exit(2);
}

console.log(`onglet : ${page.url()}`);
console.log(`${rows.length} lignes ${wanted || "toutes devises"} à interroger\n`);

const client = await page.target().createCDPSession();
await client.send("Network.enable");

const byHost = new Map();
client.on("Network.requestWillBeSent", (event) => {
  const headers = event.request.headers || {};
  if (!/trdngbcknd\.com\/v13\//.test(event.request.url)) return;
  if (!(headers.Authorization || headers.authorization)) return;
  byHost.set(new URL(event.request.url).host, headers);
});

await page.reload({ waitUntil: "domcontentloaded" });
await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

const captured = byHost.get(PRICE_HOST);
if (!captured) {
  console.error("jeton de cotation non capturé : la session est-elle bien ouverte ?");
  await browser.disconnect();
  process.exit(2);
}

const headers = Object.fromEntries(
  Object.entries(captured).filter(([key]) => !key.startsWith(":") && !/^(host|content-length|referer)$/i.test(key))
);

// The pair each line would be converted through, asked alongside so that `r`
// can be read against a mid quoted at the same instant.
const pairs = [...new Set(rows.map((r) => String(r.currency || "").toUpperCase()))]
  .filter((c) => c && c !== "USD")
  .map((c) => (c === "EUR" || c === "GBP" ? `${c}/USD` : `USD/${c}`));

const names = [...new Set([...rows.map(shortNameOf), ...pairs])];
const quotes = new Map();

for (let i = 0; i < names.length; i += BATCH) {
  const slice = names.slice(i, i + BATCH);
  const answer = await page.evaluate(
    async (h, url, shortNames) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...h, "content-type": "application/json" },
        body: JSON.stringify({ shortNames }),
      });
      return { status: res.status, text: await res.text() };
    },
    headers,
    PRICE,
    slice
  );

  if (answer.status !== 200) {
    console.error(`cotation refusée (${answer.status}) : ${answer.text.slice(0, 160)}`);
    await browser.disconnect();
    process.exit(1);
  }

  for (const q of JSON.parse(answer.text).data || []) quotes.set(q.n, q);
  process.stderr.write(`  ${Math.min(i + BATCH, names.length)}/${names.length}\r`);
}

await browser.disconnect();

const pairMid = new Map();
for (const p of pairs) {
  const q = quotes.get(p);
  if (q && q.b > 0 && q.a > 0) pairMid.set(p, (q.b + q.a) / 2);
}

const measured = [];
const closed = [];
const missing = [];

for (const row of rows) {
  const name = shortNameOf(row);
  const quote = quotes.get(name);
  if (!quote) {
    missing.push(name);
    continue;
  }

  // The cost file's own resolution, so that the two books compared are the two
  // books it would have chosen: one from Quantfury, one standing in for it.
  const priced = roundTrip({
    etf: row.isin || row.ticker,
    place: row.exchange,
    currency: row.currency,
    shares: 1,
    price: 100,
  });

  const currency = String(row.currency || "").toUpperCase();
  const pair = currency === "USD" ? null : currency === "EUR" || currency === "GBP" ? `${currency}/USD` : `USD/${currency}`;
  const mid = pair ? pairMid.get(pair) : null;
  const inverted = pair ? pair.startsWith("USD/") : false;

  const seen = {
    ticker: row.ticker,
    name: row.name,
    shortName: name,
    isin: row.isin || null,
    currency,
    exchange: row.exchange,
    bid: quote.b,
    ask: quote.a,
    quantfuryBp: bpOf(quote.b, quote.a),
    standInBp: priced.bp ?? null,
    standInVenue: priced.listing?.bookVenue ?? null,
    rate: quote.r ?? null,
    // `r` puts the line in dollars; the pair's mid says what that should be.
    rateOffBp:
      quote.r > 0 && mid ? ((quote.r - (inverted ? 1 / mid : mid)) / (inverted ? 1 / mid : mid)) * 1e4 : null,
  };

  // Outside the session Quantfury returns the close on both sides. A zero here
  // is the market being shut, not a book without a spread.
  if (!(quote.b > 0) || !(quote.a > 0) || quote.b === quote.a) closed.push(seen);
  else measured.push(seen);
}

const withBoth = measured.filter((m) => m.quantfuryBp != null && m.standInBp != null);

console.log(`\n${measured.length} lignes cotées des deux côtés, ${closed.length} fermées, ${missing.length} inconnues de Quantfury\n`);

if (measured.length) {
  console.log("ticker    devise  Quantfury   doublure   place     écart");
  for (const m of measured.slice().sort((a, b) => (b.quantfuryBp ?? 0) - (a.quantfuryBp ?? 0))) {
    const gap = m.standInBp != null && m.quantfuryBp != null ? m.quantfuryBp - m.standInBp : null;
    console.log(
      ` ${String(m.ticker).padEnd(9)} ${m.currency.padEnd(6)} ` +
        `${(m.quantfuryBp?.toFixed(2) ?? "N/A").padStart(9)} ` +
        `${(m.standInBp?.toFixed(2) ?? "N/A").padStart(10)}  ` +
        `${String(m.standInVenue || "—").padEnd(8)} ` +
        `${gap == null ? "" : (gap > 0 ? "+" : "") + gap.toFixed(2)}`
    );
  }
}

const summary = {
  asOf: new Date().toISOString(),
  currency: wanted || "toutes",
  asked: rows.length,
  measured: measured.length,
  closed: closed.length,
  missing: missing.length,
  medianQuantfuryBp: median(withBoth.map((m) => m.quantfuryBp)),
  medianStandInBp: median(withBoth.map((m) => m.standInBp)),
  medianGapBp: median(withBoth.map((m) => m.quantfuryBp - m.standInBp)),
  medianRateOffBp: median(measured.map((m) => m.rateOffBp)),
};

console.log("\n— résumé —");
if (!measured.length) {
  console.log("aucune ligne ouverte : hors séance, Quantfury renvoie la clôture des deux côtés.");
  console.log("relancer pendant les heures de marché de la place visée.");
} else {
  console.log(`touche affichée par Quantfury : médiane ${summary.medianQuantfuryBp?.toFixed(2)} bp`);
  console.log(`carnet servant de doublure    : médiane ${summary.medianStandInBp?.toFixed(2)} bp`);
  console.log(`écart médian                  : ${summary.medianGapBp?.toFixed(2)} bp, sur ${withBoth.length} lignes`);
  if (summary.medianRateOffBp != null) {
    console.log(`taux de change appliqué       : ${summary.medianRateOffBp.toFixed(2)} bp du mid de la paire`);
  }
  // Rule 605 gives an American share a per-share figure and no bp, so those
  // lines have a touch to show and nothing to set it against.
  const perShareOnly = measured.length - withBoth.length;
  if (perShareOnly > 0) {
    console.log(`${perShareOnly} lignes sans doublure en bp : la bande 605 les chiffre par part`);
  }
}

fs.writeFileSync(OUT, JSON.stringify({ ...summary, measured, closed, missing }, null, 2));
console.log(`\nécrit dans ${OUT.pathname.split("/").slice(-2).join("/")}`);

const prev = fs.existsSync(TOUCHES) ? JSON.parse(fs.readFileSync(TOUCHES, "utf8")) : {};
const byIsin = { ...(prev.byIsin || {}) };
const byTicker = { ...(prev.byTicker || {}) };
const at = summary.asOf;
for (const m of measured) {
  const rec = {
    ticker: m.ticker,
    shortName: m.shortName,
    bid: m.bid,
    ask: m.ask,
    perShare: Number((m.ask - m.bid).toPrecision(8)),
    bp: Number(m.quantfuryBp?.toFixed(4)),
    currency: m.currency,
    at,
  };
  if (m.isin) byIsin[String(m.isin).toUpperCase()] = rec;
  if (m.ticker) byTicker[String(m.ticker).toUpperCase()] = rec;
}
fs.writeFileSync(TOUCHES, JSON.stringify({ asOf: at, byIsin, byTicker }, null, 2));
console.log(`touches : ${Object.keys(byIsin).length} ISIN / ${Object.keys(byTicker).length} tickers → quantfury/quantfury-touches.json`);
console.log("aucun ordre passé, aucun solde touché.");
