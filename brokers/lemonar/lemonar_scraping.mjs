// What Lemon (Lemon Argentina; the stock product is offered by Quaestus
// Advisory S.A., CNV adviser no. 1098, orders executed by Alpaca Securities
// LLC) sells in shares and exchange-traded products, with no login. Its
// help centre says "podés comprar acciones, Índices y Packs de acciones de
// empresas de EE.UU." ("you can buy shares, Indices and Packs of shares of
// US companies"), and among what one can invest in: "Catálogo extendido:
// podés buscar cualquier acción o índice del mercado americano por nombre,
// ticker o alias" ("extended catalogue: you can search any share or index
// of the American market"). An "Índice" there is a fund that tracks an
// index ("el índice del S&P 500 te da exposición a las 500 empresas más
// grandes de EE.UU. con una sola compra"), that is an ETF; a Pack is a
// basket of the same shares. No page names a board, a segment or a kind
// of listed share or fund it does not sell, so the catalogue is the whole
// US exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs,
// REITs, partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt. The app's list itself
// is not public.
//
//   https://help.lemon.me/es/articles/14979916-que-es-el-producto-de-acciones-de-lemon
//   https://help.lemon.me/es/articles/14979997-en-que-puedo-invertir-y-cuales-son-los-limites
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the pages speak
// only of shares and indices of "el mercado americano" and never of
// over-the-counter trading. The US is one NBBO market: one row per title,
// on its primary listing, in dollars (the client may pay in pesos or
// digital dollars, which Lemon converts).
//
// Remarks, not removals: orders are market orders only ("Las órdenes son
// de mercado: se ejecutan al precio vigente en el momento en que Alpaca
// Securities procesa la orden"), from 1 USD, regular US hours.
//
// Fees ("Lemon cobra el 0,5% por operación, tanto para compras como para
// ventas. Es la única comisión"):
//   https://help.lemon.me/es/articles/14979054-cuales-son-las-comisiones-y-a-que-precio-se-ejecuta-mi-orden
//
//   node brokers/lemonar/lemonar_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HELP = "https://help.lemon.me/es/articles/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;| |​/g, " ")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(`${HELP}14979916-que-es-el-producto-de-acciones-de-lemon`, [
  /acciones, Índices y Packs de acciones de empresas de EE\.UU\./i,
]);
await sleep(1000);
await evidence(`${HELP}14979997-en-que-puedo-invertir-y-cuales-son-los-limites`, [
  /cualquier acción o índice del mercado americano/i,
]);
await sleep(1000);
await evidence(`${HELP}14979054-cuales-son-las-comisiones-y-a-que-precio-se-ejecuta-mi-orden`, [
  /0,5% por operación/i,
  /Alpaca Securities/i,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("lemonar-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
