// What Balanz Uruguay (Balanz Uruguay Corredor de Bolsa S.A. and Balanz
// Uruguay Agente de Valores S.A., both supervised by the Banco Central del
// Uruguay) sells in shares and exchange-traded products, with no login.
// The home page lists among "Los mejores instrumentos del mercado"
// "Acciones" and "ETFs", and under "Acceso a mercados globales" says "la
// apertura de cuentas de inversión en los principales brokers de USA"; the
// agent's page says "brindamos acceso a los principales mercados
// internacionales y bancos de inversión en USA (Pershing)". No page names
// a board, a segment or a kind of listed share or fund it does not sell,
// and none publishes a list, so the catalogue is the whole US exchange
// book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt.
//
//   https://www.balanz.com.uy/
//   https://www.balanz.com.uy/agente
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no page mentions
// over-the-counter shares. The US is one NBBO market: one row per title,
// on its primary listing, in dollars.
//
// Remark, not a removal: the service is advised ("asesoramiento
// personalizado"), and the account is opened at a US broker "sujeta a
// aprobación de las entidades correspondientes".
//
// Fees (Corredor de Bolsa tariff, linked from /corredor-bolsa: "Comisión
// por compra/venta de acciones Hasta el 2% del valor efectivo de la
// operación, Mínimo USD 100", "Costo acciones por operación de
// compra/venta USD 12", account upkeep "Hasta 0.25% anual sobre AUM,
// Mínimo USD 300"; the agent's Pershing and StoneX tariff is
// 119732_tarifarioagenteystonex2026.pdf):
//   https://cms.balanz.com/PFS/107316_tarifariobalanzuruguaycorredordebolsasa.pdf
//
//   node brokers/balanzuruguay/balanzuruguay_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const source = await response.text();
  const text = source
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;| /g, " ")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text) && !pattern.test(source)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.balanz.com.uy/", [
  /Acceso a mercados globales/i,
  /principales brokers de USA/i,
  /Acciones ETFs/i,
]);
await sleep(1000);
await evidence("https://www.balanz.com.uy/agente", [/mercados internacionales y bancos de inversión en USA \(Pershing\)/i]);
await sleep(1000);
await evidence("https://www.balanz.com.uy/corredor-bolsa", [/107316_tarifariobalanzuruguaycorredordebolsasa\.pdf/]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("balanzuruguay-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
