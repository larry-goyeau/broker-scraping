// GlobalConnect cash touch, read through the Chrome that can open the
// exchange site. Bid and ask are Oferta kupna and Oferta sprzedaży.
// A last trade is never written in their place. This is the Warsaw
// zloty book (XGLO), not the home-market book of the same share.
//
// The share list has no bid column. Each card's quotations tab does.
// The ETF full board prints both prices in one table. Continuous
// trading is 09:05–17:05 in Warsaw. The board is delayed by 15 minutes.
// Outside the session nothing is written. The reading is gc-touch.json.
// spread.mjs copies it into spread.json (`--only=gc-touch`).
//
//   node spreads/gc-touch.mjs

import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const STORE = fileURLToPath(new URL("./gc-touch.json", import.meta.url));
const HOME = "https://gpwglobalconnect.pl/notowania";
const ETF = "https://gpwglobalconnect.pl/etfy-pelna-wersja-notowan";
const CHROME = "http://127.0.0.1:9222";

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

const openNow = (at) => at.day && at.minutes >= 9 * 60 + 5 && at.minutes < 17 * 60 + 5;

const num = (value) => {
  let text = String(value ?? "").replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ").trim();
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
    match[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  );

function catalogue() {
  const byIsin = new Set();
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (String(row.exchange || "").replace(/[^a-z]/gi, "").toLowerCase() !== "globalconnect") continue;
    const isin = String(row.isin || "").toUpperCase();
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    byIsin.add(isin);
    if (!/^[A-Z0-9]{2,12}$/.test(ticker)) continue;
    const counts = byCode.get(ticker) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byCode.set(ticker, counts);
  }
  return { byIsin, byCode };
}

const pick = (counts) => {
  if (!counts) return "";
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return "";
  return ranked[0][0];
};

const now = warsaw();
if (!openNow(now)) {
  console.error(`hors continu, Varsovie ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

let browser;
try {
  browser = await puppeteer.connect({
    browserURL: CHROME,
    defaultViewport: null,
    protocolTimeout: 120000,
  });
} catch {
  console.error(`Chrome n'écoute pas sur ${CHROME}. Rien n'est écrit.`);
  process.exit(1);
}

const page = await browser.newPage();
try {
  await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
  const shares = await page.evaluate(async () => {
    const response = await fetch(
      "/ajaxindex.php?action=GCExternalDataFrontController&start=showTable&tab=all&lang=PL&type=ALL&full=1&format=html",
      { credentials: "include" }
    );
    return response.text();
  });
  const dated = shares.match(/(\d{2}-\d{2}-\d{4}),\s*dane opóźnione/)?.[1];
  if (dated !== now.stamp) {
    console.error(`tableau daté ${dated || "sans date"}, Varsovie ${now.stamp}. Rien n'est écrit.`);
    process.exit(1);
  }

  const jobs = [];
  for (const row of shares.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = cellsOf(row);
    const isinAt = cells.findIndex((cell) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(cell));
    if (isinAt < 0) continue;
    jobs.push({ isin: cells[isinAt], code: String(cells[isinAt + 1] || "").toUpperCase() });
  }
  console.error(`Varsovie ${now.clock}. ${jobs.length} actions, tableau du ${dated}.`);

  const found = [];
  let noTouch = 0;
  for (const job of jobs) {
    const html = await page.evaluate(async (isin) => {
      const response = await fetch(
        `/ajaxindex.php?start=quotationsTab&format=html&action=GCCompany&gls_isin=${isin}&lang=PL`,
        { credentials: "include" }
      );
      return response.text();
    }, job.isin);
    const bid = num(html.match(/Oferta kupna<\/th>\s*<td>([^<]*)/i)?.[1]);
    const ask = num(html.match(/Oferta sprzedaży<\/th>\s*<td>([^<]*)/i)?.[1]);
    const bp = bpFrom(bid, ask);
    if (bp == null) {
      noTouch += 1;
      continue;
    }
    found.push({
      isin: job.isin,
      code: job.code,
      bid,
      ask,
      bp,
      url: `https://gpwglobalconnect.pl/spolka?isin=${job.isin}`,
    });
  }

  await page.goto(ETF, { waitUntil: "domcontentloaded", timeout: 45000 });
  const etfHtml = await page.content();
  let etf = 0;
  for (const row of etfHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = cellsOf(row);
    const isinAt = cells.findIndex((cell) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(cell));
    if (isinAt < 0 || cells[isinAt + 1] !== "PLN") continue;
    const bid = num(cells[isinAt + 14]);
    const ask = num(cells[isinAt + 15]);
    const bp = bpFrom(bid, ask);
    if (bp == null) {
      noTouch += 1;
      continue;
    }
    etf += 1;
    found.push({
      isin: cells[isinAt],
      code: String(cells[isinAt - 1] || "").toUpperCase(),
      bid,
      ask,
      bp,
      url: ETF,
    });
  }
  console.error(`${etf} ETF sur le tableau complet.`);

  const { byIsin, byCode } = catalogue();
  const kept = [];
  let unknown = 0;
  let tied = 0;
  for (const row of found) {
    let isin = byIsin.has(row.isin) ? row.isin : "";
    if (!isin) {
      const fromCode = pick(byCode.get(row.code));
      if (!fromCode && byCode.has(row.code)) tied += 1;
      else if (!fromCode) unknown += 1;
      isin = fromCode;
    }
    if (!isin) continue;
    kept.push({ ...row, isin });
  }
  kept.sort((a, b) => a.code.localeCompare(b.code) || a.isin.localeCompare(b.isin));
  if (!kept.length) {
    console.error(`aucune touche du continu. Varsovie ${now.clock}. Rien n'est écrit.`);
    process.exit(1);
  }
  fs.writeFileSync(
    STORE,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        date: now.date,
        clock: now.clock,
        source: HOME,
        rows: kept,
        noTouch,
        tied,
        unknown,
      },
      null,
      2
    )
  );
  console.error(
    `${kept.length} touches, ${noTouch} sans bid et ask, ${tied} ISIN partagés, ${unknown} hors catalogue. Écrit dans gc-touch.json.`
  );
} finally {
  await page.close().catch(() => {});
  await browser.disconnect();
}
