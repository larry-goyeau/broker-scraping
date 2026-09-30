// US / OTC / Ireland previews on the CapTrader portal. Nothing is submitted.
//
//   node captrader/captrader-us-whatif.mjs

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = new URL("captrader-us-whatif.json", import.meta.url);
const API = "/portal.proxy/v1/portal";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page =
  (await browser.pages()).find((p) => /clientam\.com\/portal/i.test(p.url()) && /CapTrader/i.test(p.url())) ||
  (await browser.pages()).find((p) => /clientam\.com\/portal/i.test(p.url()));
if (!page) throw new Error("No CapTrader portal tab");

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
        return { status: r.status, error: text.slice(0, 400) };
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

async function find({ symbol, exchange }) {
  const found = await call("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern: false, referrer: "" }),
  });
  const hits = Array.isArray(found.json) ? found.json : [];
  const want = String(exchange || "").toUpperCase();
  const hit =
    hits.find(
      (h) =>
        String(h.description || "").toUpperCase() === want ||
        (h.sections || []).some((s) => String(s.exchange || "").toUpperCase().includes(want))
    ) || hits[0];
  return hit ? { symbol, exchange, conid: String(hit.conid), company: hit.companyHeader, desc: hit.description } : null;
}

async function lastPrice(conid) {
  for (let i = 0; i < 6; i++) {
    const snap = await call(`iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86`);
    const row = Array.isArray(snap.json) ? snap.json[0] : null;
    const n = Number(String(row?.["31"] ?? row?.["84"] ?? row?.["86"] ?? "").replace(/[^0-9.]/g, ""));
    if (n > 0) return { price: n, bid: Number(row?.["84"]), ask: Number(row?.["86"]) };
    await sleep(700);
  }
  return { price: null };
}

async function preview({ conid, side, quantity, price, exchange }) {
  const answer = await call(`iserver/account/${accountId}/orders/whatif`, {
    method: "POST",
    body: JSON.stringify({
      orders: [
        {
          conid: Number(conid),
          orderType: "LMT",
          price,
          side,
          quantity,
          tif: "DAY",
          secType: `${conid}:STK`,
          ...(exchange ? { exchange } : {}),
        },
      ],
    }),
  });
  return {
    amount: answer.json?.amount ?? null,
    error: answer.json?.error || answer.json?.errors || null,
    warn: answer.json?.warn || null,
  };
}

const CASES = [
  { id: "us_floor", symbol: "F", exchange: "NYSE", side: "BUY", quantity: 1, expect: "2 USD" },
  { id: "us_250", symbol: "GNS", exchange: "AMEX", side: "BUY", quantity: 250, expect: "2.50 USD si 0,01 $/part" },
  { id: "us_sell", symbol: "F", exchange: "NYSE", side: "SELL", quantity: 1, expect: "2 USD, plus SEC/TAF s'ils sont nommés" },
  { id: "us_cap", symbol: "GNS", exchange: "AMEX", side: "BUY", quantity: 1500, expect: "1 % du notionnel si le plafond lie, sinon le plancher" },
  { id: "otc", symbol: "BBIG", exchange: "PINK", side: "BUY", quantity: 1, expect: "8,90 USD sous le dollar" },
  { id: "ireland", symbol: "BIRG", exchange: "ISED", side: "BUY", quantity: 1, expect: "un chiffre, ou N/A confirmé" },
];

const results = [];
for (const c of CASES) {
  const found = await find(c);
  if (!found) {
    results.push({ ...c, miss: true });
    continue;
  }
  const q = await lastPrice(found.conid);
  const seen = q.price ? await preview({ ...found, ...c, price: q.price }) : { error: "no price" };
  results.push({ ...c, ...found, ...q, ...seen });
  console.log(
    JSON.stringify({
      id: c.id,
      company: found.company,
      price: q.price,
      commission: seen.amount?.commission,
      total: seen.amount?.total,
      error: seen.error,
    })
  );
  await sleep(400);
}

const out = { cash, results };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
await browser.disconnect();
