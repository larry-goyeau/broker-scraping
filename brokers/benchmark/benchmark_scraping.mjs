// What BenchMark Finance (Bulgaria) sells on the Bulgarian Stock Exchange
// through BG Trader, with no login. These are real shares and exchange-traded
// products held in the client's name; BenchMark's MetaTrader 4/5 CFDs (on
// shares, indices, currencies, metals, crypto) are a different account and
// are not read.
//
// The "For investors" pages list every issue BG Trader offers, one shelf per
// page, each filled by an open JSON API that gives the BSE code, the ISIN, the
// issuer, the share type, the trading phase, the last and closing price and
// the currency of every line (lang=1 Bulgarian, lang=2 English):
//
//   https://www.benchmark.bg/issues.php?share_type=1&share_subtype=1   Bulgarian shares
//   https://www.benchmark.bg/issues.php?share_type=1&share_subtype=2   international shares
//   https://www.benchmark.bg/issues.php?share_type=4                   ETF
//   https://www.benchmark.bg/issues.php?share_type=5                   АДСИЦ (REITs)
//   https://www.benchmark.bg/api/bgtr-get-issues/?lang=2&share_type=<n>&share_subtype=<m>
//   https://www.benchmark.bg/pics/editor/PDFBG/Tariff_v_sila_ot_11.08.2026.pdf
//   https://www.benchmark.bg/Внос-на-средства_545.html
//
// Rules:
//   Bulgarian shares     the BSE main market: "Bulgarian Stock Exchange", XBUL,
//                        STOCK.
//   International shares the BSE International segment, where foreign shares
//                        trade on the BSE's own book under their Xetra codes
//                        (Nordea is 04Q): "BSE International", XBUL, STOCK.
//                        It is a segment of the same exchange, not a second
//                        venue, so its MIC is the BSE's.
//   АДСИЦ (REITs)        Bulgarian special-purpose investment companies. They
//                        are joint-stock companies whose shares trade on the
//                        BSE main market like any other share, so they are
//                        kept, as STOCK on the "Bulgarian Stock Exchange".
//   ETF shelf            a Bulgarian ISIN (the Expat index ETFs, the national
//                        investment funds) is on the main market; any other
//                        ISIN is on BSE International. A line whose name says
//                        ETN is an ETN; one whose name says ETC or ETP
//                        (BTCetc, iShares Physical Gold ETC), Xetra-Gold, or a
//                        Jersey, Guernsey, UK or Swiss note (WisdomTree Wheat,
//                        WisdomTree Bitcoin) is an ETC; any other Irish or
//                        Luxembourg line is an ETF, even when its name reads
//                        like a commodity (WTDI, IE00BZ0XVF52, is listed as
//                        "WisdomTree Cocoa" but is the AT1 CoCo Bond UCITS
//                        ETF); the rest are ETFs.
//   Left out             bonds and government securities (share_type=2),
//                        compensatory instruments (share_type=3), rights
//                        (share_type=6), a right or warrant that sits on the
//                        ETF shelf (a BG92 ISIN, "wrt" in the name), and a line
//                        whose phase is DEL (delisted).
//   Currency             the API's own (Valuta) for each line. Since the euro
//                        replaced the lev on 1 January 2026 every BSE line,
//                        both segments, quotes in EUR. BG Trader is funded in
//                        EUR or USD (the deposit page above lists one EUR and
//                        one USD IBAN for BG Trader clients); a USD deposit is
//                        converted at BenchMark's rate.
//   Names                English (lang=2); the Bulgarian name goes in `raw`.
//
//   node brokers/benchmark/benchmark_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const API = "https://www.benchmark.bg/api/bgtr-get-issues/";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const MAIN = "Bulgarian Stock Exchange";
const INTERNATIONAL = "BSE International";

// Each shelf read, with the least it must hold so a short answer is not
// mistaken for a whole one.
const SHELVES = [
  { label: "Bulgarian shares", share_type: 1, share_subtype: 1, min: 150 },
  { label: "international shares", share_type: 1, share_subtype: 2, min: 150 },
  { label: "ETF", share_type: 4, min: 30 },
  { label: "REIT", share_type: 5, min: 30 },
];

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function issues(shelf, lang) {
  const query = new URLSearchParams({ lang: String(lang), share_type: String(shelf.share_type) });
  if (shelf.share_subtype) query.set("share_subtype", String(shelf.share_subtype));
  const url = `${API}?${query}`;
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.benchmark.bg/issues.php" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.success && Array.isArray(payload.data)) return payload.data;
        last = `no data in ${url}`;
      } else {
        last = `${response.status} ${url}`;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// A right or warrant on a share, which BSE codes BG92 and BenchMark calls "wrt".
function isRight(line) {
  return line.ISIN.startsWith("BG92") || /\b(wrt|warrants?|rights?|права)\b/i.test(`${line.en} ${line.bg}`);
}

function productType(line) {
  const name = `${line.en} ${line.bg}`;
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/(ETC|ETP)\b/i.test(name) || /Xetra-Gold/i.test(name)) return "ETC";
  if (/^(IE|LU)/.test(line.ISIN)) return "ETF";
  if (/^(JE|GG|GB|CH)/.test(line.ISIN)) return "ETC";
  return "ETF";
}

const rows = [];
const seen = new Set();
const tally = { delisted: 0, rights: 0, badIsin: 0, duplicate: 0, neverTraded: 0 };

for (const shelf of SHELVES) {
  const [bulgarian, english] = await Promise.all([issues(shelf, 1), issues(shelf, 2)]);
  if (bulgarian.length < shelf.min) throw new Error(`${shelf.label}: only ${bulgarian.length} lines`);
  const englishName = new Map(english.map((line) => [`${line.StockCode}|${line.ISIN}`, normalize(line.IssuerName)]));

  let kept = 0;
  for (const source of bulgarian) {
    const line = {
      ...source,
      ISIN: normalize(source.ISIN).toUpperCase(),
      bg: normalize(source.IssuerName),
      en: englishName.get(`${source.StockCode}|${source.ISIN}`) || normalize(source.IssuerName),
    };
    const ticker = normalize(line.StockCode).toUpperCase();
    if (!ISIN.test(line.ISIN) || !ticker) {
      tally.badIsin += 1;
      continue;
    }
    if (line.Phase === "DEL") {
      tally.delisted += 1;
      continue;
    }
    if (isRight(line)) {
      tally.rights += 1;
      continue;
    }

    let exchange = MAIN;
    let type = "STOCK";
    if (shelf.share_type === 1 && shelf.share_subtype === 2) exchange = INTERNATIONAL;
    if (shelf.share_type === 4) {
      exchange = line.ISIN.startsWith("BG") ? MAIN : INTERNATIONAL;
      type = productType(line);
    }

    const key = `${exchange}|${line.ISIN}`;
    if (seen.has(key)) {
      tally.duplicate += 1;
      continue;
    }
    seen.add(key);
    if (!line.trdTim || line.trdTim.startsWith("1970")) tally.neverTraded += 1;

    const currency = normalize(line.Valuta).toUpperCase() || "EUR";
    rows.push({
      query: ticker,
      ticker,
      name: line.en,
      exchange,
      mic: "XBUL",
      currency,
      type,
      isin: line.ISIN,
      raw: [
        ticker,
        line.ISIN,
        line.en,
        line.en === line.bg ? "" : line.bg,
        shelf.label,
        normalize(line.SectorName),
        line.Phase,
        line.clsPrc ?? "",
        currency,
      ]
        .filter((part) => part !== "")
        .join(" | "),
    });
    kept += 1;
  }
  console.error(`${shelf.label}: ${bulgarian.length} lines, ${kept} kept`);
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("benchmark-parsed.json", import.meta.url), JSON.stringify(written, null, 2));

const counts = {};
for (const row of written) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${written.length} rows (${rows.length - written.length} dropped as debt)`, tally);
