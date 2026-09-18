// Preview a Warsaw share. Tries whatif first, then an FX preview. No live
// stock order unless --buy is passed.
//
//   node mexem/mexem-wse-probe.mjs
//   node mexem/mexem-wse-probe.mjs --buy

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const LIVE = process.argv.includes("--buy");
const OUT = new URL("mexem-wse-probe.json", import.meta.url);
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
          return { status: r.status, error: text.slice(0, 500) };
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
const ledger = await call(`portfolio/${accountId}/ledger`);
const cash = {};
for (const [ccy, l] of Object.entries(ledger.json || {})) {
  if (l && typeof l === "object") cash[ccy] = { bal: l.cashbalance, settled: l.settledcash };
}

const candidates = ["ALE", "PGE", "TPE", "PZU", "PKO", "SPL", "MBK", "CDR", "KGH", "OPL"];
const quotes = [];
for (const symbol of candidates) {
  const found = await call("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern: false, referrer: "" }),
  });
  const hits = Array.isArray(found.json) ? found.json : [];
  const hit =
    hits.find(
      (h) =>
        String(h.description || "").toUpperCase() === "WSE" ||
        (h.sections || []).some((s) => String(s.exchange || "").toUpperCase().includes("WSE"))
    ) || hits[0];
  if (!hit) continue;
  const conid = String(hit.conid);
  let px = null;
  for (let i = 0; i < 5 && !px; i++) {
    const snap = await call(`iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86`);
    const row = Array.isArray(snap.json) ? snap.json[0] : null;
    const raw = row?.["31"] ?? row?.["84"] ?? row?.["86"];
    const n = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
    if (n > 0) px = n;
    else await new Promise((r) => setTimeout(r, 800));
  }
  quotes.push({ symbol, conid, company: hit.companyHeader, exchange: hit.description, price: px });
}

const cheap = quotes.filter((q) => q.price > 0).sort((a, b) => a.price - b.price)[0];

const whatifs = [];
if (cheap) {
  const bodies = [
    { label: "plain", extra: {} },
    { label: "route WSE", extra: { exchange: "WSE" } },
    { label: "cashCcy EUR", extra: { cashCcy: "EUR" } },
    { label: "fx + EUR", extra: { cashCcy: "EUR", isCcyConv: true } },
  ];
  for (const b of bodies) {
    const order = {
      conid: Number(cheap.conid),
      orderType: "LMT",
      price: cheap.price,
      side: "BUY",
      quantity: 1,
      tif: "DAY",
      secType: `${cheap.conid}:STK`,
      ...b.extra,
    };
    const answer = await call(`iserver/account/${accountId}/orders/whatif`, {
      method: "POST",
      body: JSON.stringify({ orders: [order] }),
    });
    whatifs.push({
      label: b.label,
      commission: answer.json?.amount?.commission,
      total: answer.json?.amount?.total,
      errors: answer.json?.errors || answer.json?.error,
      amount: answer.json?.amount,
    });
  }
}

const fxHints = await page.evaluate(async () => {
  const js = await (await fetch("/order-ticket/umd1/index.js", { credentials: "include" })).text();
  const hits = [];
  for (const re of [/exchangerate/gi, /isCcyConv/g, /cashCcy/g, /foserver/g, /currency\/pairs/g]) {
    const m = js.match(re);
    if (m) hits.push({ re: String(re), n: m.length });
  }
  const i = js.indexOf("isCcyConv");
  return { size: js.length, hits, around: i >= 0 ? js.slice(Math.max(0, i - 180), i + 280) : "" };
});

const pairs = await call("iserver/currency/pairs");
const fxPreview = await call(`iserver/account/${accountId}/orders/whatif`, {
  method: "POST",
  body: JSON.stringify({
    orders: [
      {
        orderType: "MKT",
        side: "BUY",
        tif: "DAY",
        fxQty: 80,
        isCcyConv: true,
        cashCcy: "EUR",
      },
    ],
  }),
});

const out = {
  live: LIVE,
  cash,
  quotes,
  cheap,
  whatifs,
  fxHints,
  pairs: Array.isArray(pairs.json) ? pairs.json.slice(0, 8) : pairs,
  fxPreview: fxPreview.json || fxPreview,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      cash,
      cheap,
      whatifs,
      fxPreview: {
        status: fxPreview.status,
        commission: fxPreview.json?.amount?.commission,
        errors: fxPreview.json?.errors || fxPreview.json?.error,
        keys: fxPreview.json && typeof fxPreview.json === "object" ? Object.keys(fxPreview.json) : [],
      },
      pairSample: Array.isArray(pairs.json) ? pairs.json.slice(0, 3) : pairs.json?.error || pairs.status,
    },
    null,
    2
  )
);
await browser.disconnect();
