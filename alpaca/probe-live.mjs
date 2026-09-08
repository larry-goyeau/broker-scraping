// Reads the live account's cash, type and trading blocks, to size a real round trip. Reads only:
// no order is sent from here.
//
//   node alpaca/probe-live.mjs

import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
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
for (let i = 0; i < 24 && !token; i++) await new Promise((r) => setTimeout(r, 500));
if (!token) throw new Error("aucun jeton capturé.");

const api = (path) =>
  page.evaluate(
    async (url, bearer) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" } });
      const text = await res.text();
      try {
        return { status: res.status, body: JSON.parse(text) };
      } catch {
        return { status: res.status, text: text.slice(0, 400) };
      }
    },
    path.startsWith("http") ? path : `https://app.alpaca.markets${path}`,
    token
  );

const me = await api("/api/v1/accounts?trading=true");
const list = Array.isArray(me.body) ? me.body : me.body?.accounts || [];
console.log(`comptes (${me.status}) : ${list.length}`);
for (const a of list) {
  console.log(`   ${JSON.stringify({
    id: a.id || a.account_id,
    status: a.status,
    number: a.account_number,
    currency: a.currency,
    type: a.account_type || a.type,
    paper: a.paper,
  })}`);
}
const live = list.find((a) => !/paper|PA/i.test(String(a.account_number || a.id || ""))) || list[0];
const id = live?.id || live?.account_id;
if (!id) {
  console.log(JSON.stringify(me.body).slice(0, 800));
  process.exit(0);
}
for (const p of [
  `/api/v1/trading/accounts/${id}/account`,
  `/api/v1/accounts/${id}/trade_account/margin`,
  `/api/v1/accounts/${id}/details`,
  `/api/v1/billing/overview`,
  `/api/v1/accounts/${id}/positions`,
  `/api/v1/accounts/${id}/activities?page_size=8`,
  `/api/v1/accounts/${id}/orders?status=all&limit=5`,
]) {
  const a = await api(p);
  console.log(`\n${a.status}  ${p}\n    ${(a.body ? JSON.stringify(a.body) : a.text || "").slice(0, 900)}`);
}

const clock = await api("/internal/clock");
console.log("\nclock", JSON.stringify(clock.body).slice(0, 300));

await cdp.detach();
await browser.disconnect();
