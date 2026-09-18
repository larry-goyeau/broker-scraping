// Convert 10 € to zlotys, then preview (and optionally buy) 1 TPE on WSE.
//
//   node mexem/mexem-wse-live.mjs              # FX + whatif only
//   node mexem/mexem-wse-live.mjs --buy-stock  # also buy/sell 1 TPE if whatif is still blank

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BUY_STOCK = process.argv.includes("--buy-stock");
const OUT = new URL("mexem-wse-live.json", import.meta.url);
const API = "/portal.proxy/v1/portal";
const FX_CONID = 75015682;
const TPE_CONID = 268960206;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
          return { status: r.status, error: text.slice(0, 800) };
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

async function confirm(answer) {
  let json = answer.json;
  for (let i = 0; i < 8; i++) {
    const row = Array.isArray(json) ? json[0] : json;
    const replyId = row?.id;
    const needs = row?.message || row?.messageIds;
    if (!replyId || !needs) return { json, status: answer.status };
    const reply = await call(`iserver/reply/${replyId}`, {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    });
    json = reply.json;
    answer = reply;
  }
  return answer;
}

async function ledger() {
  const l = await call(`portfolio/${accountId}/ledger`);
  const out = {};
  for (const [ccy, row] of Object.entries(l.json || {})) {
    if (row && typeof row === "object") out[ccy] = { bal: row.cashbalance, settled: row.settledcash };
  }
  return out;
}

const before = await ledger();
const fxOrder = {
  acctId: accountId,
  conid: FX_CONID,
  secType: "CASH",
  orderType: "MKT",
  side: "SELL",
  quantity: 10,
  tif: "DAY",
  isCcyConv: true,
};
const fxPreview = await call(`iserver/account/${accountId}/orders/whatif`, {
  method: "POST",
  body: JSON.stringify({ orders: [fxOrder] }),
});
const fxPlaced = await confirm(
  await call(`iserver/account/${accountId}/orders`, {
    method: "POST",
    body: JSON.stringify({ orders: [fxOrder] }),
  })
);

await sleep(2500);
const afterFx = await ledger();

async function lastPrice(conid) {
  for (let i = 0; i < 6; i++) {
    const snap = await call(`iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86`);
    const row = Array.isArray(snap.json) ? snap.json[0] : null;
    const n = Number(String(row?.["31"] ?? row?.["84"] ?? row?.["86"] ?? "").replace(/[^0-9.]/g, ""));
    if (n > 0) return n;
    await sleep(800);
  }
  return null;
}

const price = await lastPrice(TPE_CONID);
const stockOrder = {
  conid: TPE_CONID,
  orderType: "LMT",
  price,
  side: "BUY",
  quantity: 1,
  tif: "DAY",
  secType: `${TPE_CONID}:STK`,
  exchange: "WSE",
};
const stockPreview = await call(`iserver/account/${accountId}/orders/whatif`, {
  method: "POST",
  body: JSON.stringify({ orders: [stockOrder] }),
});

let stockPlaced = null;
let stockSold = null;
if (BUY_STOCK && (stockPreview.json?.amount?.commission === "—" || stockPreview.json?.errors)) {
  stockPlaced = await confirm(
    await call(`iserver/account/${accountId}/orders`, {
      method: "POST",
      body: JSON.stringify({ orders: [stockOrder] }),
    })
  );
  await sleep(3000);
  const sell = { ...stockOrder, side: "SELL", price: Number((price * 0.98).toFixed(3)) };
  stockSold = await confirm(
    await call(`iserver/account/${accountId}/orders`, {
      method: "POST",
      body: JSON.stringify({ orders: [sell] }),
    })
  );
}

const after = await ledger();
const out = {
  before,
  fxPreview: fxPreview.json,
  fxPlaced: fxPlaced.json,
  afterFx,
  price,
  stockPreview: stockPreview.json,
  stockPlaced: stockPlaced?.json ?? null,
  stockSold: stockSold?.json ?? null,
  after,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      before,
      fxPreview: fxPreview.json?.amount,
      fxPlaced: Array.isArray(fxPlaced.json) ? fxPlaced.json[0]?.order_id || fxPlaced.json[0]?.orderId || fxPlaced.json[0] : fxPlaced.json,
      afterFx,
      tpe: price,
      stockPreview: {
        commission: stockPreview.json?.amount?.commission,
        amount: stockPreview.json?.amount,
        errors: stockPreview.json?.errors,
      },
      bought: Boolean(stockPlaced),
      after,
    },
    null,
    2
  )
);
await browser.disconnect();
