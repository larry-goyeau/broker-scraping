// What Max Capital sells in Buenos Aires shares and CEDEARs, with no login.
// Max Capital S.A. is an agent of BYMA (ALyC y AN integral n° 570 CNV). The
// search box of its quote pages (max.capital/mercados/cotizaciones) loads
// one public index, /api/cotizaciones/buscador/, that names every symbol
// the site quotes with its kind. The "acciones" entries (local shares, with
// their MEP D and cable C lines: GGAL, GGALD, GGALC) and the "cedears"
// entries (every CEDEAR, ETF certificates such as SPY, QQQ and IBIT
// included, with their D and C lines) are the catalogue. Bonds, letras,
// obligaciones negociables, options, futures and funds are other kinds of
// the same index and stay out.
//
// The site sits behind a Cloudflare rule that answers 403 to scripts (curl
// and Node alike) while a browser reads it. The scraper asks the index
// first; when it is refused it reads maxcapital-cache.json in this folder,
// the same index's acciones and cedears entries saved from a browser on the
// date the file names. Refresh that file from a browser (open
// https://www.max.capital/api/cotizaciones/buscador/ and keep the entries of
// type acciones and cedears) when the scraper says the cache is old.
//
// The index names the BYMA symbol only. Its currency, type and ISIN come
// from BYMA's open data (../comafi/byma.mjs, shared with brokers/comafi and
// brokers/gio): a symbol BYMA no longer quotes, a block line (ALUAB, GGALB)
// and a kind that is not a share, a CEDEAR or an ADR are not written, nor a
// line BYMA lists but has not seen a trade on in two years. Every line with
// no trade today on BYMA is looked up in BYMA's history, whatever bid,
// offer or previous close it shows: BYMA prints placeholder quotes on dead
// lines (read 2026-10-22: TIIAC previous close 0.01, ADS bid 0.01; neither
// has a day of volume in two years), so a quote does not prove a market.
// Of two lines of one certificate, currency and settlement only the newer
// BYMA instrument is written: Southern Copper's MEP line SCCOD (instrument
// 3128255) is kept, the legacy SCOOD (1941369, last trade 2026-07-17) is
// not.
//
// Cable lines (C) are kept next to the MEP (D) lines, because Max lets
// clients hold cable dollars. Its help centre, "¿En qué monedas se puede
// operar desde la cuenta comitente?": "Dólar CCL o cable: Es utilizado para
// operaciones con cuentas bancarias del exterior"; its fee page charges
// "Transferencia electrónica de dólares divisa internacional USD 25".
//   https://ayuda.max.capital/es/articles/11044783-en-que-monedas-se-puede-operar-desde-la-cuenta-comitente
//   https://www.max.capital/cargos-y-comisiones/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   https://www.max.capital/api/cotizaciones/buscador/
//   https://open.bymadata.com.ar/
//
//   node brokers/maxcapital/maxcapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { UA, bymaRows, clean, expectLine, summary } from "../comafi/byma.mjs";

const INDEX = "https://www.max.capital/api/cotizaciones/buscador/";
const CACHE = new URL("maxcapital-cache.json", import.meta.url);
const KINDS = { acciones: "local", cedears: "cedear" };
const CACHE_DAYS = 45;

async function liveIndex() {
  try {
    const response = await fetch(INDEX, {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.max.capital/mercados/cotizaciones/" },
      signal: AbortSignal.timeout(40_000),
    });
    const text = await response.text();
    if (!response.ok) return { refused: `${response.status}` };
    const list = JSON.parse(text);
    if (!Array.isArray(list)) return { refused: "not a list" };
    return { items: list.filter((item) => KINDS[item.type]), from: INDEX };
  } catch (error) {
    return { refused: error.message || String(error) };
  }
}

let index = await liveIndex();
if (index.refused) {
  const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  const age = (Date.now() - Date.parse(cache.savedOn)) / 86_400_000;
  console.error(`${INDEX} refused (${index.refused}); reading maxcapital-cache.json saved ${cache.savedOn}`);
  if (age > CACHE_DAYS) console.error(`maxcapital-cache.json is ${Math.round(age)} days old: refresh it from a browser`);
  index = { items: cache.items, from: `maxcapital-cache.json ${cache.savedOn}` };
} else {
  // Keep the cache current when the site answers.
  fs.writeFileSync(
    CACHE,
    JSON.stringify(
      {
        source: INDEX,
        savedOn: new Date().toISOString().slice(0, 10),
        note: "The acciones and cedears entries of the site's search index.",
        items: index.items.map(({ code, type, description }) => ({ code, type, description })),
      },
      null,
      1
    )
  );
}

const entries = [];
const perKind = { acciones: 0, cedears: 0 };
for (const item of index.items) {
  const symbol = clean(item.code).toUpperCase();
  if (!symbol) continue;
  perKind[item.type] += 1;
  entries.push({ symbol, live: false, name: clean(item.description), raw: [item.type, symbol, clean(item.description)].join(" | ") });
}
console.error(`Max Capital index (${index.from}): ${perKind.acciones} acciones, ${perKind.cedears} cedears`);
if (perKind.acciones < 120 || perKind.cedears < 1000) throw new Error(`the index was short: ${JSON.stringify(perKind)}`);

const { rows, dropped } = await bymaRows(entries, "Max Capital", { cable: true });

expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLC", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
expectLine(rows, "SPYD", "USD", "ETF", "ARCAVA460131");
for (const block of ["GGALB", "AAPLB", "ALUAB", "AAPDB"]) {
  if (rows.some((row) => row.ticker === block)) throw new Error(`the block line ${block} was kept`);
}
const local = rows.filter((row) => row.panel === "local");
const cedears = rows.filter((row) => row.panel === "cedear");
if (local.length < 100) throw new Error(`Buenos Aires shares were short: ${local.length}`);
if (cedears.length < 950) throw new Error(`CEDEARs were short: ${cedears.length}`);
if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

summary("Max Capital", rows, dropped);
const kept = rows.map(({ panel, ...row }) => row);
fs.writeFileSync(new URL("maxcapital-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(kept)), null, 2));
