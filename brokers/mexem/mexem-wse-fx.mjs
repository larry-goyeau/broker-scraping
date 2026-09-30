// Find the EUR.PLN pair and preview (or place) a small conversion so a
// Warsaw share can be priced. `--live` submits the FX order only.
//
//   node mexem/mexem-wse-fx.mjs
//   node mexem/mexem-wse-fx.mjs --live

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const OUT = new URL("mexem-wse-fx.json", import.meta.url);
const API = "/portal.proxy/v1/portal";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => /clientam\.com\/portal/i.test(p.url()));
if (!page) throw new Error("No Mexem portal tab");

const call = (path, options = {}) =>
  page.evaluate(
    async (base, target, opts) => {
      try {
        const r = await fetch(`${base}/${target}`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: opts.method || "GET",
          body: opts.body || undefined,
        });
        const text = await r.text();
        try {
          return { status: r.status, json: JSON.parse(text) };
        } catch {
          return { status: r.status, error: text.slice(0, 600) };
        }
      } catch (e) {
        return { error: String(e) };
      }
    },
    API,
    path,
    options
  );

const accounts = await call("iserver/accounts");
const accountId = accounts.json?.selectedAccount || accounts.json?.accounts?.[0];

const pairs = await call("iserver/currency/pairs?currency=EUR");
const list = Array.isArray(pairs.json) ? pairs.json : pairs.json?.EUR || [];
const pln = (Array.isArray(list) ? list : []).find((p) => /PLN/i.test(JSON.stringify(p)));

const search = await call("iserver/secdef/search", {
  method: "POST",
  body: JSON.stringify({ symbol: "EUR.PLN", pattern: false, referrer: "" }),
});
const searchHits = Array.isArray(search.json) ? search.json : [];

const out = { live: LIVE, pairsStatus: pairs.status, pln, searchHits: searchHits.slice(0, 5) };

const conid = pln?.conid || pln?.conidex || searchHits[0]?.conid;
if (!conid) {
  fs.writeFileSync(OUT, JSON.stringify({ ...out, pairs }, null, 2));
  console.log(JSON.stringify({ error: "no EUR.PLN conid", pln, searchHits: searchHits.slice(0, 3), pairKeys: pairs.json && typeof pairs.json === "object" ? Object.keys(pairs.json) : null }, null, 2));
  await browser.disconnect();
  process.exit(1);
}

const order = {
  acctId: accountId,
  conid: Number(conid),
  secType: "CASH",
  orderType: "MKT",
  side: "BUY",
  quantity: 40,
  tif: "DAY",
  isCcyConv: true,
};
const preview = await call(`iserver/account/${accountId}/orders/whatif`, {
  method: "POST",
  body: JSON.stringify({ orders: [order] }),
});
out.conid = conid;
out.preview = preview.json || preview;

let placed = null;
if (LIVE && !preview.json?.errors && !preview.json?.error) {
  placed = await call(`iserver/account/${accountId}/orders`, {
    method: "POST",
    body: JSON.stringify({ orders: [order] }),
  });
  out.placed = placed.json || placed;
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      live: LIVE,
      conid,
      pln,
      preview: {
        status: preview.status,
        commission: preview.json?.amount?.commission,
        amount: preview.json?.amount,
        errors: preview.json?.errors || preview.json?.error,
      },
      placed: placed ? { status: placed.status, json: placed.json } : null,
    },
    null,
    2
  )
);
await browser.disconnect();
