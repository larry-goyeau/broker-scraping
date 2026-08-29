// Real round trips on TradeZero International, to put `tradezero_cost.mjs` against money that
// moved. Two modes, and the first exists so the second is not the place where the payload gets
// debugged:
//
//   --probe   a limit order far from the market, which cannot fill, then cancelled. Confirms the
//             endpoint, the field names and the enums at no cost.
//   --live    a market buy and an immediate market sell, the thing being measured.
//
// The account's buying power was 500 dollars when this was written, so sizes are small by
// necessity as well as by choice. Guards below refuse anything above 10 shares or 500 dollars,
// and if a buy fills and its sell does not, the script stops and says so loudly rather than
// carrying on and leaving a position open overnight.
//
//   node tradezero/tradezero-experiment.mjs --probe
//   node tradezero/tradezero-experiment.mjs --live --symbol=IAU --shares=5

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const LIVE = process.argv.includes("--live");
const PROBE = process.argv.includes("--probe");
const ACCOUNT = arg("account", "LGO18192");
const SYMBOL = arg("symbol", "IAU").toUpperCase();
const SHARES = Number(arg("shares", "5"));
const MAX_SHARES = 10;
const MAX_NOTIONAL = 500;
const OUT = new URL(LIVE ? "tradezero-experiment.json" : "tradezero-probe.json", import.meta.url);

if (SHARES > MAX_SHARES) throw new Error(`garde-fou : ${SHARES} parts demandées, ${MAX_SHARES} au plus.`);

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("tz1.tradezero.com"));
if (!page) throw new Error("aucun onglet tz1.tradezero.com ouvert.");

const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
let token = null;
cdp.on("Network.requestWillBeSent", (e) => {
  const h = e.request.headers || {};
  const auth = h.Authorization || h.authorization;
  if (auth && /^Bearer /i.test(auth)) token = auth;
});
for (let i = 0; i < 40 && !token; i++) {
  if (i === 8) await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(500);
}
if (!token) throw new Error("aucun jeton capturé : recharger la plateforme.");

const A = "https://api.tradezero.com/v1/accounts/api/accounts";

// Orders travel as JSON, cancellations as multipart — the platform's own bundle does the same,
// and sending the cancellation as JSON gets no answer at all.
async function api(url, { method = "GET", body = null, form = null } = {}) {
  return page.evaluate(
    async (u, auth, method, body, form) => {
      try {
        let payload = body;
        if (form) {
          payload = new FormData();
          for (const [k, v] of Object.entries(JSON.parse(form))) payload.append(k, v);
        }
        const res = await fetch(u, {
          method,
          headers: {
            Authorization: auth,
            Accept: "application/json",
            ...(body && !form ? { "Content-Type": "application/json" } : {}),
          },
          ...(payload ? { body: payload } : {}),
        });
        const text = await res.text();
        try {
          return { status: res.status, body: JSON.parse(text) };
        } catch {
          return { status: res.status, text: text.slice(0, 400) };
        }
      } catch (error) {
        return { status: 0, text: String(error) };
      }
    },
    url,
    token,
    method,
    body ? JSON.stringify(body) : null,
    form ? JSON.stringify(form) : null
  );
}

// This endpoint returns one row per market data feed and they are not equally alive: the account
// is entitled to Nasdaq Basic and not to the consolidated tape, so the tape row goes stale and
// still looks well-formed. On the run below it read 86.07/86.08 while the fill came back at 83.85,
// two dollars away. Volume is what separates them — the stale row's total equalled its pre-market
// total — so the busiest row wins rather than the best-named one.
async function quote(symbol) {
  const res = await api(`https://feed.tradezero.com/api/data/symbol/${encodeURIComponent(symbol)}`);
  const rows = Array.isArray(res.body) ? res.body : [];
  const row = [...rows].sort((a, b) => Number(b.volume || 0) - Number(a.volume || 0))[0];
  if (!row) return { symbol, error: `pas de cotation (${res.status})` };
  return {
    symbol,
    feed: row.feed,
    exchange: row.exchange,
    bid: row.bid,
    ask: row.ask,
    last: row.last,
    mid: row.bid > 0 && row.ask > 0 ? Number(((row.bid + row.ask) / 2).toFixed(4)) : null,
    spread: row.bid > 0 && row.ask > 0 ? Number((row.ask - row.bid).toFixed(4)) : null,
    at: row.lastTradeTime,
  };
}

// The platform's own commission calculator. Free to ask, and the thing the fills are checked
// against leg by leg.
async function estimate(side, symbol, shares, price) {
  const res = await api(
    `${A}/commissionreturn/${ACCOUNT}?side=${side}&symbol=${encodeURIComponent(symbol)}&shares=${shares}&price=${price}`
  );
  return res.status === 200 ? res.body : { error: res.status, ...res };
}

// Field names and enums read out of the platform's own bundle: side is a word and the order
// carries both `orderQuantity` and `quantity`. No `legs` array: the one in the bundle belongs to
// the option and multi-leg paths, and sending it for a stock is refused with "R149: Validation
// Order Error: Security Type and MLEG ID Mismatch", which is how this was found out.
function orderBody({ side, symbol, shares, orderType, limitPrice = 0 }) {
  return {
    account: ACCOUNT,
    symbol,
    side,
    orderQuantity: shares,
    quantity: shares,
    securityType: "Stock",
    orderType,
    timeInForce: "Day",
    route: "",
    openClose: side === "Buy" ? "Open" : "Close",
    limitPrice,
    priceStop: 0,
    userOrderId: "",
  };
}

const place = async (body) => api(`${A}/orders/placeorderwithresponse`, { method: "POST", body });

const orders = async () => {
  const res = await api(`${A}/orders/${ACCOUNT}`);
  return Array.isArray(res.body) ? res.body : [];
};
const trades = async () => {
  const res = await api(`${A}/trades/${ACCOUNT}`);
  return Array.isArray(res.body) ? res.body : [];
};
const positions = async () => {
  const res = await api(`${A}/positions/${ACCOUNT}`);
  return Array.isArray(res.body) ? res.body : [];
};

// Waits for one order to reach a terminal state, identified by the id the placement returned when
// it gives one and by symbol and side otherwise.
async function settle(id, { symbol, side }) {
  for (let i = 0; i < 40; i++) {
    const list = await orders();
    const mine = id
      ? list.find((o) => String(o.userOrderId) === String(id))
      : [...list].reverse().find((o) => o.symbol === symbol && String(o.side || "").toLowerCase() === side.toLowerCase());
    const status = String(mine?.orderStatus || mine?.status || "").toLowerCase();
    if (mine && /fill|complete|cancel|reject|expire/.test(status)) {
      return {
        status: mine.orderStatus ?? mine.status,
        shares: Number(mine.executed ?? mine.filledQuantity ?? 0),
        price: mine.priceAvg != null ? Number(mine.priceAvg) : null,
        raw: mine,
      };
    }
    await sleep(700);
  }
  return { status: "inconnu après 28 s" };
}

const run = { at: new Date().toISOString(), account: ACCOUNT, symbol: SYMBOL, shares: SHARES, mode: LIVE ? "live" : "probe" };

const q0 = await quote(SYMBOL);
console.error(`${SYMBOL} : ${q0.bid}/${q0.ask} (${q0.spread}) sur ${q0.exchange}, flux ${q0.feed}`);
run.quoteBefore = q0;
if (q0.mid != null && q0.mid * SHARES > MAX_NOTIONAL) {
  throw new Error(`garde-fou : ${(q0.mid * SHARES).toFixed(2)} $ demandés, ${MAX_NOTIONAL} au plus.`);
}

run.estimate = {
  buy: await estimate("Buy", SYMBOL, SHARES, q0.ask ?? q0.mid),
  sell: await estimate("Sell", SYMBOL, SHARES, q0.bid ?? q0.mid),
};
console.error(
  `devis de la plateforme : achat commission ${run.estimate.buy.commission} frais ${run.estimate.buy.fees}, ` +
    `vente commission ${run.estimate.sell.commission} frais ${run.estimate.sell.fees}`
);

if (PROBE) {
  // Half the market price: a buy limit there rests and cannot fill, so the only thing at stake is
  // whether the payload is accepted.
  const limitPrice = Number((q0.mid / 2).toFixed(2));
  const body = orderBody({ side: "Buy", symbol: SYMBOL, shares: 1, orderType: "Limit", limitPrice });
  console.error(`\nsonde : achat limite 1 part à ${limitPrice}, hors du marché`);
  for (const orderType of ["Limit", "LMT", "limit"]) {
    const answer = await place({ ...body, orderType });
    console.error(`  orderType=${orderType} -> ${answer.status} ${JSON.stringify(answer.body ?? answer.text).slice(0, 220)}`);
    run.probe = { orderType, ...answer };
    if (answer.status >= 200 && answer.status < 300) break;
  }
  await sleep(1500);
  const open = await orders();
  console.error(`\n${open.length} ordre(s) au carnet :`);
  for (const o of open.slice(-4)) {
    console.error(`  ${o.symbol} ${o.side} ${o.orderQuantity} ${o.orderType} ${o.limitPrice} -> ${o.orderStatus} (id ${o.orderId ?? o.id})`);
  }
  run.openAfterProbe = open.slice(-4);
  // Whatever was accepted is taken straight back off the book.
  const mine = open.find((o) => o.symbol === SYMBOL && /work|open|pend|new|accept/i.test(String(o.orderStatus || "")));
  if (mine) {
    const cancelled = await api(`${A}/orders/cancelorder`, {
      method: "POST",
      body: { account: ACCOUNT, orderId: mine.orderId ?? mine.id, symbol: SYMBOL },
    });
    console.error(`annulation : ${cancelled.status} ${JSON.stringify(cancelled.body ?? cancelled.text).slice(0, 160)}`);
    run.cancelled = cancelled;
  }
}

if (LIVE) {
  const held = (await positions()).filter((p) => Number(p.shares) !== 0);
  if (held.length) throw new Error(`le compte porte déjà ${held.length} position(s) : refus de mesurer par-dessus.`);

  // Learned the hard way: a resting buy left over from the probe made the sell come back "R41:
  // This order would have created a wash sale", because TradeZero refuses an order that could
  // cross the account's own. The buy had already filled, so the position sat open until the book
  // was cleared by hand. The book is now cleared before anything is sent.
  const resting = (await orders()).filter((o) => /new|work|pend|partial|accept/i.test(String(o.orderStatus || "")));
  if (resting.length) {
    console.error(`${resting.length} ordre(s) au carnet, annulation avant de commencer`);
    await api(`${A}/orders/cancelallorders?symbol=${encodeURIComponent(SYMBOL)}`, { method: "POST", form: { account: ACCOUNT } });
    await sleep(1500);
    const left = (await orders()).filter((o) => /new|work|pend|partial|accept/i.test(String(o.orderStatus || "")));
    if (left.length) throw new Error(`${left.length} ordre(s) toujours actif(s) : un ordre dormant fait rejeter la vente.`);
  }

  console.error(`\nachat au marché de ${SHARES} ${SYMBOL}`);
  const bought = await place(orderBody({ side: "Buy", symbol: SYMBOL, shares: SHARES, orderType: "Market" }));
  if (bought.status < 200 || bought.status >= 300) {
    throw new Error(`achat refusé (${bought.status}) : ${JSON.stringify(bought.body ?? bought.text)}`);
  }
  const buyId = bought.body?.userOrderId ?? null;
  const buy = await settle(buyId, { symbol: SYMBOL, side: "Buy" });
  console.error(`  ${buy.status}, ${buy.shares} parts à ${buy.price}`);
  run.buy = buy;

  await sleep(2000);
  const q1 = await quote(SYMBOL);
  run.quoteBetween = q1;

  console.error(`vente au marché de ${SHARES} ${SYMBOL}`);
  const sold = await place(orderBody({ side: "Sell", symbol: SYMBOL, shares: SHARES, orderType: "Market" }));
  // The endpoint answers 200 and puts the refusal in the order's own status, so the HTTP code
  // alone is not the test. Getting this wrong is what let a rejected sell pass unnoticed.
  const refused = sold.status < 200 || sold.status >= 300 || /reject/i.test(String(sold.body?.orderStatus || ""));
  if (refused) {
    console.error(
      `\n!!! VENTE REFUSÉE alors que l'achat est passé : ${sold.body?.orderStatus || sold.status} ` +
        `${sold.body?.text || JSON.stringify(sold.body ?? sold.text)}\n` +
        `!!! une position de ${SHARES} ${SYMBOL} est OUVERTE. La solder : node tradezero/close-now.mjs ${SYMBOL} ${SHARES}`
    );
    run.sellFailed = sold.body ?? sold;
  } else {
    const sell = await settle(sold.body?.userOrderId ?? null, { symbol: SYMBOL, side: "Sell" });
    console.error(`  ${sell.status}, ${sell.shares} parts à ${sell.price}`);
    run.sell = sell;
  }

  await sleep(2500);
  run.trades = (await trades()).slice(-6);
  run.positionsAfter = await positions();
}

const history = (() => {
  try {
    const held = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(held?.runs) ? held.runs : [];
  } catch {
    return [];
  }
})();
fs.writeFileSync(OUT, JSON.stringify({ runs: [...history, run] }, null, 2));
console.error(`\nécrit dans ${OUT.pathname.split("/").slice(-2).join("/")} (${history.length + 1} passe(s))`);

await cdp.detach();
await browser.disconnect();
