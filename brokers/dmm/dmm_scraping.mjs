// What DMM.com Securities (DMM 株, Japan) sells: Japanese listed shares,
// ETFs and ETNs at home, and US shares, ETFs and ADRs abroad. It sells no
// other foreign market.
//
// US. The three list pages (stocks, ETFs, ADRs) are empty tables that
// their script fills from a CSV with a header row: us-stock.csv has code,
// name, detail, market, collateral; us-etf.csv code, name, market, url,
// management, collateral, leverage; us-adr.csv code, name, detail, market,
// nationality, country, collateral. The market column names the US venue
// (NYSE, NASDAQ, NYSE American; OTC is written on OTC Markets); an
// unknown venue falls back to the one ../../assets/stocks.csv and etfs.csv
// give (see ../mitsubishiufjesmart/japan.mjs), which also give the ISIN.
// A line of the ETF file is an ETF, an ETN when its name says ETN; stock
// and ADR lines are STOCK. A US title is one row: the US venues are one
// NBBO market. It is written in USD only: the price is in dollars, and,
// as at the other Japanese brokers, no second line in yen is written for a
// yen-settled order (DMM has no entry in ../../deposits.mjs).
// kabu.dmm.com answers 403 (Akamai "Access Denied") outside Japan. The
// CSVs are read live first, then from the newest Wayback Machine copy
// (CDX, id_ form), whose date goes into each row's raw. On 2026-10-19
// Wayback held no copy of any of the three (the list pages are archived,
// the CSVs they load are not), so the run stops unless it is given local
// copies with --csv=<folder> or told to write Japan only with
// --japan-only. The file written on 2026-10-19 is Japan only.
//
// Japan. The product page (商品概要・取引ルール) sells the shares listed on
// Tokyo, Nagoya, Sapporo and Fukuoka, rights-offering lines, ETFs, REITs
// and ETNs, and excludes foreign shares listed in Japan and JASDEC
// non-handled names. The lists are the ones japan.mjs reads for the other
// Japanese scrapers: the JPX month-end file for Tokyo (Prime, Standard and
// Growth domestic sections, and the ETF・ETN section; a name that says ETN
// is an ETN), Nagoya's search (Premier, Main, Next and its ETF board),
// Fukuoka's monthly PDF with today's sole-listing page, and Sapporo's
// listing page. Left out: Tokyo's foreign-share sections, a Nagoya,
// Fukuoka or Sapporo share whose ISIN is not Japanese, the JASDEC list,
// PRO Market, 出資証券 (not named on the page), and the REIT/fund section as
// in the other Japanese catalogues (REIT is not a type here).
// DMM has no SOR and does not let the order pick a market: its best
// execution policy sends a sole listing to its exchange and a dual
// listing to the one main market DMM picks each month as the most liquid
// over 25 days, Tokyo first, then Nagoya, for a new listing. So, unlike
// the one-row-per-place rule, a Japanese name is one row, on Tokyo when it
// is listed there, else Nagoya, else Fukuoka, else Sapporo. DMM does not
// publish the monthly pick; a dual listing whose volume is higher outside
// Tokyo would be missed.
//
//   https://kabu.dmm.com/us/stock/stock_list/us_stock_list/
//   https://kabu.dmm.com/us/stock/stock_list/etf_list/
//   https://kabu.dmm.com/us/stock/stock_list/adr_list/
//   https://kabu.dmm.com/_data/us-stock.csv
//   https://kabu.dmm.com/_data/us-etf.csv
//   https://kabu.dmm.com/_data/us-adr.csv
//   https://web.archive.org/cdx/search/cdx?url=kabu.dmm.com/_data/us-stock.csv&output=json&limit=-3
//   https://kabu.dmm.com/jp/stock/outline/        (Wayback 2026-04-20)
//   https://kabu.dmm.com/jp/stock/etf_etn/        (Wayback 2026-05-15)
//   https://kabu.dmm.com/selection_criteria/      (Wayback 2026-04-11)
//   https://securities.dmm.com/_pdf/sairyou.pdf   (Wayback 2026-02-08)
//
//   node brokers/dmm/dmm_scraping.mjs
//   node brokers/dmm/dmm_scraping.mjs --csv=./folder-with-the-three-csvs
//   node brokers/dmm/dmm_scraping.mjs --japan-only

import {
  attachJapanIsins,
  fetchText,
  fold,
  fukuokaListing,
  jasdecRefused,
  jpRow,
  nagoyaEtfs,
  nagoyaListing,
  normalize,
  parseCsv,
  sapporoListing,
  tokyoListing,
  usRow,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";
import fs from "node:fs";
import path from "node:path";

const DATA = "https://kabu.dmm.com/_data/";
const CDX = "https://web.archive.org/cdx/search/cdx";
const FILES = [
  { file: "us-stock.csv", kind: "stock", floor: 500 },
  { file: "us-etf.csv", kind: "etf", floor: 100 },
  { file: "us-adr.csv", kind: "adr", floor: 50 },
];
const PLACES = ["Tokyo", "Nagoya", "Fukuoka", "Sapporo"];
const TOKYO_STOCK = new Set(["プライム（内国株式）", "スタンダード（内国株式）", "グロース（内国株式）"]);

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name) => process.argv.includes(`--${name}`);

// At most four requests at once.
async function four(tasks) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < tasks.length) {
        const at = next;
        next += 1;
        out[at] = await tasks[at]();
      }
    })
  );
  return out;
}

// A CSV with the column names the page script reads, not an error page.
function csvLines(text, file) {
  const table = parseCsv(String(text).replace(/^﻿/, "").trim());
  const header = (table[0] || []).map((cell) => normalize(cell).toLowerCase());
  if (!header.includes("code") || !header.includes("name") || !header.includes("market")) {
    throw new Error(`${file} header is ${header.join(",").slice(0, 120)}`);
  }
  return table.slice(1).map((line) => Object.fromEntries(header.map((key, at) => [key, normalize(line[at])])));
}

// Live, then the newest Wayback copy. Returns { lines, from } or { error }.
async function usFile({ file }) {
  const local = arg("csv");
  if (local) {
    const where = path.resolve(local, file);
    return { lines: csvLines(fs.readFileSync(where, "utf8"), file), from: "local copy" };
  }
  const errors = [];
  try {
    return { lines: csvLines(await fetchText(`${DATA}${file}`), file), from: `live ${new Date().toISOString().slice(0, 10)}` };
  } catch (error) {
    errors.push(`live: ${error.message || error}`);
  }
  try {
    const query = `${CDX}?url=kabu.dmm.com/_data/${file}&output=json&limit=-3&filter=statuscode:200`;
    const found = JSON.parse((await fetchText(query)) || "[]").slice(1);
    const newest = found.map((line) => line[1]).sort().at(-1);
    if (!newest) throw new Error("no capture");
    const lines = csvLines(await fetchText(`https://web.archive.org/web/${newest}id_/${DATA}${file}`), file);
    const day = `${newest.slice(0, 4)}-${newest.slice(4, 6)}-${newest.slice(6, 8)}`;
    return { lines, from: `Wayback ${day} (${newest})` };
  } catch (error) {
    errors.push(`Wayback: ${error.message || error}`);
  }
  return { error: `${file}: ${errors.join("; ")}` };
}

// DMM's market word to a MIC; "" leaves the asset lists' venue.
function usVenue(market, type) {
  const word = fold(market).toUpperCase();
  if (/ARCA/.test(word)) return "ARCX";
  if (/AMERICAN|AMEX|MKT/.test(word)) return type === "STOCK" ? "XASE" : "ARCX";
  if (/NASDAQ/.test(word)) return "XNAS";
  if (/CBOE|BATS|BZX/.test(word)) return "BATS";
  if (/NYSE|ニューヨーク/.test(word)) return "XNYS";
  if (/^OTC/.test(word)) return "OTC";
  return "";
}

function usBook(files) {
  const byCode = new Map();
  const unread = new Set();
  // The ETF file first, so a code it shares with the stock file keeps ETF.
  for (const at of [1, 2, 0]) {
    const { kind, file } = FILES[at];
    const { lines, from } = files[at];
    for (const line of lines) {
      const code = fold(line.code).toUpperCase();
      if (!code) continue;
      if (!/^[A-Z][A-Z0-9.\-/ ]*$/.test(code)) throw new Error(`${file} code not read: ${line.code}`);
      if (byCode.has(code)) continue;
      const type = kind === "etf" ? (/\bETN\b/i.test(fold(line.name)) ? "ETN" : "ETF") : "STOCK";
      const note = [line.detail, line.management, line.nationality, line.market, file, from].filter(Boolean).join(" ");
      const row = usRow({ symbol: code, name: line.name, type, note });
      const venue = usVenue(line.market, type);
      if (venue === "OTC") {
        row.exchange = "OTC Markets";
        row.mic = "OTCM";
      } else if (venue) {
        row.exchange = venue;
        row.mic = venue;
      } else unread.add(line.market || "(empty)");
      byCode.set(code, row);
    }
  }
  return { rows: [...byCode.values()], unread: [...unread] };
}

// One row per Japanese code, on its main market (see the header).
function japanBook({ tokyo, nagoya, nagoyaFunds, fukuoka, sapporo, refused }) {
  const rows = [];
  const dropped = {};
  const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
  const placed = new Set();
  for (const line of tokyo) {
    placed.add(line.code);
    if (refused.has(line.code)) drop("JASDEC");
    else if (TOKYO_STOCK.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
    else if (line.section === "ETF・ETN") {
      rows.push(jpRow({ ...line, exchange: "Tokyo", type: fold(line.name).includes("ETN") ? "ETN" : "ETF" }));
    } else drop(`Tokyo ${line.section}`);
  }
  const others = [
    ["Nagoya", nagoya, "STOCK"],
    ["Nagoya", nagoyaFunds, "ETF"],
    ["Fukuoka", fukuoka, "STOCK"],
    ["Sapporo", sapporo, "STOCK"],
  ];
  for (const [exchange, lines, type] of others) {
    const here = new Set();
    for (const line of lines) {
      if (placed.has(line.code)) {
        drop(`${exchange} dual listing routed elsewhere`);
        continue;
      }
      here.add(line.code);
      if (refused.has(line.code)) drop("JASDEC");
      else rows.push(jpRow({ ...line, exchange, type }));
    }
    for (const code of here) placed.add(code);
  }
  return { rows, dropped };
}

const tasks = [
  () => tokyoListing(),
  () => nagoyaListing(),
  () => nagoyaEtfs(),
  () => fukuokaListing(),
  () => sapporoListing(),
  () => jasdecRefused(),
  ...(flag("japan-only") ? [] : FILES.map((spec) => () => usFile(spec))),
];
const [tokyo, nagoya, nagoyaFunds, fukuoka, sapporo, refused, ...files] = await four(tasks);

const japan = japanBook({ tokyo, nagoya, nagoyaFunds, fukuoka, sapporo, refused });
attachJapanIsins(japan.rows);
const foreign = japan.rows.filter((row) => row.exchange !== "Tokyo" && row.isin && !row.isin.startsWith("JP"));
const rows = japan.rows.filter((row) => !foreign.includes(row));

let us = { rows: [], unread: [] };
if (!flag("japan-only")) {
  const failed = files.filter((file) => file.error).map((file) => file.error);
  if (failed.length) {
    throw new Error(`US lists not read (run from Japan, pass --csv=<folder> or --japan-only):\n  ${failed.join("\n  ")}`);
  }
  FILES.forEach(({ file, floor }, at) => {
    if (files[at].lines.length < floor) throw new Error(`${file} has only ${files[at].lines.length} lines`);
  });
  us = usBook(files);
  rows.push(...us.rows);
}

writeCatalogue(import.meta.url, "dmm-parsed.json", rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Nagoya: 5,
  Fukuoka: 5,
  Sapporo: 5,
  ...(flag("japan-only") ? {} : { XNAS: 300, XNYS: 300 }),
});
if (flag("japan-only")) console.error("US left out (--japan-only).");
else {
  FILES.forEach(({ file }, at) => console.error(`${file}: ${files[at].lines.length} lines, ${files[at].from}`));
  if (us.unread.length) console.error(`US market words not mapped (venue from the asset lists): ${us.unread.join(", ")}`);
}
console.error(
  `Left out: ${[
    ...Object.entries(japan.dropped).map(([why, count]) => `${count} ${why}`),
    `${foreign.length} foreign share outside Tokyo (${foreign.map((row) => `${row.exchange} ${row.ticker}`).join(", ") || "none"})`,
  ].join(", ")}`
);
