// Cancels every open order on one symbol, then sells the position at the market. Written to close
// a position the wash-sale check refused to let go: a resting buy from an earlier probe was still
// on the book, and TradeZero blocks a sell that could cross the account's own bid.
//
//   node tradezero/close-now.mjs IAU 4

import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [SYMBOL = "IAU", SHARES = "4"] = process.argv.slice(2);
const ACCOUNT = "LGO18192";
const A = "https://api.tradezero.com/v1/accounts/api/accounts";

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
for (let i = 0; i < 60 && !token; i++) {
  if (i === 4) await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(400);
}
if (!token) throw new Error("aucun jeton.");

const api = (url, { method = "GET", body = null, form = null } = {}) =>
  page.evaluate(
    async (u, auth, method, body, form) => {
      try {
        let payload;
        const headers = { Authorization: auth, Accept: "application/json" };
        if (form) {
          payload = new FormData();
          for (const [k, v] of Object.entries(JSON.parse(form))) payload.append(k, v);
        } else if (body) {
          payload = body;
          headers["Content-Type"] = "application/json";
        }
        const res = await fetch(u, { method, headers, ...(payload ? { body: payload } : {}) });
        const t = await res.text();
        try {
          return { status: res.status, body: JSON.parse(t) };
        } catch {
          return { status: res.status, text: t.slice(0, 300) };
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

// The bundle sends this one as multipart with the account in the body and the symbol in the query.
const cancelled = await api(`${A}/orders/cancelallorders?symbol=${encodeURIComponent(SYMBOL)}`, {
  method: "POST",
  form: { account: ACCOUNT },
});
console.error(`annulation : ${cancelled.status} ${JSON.stringify(cancelled.body ?? cancelled.text).slice(0, 200)}`);

await sleep(1200);
const open = (await api(`${A}/orders/${ACCOUNT}`)).body || [];
const live = open.filter((o) => /new|work|pend|partial|accept/i.test(String(o.orderStatus || "")));
console.error(`${live.length} ordre(s) encore actif(s)`);
for (const o of live) console.error(`  ${o.symbol} ${o.side} ${o.orderQuantity} ${o.orderStatus}`);

const sold = await api(`${A}/orders/placeorderwithresponse`, {
  method: "POST",
  body: {
    account: ACCOUNT,
    symbol: SYMBOL,
    side: "Sell",
    orderQuantity: Number(SHARES),
    quantity: Number(SHARES),
    securityType: "Stock",
    orderType: "Market",
    timeInForce: "Day",
    route: "",
    openClose: "Close",
    limitPrice: 0,
    priceStop: 0,
    userOrderId: "",
  },
});
console.error(
  `vente : ${sold.status} ${sold.body?.orderStatus || ""} ${sold.body?.text || ""} ` +
    `${sold.body?.executed ?? ""} parts à ${sold.body?.priceAvg ?? ""}`
);

for (let i = 0; i < 20; i++) {
  await sleep(700);
  const held = (await api(`${A}/positions/${ACCOUNT}`)).body || [];
  const mine = held.find((p) => p.symbol === SYMBOL);
  if (!mine) {
    console.error("position soldée.");
    break;
  }
  if (i === 19) console.error(`!!! ${mine.shares} parts de ${SYMBOL} TOUJOURS OUVERTES`);
}

await cdp.detach();
await browser.disconnect();
