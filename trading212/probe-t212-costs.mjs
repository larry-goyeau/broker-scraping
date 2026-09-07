// Trading212's MiFID ex-ante cost disclosure, `rest/v2/public/added-costs`, is the broker
// itemising its own bill before anything is bought: commission, conversion, and — the reason this
// probe exists — the transaction taxes a share pays where an ETF pays none. Free to ask, so stamp
// duty, the takeover levy and the American regulatory fees are settled without spending a cent.
//
// The header that makes it answer is `X-Trader-Target-Type: EQUITY`. Without it every equity call
// comes back "Invalid account session cookie" even from inside the logged-in page, which reads
// like an authentication problem and is not one.
//
// One line per tax regime rather than broad coverage: what separates these instruments is which
// taxes attach to them, and that is exactly what the disclosure names.
//
//   node trading212/probe-t212-costs.mjs
//   node trading212/probe-t212-costs.mjs HSBAl_EQ --shares=100

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const OUT = new URL("t212-disclosure.json", import.meta.url);
const flag = (name, fallback = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : fallback;
};

const catalogue = JSON.parse(fs.readFileSync(new URL("trading212-parsed.json", import.meta.url), "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const byCode = new Map(rows.map((r) => [r.code, r]));
const byTicker = (t, exchange) => rows.find((r) => r.ticker === t && (!exchange || r.exchange === exchange));

// Chosen for contrast: a British share pays stamp duty and a takeover levy, an Irish one pays a
// higher duty on the same exchange, France, Italy and Spain each levy their own transaction tax,
// Germany levies none, America charges regulatory fees on the sale, and a fund escapes all of it.
const REGIMES = [
  ["action britannique", byTicker("HSBA", "London Stock Exchange")?.code],
  ["action irlandaise à Londres", byTicker("CRH", "London Stock Exchange")?.code ?? byTicker("RYA")?.code],
  ["action française", byTicker("MC", "Euronext Paris")?.code],
  ["action italienne", byTicker("ENI", "Borsa Italiana")?.code ?? rows.find((r) => r.exchange === "Borsa Italiana" && r.type === "STOCK")?.code],
  ["action espagnole", byTicker("SAN", "Bolsa de Madrid")?.code],
  ["action néerlandaise", byTicker("ASML", "Euronext Amsterdam")?.code],
  ["action belge", rows.find((r) => r.exchange === "Euronext Brussels" && r.type === "STOCK")?.code],
  ["action allemande", byTicker("SAP", "Deutsche Börse Xetra")?.code],
  ["action allemande (Gettex)", rows.find((r) => r.exchange === "Gettex" && r.type === "STOCK")?.code],
  ["action américaine (NASDAQ)", byTicker("AAPL", "NASDAQ")?.code],
  ["action américaine (NYSE)", byTicker("KO", "NYSE")?.code ?? rows.find((r) => r.exchange === "NYSE" && r.type === "STOCK")?.code],
  ["action hors cote", rows.find((r) => r.exchange === "OTC Markets" && r.type === "STOCK")?.code],
  ["action canadienne", rows.find((r) => r.exchange === "Toronto Stock Exchange" && r.type === "STOCK")?.code],
  ["action suisse", rows.find((r) => r.exchange === "SIX Swiss Exchange" && r.type === "STOCK")?.code],
  ["action autrichienne", rows.find((r) => r.exchange === "Wiener Börse" && r.type === "STOCK")?.code],
  ["ETF Xetra", byTicker("EUNL", "Deutsche Börse Xetra")?.code],
  ["ETF Londres", byTicker("IAUP", "London Stock Exchange")?.code ?? rows.find((r) => r.exchange === "London Stock Exchange" && r.type === "ETF")?.code],
];

const asked = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const plan = asked.length ? asked.map((c) => [byCode.get(c)?.name || c, c]) : REGIMES;
const SHARES = Number(flag("shares", "1"));
// A sale is disclosed as a negative quantity. It matters because several charges are one-sided:
// the American regulatory fees fall on the sale alone, the European transaction taxes on the
// purchase alone, and a buy-only reading would miss half the bill in both directions.
const SIDES = flag("sides", "both") === "buy" ? [1] : flag("sides") === "sell" ? [-1] : [1, -1];

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("app.trading212.com"));
if (!page) throw new Error("aucun onglet app.trading212.com ouvert.");

// The client string identifies the browser session; it is read from the app's own cookie rather
// than invented, since the session is validated against it.
const traderClient = await page.evaluate(() => {
  const uuid = document.cookie.match(/[0-9a-f]{32}=%22([0-9a-f-]{36})%22/)?.[1] ?? "";
  return `application=WC4,version=8.46.0,dUUID=${uuid}`;
});

const api = (method, path, body) =>
  page.evaluate(
    async (m, p, b, client) => {
      try {
        const r = await fetch(`https://live.services.trading212.com${p}`, {
          method: m,
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Trader-Client": client, "X-Trader-Target-Type": "EQUITY" },
          ...(b === null ? {} : { body: JSON.stringify(b) }),
        });
        const text = await r.text();
        try {
          return { status: r.status, json: JSON.parse(text) };
        } catch {
          return { status: r.status, text: text.slice(0, 300) };
        }
      } catch (e) {
        return { status: 0, text: String(e) };
      }
    },
    method,
    path,
    body === undefined ? null : body,
    traderClient
  );

const results = [];
for (const [label, code] of plan) {
  if (!code) {
    results.push({ label, error: "aucune ligne au catalogue" });
    continue;
  }
  const row = byCode.get(code) || null;
  const order = {
    quantity: SHARES,
    instrumentCode: code,
    currencyCode: row?.currency || "EUR",
    orderType: "MARKET",
    timeValidity: "GOOD_TILL_CANCEL",
    enabledExtendedMarketHours: false,
  };
  for (const side of SIDES) {
    const signed = { ...order, quantity: SHARES * side };
    const a = await api("POST", "/rest/v2/public/added-costs", signed);
    results.push({ label, code, row, side: side > 0 ? "achat" : "vente", order: signed, status: a.status, disclosure: a.json ?? a.text });
  }
}

fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), shares: SHARES, results }, null, 2));

// The taxes are the point, so the named lines are pulled out rather than left in the dump.
const shown = (r) => {
  const c = r.disclosure?.costs ?? {};
  const named = Object.entries(c).filter(([, v]) => Number(v) !== 0);
  if (!named.length) return "rien";
  const base = Number(r.disclosure.orderValue) || 0;
  return named
    .map(([k, v]) => `${k} ${v}${base ? ` (${((100 * Math.abs(v)) / base).toFixed(4)} %)` : ""}`)
    .join("  ");
};

console.log(`divulgation pour ${SHARES} part(s)\n`);
for (const r of results) {
  if (r.error) {
    console.log(`— ${r.label.padEnd(28)} ${r.error}`);
    continue;
  }
  const v = r.disclosure?.orderValue;
  console.log(
    `— ${r.label.padEnd(28)} ${String(r.row?.ticker ?? r.code).padEnd(7)} ${String(r.row?.currency).padEnd(4)} ` +
      `${r.side.padEnd(6)} ${String(v ?? "").padStart(9)}  ${r.status === 200 ? shown(r) : JSON.stringify(r.disclosure).slice(0, 120)}`
  );
}
console.log(`\nécrit dans trading212/t212-disclosure.json`);

await browser.disconnect();
