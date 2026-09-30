// Positions, today's orders and today's fills, as the platform reports them. Reads only.
//
//   node tradezero/state.mjs

import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const api = (url) =>
  page.evaluate(
    async (u, auth) => {
      try {
        const res = await fetch(u, { headers: { Authorization: auth, Accept: "application/json" } });
        return { status: res.status, body: JSON.parse(await res.text()) };
      } catch (error) {
        return { status: 0, text: String(error) };
      }
    },
    url,
    token
  );

const positions = (await api(`${A}/positions/${ACCOUNT}`)).body || [];
console.log(`positions (${positions.length}) :`);
for (const p of positions) {
  console.log(`  ${p.symbol} ${p.side} ${p.shares} parts, prix moyen ${p.priceAvg}, réalisé ${p.realized}`);
}

const orders = (await api(`${A}/orders/${ACCOUNT}`)).body || [];
console.log(`\nordres du jour (${orders.length}) :`);
for (const o of orders) {
  console.log(
    `  ${String(o.startTimeET || "").slice(11, 19)} ${o.side.padEnd(4)} ${String(o.orderQuantity).padStart(3)} ` +
      `${o.symbol.padEnd(5)} ${String(o.orderType).padEnd(6)} ${String(o.orderStatus).padEnd(12)} ` +
      `exé ${o.executed} à ${o.priceAvg}  ${o.text || ""}`
  );
}

for (const path of [`trades/${ACCOUNT}`, `positions/closed/${ACCOUNT}`, `positionsvirtual/${ACCOUNT}`]) {
  const answer = await api(`${A}/${path}`);
  const rows = Array.isArray(answer.body) ? answer.body : answer.body == null ? [] : [answer.body];
  console.log(`\n${path} (${answer.status}, ${rows.length}) :`);
  for (const r of rows) console.log(`  ${JSON.stringify(r).slice(0, 700)}`);
}

// The platform shows balances on screen even though no HTTP path found so far returns them.
const screen = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("div,span,td,label")) {
    if (el.children.length) continue;
    const text = (el.textContent || "").trim();
    if (/^\$?-?[\d,]+\.\d{2}$/.test(text) || /power|cash|equity|value|p&l|pnl|commission|fee/i.test(text)) {
      const near = el.parentElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 90);
      if (near) out.push(near);
    }
  }
  return [...new Set(out)].slice(0, 30);
});
console.log(`\nécran :`);
for (const line of screen) console.log(`  ${line}`);

await cdp.detach();
await browser.disconnect();
