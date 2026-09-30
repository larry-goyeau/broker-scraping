// Measures what a crypto buy followed immediately by a sell actually costs on tastytrade.
// Zero Hash marks the fill 50 bp each way on BTC; this run is the check against that barème,
// the same role `t212-crypto-experiment.mjs` plays for Trading212. A probe quotes and dry-runs
// at no cost. `--live` trades a small notional and sells the exact quantity received.
//
//   node tastytrade/tastytrade-crypto-experiment.mjs --probe --amount=50
//   node tastytrade/tastytrade-crypto-experiment.mjs --live --amount=50
//
// The measurement is cash in minus cash out over the notional, not a mid-based effective
// spread. Crypto here is a dealer product: the markup is inside the fill, and there is no
// public book to hold a mid against. A bought leg that fails to sell aborts and says so.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const LIVE = process.argv.includes("--live");
const SYMBOL = arg("symbol", "BTC/USD").toUpperCase();
const AMOUNT = Number(arg("amount", "50"));
const PAUSE = Number(arg("pause", "2500"));
const OUT = arg(
  "out",
  new URL(
    LIVE ? "tastytrade-crypto-experiment.json" : "tastytrade-crypto-probe.json",
    import.meta.url
  )
);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => /tastytrade|tastyworks/i.test(p.url()));
if (!page) throw new Error("aucun onglet tastytrade ouvert.");

// Session used to live in `tw-session-id`. The platform now signs with a cookie
// (`tw-auth-mode` = cookie), so the call has to be made from the page with credentials
// rather than with a bearer the storage no longer holds.
const token = await page.evaluate(() => sessionStorage.getItem("tw-session-id") || "");

async function api(path, { method = "GET", body = null } = {}) {
  return page.evaluate(
    async (url, authorization, method, body) => {
      try {
        const headers = {
          Accept: "application/json",
          "X-Tastyworks-CSRF": "1",
          ...(body ? { "Content-Type": "application/json" } : {}),
        };
        if (authorization) headers.Authorization = authorization;
        const response = await fetch(url, {
          method,
          credentials: "include",
          headers,
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
    `https://api.tastytrade.com${path}`,
    token,
    method,
    body ? JSON.stringify(body) : null
  );
}

const money = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(Number(v).toFixed(4)));

const accounts = await api("/customers/me/accounts");
if (accounts.status !== 200) {
  throw new Error(`tastytrade répond ${accounts.status} sur les comptes : ${accounts.text || ""}`);
}
const items = (accounts.body?.data?.items || []).map((i) => i.account);
const live = items.filter((a) => !a["is-test-drive"] && !a.closed);
if (!live.length) throw new Error("aucun compte réel dans la réponse.");

const funded = [];
for (const a of live) {
  const res = await api(`/accounts/${a["account-number"]}/balances`);
  funded.push({
    number: a["account-number"],
    kind: a["margin-or-cash"],
    cash: money(res.body?.data?.["cash-balance"]),
    buyingPower: money(
      res.body?.data?.["cryptocurrency-buying-power"] ??
        res.body?.data?.["equity-buying-power"] ??
        res.body?.data?.["cash-available-to-withdraw"]
    ),
  });
}
for (const a of funded) {
  console.error(`  compte ${a.number} (${a.kind}) : ${a.cash} $, crypto ${a.buyingPower} $`);
}
const chosen =
  funded.find((a) => a.number === arg("account", "")) ||
  funded.slice().sort((x, y) => (y.buyingPower || 0) - (x.buyingPower || 0))[0];
const account = chosen.number;
const cash = chosen.cash;
console.error(`retenu : ${account}`);

function notional(action, amount) {
  const debit = /buy/i.test(action);
  return {
    "time-in-force": "IOC",
    "order-type": "Notional Market",
    value: Math.abs(amount),
    "value-effect": debit ? "Debit" : "Credit",
    legs: [
      {
        "instrument-type": "Cryptocurrency",
        symbol: SYMBOL,
        action,
      },
    ],
  };
}

function quantityOrder(action, quantity) {
  return {
    "time-in-force": "IOC",
    "order-type": "Market",
    legs: [
      {
        "instrument-type": "Cryptocurrency",
        symbol: SYMBOL,
        quantity,
        action,
      },
    ],
  };
}

async function quote() {
  const res = await api(`/market-data/by-type?cryptocurrency=${encodeURIComponent(SYMBOL)}`);
  const item = res.body?.data?.items?.[0];
  if (!item) {
    return { symbol: SYMBOL, error: `cotation indisponible (${res.status})`, raw: res.body || res.text };
  }
  const bid = Number(item.bid);
  const ask = Number(item.ask);
  return {
    symbol: SYMBOL,
    at: new Date().toISOString(),
    bid,
    ask,
    last: Number(item.last),
    mid: bid > 0 && ask > 0 ? (bid + ask) / 2 : null,
    spread: bid > 0 && ask > 0 ? ask - bid : null,
    quoted: bid > 0 && ask > 0 ? (ask - bid) / ((ask + bid) / 2) : null,
  };
}

function feeOf(res) {
  if (res.status !== 201 && res.status !== 200) {
    return { error: `dry-run ${res.status} ${res.text || JSON.stringify(res.body?.error || res.body || {})}` };
  }
  const fee = res.body?.data?.["fee-calculation"] || {};
  return {
    total: money(fee["total-fees"]),
    breakdown: Object.fromEntries(
      Object.entries(fee)
        .filter(([k, v]) => k !== "total-fees" && k !== "total-fees-effect" && Number(v) > 0)
        .map(([k, v]) => [k, money(v)])
    ),
    buyingPowerEffect: money(res.body?.data?.["buying-power-effect"]?.["change-in-buying-power"]),
    raw: res.body?.data,
  };
}

async function dryRun(body) {
  return feeOf(await api(`/accounts/${account}/orders/dry-run`, { method: "POST", body }));
}

async function place(body) {
  const res = await api(`/accounts/${account}/orders`, { method: "POST", body });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`ordre refusé (${res.status}) : ${res.text || JSON.stringify(res.body?.error || res.body || {})}`);
  }
  return res.body?.data?.order ?? res.body?.data;
}

async function settle(id) {
  for (let i = 0; i < 60; i++) {
    const res = await api(`/accounts/${account}/orders/${id}`);
    const order = res.body?.data;
    const status = order?.status;
    if (status === "Filled" || status === "Rejected" || status === "Cancelled" || status === "Expired") {
      const fills = (order?.legs || []).flatMap((l) => l.fills || []);
      const qty = fills.reduce((s, f) => s + Number(f.quantity), 0);
      const value = fills.reduce((s, f) => s + Number(f.quantity) * Number(f["fill-price"]), 0);
      return {
        status,
        fills: fills.length,
        quantity: qty,
        price: qty ? value / qty : null,
        value,
        order,
      };
    }
    await sleep(500);
  }
  return { status: "inconnu après 30 s" };
}

async function cryptoHeld() {
  const res = await api(`/accounts/${account}/positions`);
  const rows = res.body?.data?.items || [];
  const hit = rows.find(
    (p) => p.symbol === SYMBOL && /crypto/i.test(p["instrument-type"] || "")
  );
  return hit ? Number(hit.quantity) : 0;
}

const beforeQuote = await quote();
const buyQuote = await dryRun(notional("Buy to Open", -AMOUNT));
const sellQuote = await dryRun(notional("Sell to Close", AMOUNT));
const heldBefore = await cryptoHeld();

console.error(
  `${SYMBOL} : ${
    beforeQuote.mid != null
      ? `${beforeQuote.bid}/${beforeQuote.ask} (${(1e4 * beforeQuote.quoted).toFixed(1)} bp cotés)`
      : beforeQuote.error
  }`
);
console.error(`dry-run achat ${AMOUNT} $ : ${buyQuote.total ?? buyQuote.error}`);
console.error(`dry-run vente ${AMOUNT} $ : ${sellQuote.total ?? sellQuote.error}`);
console.error(`position déjà ouverte : ${heldBefore}`);

const log = {
  at: new Date().toISOString(),
  account,
  live: LIVE,
  symbol: SYMBOL,
  amount: AMOUNT,
  cash,
  buyingPower: chosen.buyingPower,
  heldBefore,
  quote: beforeQuote,
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
  const shown = OUT instanceof URL ? OUT.pathname.split("/").slice(-2).join("/") : String(OUT);
  console.error(`\nlecture seule. écrit dans ${shown}`);
  console.error(`pour mesurer réellement : node tastytrade/tastytrade-crypto-experiment.mjs --live --amount=${AMOUNT}`);
  await browser.disconnect();
  process.exit(0);
}

if (heldBefore) {
  throw new Error(`position déjà ouverte (${heldBefore} ${SYMBOL}) : refuse de commencer.`);
}
if (buyQuote.error) throw new Error(`dry-run achat refusé : ${buyQuote.error}`);
// The dry-run on a $50 ticket reserved $51 (notional + a $1 brokerage line). Cash on this
// account is barely above that, so the floor is the quoted impact, not 110 % of the notional.
const reserved = Math.abs(buyQuote.buyingPowerEffect ?? AMOUNT + 1);
if (cash != null && cash < reserved) {
  throw new Error(`liquidités insuffisantes : ${cash} $ pour un impact annoncé de ${reserved} $.`);
}

const buy = await settle((await place(notional("Buy to Open", -AMOUNT))).id);
log.legs = { buy };
console.error(`achat : ${buy.status}, ${buy.quantity} @ ${buy.price}, ${money(buy.value)} $`);
if (buy.status !== "Filled" || !buy.quantity) {
  log.error = "achat non rempli";
  fs.writeFileSync(OUT, JSON.stringify({ runs: [log] }, null, 2));
  throw new Error(`achat ${buy.status} — rien à vendre, arrêt.`);
}

await sleep(PAUSE);
const between = await quote();
log.legs.quoteBetween = between;

let sell;
try {
  sell = await settle((await place(quantityOrder("Sell to Close", buy.quantity))).id);
} catch (error) {
  log.sellFailed = String(error);
  console.error(
    `\nATTENTION : ${buy.quantity} ${SYMBOL} achetées et la vente a échoué (${error.message}). ` +
      `Position ouverte à solder à la main sur my.tastytrade.com.`
  );
  fs.writeFileSync(OUT, JSON.stringify({ runs: [log] }, null, 2));
  await browser.disconnect();
  process.exit(1);
}
log.legs.sell = sell;
console.error(`vente : ${sell.status}, ${sell.quantity} @ ${sell.price}, ${money(sell.value)} $`);

if (sell.status !== "Filled") {
  console.error(
    `\nATTENTION : ${buy.quantity} ${SYMBOL} achetées et la vente est ${sell.status}. ` +
      `Position ouverte à solder à la main sur my.tastytrade.com.`
  );
  fs.writeFileSync(OUT, JSON.stringify({ runs: [log] }, null, 2));
  await browser.disconnect();
  process.exit(1);
}

const after = await api(`/accounts/${account}/balances`);
const cashAfter = money(after.body?.data?.["cash-balance"]);
const paid = cash != null && cashAfter != null ? money(cash - cashAfter) : null;
const notionalFill = buy.value;
log.reconciliation = {
  cashBefore: cash,
  cashAfter,
  observed: money(cashAfter - cash),
  paid,
};
if (buy.price && sell.price && notionalFill) {
  log.measured = {
    buyPrice: buy.price,
    sellPrice: sell.price,
    quantity: buy.quantity,
    paid,
    measured: paid != null && notionalFill ? paid / notionalFill : null,
    quoted: between.quoted ?? beforeQuote.quoted,
    published: 0.01,
  };
}

const history = (() => {
  try {
    const held = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(held?.runs) ? held.runs : held ? [held] : [];
  } catch {
    return [];
  }
})();
fs.writeFileSync(OUT, JSON.stringify({ runs: [...history, log] }, null, 2));

const shown = OUT instanceof URL ? OUT.pathname.split("/").slice(-2).join("/") : String(OUT);
if (log.measured) {
  console.error(
    `\n${SYMBOL}, ${AMOUNT} $ : payé ${log.measured.paid} $, ` +
      `soit ${((log.measured.measured || 0) * 100).toFixed(2)} % ` +
      `(barème 1.00 %, coté ${((log.measured.quoted || 0) * 100).toFixed(2)} %)`
  );
}
console.error(`écrit dans ${shown}`);
await browser.disconnect();
