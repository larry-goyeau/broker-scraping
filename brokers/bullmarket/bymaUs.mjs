// The catalogue of an Argentine broker that sells BYMA's share and CEDEAR
// board and also US shares and ETFs from the same account with no US list:
// BYMA's whole board (../bancogalicia/bymaBook.mjs) plus the whole US
// exchange book (../wellstrade/usBook.mjs), less what the broker's own pages
// leave out. Shared by the scrapers of Argentina Valores, Bull Market, CAF
// Securities, IEB+, LBO, Les Cinq, Option Securities, PGA Valores, PSEC,
// Rava, Sailing and Veta; each header says why its catalogue is what it is.
//
// Options of bymaUs:
//   cable     keep BYMA's cable (C) lines, from the broker's own terms
//   mics      the US exchanges the broker names (the owner's rule: a country
//             place keeps only the exchanges the broker names), all when unset
//   usTop     the stated number of US titles: keep that many, the most
//             traded (./usTop.mjs)
//   cedearTop the stated number of CEDEAR titles (../lescinq/cedearTop.mjs)
//
// evidence(url, patterns) stops the run when a page no longer says what a
// header quotes; pdf(url) when a fee schedule is no longer served.

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topUs } from "./usTop.mjs";
import { topCedears } from "../lescinq/cedearTop.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOk(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-AR,es;q=0.9" }, signal: AbortSignal.timeout(40_000) });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

const ENTITIES = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", Aacute: "Á", Eacute: "É", iquest: "¿", amp: "&", quot: '"', nbsp: " " };

export async function evidence(url, patterns) {
  const source = await (await fetchOk(url)).text();
  const text = source
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => ENTITIES[name] ?? whole)
    .replace(/[\s ​]+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text) && !pattern.test(source)) throw new Error(`${url} no longer says ${pattern}`);
  await sleep(800);
}

export async function pdf(url) {
  const bytes = Buffer.from(await (await fetchOk(url)).arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url} is no longer a PDF`);
  await sleep(800);
}

export async function bymaUs(label, file, { cable, mics = null, usTop = 0, cedearTop = 0 }) {
  const byma = await bymaBook(label, { cable });
  let local = byma.rows;
  let cedearNote = "";
  if (cedearTop) {
    const top = await topCedears(local, cedearTop);
    cedearNote = `, ${cedearTop} most traded of ${top.titles} CEDEAR titles`;
    local = top.rows;
  }

  const book = await usBook();
  let us = withoutObligations([...book]);
  const named = us.length;
  if (mics) us = us.filter((row) => mics.includes(row.mic));
  let usNote = mics ? `, ${named - us.length} US lines on exchanges the broker does not name` : "";
  if (usTop) {
    const top = await topUs(us, usTop);
    usNote += `, ${us.length - top.rows.length} US titles past the ${usTop} most traded (FINRA days ${top.dates[top.dates.length - 1]}-${top.dates[0]})`;
    us = top.rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }
  if (us.length < (usTop ? usTop * 0.95 : mics ? 2000 : 10000)) throw new Error(`only ${us.length} US rows`);

  const rows = stampRows(withoutObligations([...local, ...us]));
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));

  const counts = {};
  for (const row of rows) {
    const place = row.mic === "XBUE" ? `XBUE ${row.currency}` : row.mic;
    counts[`${place} ${row.type}`] = (counts[`${place} ${row.type}`] || 0) + 1;
  }
  console.error(`${label}: ${rows.length} rows (${Object.entries(counts).map(([key, n]) => `${n} ${key}`).join(", ")})`);
  console.error(`${label}: left out ${byma.dropped.length} BYMA lines${cedearNote}; US directories ${JSON.stringify(book.report.directories)}, ${book.length - named} bonds${usNote}`);
  for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`  US left out ${list.length} ${what}`);
  return rows;
}
