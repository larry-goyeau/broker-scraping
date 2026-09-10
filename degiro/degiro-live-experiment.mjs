// One AAPL Nasdaq share, market both ways, on the signed-in DEGIRO NL trader.
// Chrome :9222. Does not touch other tabs. `--probe` stops after checkOrder.
//
//   node degiro/degiro-live-experiment.mjs --probe
//   node degiro/degiro-live-experiment.mjs --live
//
// A bought leg that fails to sell aborts and leaves the position; the JSON
// still writes what it has.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = process.argv.includes("--live");
const OUT = new URL(LIVE ? "degiro-live-experiment.json" : "degiro-live-probe.json", import.meta.url);

const ISIN = "US0378331005";
const TICKER = "AAPL";
const VENUE = "NDQ";
const SIZE = 1;
const MIN_CASH = 250;

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

async function degiroPage() {
  const pages = await browser.pages();
  const found = pages.find((p) => /degiro\./i.test(p.url()));
  if (found) return found;
  const page = await browser.newPage();
  await page.goto("https://trader.degiro.nl/trader/#/markets", { waitUntil: "domcontentloaded" });
  await sleep(5000);
  return page;
}

let page = await degiroPage();

async function inPage(fn, ...args) {
  return page.evaluate(fn, ...args);
}

async function readSession() {
  return inPage(() => {
    const found = {};
    for (const entry of performance.getEntriesByType("resource")) {
      try {
        const query = new URL(entry.name).searchParams;
        if (query.get("sessionId")) found.sessionId = query.get("sessionId");
        if (query.get("intAccount")) found.intAccount = query.get("intAccount");
      } catch {
        // ignore
      }
    }
    return found;
  });
}

let session = await readSession();
if (!session.sessionId || !session.intAccount) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(6000);
  session = await readSession();
}
if (!session.sessionId || !session.intAccount) {
  await browser.disconnect();
  throw new Error("session DEGIRO illisible : le trader est-il connecté ?");
}

const tail = () => `intAccount=${session.intAccount}&sessionId=${session.sessionId}`;
const jsid = (path) => `${path};jsessionid=${session.sessionId}?${tail()}`;

async function call(path, { method = "GET", body = null } = {}) {
  return inPage(
    async (url, method, body) => {
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 400) };
      }
      return { status: response.status, json };
    },
    path,
    method,
    body
  );
}

function unwrap(answer, label) {
  if (answer.status === 401 || answer.status === 403) {
    throw new Error(`session expirée (${answer.status}) sur ${label}`);
  }
  if (answer.status < 200 || answer.status >= 300) {
    throw new Error(`${label} → ${answer.status} ${JSON.stringify(answer.json).slice(0, 300)}`);
  }
  return answer.json;
}

function bag(node) {
  if (!node) return {};
  const rows = Array.isArray(node) ? node : Array.isArray(node.value) ? node.value : null;
  if (!rows) return node;
  const out = {};
  for (const item of rows) {
    if (!item || item.name == null) continue;
    out[item.name] = Array.isArray(item.value) ? bag(item.value) : item.value;
  }
  return out;
}

const dict = unwrap(
  await call(`/productsearch/secure/v1/config/dictionary?${tail()}`),
  "dictionary"
);
const exchanges = new Map();
for (const row of dict?.exchanges || []) {
  exchanges.set(String(row.id), (row.hiqAbbr || row.name || "").toUpperCase());
}

const looked = unwrap(
  await call(`/product_search/secure/v5/products/lookup?searchText=${TICKER}&limit=30&offset=0&${tail()}`),
  "lookup"
);
const products = looked?.products || looked?.data || [];
const product = products.find((p) => {
  const code = exchanges.get(String(p.exchangeId)) || "";
  return String(p.isin || "").toUpperCase() === ISIN && (code === VENUE || /NASDAQ/i.test(p.name || ""));
}) || products.find((p) => String(p.isin || "").toUpperCase() === ISIN && String(p.symbol || "").toUpperCase() === TICKER);

if (!product) {
  await browser.disconnect();
  throw new Error(`AAPL ${ISIN} ${VENUE} introuvable (${products.length} hits)`);
}

const productId = Number(product.id);
const venue = exchanges.get(String(product.exchangeId)) || String(product.exchangeId);

const info = unwrap(await call(`/pa/secure/client?${tail()}`), "client");
const client = info?.data || info;

const snap = unwrap(await call(jsid(`/trading/secure/v5/update/${session.intAccount}`) + "&cashFunds=0&orders=0&portfolio=0&totalPortfolio=0"), "update");

function cashEur(update) {
  const funds = (update?.cashFunds?.value || []).map(bag);
  const eur = funds.find((r) => String(r.currencyCode || "").toUpperCase() === "EUR");
  const total = bag(update?.totalPortfolio);
  const free = total.freeSpaceNew?.EUR ?? total.flatexCash ?? total.totalCash;
  return { value: Number(eur?.value ?? free ?? NaN), free: Number(free ?? NaN), funds };
}

function positionIn(update, id) {
  for (const row of update?.portfolio?.value || []) {
    const p = bag(row);
    if (Number(p.id) === Number(id) || Number(p.product) === Number(id) || Number(p.value) === Number(id)) {
      return p;
    }
  }
  return null;
}

let cash = cashEur(snap);
const already = positionIn(snap, productId);
if (already && Number(already.size || already.value) > 0) {
  await browser.disconnect();
  throw new Error(`position AAPL déjà ouverte (${JSON.stringify(already).slice(0, 200)})`);
}
if (!(cash.value >= MIN_CASH)) {
  await browser.disconnect();
  throw new Error(`cash EUR ${cash.value} < ${MIN_CASH}`);
}

const lastUsd = await inPage(() => {
  const m = document.body.innerText.match(/\$\s*([0-9]+[.,][0-9]+)/);
  return m ? Number(m[1].replace(",", ".")) : null;
});
if (!lastUsd) {
  await browser.disconnect();
  throw new Error("cours AAPL illisible sur la fiche");
}

// Market needs ~324 € of free space on a 320 $ print. Cash is 290 €, so the
// buy is a limit a few dollars through the (15 min delayed) last. The sell
// can be a market: it does not reserve that cash pad.
const buyPrice = Number(Math.min(lastUsd + 6, 332).toFixed(2));

const buyBody = {
  buySell: "BUY",
  orderType: 0,
  productId,
  size: SIZE,
  timeType: 1,
  price: buyPrice,
};
const sellBody = {
  buySell: "SELL",
  orderType: 2,
  productId,
  size: SIZE,
  timeType: 1,
};

async function checkOrder(body) {
  return unwrap(
    await call(jsid("/trading/secure/v5/checkOrder"), { method: "POST", body }),
    `checkOrder ${body.buySell}`
  );
}

async function confirm(confirmationId, body) {
  return unwrap(
    await call(jsid(`/trading/secure/v5/order/${confirmationId}`), { method: "POST", body }),
    `order ${body.buySell}`
  );
}

async function cancelOrder(orderId) {
  return call(jsid(`/trading/secure/v5/order/${orderId}`), { method: "DELETE" });
}

async function refresh() {
  return unwrap(
    await call(jsid(`/trading/secure/v5/update/${session.intAccount}`) + "&cashFunds=0&orders=0&portfolio=0&totalPortfolio=0&transactions=0&historicalOrders=0"),
    "update"
  );
}

const today = (() => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
})();

async function transactions() {
  return unwrap(
    await call(
      `/reporting/secure/v4/transactions?fromDate=${encodeURIComponent(today)}&toDate=${encodeURIComponent(today)}&groupTransactionsByOrder=false&${tail()}`
    ),
    "transactions"
  );
}

const probeBuy = await checkOrder(buyBody);
const record = {
  on: new Date().toISOString().slice(0, 10),
  entity: "DEGIRO (flatexDEGIRO Bank Dutch Branch, NL)",
  isin: ISIN,
  ticker: TICKER,
  name: product.name,
  exchange: venue,
  productId,
  currency: product.currency,
  n: SIZE,
  order: { buy: "limit", sell: "market", lastUsd, buyPrice },
  cash: { start: cash.value, free: cash.free },
  check: { buy: probeBuy },
  live: LIVE,
};

if (!LIVE) {
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  console.log(
    JSON.stringify({ probe: true, cash: cash.value, lastUsd, buyPrice, productId, venue, check: probeBuy }, null, 2)
  );
  await browser.disconnect();
  process.exit(0);
}

const buyId = probeBuy?.data?.confirmationId || probeBuy?.confirmationId;
if (!buyId) {
  await browser.disconnect();
  throw new Error(`pas de confirmationId achat : ${JSON.stringify(probeBuy).slice(0, 400)}`);
}

const buyConfirm = await confirm(buyId, buyBody);
record.buy = { check: probeBuy, confirm: buyConfirm, limit: buyPrice };

let filled = null;
for (let i = 0; i < 40; i += 1) {
  await sleep(1500);
  const u = await refresh();
  cash = cashEur(u);
  filled = positionIn(u, productId);
  record.cash.afterBuy = cash.value;
  record.buy.position = filled || null;
  if (filled && Number(filled.size || filled.value) > 0) break;
}

if (!filled || !(Number(filled.size) > 0)) {
  record.note = "achat confirmé mais position absente ; pas de vente";
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
  await browser.disconnect();
  throw new Error("achat sans position visible");
}

const probeSell = await checkOrder(sellBody);
record.check.sell = probeSell;
const sellId = probeSell?.data?.confirmationId || probeSell?.confirmationId;
if (!sellId) {
  record.note = "position ouverte, checkOrder SELL sans confirmationId";
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
  await browser.disconnect();
  throw new Error("vente : pas de confirmationId");
}

const sellConfirm = await confirm(sellId, sellBody);
record.sell = { check: probeSell, confirm: sellConfirm };

for (let i = 0; i < 40; i += 1) {
  await sleep(1500);
  const u = await refresh();
  cash = cashEur(u);
  filled = positionIn(u, productId);
  record.cash.end = cash.value;
  record.positionsAfter = filled && Number(filled.size || filled.value) !== 0 ? filled : 0;
  if (!filled || Number(filled.size || filled.value) === 0) break;
}

try {
  record.transactions = await transactions();
} catch (err) {
  record.transactionsError = String(err.message);
}

fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
await browser.disconnect();
if (record.positionsAfter && record.positionsAfter !== 0) {
  throw new Error("position encore ouverte après la vente");
}
