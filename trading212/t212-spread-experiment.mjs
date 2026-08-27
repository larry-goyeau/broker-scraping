// Measures what a buy followed by an immediate sell of an ETF actually costs on
// Trading212, so the result can be fitted to cost = a * spread * n + b.
//
// Trading212 charges nothing explicit on a EUR-quoted ETF (its own MiFID ex-ante
// disclosure returns zero for every cost line), so the round trip should cost the
// bid-ask spread and nothing else. This script measures that in euros.
//
//   node trading212/t212-spread-experiment.mjs --dry              # plumbing only, no orders
//   node trading212/t212-spread-experiment.mjs --sizes=1,8 --reps=3
//
// Cash is read before and after each leg: the drop in free funds is what the buy
// really cost, and the rise is what the sale really returned, whatever fees may
// be hiding inside them.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const DRY = process.argv.includes("--dry");
const TICKER = arg("ticker", "EUNLd_EQ");
const CFD_TICKER = arg("cfd", "EUNL_DE_CFD");
const SIZES = arg("sizes", "1,8").split(",").map(Number).filter((n) => n > 0);
const REPS = Number(arg("reps", "3"));
// A dry run and a real one do not write to the same place, and a real one appends. Both rules
// exist because a round trip costs money and cannot be replayed under the same market: the
// tastytrade twin of this script lost an afternoon of live trips to a later probe writing over
// them, and nothing here would have stopped the same thing.
const OUT = arg(
  "out",
  new URL(
    DRY ? "../parsed_json/t212-dry.json" : "../parsed_json/t212-experiment.json",
    import.meta.url
  )
);
const previousRuns = (() => {
  try {
    const held = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(held?.runs) ? held.runs : held?.rounds ? [held] : [];
  } catch {
    return [];
  }
})();
const save = (log) => {
  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ runs: [...previousRuns, log] }, null, 2));
};
// Running every repetition of one size before moving to the next confounds size
// with time: if the spread drifts, the later size wears the difference. Passing
// --sequence=1,20,1,20 interleaves them instead, so both sizes see the same
// market seconds apart and any residual gap is attributable to size alone.
const SEQUENCE = arg("sequence", "")
  .split(",")
  .map(Number)
  .filter((n) => n > 0);
const PAUSE = Number(arg("pause", "4000"));

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app.trading212.com"));
if (!page) throw new Error("No Trading212 tab open.");

const session = await page.evaluate(() => {
  const device = JSON.parse(localStorage.getItem("usedDeviceIdForKeys") || '""');
  const account = localStorage.getItem("lastLogInAccountId") || "";
  const cached = JSON.parse(localStorage.getItem("cachedLoginResponse") || "null");
  return {
    device,
    account,
    accountSession: cached?.loginResponse?.accountSession || "",
    residency: cached?.loginResponse?.residencyCode || "",
    subSystem: JSON.parse(localStorage.getItem("lastLogInSubSystem") || '""'),
  };
});
const traderClient = `application=WC4,version=8.44.1,dUUID=${session.device},accountId=${session.account}`;

console.error(`account ${session.account} (${session.subSystem}, ${session.residency})`);
if (session.subSystem !== "LIVE") throw new Error("Not a LIVE account — aborting.");

// ---------------------------------------------------------------- quote stream
// A second connection to Trading212's price feed, subscribed to both the real
// ETF (which streams only a last price) and its CFD twin (which streams bid and
// ask). The CFD is where the quoted spread can be read.
await page.evaluate(
  (accountSession, device, equity, cfd) => {
    window.__t212 = { quotes: [], open: false, error: null };
    const url =
      `wss://live.services.trading212.com/streaming/events/?app=WC4&appVersion=8.44.1&osVersion=` +
      `&dUUID=${device}&accountSession=${accountSession}&countryOfResidence=FR&tradingType=EQUITY` +
      `&EIO=3&transport=websocket`;
    const ws = new WebSocket(url);
    window.__t212ws = ws;
    ws.onopen = () => {
      window.__t212.open = true;
    };
    ws.onerror = (e) => {
      window.__t212.error = String(e?.message || "ws error");
    };
    ws.onmessage = (event) => {
      const d = String(event.data);
      if (d === "2") {
        ws.send("3");
        return;
      }
      if (d.startsWith("0")) {
        // Engine.IO handshake done; join and subscribe.
        ws.send("40");
        setTimeout(() => ws.send(`42["s-eqs",${JSON.stringify([equity, cfd])}]`), 300);
        setInterval(() => {
          try {
            ws.send("2");
          } catch {}
        }, 20000);
        return;
      }
      if (!d.startsWith("42")) return;
      let payload;
      try {
        payload = JSON.parse(d.slice(2));
      } catch {
        return;
      }
      if (payload[0] !== "eqs") return;
      const parts = String(payload[1]).split("|");
      const at = Date.now();
      if (parts[0] === "LR") {
        window.__t212.quotes.push({ at, kind: "last", ticker: parts[1], price: Number(parts[2]) });
      } else if (parts[0] === "QR") {
        window.__t212.quotes.push({
          at,
          kind: "quote",
          ticker: parts[1],
          bid: Number(parts[2]),
          ask: Number(parts[3]),
        });
      }
    };
  },
  session.accountSession,
  session.device,
  TICKER,
  CFD_TICKER
);

await sleep(6000);
const wsState = await page.evaluate(() => ({
  open: window.__t212.open,
  error: window.__t212.error,
  n: window.__t212.quotes.length,
}));
console.error(`quote feed: open=${wsState.open} frames=${wsState.n} error=${wsState.error || "none"}`);
// Only a supplement: the fill prices come from the order history, which is both
// exact and always available. An instrument with no CFD twin streams nothing but
// a last price anyway, so a dead feed is no reason to skip the measurement.
if (!wsState.open) console.error("  (continuing without it — fill prices come from the order history)");

const quotesSince = (from) =>
  page.evaluate((t) => window.__t212.quotes.filter((q) => q.at >= t), from);
const allQuotes = () => page.evaluate(() => window.__t212.quotes);

// ------------------------------------------------------------------ REST calls
async function api(method, path, body) {
  return page.evaluate(
    async (m, p, b, client) => {
      const headers = {
        "Content-Type": "application/json",
        "X-Trader-Client": client,
        "X-Trader-Target-Type": "EQUITY",
      };
      try {
        const r = await fetch(`https://live.services.trading212.com${p}`, {
          method: m,
          credentials: "include",
          headers,
          ...(b === null ? {} : { body: JSON.stringify(b) }),
        });
        const text = await r.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        return { status: r.status, text, json };
      } catch (e) {
        return { status: 0, text: String(e), json: null };
      }
    },
    method,
    path,
    body === undefined ? null : body,
    traderClient
  );
}

async function accountState() {
  const r = await api("POST", "/rest/v1/equity/multi-accounts/summary?targetCurrency=EUR", []);
  const eq = r.json?.accountsByType?.EQUITY;
  if (!eq) throw new Error(`Could not read the account: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  const pos = (eq.open || []).find((p) => p.code === TICKER);
  return {
    at: Date.now(),
    free: Number(eq.cash.freeForStocks),
    total: Number(eq.cash.total),
    blocked: Number(eq.cash.blockedForStocks),
    pendingOrders: (eq.orders || []).length + (eq.valueOrders || []).length,
    position: pos
      ? {
          quantity: Number(pos.quantity),
          averagePrice: Number(pos.averagePrice),
          investment: Number(pos.investment),
          sellable: Number(pos.sellableQuantity),
          value: Number(pos.value),
        }
      : null,
  };
}

const marketOrder = (quantity) => ({
  quantity,
  instrumentCode: TICKER,
  currencyCode: "EUR",
  orderType: "MARKET",
  timeValidity: "GOOD_TILL_CANCEL",
  enabledExtendedMarketHours: false,
});

async function validate(quantity) {
  return api("POST", "/rest/public/v2/equity/order/validate", marketOrder(quantity));
}

async function place(quantity) {
  if (DRY) return { status: 999, text: "(dry run — no order sent)", json: null };
  return api("POST", "/rest/public/v2/equity/order", marketOrder(quantity));
}

// Waits until nothing is pending and the holding matches what we expect.
async function settle(expectQuantity, timeoutMs = 60000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await accountState();
    const held = last.position?.quantity ?? 0;
    if (last.pendingOrders === 0 && Math.abs(held - expectQuantity) < 1e-6) return { ok: true, state: last };
    await sleep(700);
  }
  return { ok: false, state: last };
}

// ------------------------------------------------------------------ experiment
// The ordered list of round trips to run, one entry per round trip.
const PLAN = SEQUENCE.length
  ? SEQUENCE.map((n, i) => ({ n, rep: i + 1 }))
  : SIZES.flatMap((n) => Array.from({ length: REPS }, (_, i) => ({ n, rep: i + 1 })));

const log = {
  startedAt: new Date().toISOString(),
  ticker: TICKER,
  cfdTicker: CFD_TICKER,
  dry: DRY,
  sizes: SIZES,
  reps: REPS,
  sequence: SEQUENCE.length ? SEQUENCE : null,
  plan: PLAN.map((p) => p.n),
  tradingSession: (await api("GET", "/rest/working-schedules/v4/trading-sessions/166?zoneId=Europe%2FParis")).json,
  costReview: {},
  rounds: [],
};

for (const n of [...new Set(PLAN.map((p) => p.n))]) {
  log.costReview[n] = (await api("POST", "/rest/v2/public/added-costs", marketOrder(n))).json;
}

const opening = await accountState();
console.error(
  `opening: free=€${opening.free} total=€${opening.total} position=${JSON.stringify(opening.position)}`
);
if (opening.position && opening.position.quantity > 0) {
  throw new Error(`Already holding ${opening.position.quantity} of ${TICKER} — aborting to keep the books clean.`);
}
log.opening = opening;

let aborted = null;

for (const { n, rep } of PLAN) {
  const tag = `n=${n} (#${rep} of ${PLAN.length})`;
  console.error(`\n=== ${tag} ===`);

  const pre = await validate(n);
  if (pre.status !== 200) {
    console.error(`  buy rejected before sending: ${pre.status} ${pre.text.slice(0, 200)}`);
    aborted = `validate failed for ${tag}: ${pre.text.slice(0, 200)}`;
    break;
  }

  const before = await accountState();
  const qBefore = await quotesSince(Date.now() - 15000);

  const buyAt = Date.now();
  const buy = await place(n);
  console.error(`  buy  ${n} -> HTTP ${buy.status}`);
  if (!DRY && buy.status !== 200) {
    aborted = `buy failed for ${tag}: ${buy.status} ${buy.text.slice(0, 300)}`;
    break;
  }

  const afterBuy = DRY ? before : (await settle(n)).state;
  const buySettled = DRY ? { ok: true } : { ok: Math.abs((afterBuy.position?.quantity ?? 0) - n) < 1e-6 };
  if (!DRY && !buySettled.ok) {
    aborted = `buy did not settle for ${tag} — holding ${afterBuy.position?.quantity ?? 0}`;
    break;
  }
  const qAfterBuy = await quotesSince(buyAt - 3000);

  const held = DRY ? n : afterBuy.position.quantity;
  const sellAt = Date.now();
  const sell = await place(-held);
  console.error(`  sell ${held} -> HTTP ${sell.status}`);
  if (!DRY && sell.status !== 200) {
    aborted = `SELL FAILED for ${tag} — STILL HOLDING ${held}: ${sell.status} ${sell.text.slice(0, 300)}`;
    break;
  }

  const afterSell = DRY ? before : (await settle(0)).state;
  if (!DRY && (afterSell.position?.quantity ?? 0) !== 0) {
    aborted = `sell did not settle for ${tag} — STILL HOLDING ${afterSell.position?.quantity}`;
    break;
  }
  const qAfterSell = await quotesSince(sellAt - 3000);

  const round = {
    n,
    rep,
    before,
    afterBuy,
    afterSell,
    buyResponseStatus: buy.status,
    sellResponseStatus: sell.status,
    heldQuantity: held,
    debited: DRY ? null : +(before.free - afterBuy.free).toFixed(6),
    credited: DRY ? null : +(afterSell.free - afterBuy.free).toFixed(6),
    roundTripCost: DRY ? null : +(before.free - afterSell.free).toFixed(6),
    quotes: { beforeBuy: qBefore, afterBuy: qAfterBuy, afterSell: qAfterSell },
  };
  log.rounds.push(round);
  console.error(
    `  debited=€${round.debited} credited=€${round.credited} cost=€${round.roundTripCost}`
  );

  save(log);
  await sleep(PAUSE);
}

log.aborted = aborted;
log.closing = await accountState();
log.quoteStream = await allQuotes();

// Cash deltas are rounded to the cent, which is too coarse to read a spread of
// a tenth of a cent. The order history carries the exact fill price and the
// execution venue, so pull those back for every order just placed.
if (!DRY) {
  const list = await api("GET", "/rest/history/v2/orders?limit=40");
  const items = (list.json?.data || []).filter(
    (it) => it.heading?.context?.instrumentCode === TICKER
  );
  log.fills = [];
  for (const it of items.slice(0, PLAN.length * 3)) {
    const id = String(it.detailsPath || "").split("/").pop();
    if (!id) continue;
    const d = await api("GET", `/rest/history/v4/orders/${id}`);
    const row = (needle) => {
      for (const s of d.json?.sections || []) {
        for (const r of s.rows || []) {
          if ((r.description?.key || "").includes(needle)) return r.value;
        }
      }
      return null;
    };
    log.fills.push({
      id,
      date: it.date,
      side: it.avatar?.status,
      orderId: row("order.id")?.context?.id,
      orderedQuantity: row("ordered-quantity")?.context?.quantity,
      fillQuantity: row("fill.quantity")?.context?.quantity,
      fillPrice: row("fill.price")?.context?.amount,
      total: row("order.total")?.context?.amount,
      result: row("order.result")?.context?.amount ?? null,
      venue: (row("fill.type")?.key || "").split(".").pop(),
    });
  }
}

log.finishedAt = new Date().toISOString();

save(log);

console.error(`\nclosing: free=€${log.closing.free} position=${JSON.stringify(log.closing.position)}`);
if (aborted) console.error(`\n!!! ABORTED: ${aborted}`);
// The default is a URL relative to this module, whose file:///… form reads badly in a log.
const shown = (p) => (p instanceof URL ? p.pathname.split("/").slice(-2).join("/") : String(p));
console.error(`\nwrote ${shown(OUT)} (${log.rounds.length} rounds)`);

await page.evaluate(() => {
  try {
    window.__t212ws.close();
  } catch {}
});
await browser.disconnect();
