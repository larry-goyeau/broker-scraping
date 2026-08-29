// Runs round trips on Alpaca's paper account, to see what can be checked against
// `alpaca_cost.mjs` without money at stake — and, as it turned out, to establish what cannot.
//
// Two limits were found before the first order was sent, and both bound the result:
//
//   - the paper ledger has no regulatory fee lines at all. Asking its activities for `REG` or
//     `TAF` is answered `invalid activity type`, where the live API accepts both. So the fee
//     side of the model, which is the whole of `a` and most of `b` on a tight fund, is not
//     simulated and cannot be validated here.
//
//   - the only quote this subscription may read is IEX's own book: `feed=sip` returns 403,
//     "subscription does not permit querying recent SIP data". IEX is one venue out of a dozen
//     and its book is far wider than the national one — it showed ACWI 161.21/161.31, ten
//     cents, on an afternoon when the consolidated quote was a cent. An effective spread
//     measured against that mid would be measuring IEX, not the market.
//
// What remains is worth having anyway: that the plumbing works end to end, that the platform
// charges no commission of its own on the leg it simulates, and what its matching engine does
// with a market order — which is a fact about Alpaca's simulator that anyone testing a strategy
// on it should know.
//
//   node alpaca/alpaca-experiment.mjs                       # rien n'est envoyé
//   node alpaca/alpaca-experiment.mjs --live --plan=IAU:10,ACWI:10,AQLT:10

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const LIVE = process.argv.includes("--live");
const OUT = arg("out", new URL(LIVE ? "alpaca-experiment.json" : "alpaca-probe.json", import.meta.url));
const PLAN = arg("plan", "IAU:10")
  .split(",")
  .map((part) => {
    const [symbol, shares] = part.split(":");
    return { symbol: symbol.trim().toUpperCase(), shares: Number(shares || 1) };
  })
  .filter((t) => t.symbol && t.shares > 0);
const PAUSE = Number(arg("pause", "2500"));

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const page = (await browser.pages()).find((p) => /app\.alpaca\.markets/i.test(p.url()));
if (!page) throw new Error("aucun onglet app.alpaca.markets ouvert.");

// The dashboard signs its calls with a token it holds in memory rather than in storage, so it
// is taken off a request it makes. Reloading is what guarantees one comes past.
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
let token = null;
cdp.on("Network.requestWillBeSent", (e) => {
  const auth = e.request.headers.Authorization || e.request.headers.authorization;
  if (!token && auth?.startsWith("Bearer ")) token = auth.slice(7);
});
await page.reload({ waitUntil: "networkidle2" });
for (let i = 0; i < 24 && !token; i++) await sleep(500);
if (!token) throw new Error("aucun jeton capturé : recharger le tableau de bord et réessayer.");

async function api(path, { method = "GET", body = null } = {}) {
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
          return { status: res.status, body: JSON.parse(text) };
        } catch {
          return { status: res.status, text: text.slice(0, 300) };
        }
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    path.startsWith("http") ? path : `https://app.alpaca.markets${path}`,
    token,
    method,
    body ? JSON.stringify(body) : null
  );
}

const money = (v) => (v == null ? null : Number(Number(v).toFixed(4)));

// ------------------------------------------------------------------------- le compte papier

const papers = await api("/api/v1/paper_accounts");
const id = (Array.isArray(papers.body) ? papers.body : [])[0]?.paper_account_id;
if (!id) throw new Error(`aucun compte papier (${papers.status}).`);
const base = `/api/v1/paper_accounts/${id}`;

const stateOf = async () => {
  const res = await api(`${base}/trade_account/margin`);
  const d = res.body || {};
  return {
    number: d.account_number,
    cash: money(d.cash),
    equity: money(d.equity),
    buyingPower: money(d.buying_power),
    // Present on the live account, and the reason the fee side cannot be read here: it stays
    // at zero because the paper ledger never accrues one.
    pendingRegTaf: money(d.pending_reg_taf_fees),
  };
};
const opening = await stateOf();
console.error(
  `compte papier ${opening.number} : ${opening.cash} $ de liquidités, ` +
    `${opening.equity} $ d'équité, frais réglementaires en attente ${opening.pendingRegTaf}`
);

// The clock decides whether a market order fills or queues, and a queued one would sit in the
// account overnight rather than measure anything.
const clock = await api("/internal/clock");
const open = clock.body?.is_open;
console.error(
  `marché ${open ? "ouvert" : "fermé"}` +
    (clock.body?.next_close ? `, prochaine clôture ${String(clock.body.next_close).slice(11)}` : "")
);

// ----------------------------------------------------------------------------- les cotations

// IEX alone, by subscription. Recorded with the venue codes it comes with, so that a reader
// can see it is one book and not the consolidated one: `ax` and `bx` both say V.
async function quote(symbol) {
  const res = await api(
    `https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbol)}`
  );
  const q = res.body?.quotes?.[symbol];
  if (!q) return { symbol, error: `cotation indisponible (${res.status})` };
  return {
    symbol,
    at: q.t,
    bid: q.bp,
    ask: q.ap,
    bidSize: q.bs,
    askSize: q.as,
    bidVenue: q.bx,
    askVenue: q.ax,
    feed: "iex",
    mid: q.bp > 0 && q.ap > 0 ? (q.bp + q.ap) / 2 : null,
    spread: q.bp > 0 && q.ap > 0 ? Number((q.ap - q.bp).toFixed(4)) : null,
  };
}

// ------------------------------------------------------------------------------- les ordres

const place = async (symbol, shares, side) => {
  const res = await api(`${base}/orders`, {
    method: "POST",
    body: { symbol, qty: String(shares), side, type: "market", time_in_force: "day" },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`ordre refusé (${res.status}) : ${res.text || JSON.stringify(res.body)}`);
  }
  return res.body;
};

const settle = async (orderId) => {
  for (let i = 0; i < 40; i++) {
    const res = await api(`${base}/orders/${orderId}`);
    const o = res.body || {};
    if (["filled", "canceled", "expired", "rejected"].includes(o.status)) {
      return {
        status: o.status,
        shares: Number(o.filled_qty || 0),
        price: o.filled_avg_price != null ? Number(o.filled_avg_price) : null,
        filledAt: o.filled_at,
      };
    }
    await sleep(500);
  }
  return { status: "inconnu après 20 s" };
};

// ----------------------------------------------------------------------------- le programme

const { roundTripCost } = await import("./alpaca_cost.mjs");

const trips = [];
for (const { symbol, shares } of PLAN) {
  const before = await quote(symbol);
  const model = roundTripCost({ etf: symbol, currency: "USD" });
  const trip = {
    symbol,
    shares,
    quote: before,
    model: model.a == null ? { why: model.why } : { a: model.a, b: model.b, c: model.c, perShare: model.perShare },
    predicted:
      model.a == null || before.mid == null
        ? null
        : money(model.a * before.mid * shares + model.b * shares + model.c),
  };

  if (LIVE) {
    if (!open) {
      trip.error = "marché fermé, aller-retour non tenté";
    } else if (before.mid == null) {
      trip.error = "pas de touche cotée";
    } else {
      const buy = await settle((await place(symbol, shares, "buy")).id);
      await sleep(PAUSE);
      const between = await quote(symbol);
      const sell = await settle((await place(symbol, shares, "sell")).id);
      trip.legs = { buy, sell, quoteBetween: between };
      if (buy.price && sell.price && between.mid) {
        const perShare = buy.price - before.mid + (between.mid - sell.price);
        trip.measured = {
          buySlippage: money(buy.price - before.mid),
          sellSlippage: money(between.mid - sell.price),
          // Named for what it is: a slippage against an IEX mid, not the effective spread the
          // Rule 605 reports define, which is measured against the consolidated quote.
          perShareAgainstIexMid: money(perShare),
          cost: money(perShare * shares),
        };
      }
    }
  }

  trips.push(trip);
  console.error(
    `${symbol} x${shares} : IEX ${before.bid}/${before.ask} (${before.spread} $), ` +
      `prédit ${trip.predicted} $` +
      (trip.measured
        ? `, exécuté ${trip.legs.buy.price} puis ${trip.legs.sell.price}, ` +
          `glissement ${(trip.measured.perShareAgainstIexMid * 100).toFixed(2)} c/part`
        : trip.error
          ? `, ${trip.error}`
          : "")
  );
}

// What the account really lost, against what the fills alone say it should have. On paper the
// two must agree exactly: any difference would be a fee, and the point here is that there is
// none to find.
let reconciliation = null;
if (LIVE && trips.some((t) => t.legs)) {
  await sleep(1500);
  const closing = await stateOf();
  const fromFills = trips.reduce(
    (sum, t) =>
      t.legs?.buy?.price && t.legs?.sell?.price
        ? sum + t.shares * (t.legs.sell.price - t.legs.buy.price)
        : sum,
    0
  );
  reconciliation = {
    cashBefore: opening.cash,
    cashAfter: closing.cash,
    observed: money(closing.cash - opening.cash),
    expectedFromFills: money(fromFills),
    feesCharged: money(closing.cash - opening.cash - fromFills),
    pendingRegTafAfter: closing.pendingRegTaf,
  };
  console.error(
    `\ncaisse ${opening.cash} -> ${closing.cash} $ (${reconciliation.observed}), ` +
      `attendu d'après les exécutions ${reconciliation.expectedFromFills}, ` +
      `donc frais prélevés ${reconciliation.feesCharged} $`
  );
}

const run = { at: new Date().toISOString(), account: opening.number, live: LIVE, marketOpen: open, opening, trips, reconciliation };
const history = (() => {
  try {
    const held = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(held?.runs) ? held.runs : [];
  } catch {
    return [];
  }
})();
fs.writeFileSync(OUT, JSON.stringify({ runs: [...history, run] }, null, 2));
const shown = (p) => (p instanceof URL ? p.pathname.split("/").slice(-2).join("/") : String(p));
console.error(`\n${trips.length} ligne(s) ajoutée(s) à ${shown(OUT)} (${history.length + 1} passe(s))`);

await cdp.detach();
await browser.disconnect();
