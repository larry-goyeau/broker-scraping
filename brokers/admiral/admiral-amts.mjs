// Signed AMTS snapshot / close for the live Invest.MT5 USD account.
// Does not open. Chrome must be on admiralmarkets.com with the session live.
//
//   node admiral/admiral-amts.mjs            # positions + recent deals
//   node admiral/admiral-amts.mjs --close    # close the first open position

import puppeteer from "puppeteer-core";
import crypto from "node:crypto";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLOSE = process.argv.includes("--close");

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const page = (await browser.pages()).find((p) => /admiralmarkets\.com/i.test(p.url()));
if (!page) throw new Error("no admiral tab");
await page.bringToFront();

async function callJson(url, headers, body) {
  const method = body === undefined ? "GET" : "POST";
  return page.evaluate(
    async (url, headers, payload, method) => {
      const response = await fetch(url, {
        method,
        headers,
        ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
      });
      const text = await response.text();
      try {
        return { status: response.status, payload: JSON.parse(text) };
      } catch {
        return { status: response.status, payload: null, text: text.slice(0, 800) };
      }
    },
    url,
    headers,
    body,
    method
  );
}

const client = await page.createCDPSession();
await client.send("Network.enable");
let authorization = null;
client.on("Network.requestWillBeSent", (e) => {
  if (!e.request.url.startsWith("https://api.admiralmarkets.com/")) return;
  authorization = e.request.headers.Authorization || e.request.headers.authorization || authorization;
});
await page.reload({ waitUntil: "domcontentloaded" });
for (let i = 0; i < 40 && !authorization; i++) await sleep(250);
if (!authorization) throw new Error("no auth");

const accounts = await callJson(
  "https://api.admiralmarkets.com/accounts/",
  { Authorization: authorization, "Api-Client": "nt_web", "Content-Type": "application/json" }
);
const real = accounts.payload?.REAL?.accounts || [];
const invests = real.filter((a) => a.trade_type_id === 20);
let invest = null;
let login = null;
for (const candidate of invests) {
  const attempt = await callJson(
    "https://api.admiralmarkets.com/trade/v1/login/",
    { Authorization: authorization, "Api-Client": "nt_web", "Content-Type": "application/json" },
    { tr_account_id: candidate.id, app_id: 3, version: 16, offline_mode: true }
  );
  if (attempt.payload?.account_currency === "USD") {
    invest = candidate;
    login = attempt;
    break;
  }
}
if (!invest || !login?.payload) throw new Error("pas de compte Invest.MT5 USD");

const hmac = (g) => {
  if (typeof g === "string") return g;
  if (typeof g === "number") return g.toString();
  if (g && typeof g === "object") {
    return Object.keys(g)
      .sort()
      .reduce((y, k) => {
        if (Array.isArray(g[k])) return y + `${k}=${g[k].map(hmac).join("")}`;
        if (g[k] && typeof g[k] === "object") return y + `${k}=${hmac(g[k])}`;
        return y + `${k}=${g[k]}`;
      }, "");
  }
  return String(g ?? "");
};
const sign = (data, token, pin) => {
  const withToken = { ...data, token };
  const sorted = Object.keys(withToken)
    .sort()
    .reduce((o, k) => ({ ...o, [k]: withToken[k] }), {});
  return {
    ...sorted,
    secret: crypto.createHash("sha1").update(hmac(sorted) + pin).digest("hex"),
  };
};

const token = login.payload.amts_token;
const pin = login.payload.amts_pin;
const headers = { "Api-Client": "nt_web", "Content-Type": "application/json" };
const ACCOUNT = "https://login-live.trade.admiralmarkets.com/";
const TRADE = "https://trade-live.trade.admiralmarkets.com/";
const amts = (host, data) => callJson(host, headers, sign({ version: 16, app_id: 3, ...data }, token, pin));

const account = await amts(ACCOUNT, { method: "req_account" });
const positions = await amts(ACCOUNT, { method: "req_positions" });
const pos = positions.payload?.result?.positions || [];

let close = null;
if (CLOSE && pos[0]) {
  close = await amts(TRADE, {
    method: "req_trade",
    req_id: 1,
    trade: { position_id: pos[0].id, action: "CLOSE" },
  });
  await sleep(2500);
}

const after = CLOSE
  ? {
      account: await amts(ACCOUNT, { method: "req_account" }),
      positions: await amts(ACCOUNT, { method: "req_positions" }),
    }
  : null;

const history = await amts(ACCOUNT, {
  method: "req_deals_history",
  ts_from: Date.now() - 3600_000,
  ts_to: Date.now() + 60_000,
});

console.log(
  JSON.stringify(
    {
      on: new Date().toISOString(),
      login: login.payload.mt_account_id,
      currency: login.payload.account_currency,
      account: account.payload?.result?.user_account,
      positions: pos,
      close,
      after: after
        ? {
            account: after.account.payload?.result?.user_account,
            positions: after.positions.payload?.result?.positions,
          }
        : null,
      history: history.payload?.result?.deals,
    },
    null,
    2
  )
);
await browser.disconnect();
