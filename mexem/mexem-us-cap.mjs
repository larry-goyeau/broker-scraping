// Separate Mexem's 2 % US cap from IBKR's 1 %: needs a sub-dollar name
// and a notional the $1 floor no longer hides. Preview only.
//
//   node mexem/mexem-us-cap.mjs

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = new URL("mexem-us-cap.json", import.meta.url);
const API = "/portal.proxy/v1/portal";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => /clientam\.com\/portal/i.test(p.url()));
if (!page) throw new Error("No Mexem portal tab");

const call = (path, options = {}) =>
  page.evaluate(
    async (base, target, opts) => {
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
    },
    API,
    path,
    options
  );

const accounts = await call("iserver/accounts");
const accountId = accounts.json?.selectedAccount || accounts.json?.accounts?.[0];
const ledger = await call(`portfolio/${accountId}/ledger`);
const cash = {};
for (const [ccy, row] of Object.entries(ledger.json || {})) {
  if (row && typeof row === "object") cash[ccy] = { bal: row.cashbalance, settled: row.settledcash };
}

const scan = await call("iserver/scanner/run", {
  method: "POST",
  body: JSON.stringify({
    instrument: "STK",
    location: "STK.US.MAJOR",
    type: "MOST_ACTIVE",
    filter: [
      { code: "priceAbove", value: 0.05 },
      { code: "priceBelow", value: 0.5 },
      { code: "usdVolumeAbove", value: 100000 },
    ],
  }),
});

const FALLBACK = ["SNDL", "NAK", "CAN", "BBIG", "MULN", "GNS", "WKHS", "GOEV", "FCEL", "NNDM", "PLUG", "SOUN", "RIG", "NOK"];
const scanRows = Array.isArray(scan.json?.contracts) ? scan.json.contracts : Array.isArray(scan.json) ? scan.json : [];

const candidates = [];
for (const row of scanRows.slice(0, 15)) {
  if (row?.contractID || row?.conid) candidates.push({ symbol: row.symbol, conid: row.contractID || row.conid, from: "scan" });
}
for (const symbol of FALLBACK) {
  if (candidates.some((c) => c.symbol === symbol)) continue;
  const found = await call("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern: false, referrer: "" }),
  });
  const hits = Array.isArray(found.json) ? found.json : [];
  const hit = hits.find((h) => /NASDAQ|NYSE|AMEX|ARCA/i.test(JSON.stringify(h))) || hits[0];
  if (hit?.conid) candidates.push({ symbol, conid: hit.conid, company: hit.companyHeader, from: "search" });
}

const quotes = [];
for (const c of candidates) {
  let price = null;
  let raw = null;
  for (let i = 0; i < 4 && !price; i++) {
    const snap = await call(`iserver/marketdata/snapshot?conids=${c.conid}&fields=31,84,86,7059`);
    raw = Array.isArray(snap.json) ? snap.json[0] : null;
    const n = Number(String(raw?.["31"] ?? raw?.["84"] ?? raw?.["86"] ?? "").replace(/[^0-9.]/g, ""));
    if (n > 0) price = n;
    else await sleep(600);
  }
  quotes.push({ ...c, price, listing: raw?.["7059"] || raw?.["6509"] });
}

const cheap = quotes.filter((q) => q.price > 0 && q.price < 0.55).sort((a, b) => a.price - b.price);
const pick = cheap[0] || quotes.filter((q) => q.price > 0).sort((a, b) => a.price - b.price)[0];

const whatifs = [];
if (pick) {
  const sizes = pick.price < 0.5 ? [200, 400, 600, 800] : [1];
  for (const quantity of sizes) {
    const notional = pick.price * quantity;
    const preview = await call(`iserver/account/${accountId}/orders/whatif`, {
      method: "POST",
      body: JSON.stringify({
        orders: [
          {
            conid: Number(pick.conid),
            orderType: "LMT",
            price: pick.price,
            side: "BUY",
            quantity,
            tif: "DAY",
            secType: `${pick.conid}:STK`,
          },
        ],
      }),
    });
    const amt = preview.json?.amount;
    const error = preview.json?.error || preview.json?.errors;
    const needed = String(error || "").match(/NEEDED[^0-9]{0,40}([0-9]+(?:\.[0-9]+)?)/i);
    const implied = needed ? Number(needed[1]) - notional : null;
    whatifs.push({
      quantity,
      notional: Number(notional.toFixed(4)),
      commission: amt?.commission,
      total: amt?.total,
      amount: amt,
      error,
      needed: needed ? Number(needed[1]) : null,
      impliedCommission: implied != null ? Number(implied.toFixed(4)) : null,
      expect2: Number((notional * 0.02).toFixed(4)),
      expect1: Number((notional * 0.01).toFixed(4)),
      expectShare: Number((0.005 * quantity).toFixed(4)),
    });
  }
}

const out = { cash, scanStatus: scan.status, scanError: scan.json?.error || scan.error, quotes, pick, whatifs };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      usd: cash.USD,
      eur: cash.EUR,
      scanN: scanRows.length,
      cheap: cheap.map((q) => ({ symbol: q.symbol, price: q.price, conid: q.conid })),
      pick,
      whatifs: whatifs.map((w) => ({
        n: w.quantity,
        notional: w.notional,
        commission: w.commission,
        needed: w.needed,
        implied: w.impliedCommission,
        "2%": w.expect2,
        "1%": w.expect1,
        share: w.expectShare,
      })),
    },
    null,
    2
  )
);
await browser.disconnect();
