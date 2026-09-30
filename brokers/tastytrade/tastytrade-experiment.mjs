// Measures what a buy followed immediately by a sell actually costs on tastytrade, to check
// the coefficients `tastytrade_cost.mjs` publishes against money that really moved.
//
// Two things are being tested, and they are of different kinds. The fee side is arithmetic
// on published rates, and the broker will quote it before anything is traded: `--probe` asks
// for that quote and compares it with the model, at no cost. The market side is the effective
// spread, and only a real order can say what it was, so `--live` trades.
//
//   node tastytrade/tastytrade-experiment.mjs --probe                      # nothing traded
//   node tastytrade/tastytrade-experiment.mjs --live --plan=IAU:1,AQLT:1
//
// The measurement is the Rule 605 one, so that it can be held against the reports the cost
// script reads: the mid is noted just before each leg, and the effective spread per share is
// (buy - mid) + (mid - sell). Taking it against the mid rather than against the other leg is
// what keeps a market that drifted during the two seconds from being charged to the spread.
//
// Sizes stay small on purpose. The published figure averages orders of 100 to 499 shares, and
// a one-share order is not in that sample, so a match on size is worth having — but it is not
// worth thousands of dollars of exposure to a gap, and the spread per share is the same
// quantity whatever the size on a book that quotes in cents.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const LIVE = process.argv.includes("--live");
// A probe and a live run do not write to the same place: a probe can be repeated at will, and
// the file it would land in holds trips that cost money and cannot be repeated at all.
const OUT = arg(
  "out",
  new URL(
    LIVE ? "tastytrade-experiment.json" : "tastytrade-probe.json",
    import.meta.url
  )
);
const PLAN = arg("plan", "IAU:1")
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
const pages = await browser.pages();
const page = pages.find((p) => /tastytrade|tastyworks/i.test(p.url()));
if (!page) throw new Error("aucun onglet tastytrade ouvert.");

const token = await page.evaluate(() => sessionStorage.getItem("tw-session-id") || "");
if (!token) throw new Error("aucune session tastytrade : se reconnecter sur my.tastytrade.com.");

// Every call is made from inside the page, which is what gives it the origin api.tastytrade.com
// expects, and the session token the platform itself signs with.
async function api(path, { method = "GET", body = null } = {}) {
  const answer = await page.evaluate(
    async (url, authorization, method, body) => {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: authorization,
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
    `https://api.tastytrade.com${path}`,
    token,
    method,
    body ? JSON.stringify(body) : null
  );
  return answer;
}

const money = (v) => (v == null ? null : Number(Number(v).toFixed(4)));

// ------------------------------------------------------------------------------- le compte

const accounts = await api("/customers/me/accounts");
if (accounts.status !== 200) {
  throw new Error(`tastytrade répond ${accounts.status} sur les comptes : ${accounts.text || ""}`);
}
const items = (accounts.body?.data?.items || []).map((i) => i.account);
const live = items.filter((a) => !a["is-test-drive"] && !a.closed);
if (!live.length) throw new Error("aucun compte réel dans la réponse.");

// More than one account is normal, and the first one is not necessarily the funded one, so
// each is asked for its balance and the one that can actually trade is used. `--account=`
// overrides where the choice should not be made by the money in it.
const funded = [];
for (const a of live) {
  const res = await api(`/accounts/${a["account-number"]}/balances`);
  funded.push({
    number: a["account-number"],
    kind: a["margin-or-cash"],
    cash: money(res.body?.data?.["cash-balance"]),
    buyingPower: money(res.body?.data?.["equity-buying-power"] ?? res.body?.data?.["cash-available-to-withdraw"]),
  });
}
for (const a of funded) {
  console.error(`  compte ${a.number} (${a.kind}) : ${a.cash} $, pouvoir d'achat ${a.buyingPower} $`);
}
const chosen =
  funded.find((a) => a.number === arg("account", "")) ||
  funded.slice().sort((x, y) => (y.buyingPower || 0) - (x.buyingPower || 0))[0];
const account = chosen.number;
const cash = chosen.cash;
const buyingPower = chosen.buyingPower;
console.error(`retenu : ${account}, pouvoir d'achat ${buyingPower} $`);

// --------------------------------------------------------------------------- les cotations

// The touch, read the way the platform's own ticker reads it. Needed twice per trip and
// wanted fresh, so it is asked for one symbol at a time rather than cached.
async function quote(symbol) {
  const res = await api(`/market-data/by-type?equity=${encodeURIComponent(symbol)}`);
  const item = res.body?.data?.items?.[0];
  if (!item) return { symbol, error: `cotation indisponible (${res.status})` };
  const bid = Number(item.bid);
  const ask = Number(item.ask);
  return {
    symbol,
    at: new Date().toISOString(),
    bid,
    ask,
    last: Number(item.last),
    mid: bid > 0 && ask > 0 ? (bid + ask) / 2 : null,
    spread: bid > 0 && ask > 0 ? ask - bid : null,
  };
}

// ------------------------------------------------------------------------------ les ordres

const leg = (symbol, shares, action) => ({
  "instrument-type": "Equity",
  symbol,
  quantity: shares,
  action,
});
const marketOrder = (symbol, shares, action) => ({
  "time-in-force": "Day",
  "order-type": "Market",
  legs: [leg(symbol, shares, action)],
});

// What the broker itself says an order would cost, before it exists. This is the fee side
// answered by the party that charges it, which beats any reading of a schedule.
async function dryRun(symbol, shares, action) {
  const res = await api(`/accounts/${account}/orders/dry-run`, {
    method: "POST",
    body: marketOrder(symbol, shares, action),
  });
  if (res.status !== 201 && res.status !== 200) {
    return { error: `dry-run ${res.status} ${res.text || JSON.stringify(res.body?.error || {})}` };
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
  };
}

async function place(symbol, shares, action) {
  const res = await api(`/accounts/${account}/orders`, {
    method: "POST",
    body: marketOrder(symbol, shares, action),
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`ordre refusé (${res.status}) : ${res.text || JSON.stringify(res.body?.error || {})}`);
  }
  return res.body?.data?.order;
}

// Market orders on an American fund fill at once, but "at once" is not "before the next
// call", so the fill is waited for rather than assumed.
async function settle(id) {
  for (let i = 0; i < 40; i++) {
    const res = await api(`/accounts/${account}/orders/${id}`);
    const order = res.body?.data;
    const status = order?.status;
    if (status === "Filled" || status === "Rejected" || status === "Cancelled" || status === "Expired") {
      const fills = (order?.legs || []).flatMap((l) => l.fills || []);
      const shares = fills.reduce((s, f) => s + Number(f.quantity), 0);
      const value = fills.reduce((s, f) => s + Number(f.quantity) * Number(f["fill-price"]), 0);
      return { status, fills: fills.length, shares, price: shares ? value / shares : null, value };
    }
    await sleep(500);
  }
  return { status: "inconnu après 20 s" };
}

// ----------------------------------------------------------------------------- le programme

const trips = [];
for (const { symbol, shares } of PLAN) {
  const before = await quote(symbol);
  const quoted = await dryRun(symbol, shares, "Buy to Open");
  // The exit cannot be quoted before the position exists: without shares to close, the same
  // order is a short sale, and the account is not approved for one. So it is quoted after the
  // buy in a live run, and left unanswered in a probe.
  const trip = {
    symbol,
    shares,
    quote: before,
    quotedFees: { buy: quoted },
  };

  if (LIVE) {
    if (before.mid == null) {
      trip.error = "pas de touche cotée, aller-retour non tenté";
      trips.push(trip);
      continue;
    }
    const buy = await settle((await place(symbol, shares, "Buy to Open")).id);
    const midBuy = before.mid;
    await sleep(PAUSE);
    trip.quotedFees.sell = await dryRun(symbol, shares, "Sell to Close");
    trip.quotedFees.roundTrip = money(
      (trip.quotedFees.buy.total || 0) + (trip.quotedFees.sell.total || 0)
    );
    const between = await quote(symbol);
    const sell = await settle((await place(symbol, shares, "Sell to Close")).id);
    trip.legs = { buy, sell, quoteBetween: between };
    // A bought leg that failed to sell is an open position nobody asked for, and the worst
    // thing to do about it is to place the next buy. The run stops here and says so.
    if (buy.status === "Filled" && sell.status !== "Filled") {
      trips.push(trip);
      console.error(
        `\nATTENTION : ${shares} ${symbol} achetées et la vente est ${sell.status}. ` +
          `Position ouverte à solder à la main sur my.tastytrade.com. Aucun autre ordre ne sera passé.`
      );
      break;
    }
    if (buy.price && sell.price && between.mid) {
      const perShare = buy.price - midBuy + (between.mid - sell.price);
      trip.measured = {
        // The two halves of the effective spread, each against the mid that stood before
        // its own leg. Their sum is the round-trip figure the reports publish.
        buySlippage: money(buy.price - midBuy),
        sellSlippage: money(between.mid - sell.price),
        effectivePerShare: money(perShare),
        marketCost: money(perShare * shares),
        fees: trip.quotedFees.roundTrip,
        total: money(perShare * shares + (trip.quotedFees.roundTrip || 0)),
      };
    }
  }
  trips.push(trip);
  console.error(
    `${symbol} x${shares} : ` +
      (trip.measured
        ? `spread effectif ${(trip.measured.effectivePerShare * 100).toFixed(2)} c/part, ` +
          `coût ${trip.measured.total} $`
        : trip.error ||
          `cotation ${before.bid}/${before.ask} (${(((before.ask - before.bid) / before.mid) * 1e4).toFixed(1)} bp), ` +
            `frais annoncés à l'achat ${trip.quotedFees.buy.total ?? trip.quotedFees.buy.error}`)
  );
}

// The measurement above deliberately ignores what the market did between the two legs, which
// makes it the right number for a spread and the wrong one for a bank statement. So the two are
// reconciled: what the fills and the fees say the account should have lost, against what it did
// lose. They agreed to the cent on the run of 2026-08-27 — 3.059 $, of which 2.81 of execution
// and 0.25 of fees — and a gap between them would mean a leg or a fee went unseen.
let reconciliation = null;
if (LIVE) {
  const after = await api(`/accounts/${account}/balances`);
  const expected = trips.reduce((sum, t) => {
    if (!t.legs?.buy?.price || !t.legs?.sell?.price) return sum;
    return sum + t.shares * (t.legs.sell.price - t.legs.buy.price) - (t.quotedFees?.roundTrip || 0);
  }, 0);
  const cashAfter = money(after.body?.data?.["cash-balance"]);
  reconciliation = {
    cashBefore: cash,
    cashAfter,
    observed: money(cashAfter - cash),
    expectedFromFills: money(expected),
    // Positive means money left unaccounted for by the fills and the quoted fees.
    unexplained: money(cashAfter - cash - expected),
  };
  console.error(
    `\ncaisse ${cash} -> ${cashAfter} \$ (${reconciliation.observed}), ` +
      `attendu d'après les exécutions ${reconciliation.expectedFromFills}, ` +
      `inexpliqué ${reconciliation.unexplained} \$`
  );
}

// Runs accumulate rather than replace each other. A round trip costs money and cannot be taken
// again under the same market, so the one thing this file must never do is lose one — which it
// did once, on 2026-08-27: a later probe, writing the same path, overwrote the six live trips of
// that afternoon. Their distilled figures survive in `tastytrade_cost.mjs`, the raw legs do not.
// Hence two defences: a probe writes to its own file, and a live run appends.
const run = {
  at: new Date().toISOString(),
  account,
  live: LIVE,
  cash,
  buyingPower,
  trips,
  reconciliation,
};
const history = (() => {
  try {
    const held = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(held?.runs) ? held.runs : held?.trips ? [held] : [];
  } catch {
    return [];
  }
})();
fs.writeFileSync(OUT, JSON.stringify({ runs: [...history, run] }, null, 2));
// The default is a URL relative to this module, which prints as file:///… and reads badly in a
// log, so only the tail of it is shown.
const shown = (p) => (p instanceof URL ? p.pathname.split("/").slice(-2).join("/") : String(p));
console.error(
  `\n${trips.length} ligne(s) ajoutée(s) à ${shown(OUT)} (${history.length + 1} passe(s) au total)`
);

await browser.disconnect();
