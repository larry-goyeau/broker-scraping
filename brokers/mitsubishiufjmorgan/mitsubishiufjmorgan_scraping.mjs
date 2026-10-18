// What Mitsubishi UFJ Morgan Stanley Securities sells through its online
// and telephone channel (インターネットトレード / オンライントレード).
//
// Abroad, the online page names two markets, US and Hong Kong, and sells
// the shares and ETFs the firm has chosen there, as 外国委託取引 only. Each
// market's chosen list is a PDF linked from that page: section (株式 or
// ETF), the firm's own code, ticker and Japanese name. Neither PDF prints a
// venue or ISIN. A US ticker is joined to ../../assets/stocks.csv and
// etfs.csv for the venue and ISIN (see ../mitsubishiufjesmart/japan.mjs);
// a Hong Kong code to the HKEX lines. The one Hong Kong line filed as ETF
// is HK Electric Investments' share-stapled units (2638), a share, and is
// stored as STOCK. The branches sell further markets (Canada, Europe,
// Australia, China B, Taiwan, ASEAN) face to face; those are not online.
//
// At home the online page lists Tokyo Prime, Standard and Growth with ETF,
// ETN, REIT, country and venture funds; Nagoya Premier, Main and Next with
// ETF; Fukuoka sole listings and Q-Board; Sapporo sole listings and
// Ambitious. PRO markets are not sold online, nor is a 5-digit code
// (新株, which takes in the bond-type class shares). Tokyo is the JPX
// month-end file: Prime, Standard and Growth, domestic and foreign, and the
// ETF・ETN section (a name that says ETN is an ETN). The REIT/fund section
// is left out as in the other Japanese catalogues, and so is 出資証券, which
// the page does not name. Nagoya is the exchange search; its ETFs are
// Tokyo funds and are not a second line. Fukuoka and Sapporo are their own
// sole-listing pages. A code JASDEC does not handle stays out.
//
//   https://www.sc.mufg.jp/trade/deal/f_stock/index.html
//   https://www.sc.mufg.jp/its/pdf/US_stock.pdf
//   https://www.sc.mufg.jp/its/pdf/HK_stock.pdf
//   https://www.sc.mufg.jp/trade/deal/st_etf_reit/index.html
//
//   node brokers/mitsubishiufjmorgan/mitsubishiufjmorgan_scraping.mjs

import {
  attachJapanIsins,
  fetchBytes,
  fetchText,
  fold,
  fukuokaSole,
  hkRow,
  jasdecRefused,
  jpRow,
  nagoyaListing,
  sapporoSole,
  textOf,
  tokyoListing,
  usRow,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";
import { spawnSync } from "node:child_process";

const SITE = "https://www.sc.mufg.jp";
const FOREIGN_PAGE = `${SITE}/trade/deal/f_stock/index.html`;
const DOMESTIC_PAGE = `${SITE}/trade/deal/st_etf_reit/index.html`;

const TOKYO_STOCK = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
]);

const PDF_LINES = `
import json, sys
try:
    import fitz
except ImportError:
    sys.stderr.write("PyMuPDF is missing: pip install pymupdf")
    sys.exit(2)
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
json.dump([page.get_text() for page in doc], sys.stdout, ensure_ascii=False)
`;

function pdfPages(bytes) {
  const run = spawnSync("python3", ["-c", PDF_LINES], { input: bytes, maxBuffer: 64_000_000 });
  if (run.status !== 0) throw new Error(run.stderr.toString() || "the PDF could not be read");
  return JSON.parse(run.stdout.toString("utf8"));
}

// Rows are four lines: 区分, the firm's code (A1234 / Z1234), ticker, name.
function pdfRows(pages, label) {
  const rows = [];
  let codes = 0;
  let asOf = "";
  for (const page of pages) {
    const lines = page.split("\n").map((line) => line.normalize("NFKC").trim());
    asOf ||= lines.find((line) => /^\d{4}年\d{1,2}月\d{1,2}日現在$/.test(line)) || "";
    codes += lines.filter((line) => /^[A-Z]\d{4}$/.test(line)).length;
    for (let i = 0; i + 3 < lines.length; i += 1) {
      if ((lines[i] === "株式" || lines[i] === "ETF") && /^[A-Z]\d{4}$/.test(lines[i + 1])) {
        rows.push({ section: lines[i], firmCode: lines[i + 1], ticker: lines[i + 2], name: fold(lines[i + 3]) });
        i += 3;
      }
    }
  }
  if (rows.length !== codes) throw new Error(`${label} PDF has ${codes} codes and ${rows.length} rows`);
  return { rows, asOf };
}

function linkOf(html, pattern) {
  const href = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((match) => match[1]).find((href) => pattern.test(href));
  if (!href) throw new Error(`online foreign-stock page no longer links ${pattern}`);
  return new URL(href, FOREIGN_PAGE).href;
}

async function foreignBook() {
  const html = await fetchText(FOREIGN_PAGE);
  const text = textOf(html);
  if (!/取扱市場 下記市場についてお取扱いいたします。 米国市場 香港市場 取扱銘柄/.test(text)) {
    throw new Error("online foreign-stock page no longer names exactly the US and Hong Kong markets");
  }
  const us = pdfRows(pdfPages(await fetchBytes(linkOf(html, /US_stock\.pdf$/))), "US");
  const hk = pdfRows(pdfPages(await fetchBytes(linkOf(html, /HK_stock\.pdf$/))), "HK");
  if (us.rows.length < 700) throw new Error(`US PDF has only ${us.rows.length} rows`);
  if (hk.rows.length < 400) throw new Error(`HK PDF has only ${hk.rows.length} rows`);
  const rows = [];
  for (const line of us.rows) {
    if (!/^[A-Z][A-Z0-9.\-/ ]*$/.test(line.ticker)) throw new Error(`US ticker not read: ${line.ticker}`);
    rows.push(
      usRow({
        symbol: line.ticker.replace(/ /g, "."),
        name: line.name,
        type: line.section === "ETF" ? "ETF" : "STOCK",
        note: `${line.firmCode} ${line.section}`,
      })
    );
  }
  for (const line of hk.rows) {
    if (!/^\d{1,5}$/.test(line.ticker)) throw new Error(`HK code not read: ${line.ticker}`);
    const stapled = line.section === "ETF" && /ステープル/.test(line.name);
    rows.push(
      hkRow({
        code: line.ticker,
        name: line.name,
        type: line.section === "ETF" && !stapled ? "ETF" : "STOCK",
        note: `${line.firmCode} ${line.section}`,
      })
    );
  }
  return { rows, us, hk };
}

async function checkDomestic() {
  const text = textOf(await fetchText(DOMESTIC_PAGE));
  for (const phrase of ["プライム・スタンダード", "プレミア・メイン", "ネクスト", "Q-Board", "アンビシャス", "TOKYO PRO Market 市場はお取扱いしていません", "銘柄コードが5桁の銘柄"]) {
    if (!text.includes(phrase)) throw new Error(`online domestic page no longer says ${phrase}`);
  }
}

const [foreign, tokyo, nagoya, fukuoka, sapporo, refused] = await Promise.all([
  foreignBook(),
  tokyoListing(),
  nagoyaListing(),
  fukuokaSole(),
  sapporoSole(),
  jasdecRefused(),
  checkDomestic(),
]);

const rows = [...foreign.rows];
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
for (const line of tokyo) {
  if (refused.has(line.code)) drop("JASDEC");
  else if (line.code.length === 5) drop("5-digit code");
  else if (TOKYO_STOCK.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
  else if (line.section === "ETF・ETN") {
    rows.push(jpRow({ ...line, exchange: "Tokyo", type: fold(line.name).includes("ETN") ? "ETN" : "ETF" }));
  } else drop(line.section);
}
for (const [exchange, lines] of [["Nagoya", nagoya], ["Fukuoka", fukuoka], ["Sapporo", sapporo]]) {
  for (const line of lines) {
    if (refused.has(line.code)) drop("JASDEC");
    else if (line.code.length === 5) drop("5-digit code");
    else rows.push(jpRow({ ...line, exchange, type: "STOCK" }));
  }
}

attachJapanIsins(rows);
writeCatalogue(import.meta.url, "mitsubishiufjmorgan-parsed.json", rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Nagoya: 150,
  Fukuoka: 5,
  Sapporo: 5,
  HKEX: 400,
});
console.error(`US PDF ${foreign.us.rows.length} rows (${foreign.us.asOf}), HK PDF ${foreign.hk.rows.length} rows (${foreign.hk.asOf})`);
console.error(`Left out: ${Object.entries(dropped).map(([why, count]) => `${count} ${why}`).join(", ")}`);
