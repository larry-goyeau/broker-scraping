// NewConnect cash touch. Bid and ask are Oferta kupna and Oferta
// sprzedaży on each company's quotations tab. A last trade is never
// written in their place. The board is the zloty book, delayed by
// 15 minutes, and it is not the main GPW market.
//
// Continuous trading is 09:00–16:50 in Warsaw. The closing auction runs
// on to 17:05. A reading is kept until 17:05 so the delayed book from
// the continuous session still lands. Outside that window nothing is
// written. The table has to be dated today. The reading is nc-touch.json.
// spread.mjs copies it into spread.json (`--only=nc-touch`).
//
//   node spreads/nc-touch.mjs

import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const STORE = fileURLToPath(new URL("./nc-touch.json", import.meta.url));
const HOME = "https://newconnect.pl/notowania";
const CHROME = "http://127.0.0.1:9222";
const TABLE =
  "/ajaxindex.php?action=NCExternalDataFrontController&start=showTable&tab=all&lang=PL&type=ALL&full=1&format=html";

const warsaw = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(when)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday,
    day: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday),
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    stamp: `${parts.day}-${parts.month}-${parts.year}`,
  };
};

// 17:05 is the delayed tail of a book that was still continuous at 16:50.
const canRead = (at) => at.day && at.minutes >= 9 * 60 && at.minutes < 17 * 60 + 5;

const num = (value) => {
  let text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (!text || text === "--" || text === "-" || /^0([,.]0+)?$/.test(text)) return null;
  if (text.includes(",")) text = text.replace(/\s/g, "").replace(",", ".");
  else text = text.replace(/\s/g, "");
  const n = Number(text);
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const cellsOf = (row) =>
  [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

function wanted() {
  const isins = new Set();
  for (const row of catalogueRows()) {
    if (norm(row.exchange) !== "newconnect") continue;
    const isin = String(row.isin || "").toUpperCase();
    if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) isins.add(isin);
  }
  return isins;
}

const now = warsaw();
if (!canRead(now)) {
  console.error(`hors continu, Varsovie ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

let browser;
try {
  browser = await puppeteer.connect({
    browserURL: CHROME,
    defaultViewport: null,
    protocolTimeout: 180000,
  });
} catch {
  console.error(`Chrome n'écoute pas sur ${CHROME}. Rien n'est écrit.`);
  process.exit(1);
}

const page = await browser.newPage();
try {
  await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
  const table = await page.evaluate(async (path) => {
    const response = await fetch(path, { credentials: "include" });
    return response.text();
  }, TABLE);
  const dated = table.match(/(\d{2}-\d{2}-\d{4}),\s*dane opóźnione/)?.[1];
  if (dated !== now.stamp) {
    console.error(`tableau daté ${dated || "sans date"}, Varsovie ${now.stamp}. Rien n'est écrit.`);
    process.exit(1);
  }

  const catalogue = wanted();
  const jobs = [];
  const seen = new Set();
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = cellsOf(row);
    const isin = cells.find((cell) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(cell));
    if (!isin || seen.has(isin) || !catalogue.has(isin)) continue;
    seen.add(isin);
    const at = cells.indexOf(isin);
    jobs.push({ isin, code: String(cells[at + 1] || "").toUpperCase() });
  }
  console.error(`Varsovie ${now.clock}. ${jobs.length} sociétés du catalogue, tableau du ${dated}.`);
  if (!jobs.length) {
    console.error("aucune société. Rien n'est écrit.");
    process.exit(1);
  }

  const found = [];
  let noTouch = 0;
  let otherCcy = 0;
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const html = await page.evaluate(async (isin) => {
      const response = await fetch(
        `/ajaxindex.php?start=quotationsTab&format=html&action=NCCompany&gls_isin=${isin}&lang=PL`,
        { credentials: "include" }
      );
      return response.text();
    }, job.isin);
    if (i > 0 && i % 50 === 0) console.error(`${i}/${jobs.length}`);
    if (!/Bieżące \(PLN\)/.test(html)) {
      otherCcy += 1;
      continue;
    }
    const bid = num(html.match(/Oferta kupna<\/th>\s*<td>([^<]*)/i)?.[1]);
    const ask = num(html.match(/Oferta sprzedaży<\/th>\s*<td>([^<]*)/i)?.[1]);
    const bp = bpFrom(bid, ask);
    if (bp == null) {
      noTouch += 1;
      continue;
    }
    found.push({
      isin: job.isin,
      mic: "XNCO",
      code: job.code,
      bid,
      ask,
      bp,
      url: `https://newconnect.pl/spolka?isin=${job.isin}`,
    });
  }

  found.sort((a, b) => a.code.localeCompare(b.code));
  if (!found.length) {
    console.error(`aucune touche. Varsovie ${now.clock}. ${noTouch} sans deux côtés. Rien n'est écrit.`);
    process.exit(1);
  }
  fs.writeFileSync(
    STORE,
    JSON.stringify(
      { at: new Date().toISOString(), date: now.date, clock: now.clock, delayed: true, rows: found, noTouch, otherCcy },
      null,
      2
    )
  );
  console.error(
    `${found.length} touches, ${noTouch} sans deux côtés, ${otherCcy} hors zloty. Écrit dans nc-touch.json. Varsovie ${now.clock}.`
  );
} finally {
  await page.close().catch(() => null);
  await browser.disconnect();
}
