// PKO supermakler publishes two foreign lists: shares (and depositary receipts)
// and ETFs. The receipts stay out. A trust in the ETF file stays out. A line
// marked ETP stays ETP. Two leveraged copper lines are marked ETC/ETN and
// kept as ETC. Lines marked ETP/ETN are kept as ETN.
//
// The share file has no currency column. Each row takes the quotation currency
// of its market. Zurich can also be EUR or USD, and London can be USD.
//
// Warsaw is the other book. Communiqué 4/1 of 2 March 2026 says what the
// brokerage does not intermediate on the Polish market: GlobalConnect, and
// SILVAR-REGS (USU827061099). The main GPW board, NewConnect, and the Warsaw
// ETF board are the rest. Bankier tags every Warsaw ETP as "etf"; the symbol
// prefix is the product (ETC, ETN, otherwise ETF).
//
//   https://www.bm.pkobp.pl/oferta/rynki-zagraniczne
//   https://www.bm.pkobp.pl/api/default/a71c0e31-f9a2-455f-9121-821dfef914e4.pdf
//
//   node pkobp/pkobp_scraping.mjs
//   node pkobp/pkobp_scraping.mjs --shares=./akcje.pdf --etf=./etf.pdf
//
// Text is read with PyMuPDF (`python3 -c "import fitz"`).

import { stampRows } from "../accepted.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const PAGE = "https://www.bm.pkobp.pl/oferta/rynki-zagraniczne";
const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const ETF_BOARD = "https://www.bankier.pl/gielda/notowania/etf";
const SILVAIR = "USU827061099";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CCY = {
  XWBO: "EUR",
  XBRU: "EUR",
  XPRA: "CZK",
  XCSE: "DKK",
  XPAR: "EUR",
  XMAD: "EUR",
  XAMS: "EUR",
  XLUX: "EUR",
  XETR: "EUR",
  XOSL: "NOK",
  XLIS: "EUR",
  XSWX: "CHF",
  XSTO: "SEK",
  XNAS: "USD",
  XNYS: "USD",
  ARCX: "USD",
  XBUD: "HUF",
  XLON: "GBP",
  XMIL: "EUR",
};

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  // The check digit is a number, so a 12-letter word is not an ISIN.
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function pathArg(flag) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

function placeOf(text) {
  const s = normalize(text).toUpperCase();
  if (!s) return "";
  if (/ARCA/.test(s)) return "ARCX";
  if (/NASDAQ/.test(s) && !/NORDIC|OMX|COPENHAGEN|STOCKHOLM|SWEDEN|DENMARK/.test(s)) return "XNAS";
  if (/NYSE|NEW YORK/.test(s)) return "XNYS";
  if (/LONDON|\bLSE\b|LONDYN/.test(s)) return "XLON";
  // The share file names Germany "Deutsche Boerse", and one ETF line says GXE
  // on a symbol that ends in GY. Both are Xetra. The fee table has no other
  // German book.
  if (/XETRA|\bXETR\b|DEUTSCHE|\bGXE\b/.test(s)) return "XETR";
  if (/PARIS/.test(s)) return "XPAR";
  if (/AMSTE/.test(s)) return "XAMS";
  if (/MILAN|ITALY|ITALIAN|\bBIT\b/.test(s)) return "XMIL";
  if (/SWISS|\bSIX\b/.test(s)) return "XSWX";
  if (/OSLO/.test(s)) return "XOSL";
  if (/WIENER|AUSTRIA/.test(s)) return "XWBO";
  if (/BRUSSEL/.test(s)) return "XBRU";
  if (/MADRID|SPAIN/.test(s)) return "XMAD";
  if (/LISBON|PORTUGAL/.test(s)) return "XLIS";
  if (/COPENHAGEN|DENMARK/.test(s)) return "XCSE";
  if (/STOCKHOLM|SWEDEN/.test(s)) return "XSTO";
  if (/PRAGUE|CZECH/.test(s)) return "XPRA";
  if (/BUDAPEST|HUNGARY|WĘGRY|WEGRY/.test(s)) return "XBUD";
  if (/LUXEMBOURG/.test(s)) return "XLUX";
  return "";
}

function quoteCurrency(text) {
  const codes = normalize(text).toUpperCase().match(/\b[A-Z]{3}\b/g) || [];
  return codes.find((code) => code !== "PLN" && code !== "LUB") || "";
}

function etpType(label, name) {
  const cell = normalize(label).toUpperCase().replace(/\s+/g, "");
  if (cell.startsWith("TRUST")) return "";
  if (cell === "ETP") return "ETP";
  if (cell === "ETC/ETN") return "ETC";
  if (cell === "ETP/ETN") return "ETN";
  if (cell.startsWith("ETF")) return "ETF";
  if (cell.startsWith("ETC")) return "ETC";
  if (cell.startsWith("ETN")) return "ETN";
  const title = normalize(name).toUpperCase();
  if (/\bETN\b/.test(title)) return "ETN";
  if (/\bETC\b/.test(title)) return "ETC";
  if (/\bETP\b/.test(title)) return "ETP";
  if (/\bETF\b/.test(title)) return "ETF";
  return "";
}

function warsawProduct(ticker) {
  if (/^ETC/i.test(ticker)) return "ETC";
  if (/^ETN/i.test(ticker)) return "ETN";
  return "ETF";
}

function isReceipt(name, short) {
  return /\b(ADR|GDR)\b/i.test(`${name} ${short}`);
}

async function catalogueUrls() {
  const shares = pathArg("shares");
  const etf = pathArg("etf");
  if (shares && etf) return { shares, etf };
  const response = await fetch(PAGE, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`PKO page answered ${response.status}`);
  const html = await response.text();
  const hrefs = [...html.matchAll(/href="([^"]+\.pdf[^"]*)"/gi)].map((match) =>
    new URL(match[1].replace(/&amp;/g, "&"), PAGE).href
  );
  const decoded = (href) => decodeURIComponent(href);
  return {
    shares: shares || hrefs.find((href) => /akcje|kwity/i.test(decoded(href))) || "",
    etf: etf || hrefs.find((href) => /etfy/i.test(decoded(href))) || "",
  };
}

async function pdfBytes(source) {
  if (source && !/^https?:/i.test(source)) return fs.readFileSync(source);
  const response = await fetch(source, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`PKO PDF answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("PKO list URL did not return a PDF");
  return bytes;
}

function pdfLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz

doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
rows = []
for page in doc:
    words = sorted(page.get_text("words"), key=lambda w: (w[1], w[0]))
    current = []
    last = None
    for x0, y0, x1, y1, text, *_rest in words:
        text = text.strip()
        if not text:
            continue
        if last is not None and y0 - last > 2 and current:
            rows.append(current)
            current = []
        current.append({"x": x0, "text": text})
        last = y0
    if current:
        rows.append(current)
json.dump(rows, sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.status !== 0) {
    const detail = python.stderr?.toString() || "";
    throw new Error(
      detail.includes("No module named 'fitz'")
        ? "PyMuPDF is missing: pip install pymupdf"
        : `Could not read the PDF${detail ? `: ${detail.trim()}` : ""}`
    );
  }
  return JSON.parse(python.stdout.toString("utf8"));
}

function shareColumn(x) {
  if (x < 120) return "country";
  if (x < 220) return "venue";
  if (x < 330) return "desc";
  if (x < 460) return "name";
  if (x < 540) return "short";
  if (x < 650) return "isin";
  if (x < 770) return "note";
  return "type";
}

function shareListings(lines) {
  const results = [];
  const seen = new Set();
  const skipped = [];
  for (const line of lines) {
    const buckets = { country: [], venue: [], desc: [], name: [], short: [], isin: [], note: [], type: [] };
    for (const word of line) buckets[shareColumn(word.x)].push(word.text);
    const isin = buckets.isin.map(toIsin).find(Boolean) || line.map((word) => toIsin(word.text)).find(Boolean) || "";
    const type = normalize(buckets.type.join(" ")).toUpperCase();
    if (!isin || type !== "AKCJE") continue;
    const name = normalize(buckets.name.join(" "));
    const short = normalize(buckets.short.join(" "));
    if (isReceipt(name, short)) continue;
    const where = normalize(`${buckets.desc.join(" ")} ${buckets.venue.join(" ")}`);
    const exchange = placeOf(where);
    const currency = CCY[exchange] || "";
    if (!exchange || !currency) {
      skipped.push(where || isin);
      continue;
    }
    const ticker = short || name;
    if (!ticker) continue;
    const key = `${isin}:${exchange}:${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      query: isin,
      ticker,
      name: name || ticker,
      exchange,
      currency,
      type: "STOCK",
      raw: [ticker, name, exchange, currency, "STOCK"].filter(Boolean).join(" "),
      isin,
    });
  }
  return { results, skipped };
}

function etfColumn(x) {
  if (x < 250) return "name";
  if (x < 310) return "isin";
  if (x < 360) return "short";
  if (x < 415) return "venue";
  if (x < 470) return "ccy";
  if (x < 520) return "type";
  return "rest";
}

function etfListings(lines) {
  const results = [];
  const seen = new Set();
  const skipped = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isin = line.map((word) => toIsin(word.text)).find(Boolean) || "";
    if (!isin) continue;
    const buckets = { name: [], isin: [], short: [], venue: [], ccy: [], type: [], rest: [] };
    for (const word of line) buckets[etfColumn(word.x)].push(word.text);
    const earlier = [];
    // A wrapped title sits on the line above the ISIN. A full title on the ISIN
    // line is left as it is, so a section heading is not glued on in front.
    if (buckets.name.length < 3) {
      for (let back = index - 1; back >= 0 && index - back <= 2; back -= 1) {
        if (lines[back].some((word) => toIsin(word.text))) break;
        const bits = lines[back].filter((word) => word.x < 250).map((word) => word.text);
        if (!bits.length) continue;
        earlier.unshift(...bits);
        break;
      }
    }
    const name = normalize([...earlier, ...buckets.name].join(" "));
    const label = buckets.type
      .map((word) => normalize(word).toUpperCase())
      .find((word) => /^(ETF\/UCITS|ETC\/ETP|ETC\/UCITS|ETC\/ETN|ETN\/ETP|ETP\/ETN|ETF|ETC|ETN|ETP|TRUST)$/.test(word)) || "";
    const type = etpType(label, name);
    if (!type) {
      if (label || name) skipped.push(`${isin} ${label || name}`);
      continue;
    }
    let venueText = buckets.venue.join(" ");
    if (!placeOf(venueText)) {
      for (let back = index - 1; back >= 0 && index - back <= 2; back -= 1) {
        if (lines[back].some((word) => toIsin(word.text))) break;
        const guess = lines[back].map((word) => word.text).join(" ");
        if (placeOf(guess)) {
          venueText = guess;
          break;
        }
      }
    }
    const exchange = placeOf(venueText);
    const currency = quoteCurrency(buckets.ccy.join(" "));
    const ticker = normalize(buckets.short.join(" "));
    if (!exchange || !currency || !ticker) {
      skipped.push(`${isin} ${buckets.venue.join(" ")} ${buckets.ccy.join(" ")}`.trim());
      continue;
    }
    const key = `${isin}:${exchange}:${ticker}:${currency}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      query: isin,
      ticker,
      name: name || ticker,
      exchange,
      currency,
      type,
      raw: [ticker, name, exchange, currency, type].filter(Boolean).join(" "),
      isin,
    });
  }
  return { results, skipped };
}

function boardSymbols(html) {
  const body = html.split("<tbody>").at(-1)?.split("</tbody>")[0] ?? "";
  const symbols = [];
  const seen = new Set();
  for (const match of body.matchAll(/quote\.html\?symbol=([^"&]+)/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    symbols.push(match[1]);
  }
  return symbols;
}

function refusedSymbol(symbol) {
  return /SILVAIR-REGS|SILVAR-REGS/i.test(symbol);
}

async function profileHead(symbol) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetch(
        `https://www.bankier.pl/inwestowanie/profile/quote.html?symbol=${encodeURIComponent(symbol)}`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }
      );
    } catch (error) {
      last = `${symbol} profile ${error.message}`;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      last = `${symbol} profile answered ${response.status}`;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    let html = "";
    while (size < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      html = Buffer.concat(chunks).toString("utf8");
      if (html.includes("data-isin=") && html.includes("data-unit=") && html.includes("a-heading__suffix")) break;
    }
    await reader.cancel();
    return html;
  }
  throw new Error(last || `${symbol} profile did not answer`);
}

function profileRow(html, symbol, exchange, type) {
  const isin = toIsin(html.match(/data-isin="([^"]+)"/)?.[1]);
  const unit = html.match(/data-unit="([^"]+)"/)?.[1] ?? "";
  if (!isin || unit !== "zł" || isin === SILVAIR) return null;
  const suffix = normalize(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = normalize(wrapped ? wrapped[2] : symbol).toUpperCase();
  const name = normalize(wrapped ? wrapped[1] : suffix);
  if (!ticker || refusedSymbol(ticker) || refusedSymbol(suffix) || refusedSymbol(symbol)) return null;
  return {
    query: isin,
    ticker,
    name: name || ticker,
    exchange,
    currency: "PLN",
    type,
    raw: [ticker, name, exchange, "PLN", type].filter(Boolean).join(" "),
    isin,
  };
}

async function warsawRows() {
  const [sharesPage, ncPage, etfPage] = await Promise.all([
    fetch(SHARE_BOARD, { headers: { "user-agent": UA } }),
    fetch(NC_BOARD, { headers: { "user-agent": UA } }),
    fetch(ETF_BOARD, { headers: { "user-agent": UA } }),
  ]);
  if (!sharesPage.ok) throw new Error(`GPW share board answered ${sharesPage.status}`);
  if (!ncPage.ok) throw new Error(`NewConnect board answered ${ncPage.status}`);
  if (!etfPage.ok) throw new Error(`GPW ETF board answered ${etfPage.status}`);
  const [sharesHtml, ncHtml, etfHtml] = await Promise.all([sharesPage.text(), ncPage.text(), etfPage.text()]);
  const jobs = [
    ...boardSymbols(sharesHtml).map((symbol) => ({ symbol, exchange: "GPW", type: "STOCK" })),
    ...boardSymbols(ncHtml).map((symbol) => ({ symbol, exchange: "NewConnect", type: "STOCK" })),
    ...boardSymbols(etfHtml).map((symbol) => ({ symbol, exchange: "GPW", type: warsawProduct(symbol) })),
  ].filter((job) => !refusedSymbol(job.symbol));
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const html = await profileHead(job.symbol);
      const row = profileRow(html, job.symbol, job.exchange, job.type);
      if (row) rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  return rows;
}

const urls = await catalogueUrls();
if (!urls.shares || !urls.etf) throw new Error("PKO page did not link the share list and the ETF list");
const [shareLines, etfLines] = await Promise.all([
  pdfBytes(urls.shares).then(pdfLines),
  pdfBytes(urls.etf).then(pdfLines),
]);
const shares = shareListings(shareLines);
const funds = etfListings(etfLines);
const fromPdf = [...shares.results, ...funds.results];
const pdfByType = new Map();
for (const row of fromPdf) pdfByType.set(row.type, (pdfByType.get(row.type) || 0) + 1);
console.error(
  `PDF ${fromPdf.length} (${[...pdfByType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`
);
const skipped = [...shares.skipped, ...funds.skipped];
if (skipped.length) console.error(`PDF skipped ${skipped.length}: ${skipped.slice(0, 8).join(" | ")}`);

const seen = new Set(fromPdf.map((row) => `${row.isin}:${row.exchange}:${row.currency}`));
const results = [...fromPdf];
let warsaw = 0;
for (const row of await warsawRows()) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
  warsaw += 1;
}
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});
const outputPath = new URL("pkobp-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const warsawByType = new Map();
for (const row of results.filter((row) => row.exchange === "GPW" || row.exchange === "NewConnect")) {
  warsawByType.set(`${row.exchange} ${row.type}`, (warsawByType.get(`${row.exchange} ${row.type}`) || 0) + 1);
}
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`
);
console.error(
  `Warsaw ${warsaw} added. On the book: ` +
    `${[...warsawByType].map(([label, count]) => `${count} ${label}`).join(", ") || "none"}`
);
