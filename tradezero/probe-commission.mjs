// The platform's own commission calculator, `accounts/commissionreturn/{account}`, is the broker
// answering the same question `tradezero_cost.mjs` answers. Finding its parameters costs nothing
// and validates the schedule reading without spending a cent. Reads only.
//
//   node tradezero/probe-commission.mjs

import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACCOUNT = "LGO18192";

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
// A round of calls happens on its own within seconds; no reload needed if one is already flowing.
for (let i = 0; i < 40 && !token; i++) {
  if (i === 6) await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(500);
}
if (!token) throw new Error("aucun jeton capturé.");

const api = (url) =>
  page.evaluate(
    async (u, auth) => {
      try {
        const res = await fetch(u, { headers: { Authorization: auth, Accept: "application/json" } });
        const t = await res.text();
        return { status: res.status, text: t.slice(0, 700) };
      } catch (error) {
        return { status: 0, text: String(error) };
      }
    },
    url,
    token
  );

const base = `https://api.tradezero.com/v1/accounts/api/accounts/commissionreturn/${ACCOUNT}`;
const tries = [
  "side=Sell&symbol=IAU&shares=1&price=86.30",
  "side=Sell&symbol=IAU&shares=2&price=86.30",
  "side=Sell&symbol=IAU&shares=500&price=86.30",
  "side=Sell&symbol=IAU&shares=2000&price=86.30",
  "side=Sell&symbol=IAU&shares=5000&price=86.30",
  "side=Buy&symbol=IAU&shares=2000&price=86.30",
  "side=Buy&symbol=ACWEF&shares=2000&price=30",
  "side=Sell&symbol=ACWEF&shares=2000&price=30",
  "side=Buy&symbol=IAU&shares=100&price=50&orderType=Limit",
  "side=Buy&symbol=IAU&shares=100&price=50&orderType=LimitNonMarketable",
];
for (const q of tries) {
  const a = await api(`${base}?${q}`);
  console.log(`${String(a.status).padEnd(4)} ${q}\n     ${a.text}`);
}

// Balances are not on any path tried so far, so the platform's own screen is asked instead.
const shown = await page.evaluate(() => {
  const wanted = /(buying power|day trading|cash|equity|net liq|account value|excess)/i;
  const out = [];
  for (const el of document.querySelectorAll("div,span,td,label")) {
    if (el.children.length) continue;
    const t = (el.textContent || "").trim();
    if (t && t.length < 40 && wanted.test(t)) {
      const near = el.parentElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120);
      out.push(near || t);
    }
  }
  return [...new Set(out)].slice(0, 25);
});
console.log(`\nécran du compte :`);
for (const line of shown) console.log(`  ${line}`);

await cdp.detach();
await browser.disconnect();
