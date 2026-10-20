// What BKS Bank Slovenia keeps on an individual investment account, with no
// login. The bank publishes the list as a PDF and says the live book is in
// MyBroker. This file is that PDF. Bonds and treasury bills stay out.
// Shares, preferred shares and ETFs stay.
//
// Each line names one market, so the place is that market. A London line
// that names its currency stays in that currency. A London line that names
// none is written once per currency of its book. Pence and pounds are one
// sterling book. The euro is kept when that book has it.
//
//   https://www.bksbank.si/fizicne-osebe/financni-instrumenti/inr-racun
//
//   node brokers/bkssi/bkssi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spreads } from "../../spreads/book.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PAGE = "https://www.bksbank.si/fizicne-osebe/financni-instrumenti/inr-racun";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const HOME = {
  XETR: "EUR",
  XFRA: "EUR",
  XSTU: "EUR",
  XMUN: "EUR",
  XHAM: "EUR",
  XQTX: "EUR",
  XNYS: "USD",
  XNAS: "USD",
  XASE: "USD",
  OTCM: "USD",
  XPAR: "EUR",
  XAMS: "EUR",
  XBRU: "EUR",
  XLIS: "EUR",
  XMIL: "EUR",
  XWBO: "EUR",
  XSWX: "CHF",
  XBRN: "CHF",
  XTSE: "CAD",
  XTSX: "CAD",
  XCNQ: "CAD",
  NEOE: "CAD",
  XASX: "AUD",
  XTKS: "JPY",
  XKRX: "KRW",
  XSTO: "SEK",
  XCSE: "DKK",
  XHEL: "EUR",
  XOSL: "NOK",
  XMAD: "EUR",
  XATH: "EUR",
  XPRA: "CZK",
  XBUD: "HUF",
  XBSE: "RON",
  XIST: "TRY",
  XNZE: "NZD",
  XBUL: "EUR",
  XLJU: "EUR",
  XZAG: "EUR",
  XNGM: "SEK",
};

// The words the PDF prints, then the place this file already knows.
const PLACES = [
  ["XETRA Deutsche Börse AG", "XETR"],
  ["Börse Frankfurt", "XFRA"],
  ["Börse Stuttgart", "XSTU"],
  ["Börse München", "XMUN"],
  ["Börse Hamburg", "XHAM"],
  ["Börse Düsseldorf", "XQTX"],
  ["New York Stock Exchange", "XNYS"],
  ["The Nasdaq Stock Market, Inc.", "XNAS"],
  ["American Stock Exchange", "XASE"],
  ["OTC Bulletin Board - Nasdaq", "OTCM"],
  ["London International EUR on LSE", "XLON"],
  ["London International on LSE", "XLON"],
  ["London Stock Exchange", "XLON"],
  ["Euronext Paris", "XPAR"],
  ["Euronext Amsterdam USD", "XAMS"],
  ["Euronext Amsterdam", "XAMS"],
  ["Brussels Stock Exchange", "XBRU"],
  ["Euronext Lisboa", "XLIS"],
  ["Milan Stock Exchange", "XMIL"],
  ["Wiener Boerse", "XWBO"],
  ["Swiss Exchange USD", "XSWX"],
  ["SIX Swiss Exchange", "XSWX"],
  ["BX Swiss AG", "XBRN"],
  ["Toronto Stock Exchange", "XTSE"],
  ["TSX VENTURE EXCHANGE", "XTSX"],
  ["Canadian Securities Exchange", "XCNQ"],
  ["Neo Exchange", "NEOE"],
  ["Australia Stock Exchange", "XASX"],
  ["Tokio Stock Exchange", "XTKS"],
  ["KOREA STOCK EXCHANGE", "XKRX"],
  ["OMX Nordic Exchange Stockholm", "XSTO"],
  ["NASDAQ OMX COPENHAGEN", "XCSE"],
  ["Helsinki Stock Exchange", "XHEL"],
  ["Oslo Stock Exchange", "XOSL"],
  ["Bolsa de Madrid", "XMAD"],
  ["Athens Stock Exchange", "XATH"],
  ["Prague Stock Exchange", "XPRA"],
  ["Bucharest Stock Exchange", "XBSE"],
  ["Budapest Stock Exchange", "XBUD"],
  ["Istanbul Stock Exchange", "XIST"],
  ["NEW ZEALAND STOCK EXCHANGE", "XNZE"],
  ["Bulgarian Stock Exchange EUR", "XBUL"],
  ["ZAGREBAČKA BURZA EUR", "XZAG"],
  ["SI ENTER - Ljubljanska borza", "XLJU"],
  ["Ljubljanska borza, d.d.", "XLJU"],
  ["Primarne izdaje SI", "XLJU"],
  ["NORDIC GROWTH MARKET", "XNGM"],
  ["Luxemburg CHF Skladi", "XLUX"],
];

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/pdf" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return { text: await response.text(), bytes: null, response };
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function pdfUrl() {
  const { text } = await textOf(PAGE);
  const hrefs = [...text.matchAll(/href="([^"]*Seznam_FI[^"]+\.pdf)"/gi)].map((match) => match[1]);
  if (!hrefs.length) throw new Error("the INR page linked no instrument list");
  const dated = hrefs
    .map((href) => {
      const stamp = href.match(/(\d{2})_(\d{2})_(\d{4})/);
      const time = stamp ? Date.parse(`${stamp[3]}-${stamp[2]}-${stamp[1]}`) : 0;
      return { href, time };
    })
    .sort((left, right) => right.time - left.time);
  const href = dated[0].href;
  return href.startsWith("http") ? href : new URL(href, PAGE).href;
}

function pdfRows(bytes) {
  const pdfPath = path.join(os.tmpdir(), "bks-list.pdf");
  const pyPath = path.join(os.tmpdir(), "bks-list.py");
  fs.writeFileSync(pdfPath, bytes);
  fs.writeFileSync(
    pyPath,
    [
      "import json, re, sys",
      "from pypdf import PdfReader",
      'text = " ".join((page.extract_text() or "") for page in PdfReader(sys.argv[1]).pages)',
      'text = re.sub(r"\\s+", " ", text)',
      'text = re.sub(r"\\*Ta seznam.*?banke\\.", " ", text)',
      'text = re.sub(r"Najbolj ažuren.*?podatkov\\.", " ", text)',
      'text = re.sub(r"Prosimo vas, da nas v primeru zaznanih neskladij.*?podatkov\\.", " ", text)',
      'text = re.sub(r"Oznaka Ime FI ISIN Tip FI Trg Država", " ", text)',
      'countries = ("NEMČIJA","FRANCIJA","ZDA","VELIKA BRITANIJA","NIZOZEMSKA","ITALIJA","AVSTRIJA","SLOVENIJA","ŠVICA","HRVAŠKA","ŠPANIJA","JAPONSKA","KANADA","AVSTRALIJA","JUŽNA KOREJA","ŠVEDSKA","NORVEŠKA","DANSKA","FINSKA","BELGIJA","PORTUGALSKA","IRSKA","LUKSEMBURG","MADŽARSKA","POLJSKA","ČEŠKA","GRČIJA","ROMUNIJA","TURČIJA","NOVA ZELANDIJA","BOLGARIJA")',
      "suffixes = {'GR','LN','US','FP','NA','IM','SW','AV','JP','CN','KS','GY','GF','LX','UA','TI','CZ','SQ','DC','SS','FH','NO','WA','PW','IL'}",
      'parts = re.split(r"\\b([A-Z]{2}[A-Z0-9]{9}\\d)\\b", text)',
      "rows = []",
      "for i in range(1, len(parts) - 1, 2):",
      "    tail = parts[i + 1]",
      '    kind = re.match(r"\\s*(ETF|redne delnice|prednostne delnice|obveznice|zakladne menice)\\s+(.*)", tail)',
      "    if not kind: continue",
      "    if kind.group(1) in ('obveznice', 'zakladne menice'): continue",
      "    rest = kind.group(2)",
      "    cut = None",
      "    for country in sorted(countries, key=len, reverse=True):",
      '        at = rest.find(" " + country)',
      "        if at != -1 and (cut is None or at < cut): cut = at",
      "    if cut is None: continue",
      "    market = rest[:cut].strip()",
      "    head = parts[i - 1]",
      "    prev = None",
      "    for country in countries:",
      "        at = head.rfind(country)",
      "        if at != -1 and (prev is None or at > prev): prev = at + len(country)",
      "    chunk = head[prev or 0:].strip()",
      "    tokens = chunk.split()",
      "    if len(tokens) >= 2 and tokens[1] in suffixes:",
      '        ticker, name = tokens[0], " ".join(tokens[2:])',
      "    else:",
      '        ticker, name = tokens[0] if tokens else "", " ".join(tokens[1:])',
      "    if not ticker or not name or not market: continue",
      '    rows.append({"ticker": ticker, "name": name, "isin": parts[i], "kind": kind.group(1), "market": market})',
      "print(json.dumps(rows))",
      "",
    ].join("\n")
  );
  const extracted = spawnSync("python3", [pyPath, pdfPath], { encoding: "utf8", maxBuffer: 32_000_000 });
  if (extracted.status !== 0) {
    throw new Error(extracted.stderr?.trim() || "the instrument list could not be read");
  }
  const rows = JSON.parse(extracted.stdout);
  if (!Array.isArray(rows) || rows.length < 4000) {
    throw new Error(`the instrument list had ${rows?.length || 0} shares and ETFs`);
  }
  return rows;
}

function placeOf(market) {
  const hit = PLACES.find(([label]) => market === label);
  if (!hit) throw new Error(`unread market: ${market}`);
  return hit[1];
}

function statedCurrency(market) {
  const text = market.toUpperCase();
  for (const currency of ["EUR", "USD", "CHF", "PLN", "GBP"]) {
    if (new RegExp(`\\b${currency}\\b`).test(text)) return currency;
  }
  return "";
}

function londonCurrencies(isin, stated) {
  if (stated) return [stated];
  const book = spreads[isin]?.XLON || {};
  const currencies = new Set();
  if (book.GBP || book.GBX) currencies.add("GBP");
  if (book.USD) currencies.add("USD");
  if (book.EUR) currencies.add("EUR");
  if (!currencies.size) currencies.add("GBP");
  return [...currencies].sort();
}

function listingType(kind, name) {
  if (kind === "ETF") {
    if (/\bETNs?\b/i.test(name)) return "ETN";
    if (/\bETCs?\b/i.test(name)) return "ETC";
    return "ETF";
  }
  return "STOCK";
}

const listUrl = await pdfUrl();
const response = await fetch(listUrl, {
  headers: { "User-Agent": UA, Accept: "application/pdf" },
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) throw new Error(`${response.status} ${listUrl}`);
const parsed = pdfRows(Buffer.from(await response.arrayBuffer()));

const results = [];
const seen = new Set();
let londonDupes = 0;
for (const row of parsed) {
  const exchange = placeOf(row.market);
  const type = listingType(row.kind, row.name);
  const stated = statedCurrency(row.market);
  const currencies = exchange === "XLON" ? londonCurrencies(row.isin, stated) : [stated || HOME[exchange]];
  if (!currencies[0]) throw new Error(`no currency for ${row.ticker} on ${row.market}`);
  if (currencies.length > 1) londonDupes += currencies.length - 1;
  for (const currency of currencies) {
    const id = `${row.isin}:${exchange}:${currency}:${type}:${row.ticker}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({
      query: row.ticker,
      ticker: row.ticker,
      name: row.name,
      exchange,
      currency,
      type,
      isin: row.isin,
      raw: [row.ticker, row.name, row.isin, exchange, currency, type].join(" "),
    });
  }
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  const byTicker = left.ticker.localeCompare(right.ticker);
  if (byTicker !== 0) return byTicker;
  return left.currency.localeCompare(right.currency);
});

const core = results.filter((row) => row.isin === "IE00B5BMR087" && row.exchange === "XLON");
const coreCcys = new Set(core.map((row) => row.currency));
if (!coreCcys.has("GBP") || !coreCcys.has("USD")) {
  throw new Error(`London Core S&P 500 currencies were ${[...coreCcys].join(", ") || "none"}`);
}
const xetra = results.find((row) => row.isin === "IE00B5BMR087" && row.exchange === "XETR");
if (!xetra || xetra.currency !== "EUR" || xetra.type !== "ETF") throw new Error("Xetra Core S&P 500 was missing");
if (results.some((row) => row.type !== "STOCK" && row.type !== "ETF" && row.type !== "ETN" && row.type !== "ETC")) {
  throw new Error("a bond stayed in the list");
}

const kept = stampRows(withoutObligations(results));
fs.writeFileSync(new URL("bkssi-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
const byPlace = new Map();
for (const row of kept) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  const place = `${row.exchange} ${row.currency}`;
  byPlace.set(place, (byPlace.get(place) || 0) + 1);
}
console.error(
  `${kept.length} listings (${[...byPlace].sort((a, b) => b[1] - a[1]).map(([place, count]) => `${count} ${place}`).join(", ")}); ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}; ` +
    `${kept.filter((row) => row.isin).length} with an ISIN; ${londonDupes} extra London currency lines` +
    (kept.length < results.length ? `; ${results.length - kept.length} left out` : "")
);
