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
await page.reload({ waitUntil: "networkidle2" });
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
        return { status: res.status, text: text.slice(0, 200) };
      }
    },
    path.startsWith("http") ? path : `https://app.alpaca.markets${path}`,
    token
  );

const me = await api("/api/v1/accounts?trading=true");
const list = Array.isArray(me.body) ? me.body : me.body?.accounts || [];
console.log(`comptes (${me.status}) : ${list.length}`);
for (const a of list) {
  console.log(`   ${a.id || a.account_id}  ${a.status || ""}  ${a.account_number || ""}  ${a.currency || ""}`);
}
const id = list[0]?.id || list[0]?.account_id;
if (!id) {
  console.log(JSON.stringify(me.body).slice(0, 600));
  process.exit(0);
}
for (const p of [
  `/api/v1/trading/accounts/${id}/account`,
  `/api/v1/accounts/${id}/trade_account/margin`,
  `/api/v1/accounts/${id}/positions`,
  `/api/v1/accounts/${id}/activities?page_size=5`,
]) {
  const a = await api(p);
  console.log(`\n${a.status}  ${p}\n    ${(a.body ? JSON.stringify(a.body) : a.text || "").slice(0, 700)}`);
}

await cdp.detach();
await browser.disconnect();
