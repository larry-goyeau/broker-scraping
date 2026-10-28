// What Ualá México (Ualá, S.A., Institución de Banca Múltiple) sells in
// its "Acciones" service, with no login. The page says it "ofrece acceso
// al mercado de acciones de Estados Unidos" and that clients "podrás
// comprar y vender fracciones de acciones/ETFs"; DriveWealth, LLC executes
// and holds the trades ("La ejecución y tenencia de las acciones es
// operado directamente por DriveWealth, LLC"). The FAQ only says the app
// shows "todos los activos disponibles"; no page names a board, a segment
// or a kind of listed share or fund left out, and the app's list is not
// public, so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://www.uala.mx/acciones   (page and its FAQ)
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the service is
// "acciones/ETFs" of the US stock market. The US is one NBBO market: one
// row per title, on its primary listing. Currency: the line's own, USD,
// although the client always pays in pesos ("siempre operas en pesos
// mexicanos (MXN), aunque las acciones coticen en dólares (USD)").
//
// Remarks, not removals: orders from $20 MXN, at most $200,000 MXN of
// buys a day; 3 day trades in 5 business days; Mexican residents only
// (a foreigner needs "una tarjeta de residencia temporal o permanente en
// México"); orders run 8:30-15:00 Mexico City time, outside it they are
// "programada" for the next session.
//
// Fees ("Ualá cobra 0% de comisión tanto por la compra como por la venta
// de acciones"; FX at the "tipo de cambio vigente al momento exacto de tu
// operación", shown before confirming):
//   https://www.uala.mx/acciones
//
//   node brokers/ualamexico/ualamexico_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// The page still says what the header quotes, or the run stops. The FAQ
// answers sit in the page's JSON with <-escaped tags.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.uala.mx/acciones", [
  /acceso al mercado de acciones de Estados Unidos/,
  /comprar y vender fracciones de acciones\/ETFs/,
  /cobra 0% de comisi.n tanto por la compra como por la venta/,
  /DriveWealth/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("ualamexico-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
