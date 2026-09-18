// Read-only: cash + trading conditions for Saxo venues with no published line.
// Steals the in-memory bearer from the signed-in SaxoTrader tab. No orders.
//
//   node saxo/saxo-ticket-probe.mjs

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const OUT = new URL("saxo-ticket-probe.json", import.meta.url);
const NO_LINE = ["FSE", "FFT", "OSE", "EGO", "WSE", "PRA", "LUX", "MALAY", "LSE_INTL"];

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 90000,
});
const page = (await browser.pages()).find((p) => /saxotrader/i.test(p.url()));
if (!page) throw new Error("No SaxoTrader tab on :9222");

const cdp = await page.createCDPSession();
await cdp.send("Network.enable");

let stolen = null;
const steal = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no OpenAPI call in 25s")), 25000);
  const grab = (ev) => {
    const url = ev.request?.url || "";
    const headers = ev.request?.headers || ev.headers || {};
    const auth = headers.Authorization || headers.authorization;
    if (!auth || !/openapi/i.test(url)) return;
    const client = /ClientKey=([^&]+)/.exec(url)?.[1];
    const account = /AccountKey=([^&]+)/.exec(url)?.[1];
    clearTimeout(timer);
    cdp.off("Network.requestWillBeSent", grab);
    resolve({
      token: auth.replace(/^Bearer\s+/i, ""),
      clientKey: client ? decodeURIComponent(client) : null,
      accountKey: account ? decodeURIComponent(account) : null,
    });
  };
  cdp.on("Network.requestWillBeSent", grab);
});
const load = /saxotrader\.com\/d\//i.test(page.url())
  ? page.reload({ waitUntil: "domcontentloaded" })
  : page.goto("https://www.saxotrader.com/d/trading/open-positions?assetType=Etf&uic=15914348", {
      waitUntil: "domcontentloaded",
    });
stolen = await steal;
await load.catch(() => {});
await new Promise((r) => setTimeout(r, 800));

const api = (path) =>
  page.evaluate(
    async (target, token) => {
      try {
        const response = await fetch(`/openapi${target}`, {
          credentials: "include",
          headers: { authorization: `Bearer ${token}` },
        });
        const text = await response.text();
        try {
          return { status: response.status, json: JSON.parse(text) };
        } catch {
          return { status: response.status, error: text.slice(0, 400) };
        }
      } catch (error) {
        return { error: String(error) };
      }
    },
    path,
    stolen.token
  );

const pick = (row) =>
  row
    ? {
        uic: row.Identifier ?? row.Uic,
        symbol: row.Symbol,
        name: row.Description,
        type: row.AssetType,
        ccy: row.CurrencyCode,
        exchange: row.ExchangeId || row.Exchange?.ExchangeId,
        isin: row.IsinCode || row.Isin,
      }
    : null;

const me = await api("/port/v1/users/me");
const accounts = await api("/port/v1/accounts/me");
const balances = stolen.accountKey
  ? await api(
      `/port/v1/balances?ClientKey=${encodeURIComponent(stolen.clientKey || me.json?.ClientKey || "")}&AccountKey=${encodeURIComponent(stolen.accountKey)}`
    )
  : await api("/port/v1/balances/me");

const account =
  (accounts.json?.Data || []).find((a) => a.AccountKey === stolen.accountKey) ||
  (accounts.json?.Data || []).find((a) => a.AccountType === "Normal") ||
  (accounts.json?.Data || [])[0];
const accountKey = stolen.accountKey || account?.AccountKey;

const samples = {};
for (const exchange of [...NO_LINE, "XETR"]) {
  const hit = await api(
    `/ref/v1/instruments?ExchangeId=${encodeURIComponent(exchange)}&AssetTypes=Stock,Etf&$top=20&IncludeNonTradable=false`
  );
  const rows = (hit.json?.Data || []).map(pick);
  const live =
    exchange === "FFT"
      ? rows.filter((r) => r && !/wirecard/i.test(r.name || "") && !/:xetr$/i.test(r.symbol || ""))
      : rows;
  samples[exchange] = {
    status: hit.status,
    n: rows.length,
    rows: (live.length ? live : rows).slice(0, 6),
    error: hit.error,
    message: hit.json?.Message,
  };
}

function slimInstrument(json) {
  if (!json || typeof json !== "object") return json;
  return {
    Symbol: json.Symbol,
    Description: json.Description,
    Exchange: json.Exchange,
    CurrencyCode: json.CurrencyCode,
    AmountCurrency: json.AmountCurrency,
    CommissionLimits: json.CommissionLimits,
    ExchangeFeeRules: json.ExchangeFeeRules,
    Taxes: json.Taxes,
    CurrencyConversion: json.CurrencyConversion,
    IsTradable: json.IsTradable,
  };
}

function slimCost(json) {
  if (!json || typeof json !== "object") return json;
  return {
    Currency: json.Currency,
    Cost: json.Cost,
    CostInAccountCurrency: json.CostInAccountCurrency,
    CostComponents: json.CostComponents,
    Commission: json.Commission,
    TradingCost: json.TradingCost,
    keys: Object.keys(json),
  };
}

const conditions = [];
for (const [exchange, pack] of Object.entries(samples)) {
  const row = pack.rows.find((r) => r?.uic) || pack.rows[0];
  if (!row?.uic || !accountKey) continue;
  const type = row.type || "Stock";
  const inst = await api(
    `/cs/v1/tradingconditions/instrument/${encodeURIComponent(accountKey)}/${row.uic}/${type}`
  );
  const cost1 = await api(
    `/cs/v1/tradingconditions/cost/${encodeURIComponent(accountKey)}/${row.uic}/${type}?Amount=1`
  );
  const costBig = await api(
    `/cs/v1/tradingconditions/cost/${encodeURIComponent(accountKey)}/${row.uic}/${type}?Amount=10000`
  );
  conditions.push({
    exchange,
    sample: row,
    instrumentStatus: inst.status,
    instrument: slimInstrument(inst.json),
    instrumentError: inst.error || inst.json?.Message,
    cost1: slimCost(cost1.json),
    costBig: slimCost(costBig.json),
    costError: cost1.error || cost1.json?.Message,
  });
}

const cash = balances.json || {};
const out = {
  url: page.url(),
  account: account
    ? {
        AccountId: account.AccountId,
        Currency: account.Currency,
        AccountType: account.AccountType,
      }
    : null,
  cash: {
    Currency: cash.Currency,
    CashBalance: cash.CashBalance,
    CashAvailableForTrading: cash.CashAvailableForTrading,
    TotalValue: cash.TotalValue,
    TransactionsNotBooked: cash.TransactionsNotBooked,
  },
  samples,
  conditions,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      url: out.url,
      account: out.account,
      cash: out.cash,
      sampleCounts: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, { n: v.n, status: v.status, msg: v.message }])),
      tickets: conditions.map((c) => ({
        exchange: c.exchange,
        symbol: c.sample?.symbol,
        limits: c.instrument?.CommissionLimits,
        one: c.cost1?.Cost?.Long?.TradingCost?.Commissions,
        big: c.costBig?.Cost?.Long?.TradingCost?.Commissions,
      })),
    },
    null,
    2
  )
);

await browser.disconnect();
