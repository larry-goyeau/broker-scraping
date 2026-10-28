// What GBM+ (GBM Grupo Bursátil Mexicano, Casa de Bolsa) sells in shares and
// exchange-traded funds, with no login. The GBM app has two trading
// accounts: Trading MX (the Bolsa Mexicana de Valores and its Sistema
// Internacional de Cotizaciones) and Trading USA (US shares and fractions,
// held through DriveWealth). GBM prints no list for either.
//
// Fees: the investment-services guide (07/26) charges "Ejecución de
// operaciones sobre Instrumentos de Renta Variable a través de las
// plataformas GBM y GBM+: Hasta .25%" per trade, "el uso de la plataforma
// no tiene costo", tiered down to 0.10% by the last three months' volume,
// plus IVA. Its "Clases de valores" are securities "inscritos en el
// Registro Nacional de Valores ... o listados en el Sistema Internacional
// de Cotizaciones, de la Bolsa Mexicana de Valores", among them "Acciones",
// "Fibras", "Vehículos de Inversión Colectiva (como ETFs, u otros)" and
// "Acciones y fracciones de acciones en el extranjero (DriveWealth)".
//
// Mexico. The trading page: "Acciones de México: Invierte directamente en
// empresas que cotizan en la Bolsa Mexicana de Valores", FIBRAs and ETFs,
// and "Invierte en la Bolsa Mexicana de Valores, el SIC, Nasdaq, NYSE y
// más". BIVA is not named, so the Mexican part is the whole BMV book, its
// local board and the SIC, read by ../actinvertrade/bmvBook.mjs: shares,
// depositary receipts, FIBRAs, ETFs, ETCs and the listed investment trusts
// the SIC quotes, in pesos. Left out there: CKD and CERPI certificates,
// other trust and mutual-fund certificates, warrants and rights, lines
// that never traded, Mexican lines with no trade for over a year
// (suspended or delisted) and SIC lines with no BMV trade for over a year
// whose home listing is gone. Some SIC lines are open only to qualified
// investors: that depends on the client, a remark, not a removal.
//
// United States (Trading USA, through DriveWealth). The trading page:
// "Acciones de Estados Unidos: Invierte con títulos completos o
// fraccionados en las empresas más destacadas de la Bolsa de Nueva York y
// Nasdaq", and ETFs, "Portafolios diversificados que cotizan en bolsa". No
// US list, so the owner's rule for a place with no list applies: the whole
// US exchange book of the day (../wellstrade/usBook.mjs), less what GBM's
// words leave out:
// - no market restriction: the trading page says "Nasdaq, NYSE y más",
//   which implies other US exchanges, so the whole US book stays (owner's
//   rule, 2026-10-25: places named as examples mean the whole country);
// - ETFs (and the ETNs the US books file with them): no market is named
//   for them, so every US-listed one stays.
// Stated count: the home page says "un ecosistema de más de 6,000
// instrumentos financieros nacionales y extranjeros". The owner's rule
// (2026-10-25): a stated number N means the N most popular titles, so the
// whole catalogue (BMV, SIC and US) is cut to the 6,000 most traded
// instruments. An instrument is an ISIN (AAPL on the SIC and AAPL in the
// US are one, kept with both rows); its popularity is the larger of its
// lines' 30-day average traded value in dollars, from TradingView's
// Mexico scanner for BMV and SIC lines and its US scanner
// (../tfcapital/usTop.mjs) for US lines, market value as a fallback. The
// number is read from the page at run time.
//   https://gbm.com/
//   https://scanner.tradingview.com/mexico/scan
// No page names an OTC,
// leveraged-ETF or price exception. usBook drops warrants, rights, units,
// when-issued lines, listed notes and lines with an open trade halt;
// bonds go through withoutObligations. The US is one NBBO market: one row
// per title, on its listing market, in dollars; a SIC line (AAPL in pesos
// on the BMV) and the US line are two places, two rows. broker-list.json
// gives the Bolsa Mexicana, NYSE and Nasdaq, the same places.
//
//   https://gbm.com/trading/
//   https://global.gbm.com/wp-content/uploads/2026/08/03140239/Guia-de-Servicios-GBM_v3.pdf   (fees, p. 17-18)
//
// Run (the BMV book is about 230 TradingView calls, kept 12 hours):
//   node brokers/gbm/gbm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usActivity } from "../tfcapital/usTop.mjs";
import { toUsd } from "../../fx.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://gbm.com/trading/", [
  /empresas que cotizan en la Bolsa Mexicana de Valores/,
  /empresas más destacadas de la Bolsa de Nueva York y Nasdaq/,
  /Invierte en la Bolsa Mexicana de Valores, el SIC, Nasdaq, NYSE y más/,
  /ETFs Portafolios diversificados que cotizan en bolsa/,
]);

const home = await (await fetch("https://gbm.com/", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) })).text();
const stated = Number(home.match(/ecosistema de más de ([\d,]+) instrumentos financieros nacionales y extranjeros/)?.[1]?.replace(/,/g, ""));
if (!(stated >= 1000)) throw new Error("gbm.com no longer states its number of instruments");

// BMV ticker (TradingView's name, GMEXICO/B) -> { value, cap } in dollars.
async function mexicoActivity() {
  const response = await fetch("https://scanner.tradingview.com/mexico/scan", {
    method: "POST",
    headers: { "User-Agent": UA, Origin: "https://www.tradingview.com", "Content-Type": "application/json" },
    body: JSON.stringify({ columns: ["name", "close", "average_volume_30d_calc", "market_cap_basic", "currency"], range: [0, 10000] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`TradingView Mexico scan answered ${response.status}`);
  const json = await response.json();
  if (!Array.isArray(json.data) || json.data.length < 2000) throw new Error(`TradingView Mexico scan has ${json.data?.length ?? 0} lines`);
  const map = new Map();
  for (const { d } of json.data) {
    const [name, close, volume, cap, currency] = d;
    const value = Number(close) > 0 && Number(volume) > 0 ? toUsd(Number(close) * Number(volume), currency || "MXN") || 0 : 0;
    // A title shows once per Mexican venue (BMV and BIVA): keep the busier line.
    const key = String(name).toUpperCase();
    const old = map.get(key);
    if (!old || value > old.value) map.set(key, { value, cap: Number(cap) > 0 ? toUsd(Number(cap), currency || "MXN") || 0 : 0 });
  }
  return map;
}

const { rows: mx, dropped, quiet } = await bmvBook();
for (const ticker of ["WALMEX", "FUNO/11", "AAPL", "NAFTRAC/ISHRS"]) if (!mx.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the BMV book`);

const book = await usBook();
const us = book;
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);

const all = stampRows(withoutObligations([...mx, ...us]));
const [mxActivity, usActive] = await Promise.all([mexicoActivity(), usActivity()]);
const groups = new Map();
for (const row of all) {
  const key = row.isin || `${row.mic}|${row.ticker}`;
  const hit = row.mic === "XMEX" ? mxActivity.get(String(row.ticker).toUpperCase()) : usActive.get(row.ticker) || usActive.get(row.ticker.replace(/\./g, " "));
  const group = groups.get(key) || { rows: [], value: 0, cap: 0, ticker: row.ticker };
  group.rows.push(row);
  group.value = Math.max(group.value, hit?.value || 0);
  group.cap = Math.max(group.cap, hit?.cap || 0);
  groups.set(key, group);
}
const ranked = [...groups.values()].sort((a, b) => (b.value > 0) - (a.value > 0) || b.value - a.value || b.cap - a.cap || a.ticker.localeCompare(b.ticker));
const kept = ranked.slice(0, stated);
const rows = kept.flatMap((group) => group.rows);
for (const ticker of ["WALMEX", "AAPL", "SPY", "NAFTRAC/ISHRS"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} fell out of the top ${stated}`);
if (kept.length < stated) throw new Error(`only ${kept.length} instruments for a stated ${stated}`);
fs.writeFileSync(new URL("gbm-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
const last = kept[kept.length - 1];
console.error(`top ${stated} of ${groups.size} instruments (${all.length} rows); cut-off ${last.ticker} ${Math.round(last.value).toLocaleString("en-US")} USD a day`);
console.error(`BMV: dropped ${dropped.length}, quiet SIC kept ${quiet.length}`);
console.error(`US directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, items] of Object.entries(book.report.leftOut)) if (items.length) console.error(`US left out ${items.length} ${what}`);
