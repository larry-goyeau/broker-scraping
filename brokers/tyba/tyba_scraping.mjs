// What tyba (tyba por Credicorp Capital, Colombia) sells on the New York
// Stock Exchange, with no login. Its "Acciones Internacionales" are run by
// Credicorp Capital LLC (a US broker dealer, FINRA/SIPC member) and offered
// in Colombia by Credicorp Capital Colombia S.A. as its correspondent. The
// product page says "Accede al mercado de valores de NY" and "Acciones &
// ETFs", "Diversifica con ETFs internacionales"; tyba's article on the
// product gives "más de 7.000 acciones y ETFs listados en NYSE y Nasdaq".
// That is a count, not a list: the list is in the app only, and no page
// names a board, a segment or a kind of listed share or fund left out. So
// the catalogue is the whole NYSE book of the day, read by
// ../wellstrade/usBook.mjs and kept to MIC XNYS: shares, ADRs, REITs,
// preferreds, closed-end funds and the ETFs listed there (warrants,
// rights, units, when-issued lines, listed notes and lines with an open
// trade halt are left out there). broker-list.json gives tyba the New York
// Stock Exchange only; the Nasdaq titles the article names are a
// broker-list question, not added here. OTC lines are not named and not
// in the book.
//
// The US is one NBBO market: one row per title on its listing exchange, in
// dollars.
//
// Fees: "Opera con comisión 0% en acciones internacionales completas"
// (whole shares and ETFs, buy and sell), and the article adds
// "Las fracciones tienen una comisión de 0.3% por orden"; regulatory REG
// and TAF charges apply on sales:
//   https://tyba.com.co/invertir-en-acciones/
//   https://tyba.com.co/blog/invertir-en-acciones-de-estados-unidos-desde-colombia/
//
//   node brokers/tyba/tyba_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
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

await evidence("https://tyba.com.co/invertir-en-acciones/", [
  /comisión 0% en acciones internacionales completas/i,
  /Credicorp Capital LLC/,
  /ETFs internacionales/i,
]);
await pause();
await evidence("https://tyba.com.co/blog/invertir-en-acciones-de-estados-unidos-desde-colombia/", [
  /acciones y ETFs listados en NYSE y Nasdaq/i,
  /comisión de 0\.3% por orden/i,
]);
await pause();

const book = await usBook();
const rows = stampRows(withoutObligations(book.filter((row) => row.mic === "XNYS")));
if (rows.length < 2000) throw new Error(`only ${rows.length} NYSE rows`);
for (const ticker of ["JPM", "KO", "BRK.B"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("tyba-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[row.type] = (counts[row.type] || 0) + 1;
console.error(`${rows.length} NYSE rows (${Object.entries(counts).map(([type, n]) => `${n} ${type}`).join(", ")}), ${rows.filter((row) => row.isin).length} with an ISIN`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ") || "none"}`);
