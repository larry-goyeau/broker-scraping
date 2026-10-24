// What CCBolsa (Consorcio Corredores de Bolsa, Chile) sells online, with
// no login. Its shares page says that through www.ccbolsa.cl "podrás
// comprar y vender todas las Acciones que se transan en la Bolsa de
// Comercio de Santiago"; it names no other market and no ETF. So the book
// is the Santiago exchange's own share price list.
//
//   https://www.ccbolsa.cl/apps/script/modulos/productos/productos-acciones.asp
//   https://www.ccbolsa.cl/apps/script/modulos/preguntas/preguntas-frecuentes.asp  (fees)
//   https://www.bolsadesantiago.com/acciones_precios
//   https://www.bolsadesantiago.com/api/RV_ResumenMercado/getAccionesPrecios  (NEMO, ISIN, MONEDA, flags)
//   https://www.bolsadesantiago.com/api/RV_ResumenMercado/getInstrumentos     (NEMO, RAZON_SOCIAL)
//
// The price list has three kinds of line: Chilean shares, foreign shares
// (flag VALORES_EXTRANJEROS) and foreign ETFs (flag ETFs_EXTRANJEROS).
// Kept, in pesos: the Chilean shares, the foreign shares, the foreign ETFs
// (SGOVCL, an iShares ETF the exchange files as a foreign share, among
// them) and the Chilean ETFs, which are either a mutual-fund line
// (CFMITNIPSA, It Now MSCI IPSA) or an investment-fund line (CFI*, Singular
// and BTG Pactual "ETF"). CCBolsa sells "todas las Acciones que se transan
// en la Bolsa de Comercio de Santiago" with no list of its own: the
// instrument list behind its share pages (../../asp/rutinasAC.asp?ejecutar=1)
// is years old (CHILESAT, BANMEDICA) and has no foreign line at all, yet it
// already holds fund lines (CFIPIONERO, CFIMBIRF-A, CFM-BTGEMI, CFMITNIPSA),
// so the order screen is not limited to company shares. All these lines
// trade on the same Santiago equity platform. A CFI* line whose name is not
// an ETF is an ordinary investment fund and stays out.
// Left out: a line quoted in dollars. CCBolsa has a dollar cash account
// ("Caja Dólar", Manual_FFII.pdf and ManualCVDolar.pdf), but it serves only
// the Fondos Internacionales (AllFunds) and the purchase of dollars; the
// share manual (Manual_Trading_Acciones.pdf) gives its minimums in pesos
// ($45.000 buy, $50.000 sell) and names no dollar line. A foreign share
// quoted in both currencies is two lines (KO in USD, KOCL in CLP); the
// peso line is the one kept.
// The ISIN is the exchange's own; a line without one gets the ticker's
// BCS ISIN in ../../assets/stocks.csv when there is exactly one.
//
// bolsadesantiago.com answers its API only to a browser that its bot
// manager has seen, so the calls are made from inside the page in the
// local Chrome (started with --remote-debugging-port=9222), with the
// site's own CSRF token.
//
//   node brokers/ccbolsa/ccbolsa_scraping.mjs

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGE = "https://www.bolsadesantiago.com/acciones_precios";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = await browser.newPage();
let lists = null;
try {
  for (let attempt = 0; attempt < 5 && !lists; attempt += 1) {
    await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(10_000);
    lists = await page.evaluate(async () => {
      const call = async (path) => {
        const token = await (await fetch("/api/Securities/csrfToken")).json();
        const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json;charset=UTF-8", "X-CSRF-Token": token.csrf }, body: "{}" });
        if (!response.ok) return null;
        return (await response.json()).listaResult;
      };
      const prices = await call("/api/RV_ResumenMercado/getAccionesPrecios");
      const names = await call("/api/RV_ResumenMercado/getInstrumentos");
      return Array.isArray(prices) && Array.isArray(names) ? { prices, names } : null;
    });
  }
} finally {
  await page.close();
  browser.disconnect();
}
if (!lists) throw new Error("bolsadesantiago.com refused the price list five times");

const nameOf = new Map(lists.names.map((row) => [row.NEMO, String(row.RAZON_SOCIAL || "").replace(/\s+/g, " ").trim()]));

// BCS ticker -> ISINs in the shared catalogue (SQM-B is BCS:SQM_B there).
const catalogue = new Map();
for (const line of fs.readFileSync(STOCKS, "utf8").split(/\r?\n/)) {
  const [ticker, place, isin] = line.split(",");
  if (place !== "BCS" || !ISIN.test(isin || "")) continue;
  const code = ticker.split(":").pop().replace(/_/g, "-");
  if (!catalogue.has(code)) catalogue.set(code, new Set());
  catalogue.get(code).add(isin);
}

const rows = [];
const seen = new Set();
const left = { fund: 0, dollar: 0 };
const counts = {};
for (const line of lists.prices) {
  const ticker = String(line.NEMO || "").trim();
  if (!ticker) continue;
  const foreign = Boolean(line.VALORES_EXTRANJEROS);
  const name = nameOf.get(ticker) || ticker;
  const etf = /\bETF\b/i.test(name);
  const foreignEtf = Boolean(line.ETFs_EXTRANJEROS) || (foreign && etf);
  if (/^CFI/.test(ticker) && !etf) { left.fund += 1; continue; }
  if (line.MONEDA !== "CLP") { left.dollar += 1; continue; }
  if (seen.has(ticker)) continue;
  seen.add(ticker);
  let isin = ISIN.test(line.ISIN || "") ? line.ISIN : "";
  if (!isin && catalogue.get(ticker)?.size === 1) isin = [...catalogue.get(ticker)][0];
  const kind = foreignEtf ? "foreign ETF" : foreign ? "foreign share" : etf ? "Chilean ETF" : "Chilean share";
  rows.push({ query: ticker, ticker, name, exchange: "BCS", mic: "XSGO", currency: "CLP", type: foreignEtf || etf ? "ETF" : "STOCK", isin, raw: [ticker, name, isin, "CLP", kind].filter(Boolean).join(" | ") });
  counts[kind] = (counts[kind] || 0) + 1;
}
if ((counts["Chilean share"] || 0) < 150) throw new Error(`only ${counts["Chilean share"] || 0} Chilean shares`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = withoutObligations(rows);
fs.writeFileSync(new URL("ccbolsa-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
console.error(counts);
console.error(`${kept.length} peso lines, ${kept.filter((row) => row.isin).length} with an ISIN; left out ${left.fund} non-ETF CFI lines (investment funds), ${left.dollar} dollar lines`);
