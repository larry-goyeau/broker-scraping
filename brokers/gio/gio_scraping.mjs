// What GIO Bursátil sells in Buenos Aires shares and CEDEARs, with no
// login. The broker's own site prints the BYMA boards as plain HTML
// tables, one page per panel: the leader panel (/cotizaciones/), the
// general panel (/panel-general/) and the CEDEAR panel (/cedears/, ETF
// certificates such as SPY, QQQ and IBIT included). Each table row is one
// BYMA symbol (peso, MEP and cable lines are separate symbols: GGAL,
// GGALD, GGALC), zero-volume symbols included, so the three tables are the
// catalogue. Each caption carries the board's timestamp.
//
// The tables name the symbol only. Its currency, type and ISIN come from
// BYMA's open data (../comafi/byma.mjs, shared with brokers/comafi). The
// pages also keep about 370 symbols BYMA no longer quotes (Altaba AABA,
// Barrick's old ABX, China Mobile CHL, delisted local shares); a symbol
// that is not on BYMA's panels today is not written. Block lines (GGALB,
// AAPDB), warrants (CRE3W) and other kinds that are not a share, a CEDEAR
// or an ADR are not written either. Futures, bonds and options are other
// pages of the site.
//
// Cable lines (C, contado con liquidación: the certificate bought or sold
// for dollars held abroad) are kept next to the MEP (D) lines, because GIO
// takes and sends client dollars abroad. Its account terms, clause 7:
// "Las transferencias desde una cuenta comitente deberán dirigirse a una
// cuenta bancaria de titularidad o co-titularidad del Cliente, abierta en
// entidades del país [...] o en instituciones del exterior"; its fee
// schedule charges "Transferencias monetarias receptoras exterior u$s 100"
// and "Transferencias monetarias emisoras exterior u$s 150". Both are USD
// rows; the ticker (AAPLC, AAPLD) tells them apart.
//   https://giobursatil.com.ar/wp-content/uploads/2024/03/Términos-y-condiciones-de-cuenta-Vigente-2023.pdf
//   https://giobursatil.com.ar/wp-content/uploads/2021/09/Comisiones-y-Aranceles-092021.pdf
//
// A line with no price today, on GIO's page or on BYMA, that BYMA's daily
// history shows no trade on in two years (AEMC, BBA3C, ISRGD, CADO5,
// EDLH) is listed but never quoted, and is not written (byma.mjs).
//
//   https://giobursatil.com.ar/cotizaciones/
//   https://giobursatil.com.ar/panel-general/
//   https://giobursatil.com.ar/cedears/
//   https://open.bymadata.com.ar/
//
//   node brokers/gio/gio_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaRows, clean, expectLine, getText, pause, summary } from "../comafi/byma.mjs";

const PAGES = [
  { url: "https://giobursatil.com.ar/cotizaciones/", caption: /Acciones l(?:&iacute;|í)deres/, floor: 15 },
  { url: "https://giobursatil.com.ar/panel-general/", caption: /Panel General/, floor: 250 },
  { url: "https://giobursatil.com.ar/cedears/", caption: /Cedears/, floor: 1200 },
];

function decode(value) {
  return clean(
    String(value ?? "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&iacute;/g, "í")
  );
}

const entries = [];
for (const page of PAGES) {
  const html = await getText(page.url);
  const table = html.match(/<table id="tabla-acciones"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error(`${page.url} has no quote table`);
  const caption = table.match(/<caption>([\s\S]*?)<\/caption>/)?.[1] || "";
  if (!page.caption.test(caption)) throw new Error(`${page.url} caption is ${decode(caption)}`);
  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
  let count = 0;
  for (const [, row] of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => decode(match[1]));
    if (cells.length < 9) throw new Error(`${page.url} has a row of ${cells.length} cells`);
    const symbol = cells[0];
    if (!/^[A-Z0-9.]+$/.test(symbol)) throw new Error(`${page.url} has symbol ${symbol}`);
    // A price on the page today: the last trade or the previous close.
    const live = [cells[1], cells[4]].some((cell) => Number(cell.replace(/\./g, "").replace(",", ".")) > 0);
    entries.push({ symbol, live, raw: [decode(caption), ...cells].join(" | ") });
    count += 1;
  }
  console.error(`${page.url}: ${count} rows (${decode(caption)})`);
  if (count < page.floor) throw new Error(`${page.url} has only ${count} rows`);
  await pause(500);
}

const { rows, dropped, board } = await bymaRows(entries, "GIO", { cable: true });

// Every symbol BYMA quotes on the three panels is on GIO's pages.
const listed = new Set(entries.map((entry) => entry.symbol));
const missing = [...board.keys()].filter((symbol) => !listed.has(symbol));
if (missing.length > 10) throw new Error(`${missing.length} BYMA symbols are not on GIO's pages: ${missing.slice(0, 20).join(" ")}`);

expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
expectLine(rows, "SPYD", "USD", "ETF", "ARCAVA460131");
for (const gone of ["GGALB", "AAPLB", "AAPDB", "AABA", "CRE3W"]) {
  if (rows.some((row) => row.ticker === gone)) throw new Error(`${gone} was kept`);
}
const local = rows.filter((row) => row.panel === "local");
const cedears = rows.filter((row) => row.panel === "cedear");
if (local.length < 120) throw new Error(`Buenos Aires shares were short: ${local.length}`);
if (cedears.length < 950) throw new Error(`CEDEARs were short: ${cedears.length}`);
if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

summary("GIO", rows, dropped);
if (missing.length) console.error(`BYMA symbols not on GIO's pages: ${missing.join(" ")}`);
const kept = rows.map(({ panel, ...row }) => row);
fs.writeFileSync(new URL("gio-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(kept)), null, 2));
