// Measures what a crypto buy followed immediately by a sell actually costs on Swissquote.
// The published card is 1 % taker each way at Standard I. This run is the check against
// that figure, the same role the T212 and tastytrade crypto experiments play.
//
//   node swissquote/swissquote-crypto-experiment.mjs --probe --amount=50
//   node swissquote/swissquote-crypto-experiment.mjs --live --amount=50
//
// The account holds euros, so the EUR pair is the one that can be traded without a
// conversion. A bought leg that fails to sell aborts and says so.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const LIVE = process.argv.includes("--live");
const SYMBOL = arg("symbol", "BTC").toUpperCase();
const CURRENCY = arg("currency", "EUR").toUpperCase();
const AMOUNT = Number(arg("amount", "50"));
const PAUSE = Number(arg("pause", "2500"));
const OUT = arg(
  "out",
  new URL(LIVE ? "swissquote-crypto-experiment.json" : "swissquote-crypto-probe.json", import.meta.url)
);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => /trade\.swissquote\.ch/i.test(p.url()));
if (!page) throw new Error("aucun onglet Swissquote ouvert (trade.swissquote.ch).");

async function api(path, { method = "GET", body = null } = {}) {
  return page.evaluate(
    async (url, method, body) => {
      try {
        const response = await fetch(url, {
          method,
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body } : {}),
        });
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
    path,
    method,
    body ? JSON.stringify(body) : null
  );
}

const money = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(Number(v).toFixed(4)));

const search = await api("/eding_securities-search-plugin/api/search/allGrouped", {
  method: "POST",
  body: { count: 20, searchTerm: SYMBOL, suggestTab: "false" },
});
const flat = [];
for (const item of search.body?.securities || []) {
  flat.push(item);
  for (const child of item.children || []) flat.push(child);
}
const instrument = flat.find(
  (x) =>
    String(x.type).toUpperCase() === "CRYPTOCURRENCY" &&
    String(x.symbol).toUpperCase() === SYMBOL &&
    String(x.stockKey?.currency || "").toUpperCase() === CURRENCY
);
if (!instrument) throw new Error(`pas de ${SYMBOL}/${CURRENCY} crypto dans la recherche Swissquote`);
const stockKey = instrument.stockKey;
const key = `${stockKey.isin}_${stockKey.exchangeId}_${stockKey.currency}`;

const assets = await api("/eding_securities-retail-assets-plugin/api/assets/CHF/USD");
const cashRows = (assets.body?.assets || []).map((a) => ({
  currency: a.currency,
  cash: money(a.cashBalance),
  positions: money(a.positionsValue),
}));
const cash = cashRows.find((a) => a.currency === CURRENCY)?.cash ?? 0;
console.error(`caisse : ${cashRows.map((a) => `${a.cash} ${a.currency}`).join(", ")}`);

const mask = await api(
  `/eding_securities-retail-trademask-plugin/api/trademask/stock-key/${key}?orderSide=BUY`
);
const prices = mask.body?.prices || {};
const ask = Number(prices.askPrice);
const bid = Number(prices.bidPrice);
const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
const quoted = mid ? (ask - bid) / mid : null;
const quantity = Number((AMOUNT / ask).toFixed(8));
console.error(
  `${SYMBOL}/${CURRENCY} : ${bid}/${ask}` +
    (quoted != null ? ` (${(1e4 * quoted).toFixed(1)} bp cotés)` : "") +
    `, qté ${quantity}`
);

// The live ticket posts a LIMIT, not a MARKET: MARKET validates but the placement
// endpoint NPEs without a limit. IOC at the touch is the marketable equivalent and
// does not rest on the book if it misses.
const order = (side, qty, limit) => ({
  stockKey,
  transactionType: side,
  orderType: "LIMIT",
  limit,
  priceType: "UNIT",
  existingOpenQuantity: side === "SELL" ? qty : 0,
  accountCurrency: CURRENCY,
  isRealtimePriceAccess: false,
  quantityType: "UNIT",
  quantity: qty,
  expirationType: "GOOD_TILL_CANCEL",
  isPostOnly: false,
});

async function validate(side, qty, limit) {
  const res = await api("/eding_securities-retail-trademask-plugin/api/order-validation", {
    method: "POST",
    body: order(side, qty, limit),
  });
  const v = res.body || {};
  return {
    ok: Boolean(v.isSuccess),
    warnings: v.warnings || [],
    errors: v.errors || [],
    amounts: v.orderAmounts || null,
    raw: v,
    status: res.status,
  };
}

const buyLimit = Math.round(ask);
const sellLimitHint = Math.round(bid);
const buyQuote = await validate("BUY", quantity, buyLimit);
const sellQuote = await validate("SELL", quantity, sellLimitHint);
console.error(
  `validation achat : ${buyQuote.ok ? `${buyQuote.amounts?.totalEstimatedAmount} ${CURRENCY} (dont ${buyQuote.amounts?.commissions} comm.)` : JSON.stringify(buyQuote.errors || buyQuote)}`
);
console.error(
  `validation vente : ${sellQuote.ok ? `${sellQuote.amounts?.totalEstimatedAmount} ${CURRENCY}` : JSON.stringify(sellQuote.errors || sellQuote.warnings)}`
);

const log = {
  at: new Date().toISOString(),
  live: LIVE,
  symbol: SYMBOL,
  currency: CURRENCY,
  amount: AMOUNT,
  stockKey,
  cash,
  cashRows,
  quote: { bid, ask, mid, quoted, at: prices.askTimestamp || prices.bidTimestamp },
  quantity,
  quotedFees: { buy: buyQuote, sell: sellQuote },
};

if (!LIVE) {
  const history = (() => {
    try {
      const held = JSON.parse(fs.readFileSync(OUT, "utf8"));
      return Array.isArray(held?.runs) ? held.runs : [held];
    } catch {
      return [];
    }
  })();
  fs.writeFileSync(OUT, JSON.stringify({ runs: [...history, log] }, null, 2));
  console.error(`\nlecture seule. pour mesurer : node swissquote/swissquote-crypto-experiment.mjs --live --amount=${AMOUNT}`);
  await browser.disconnect();
  process.exit(0);
}

if (!buyQuote.ok) throw new Error(`validation achat refusée : ${JSON.stringify(buyQuote.errors)}`);
if (buyQuote.warnings?.some((w) => /NOT_ENOUGH_CASH/i.test(w.id || ""))) {
  throw new Error(`liquidités insuffisantes d'après Swissquote : ${JSON.stringify(buyQuote.warnings)}`);
}
if (cash < AMOUNT * 1.15) throw new Error(`caisse ${cash} ${CURRENCY} trop juste pour ${AMOUNT}`);

async function place(side, qty, limit) {
  const session = await api("/eding_securities-retail-trademask-plugin/api/session-keys", {
    method: "POST",
    body: {},
  });
  const res = await api("/eding_securities-retail-trademask-plugin/api/order-placement", {
    method: "POST",
    body: { order: order(side, qty, limit), sessionKey: session.body },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`ordre refusé (${res.status}) : ${res.text || JSON.stringify(res.body)}`);
  }
  if (res.body && res.body.isSuccess === false) {
    throw new Error(`ordre refusé : ${JSON.stringify(res.body.errors || res.body)}`);
  }
  return res.body;
}

function walkQty(node, acc = 0) {
  if (!node || typeof node !== "object") return acc;
  if (node.stockKey?.isin === stockKey.isin && node.quantity != null) {
    return acc + Number(node.quantity);
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) for (const i of v) acc = walkQty(i, acc);
    else if (v && typeof v === "object" && v !== node.stockKey) acc = walkQty(v, acc);
  }
  return acc;
}

async function heldQty() {
  const res = await api(
    "/eding_securities-retail-positions-plugin/api/positions/CHF/USD?groupingType=PRODUCT_TYPE"
  );
  return Number(walkQty(res.body).toFixed(8));
}

async function cashNow() {
  const res = await api("/eding_securities-retail-assets-plugin/api/assets/CHF/USD");
  return money((res.body?.assets || []).find((a) => a.currency === CURRENCY)?.cashBalance);
}

const buy = await place("BUY", quantity, buyLimit);
log.legs = { buy };
console.error(`achat envoyé : ${JSON.stringify(buy).slice(0, 240)}`);

let got = 0;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  got = await heldQty();
  if (got > 0) break;
}
console.error(`position : ${got} ${SYMBOL}`);
if (!got) {
  log.error = "achat non rempli";
  fs.writeFileSync(OUT, JSON.stringify({ runs: [log] }, null, 2));
  throw new Error("l'achat n'a pas ouvert de position en 20 s — vérifier le compte à la main.");
}

await sleep(PAUSE);
const between = await api(
  `/eding_securities-retail-trademask-plugin/api/trademask/stock-key/${key}?orderSide=SELL`
);
log.legs.quoteBetween = between.body?.prices || null;

let sell;
try {
  const sellLimit = Math.round(between.body?.prices?.bidPrice || bid);
  sell = await place("SELL", got, sellLimit);
} catch (error) {
  log.sellFailed = String(error);
  console.error(
    `\nATTENTION : ${got} ${SYMBOL} achetées et la vente a échoué (${error.message}). ` +
      `Position ouverte à solder à la main sur trade.swissquote.ch.`
  );
  fs.writeFileSync(OUT, JSON.stringify({ runs: [log] }, null, 2));
  await browser.disconnect();
  process.exit(1);
}
log.legs.sell = sell;
console.error(`vente envoyée : ${JSON.stringify(sell).slice(0, 240)}`);

let left = got;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  left = await heldQty();
  if (left === 0) break;
}
if (left !== 0) {
  console.error(
    `\nATTENTION : il reste ${left} ${SYMBOL}. Position ouverte à solder à la main sur trade.swissquote.ch.`
  );
  fs.writeFileSync(OUT, JSON.stringify({ runs: [log] }, null, 2));
  await browser.disconnect();
  process.exit(1);
}

const cashAfter = await cashNow();
const paid = cash != null && cashAfter != null ? money(cash - cashAfter) : null;
log.reconciliation = { cashBefore: cash, cashAfter, paid };
log.measured = {
  quantity: got,
  paid,
  measured: paid != null ? paid / AMOUNT : null,
  published: 0.02,
  quotedBook: quoted,
};

const history = (() => {
  try {
    const held = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(held?.runs) ? held.runs : held ? [held] : [];
  } catch {
    return [];
  }
})();
fs.writeFileSync(OUT, JSON.stringify({ runs: [...history, log] }, null, 2));
console.error(
  `\n${SYMBOL}/${CURRENCY}, ${AMOUNT} : payé ${paid} ${CURRENCY}, ` +
    `soit ${((log.measured.measured || 0) * 100).toFixed(2)} % (barème 2.00 %)`
);
await browser.disconnect();
