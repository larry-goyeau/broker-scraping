// One live equity round trip on the funded account, to see whether the published
// SEC / TAF / CAT lines actually leave. The paper ledger does not charge them.
//
//   node alpaca/alpaca-live-experiment.mjs            # quote + buying power, no order
//   node alpaca/alpaca-live-experiment.mjs --live     # 1 IAU, then sell
//   node alpaca/alpaca-live-experiment.mjs --live --crypto --amount=25
//
// A bought leg that fails to sell aborts and says so.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const LIVE = process.argv.includes("--live");
const CRYPTO = process.argv.includes("--crypto");
const SYMBOL = arg("symbol", CRYPTO ? "BTC/USD" : "IAU").toUpperCase();
const SHARES = Number(arg("shares", "1"));
const AMOUNT = Number(arg("amount", "25"));
const PAUSE = Number(arg("pause", "2000"));
const OUT = new URL(LIVE ? "alpaca-live-experiment.json" : "alpaca-live-probe.json", import.meta.url);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const page = (await browser.pages()).find((p) => /app\.alpaca\.markets/i.test(p.url()));
if (!page) throw new Error("aucun onglet app.alpaca.markets ouvert.");

const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
let token = null;
cdp.on("Network.requestWillBeSent", (e) => {
  const auth = e.request.headers.Authorization || e.request.headers.authorization;
  if (!token && auth?.startsWith("Bearer ")) token = auth.slice(7);
});
await page.reload({ waitUntil: "domcontentloaded" });
for (let i = 0; i < 24 && !token; i++) await sleep(500);
if (!token) throw new Error("aucun jeton capturé.");

async function api(path, { method = "GET", body = null, host = "https://app.alpaca.markets" } = {}) {
  const url = path.startsWith("http") ? path : `${host}${path}`;
  return page.evaluate(
    async (url, bearer, method, body) => {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${bearer}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body } : {}),
        });
        const text = await res.text();
        try {
          return { status: res.status, body: JSON.parse(text), text: null };
        } catch {
          return { status: res.status, body: null, text: text.slice(0, 400) };
        }
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    url,
    token,
    method,
    body ? JSON.stringify(body) : null
  );
}

const money = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(Number(v).toFixed(4)));

const me = await api("/api/v1/accounts?trading=true");
const list = Array.isArray(me.body) ? me.body : me.body?.accounts || [];
const acct = list[0];
const id = acct?.id || acct?.account_id;
if (!id) throw new Error("aucun compte live.");

const margin = (await api(`/api/v1/accounts/${id}/trade_account/margin`)).body || {};
const clock = (await api("/internal/clock")).body || {};
console.error(
  `compte ${margin.account_number} : ${margin.cash} $ cash, BP ${margin.buying_power}, ` +
    `non-marg. ${margin.non_marginable_buying_power}, pending TAF ${margin.pending_reg_taf_fees}`
);
console.error(`marché ${clock.is_open ? "ouvert" : "fermé"}, clôture ${clock.next_close || "?"}`);

const quoteStock = async (symbol) => {
  const res = await api(`https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbol)}`);
  const q = res.body?.quotes?.[symbol];
  if (!q) return { symbol, error: `cotation indisponible (${res.status})`, raw: res.body || res.text };
  return {
    symbol,
    at: q.t,
    bid: q.bp,
    ask: q.ap,
    mid: q.bp > 0 && q.ap > 0 ? (q.bp + q.ap) / 2 : null,
    spread: q.bp > 0 && q.ap > 0 ? Number((q.ap - q.bp).toFixed(4)) : null,
    feed: "iex",
  };
};

const quoteCrypto = async (symbol) => {
  const res = await api(`https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(symbol)}`);
  const q = res.body?.quotes?.[symbol] || res.body?.quotes?.[symbol.replace("/", "")];
  if (!q) return { symbol, error: `cotation crypto indisponible (${res.status})`, raw: JSON.stringify(res.body || res.text).slice(0, 300) };
  return {
    symbol,
    at: q.t,
    bid: q.bp,
    ask: q.ap,
    mid: q.bp > 0 && q.ap > 0 ? (q.bp + q.ap) / 2 : null,
    spread: q.bp > 0 && q.ap > 0 ? Number((q.ap - q.bp).toFixed(4)) : null,
    feed: "crypto",
  };
};

const quote = CRYPTO ? await quoteCrypto(SYMBOL) : await quoteStock(SYMBOL);
console.error(`quote ${SYMBOL} : ${quote.bid}/${quote.ask}` + (quote.error ? ` (${quote.error})` : ""));

const { roundTripCost } = await import("./alpaca_cost.mjs");
const model = roundTripCost({
  etf: SYMBOL,
  place: CRYPTO ? "CRYPTO" : undefined,
  currency: "USD",
});

const orderPaths = [
  `/api/v1/accounts/${id}/orders`,
  `/api/v1/trading/accounts/${id}/orders`,
];

const placeBody = CRYPTO
  ? {
      symbol: SYMBOL,
      notional: String(AMOUNT),
      side: "buy",
      type: "market",
      time_in_force: "gtc",
    }
  : {
      symbol: SYMBOL,
      qty: String(SHARES),
      side: "buy",
      type: "market",
      time_in_force: "day",
    };

if (!LIVE) {
  for (const p of orderPaths) {
    const r = await api(p, { method: "POST", body: { ...placeBody, type: "limit", limit_price: "0.01" } });
    console.error(`probe POST ${p} -> ${r.status} ${(r.text || JSON.stringify(r.body) || "").slice(0, 180)}`);
  }
  const out = {
    at: new Date().toISOString(),
    live: false,
    account: margin.account_number,
    cash: money(margin.cash),
    buyingPower: money(margin.buying_power),
    nonMarginable: money(margin.non_marginable_buying_power),
    pendingRegTaf: money(margin.pending_reg_taf_fees),
    marketOpen: clock.is_open,
    quote,
    model: model.a == null ? { why: model.why } : { a: model.a, b: model.b, c: model.c, type: model.listing?.type },
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error("sonde écrite, aucun ordre envoyé");
  await cdp.detach();
  await browser.disconnect();
  process.exit(0);
}

if (!CRYPTO && !clock.is_open) throw new Error("marché actions fermé.");
if (quote.mid == null) throw new Error(quote.error || "pas de touche");

const needed = CRYPTO ? AMOUNT : (quote.ask || quote.mid) * SHARES;
if (Number(margin.buying_power) < needed) {
  throw new Error(`buying power ${margin.buying_power} $ < ${needed.toFixed(2)} $ nécessaires`);
}

let placePath = `/api/v1/trading/accounts/${id}/orders`;
const tryPlace = async (body) => {
  for (const p of orderPaths) {
    const r = await api(p, { method: "POST", body });
    if (r.status === 200 || r.status === 201) {
      placePath = p;
      return r.body;
    }
    if (r.status !== 404) {
      throw new Error(`ordre refusé (${r.status} ${p}) : ${r.text || JSON.stringify(r.body)}`);
    }
  }
  throw new Error("aucun endpoint d'ordre n'a répondu");
};

const settle = async (orderId) => {
  for (let i = 0; i < 50; i++) {
    const res = await api(`${placePath}/${orderId}`);
    const o = res.body || {};
    if (["filled", "canceled", "expired", "rejected"].includes(o.status)) {
      return {
        status: o.status,
        shares: Number(o.filled_qty || 0),
        price: o.filled_avg_price != null ? Number(o.filled_avg_price) : null,
        notional: o.filled_avg_price != null ? Number(o.filled_qty || 0) * Number(o.filled_avg_price) : null,
        filledAt: o.filled_at,
        raw: { id: o.id, status: o.status, asset_class: o.asset_class },
      };
    }
    await sleep(400);
  }
  return { status: "inconnu après 20 s", id: orderId };
};

const buy = await settle((await tryPlace(placeBody)).id);
console.error(`achat ${buy.status} ${buy.shares} @ ${buy.price}`);
if (buy.status !== "filled" || !buy.shares) {
  throw new Error(`achat non rempli : ${JSON.stringify(buy)}`);
}

await sleep(PAUSE);

const sellBody = CRYPTO
  ? {
      symbol: SYMBOL,
      qty: String(buy.shares),
      side: "sell",
      type: "market",
      time_in_force: "gtc",
    }
  : {
      symbol: SYMBOL,
      qty: String(buy.shares),
      side: "sell",
      type: "market",
      time_in_force: "day",
    };

const sell = await settle((await tryPlace(sellBody)).id);
console.error(`vente ${sell.status} ${sell.shares} @ ${sell.price}`);
if (sell.status !== "filled") {
  console.error("VENTE ÉCHOUÉE — position encore ouverte");
}

await sleep(1500);
const after = (await api(`/api/v1/accounts/${id}/trade_account/margin`)).body || {};
const activities = (await api(`/api/v1/accounts/${id}/activities?page_size=15`)).body;
const positions = (await api(`/api/v1/accounts/${id}/positions`)).body;

const fromFills =
  buy.price && sell.price ? money(buy.shares * sell.price - buy.shares * buy.price) : null;
const cashDelta = money(Number(after.cash) - Number(margin.cash));

const run = {
  at: new Date().toISOString(),
  live: true,
  account: margin.account_number,
  symbol: SYMBOL,
  crypto: CRYPTO,
  opening: {
    cash: money(margin.cash),
    buyingPower: money(margin.buying_power),
    pendingRegTaf: money(margin.pending_reg_taf_fees),
  },
  quote,
  model: { a: model.a, b: model.b, c: model.c, type: model.listing?.type },
  buy,
  sell,
  closing: {
    cash: money(after.cash),
    pendingRegTaf: money(after.pending_reg_taf_fees),
    positions,
  },
  cashDelta,
  fromFills,
  feesVsFills: fromFills != null && cashDelta != null ? money(cashDelta - fromFills) : null,
  activities,
};

fs.writeFileSync(OUT, JSON.stringify(run, null, 2));
console.error(
  `caisse ${margin.cash} → ${after.cash} (Δ ${cashDelta}), fills ${fromFills}, ` +
    `pending TAF ${after.pending_reg_taf_fees}, positions ${Array.isArray(positions) ? positions.length : "?"}`
);

await cdp.detach();
await browser.disconnect();
if (sell.status !== "filled") process.exit(2);
