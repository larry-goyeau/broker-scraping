// What Fortuneo actually quotes: ask the signed-in search for each ISIN
// on the fund and share lists, keep the venues a ticket can name.
//
// Session: Chrome on http://127.0.0.1:9222, tab
// `https://mabanque.fortuneo.fr/…`. Search is
// `/fr/prive/recherche.jsp?saisie={ISIN}&pattern={ISIN}`. One hit
// redirects to the fiche (`cdReferentiel=FTN######ISIN`); several hits
// print a table (place, mnemonic, type). Facts the table does not carry
// — MIC, currency, `isTradable` — come from
// `https://api.fortuneo.fr/trading-instrument/v1/instruments/{id}`.
//
// German regional floors (Frankfurt, Munich, Hamburg, Berlin,
// Düsseldorf) and the Nasdaq OTC mirror of a European share are quote
// satellites: they stay out. Spot crypto is not a Fortuneo product.
//
//   node fortuneo/fortuneo_scraping.mjs
//   node fortuneo/fortuneo_scraping.mjs FR0000120271 IE00B4L5Y983 US0378331005
//   node fortuneo/fortuneo_scraping.mjs --refresh --start=400
//   node fortuneo/fortuneo_scraping.mjs --stocks-only --start=400
//
// Writes `fortuneo-parsed.json` next to this file.

import puppeteer from "puppeteer-core";
import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  return firstColumn.includes(":") ? firstColumn.split(":").pop().trim() : firstColumn;
}

function loadByIsin(csvPath, kind, into = new Map()) {
  if (!fs.existsSync(csvPath)) return into;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    const exchange =
      isinIndex >= 2 ? (columns[isinIndex - 1] || "").trim().toUpperCase() : "";
    if (!name) continue;

    const rows = into.get(isin) || [];
    into.set(isin, rows);
    rows.push({ ticker, kind, name, exchange });
  }
  return into;
}

const MIC_EXCHANGE = {
  XPAR: "EURONEXT",
  XAMS: "EURONEXT",
  XBRU: "EURONEXT",
  XLIS: "EURONEXT",
  XNAS: "NASDAQ",
  XNGS: "NASDAQ",
  XNMS: "NASDAQ",
  XNCM: "NASDAQ",
  XNYS: "NYSE",
  XASE: "AMEX",
  ARCX: "AMEX",
  BATS: "CBOE",
  XETR: "XETR",
  XLON: "LSE",
  XSWX: "SIX",
  XVTX: "SIX",
  XMIL: "MIL",
  ETFP: "MIL",
  XWBO: "VIE",
  XSTO: "OMXSTO",
  XHEL: "OMXHEX",
  XOSL: "OSL",
  XMCE: "BME",
  XMAD: "BME",
  XHKG: "HKEX",
  XTKS: "TSE",
};

const PLACE_EXCHANGE = [
  { test: /nasdaq(?!.*otc)/i, exchange: "NASDAQ" },
  { test: /nyse american|amex/i, exchange: "AMEX" },
  { test: /nyse arca|arca/i, exchange: "AMEX" },
  { test: /\bnyse\b/i, exchange: "NYSE" },
  { test: /euronext|paris|amsterdam|bruxelles|brussels|lisbonne|lisbon/i, exchange: "EURONEXT" },
  { test: /xetra/i, exchange: "XETR" },
  { test: /london|lse\b/i, exchange: "LSE" },
  { test: /swiss|six|zurich|zürich|zurich/i, exchange: "SIX" },
  { test: /milan|borsa/i, exchange: "MIL" },
  { test: /madrid|bolsa/i, exchange: "BME" },
  { test: /vienna|wiener/i, exchange: "VIE" },
  { test: /stockholm/i, exchange: "OMXSTO" },
  { test: /helsinki/i, exchange: "OMXHEX" },
  { test: /oslo/i, exchange: "OSL" },
  { test: /hong.?kong/i, exchange: "HKEX" },
  { test: /tokyo/i, exchange: "TSE" },
];

const SKIP_PLACE = /frankfurt|francfort|wertpapier|munchen|münchen|munich|hamburg|berlin|dusseldorf|düsseldorf|stuttgart|hannover|otc market|otc\b|pink/i;

function mapPlace(place) {
  const text = String(place || "").replace(/\s+/g, " ").trim();
  if (!text || SKIP_PLACE.test(text)) return "";
  for (const row of PLACE_EXCHANGE) {
    if (row.test.test(text)) return row.exchange;
  }
  return "";
}

function mapType(label) {
  const text = String(label || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (/etn/.test(text)) return "ETN";
  if (/etc/.test(text)) return "ETC";
  if (/tracker|etf|indiciel/.test(text)) return "ETF";
  if (/action|stock|share|ordinary/.test(text)) return "STOCK";
  return "";
}

function tickerFor(rows, csvExchange, kind, fallback) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange ? pool.filter((row) => row.exchange === csvExchange) : [];
  return (onVenue[0] || pool[0] || {}).ticker || fallback || "";
}

function nameFor(rows, csvExchange, kind, fallback) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange ? pool.filter((row) => row.exchange === csvExchange) : [];
  return (onVenue[0] || pool[0] || {}).name || fallback;
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&nbsp;/g, " ");
}

function parseTitle(html) {
  const raw = decodeHtml((html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "");
  const hit = raw.match(/^Cours\s+(\S+)\s+(.+?)\s+\(([^)]+)\),\s+bourse de\s+(.+?)\s+et cotations/i);
  if (!hit) return null;
  return { typeLabel: hit[1], name: hit[2].trim(), ticker: hit[3].trim().toUpperCase(), place: hit[4].trim() };
}

function parseSearch(html, isin) {
  const listings = [];
  const seen = new Set();
  const push = (row) => {
    const id = String(row.id || "").toUpperCase();
    if (!id || seen.has(id)) return;
    seen.add(id);
    listings.push(row);
  };

  const rowRe =
    /fiche-valeur\.jsp\?cdReferentiel=(FTN\d{6}[A-Z0-9]+)[^>]*>\s*([^<]+)\s*<\/a>[\s\S]*?<td class="txt">\s*([^<]+?)\s*<\/td>\s*<td class="txt">\s*([^<]+?)\s*<\/td>\s*<td class="txt">\s*([^<]+?)\s*<\/td>\s*<td class="txt">\s*([A-Z]{2}[A-Z0-9]{9}\d)\s*<\/td>/gi;
  for (const match of html.matchAll(rowRe)) {
    push({
      id: match[1],
      name: decodeHtml(match[2]).trim(),
      place: decodeHtml(match[3]).trim(),
      ticker: decodeHtml(match[4]).trim().toUpperCase(),
      typeLabel: decodeHtml(match[5]).trim(),
      isin: toIsin(match[6]),
    });
  }

  const ids = [...html.matchAll(/cdReferentiel=(FTN\d{6}[A-Z0-9]+)/gi)].map((m) => m[1]);
  for (const id of ids) push({ id, isin, name: "", place: "", ticker: "", typeLabel: "" });

  return listings.filter((row) => !row.isin || row.isin === isin);
}

function currencyGuess({ currency, mic, exchange, place }) {
  const named = String(currency || "").toUpperCase();
  if (/^[A-Z]{3}$/.test(named) && named !== "PCT") return named;
  const tape = String(mic || "").toUpperCase();
  if (/^(XNAS|XNGS|XNMS|XNCM|XNYS|XASE|ARCX|BATS)$/.test(tape)) return "USD";
  if (/^(NASDAQ|NYSE|AMEX|CBOE)$/.test(exchange)) return "USD";
  if (/euronext|paris|amsterdam|bruxelles|brussels|lisbonne|lisbon/i.test(place || "")) {
    return "EUR";
  }
  if (exchange === "EURONEXT" || exchange === "XETR" || tape === "XETR") return "EUR";
  if (exchange === "SIX" || tape === "XSWX" || tape === "XVTX") return "CHF";
  return "";
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /mabanque\.fortuneo\.fr/i.test(candidate.url())) ||
  (await browser.newPage());
await page.bringToFront().catch(() => {});

if (!/mabanque\.fortuneo\.fr/i.test(page.url())) {
  await page.goto("https://mabanque.fortuneo.fr/fr/prive/default.jsp?ANav=1", {
    waitUntil: "domcontentloaded",
  });
}

const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");
const refresh = hasFlag("refresh");

const byIsin = new Map();
if (!stocksOnly) loadByIsin(csvPath, "ETF", byIsin);
if (!fundsOnly) loadByIsin(stocksCsvPath, "STOCK", byIsin);

const cliQueries = positionalArgs.map(toIsin).filter(Boolean);
const csvQueries = [...byIsin.keys()];
const HOME_RANK = { FR: 0, IE: 1, LU: 2, NL: 3, US: 4, GB: 5, DE: 6, BE: 7, CH: 8 };
const homeRank = (isin) => HOME_RANK[String(isin).slice(0, 2)] ?? 9;
const queries = [...new Set(cliQueries.length > 0 ? cliQueries : csvQueries)].sort((a, b) => {
  return homeRank(a) - homeRank(b) || a.localeCompare(b);
});

const outputPath = new URL("fortuneo-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const lookedUp = new Set();
const entryKey = (query, ticker, exchange, currency) =>
  `${query}:${ticker}:${exchange}:${currency || ""}`.toUpperCase();

function loadJson(fileUrl) {
  if (!fs.existsSync(fileUrl)) return null;
  try {
    return JSON.parse(fs.readFileSync(fileUrl, "utf8"));
  } catch {
    return null;
  }
}

const existing = loadJson(outputPath);
if (Array.isArray(existing) && !refresh) {
  for (const entry of existing) {
    results.push(entry);
    if (entry?.query && entry?.ticker) {
      seen.add(entryKey(entry.query, entry.ticker, entry.exchange, entry.currency));
    }
    if (entry?.query) lookedUp.add(String(entry.query).toUpperCase());
  }
}

if (startIndex > 1) {
  for (const isin of queries.slice(0, startIndex - 1)) lookedUp.add(isin);
}

let cookieHeader = "";

async function refreshSession() {
  const cookies = await page.cookies("https://mabanque.fortuneo.fr");
  cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function raceTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

async function fetchText(url, timeoutMs = 12000) {
  const run = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Cookie: cookieHeader,
          Accept: "application/json, text/html, */*",
          Referer: "https://mabanque.fortuneo.fr/fr/prive/recherche.jsp",
        },
        signal: controller.signal,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") || "";
      const text = /iso-8859|latin/i.test(type)
        ? buffer.toString("latin1")
        : buffer.toString("utf8");
      return { status: response.status, text, type };
    } catch {
      return { status: 0, text: "" };
    } finally {
      clearTimeout(timer);
    }
  };
  return raceTimeout(run(), timeoutMs + 2000, { status: 0, text: "" });
}

async function fetchInPage(url, timeoutMs = 10000, accept = "text/html, */*") {
  return raceTimeout(
    page.evaluate(
      async (href, acceptHeader) => {
        try {
          const response = await fetch(href, {
            credentials: "include",
            headers: { Accept: acceptHeader },
          });
          return { status: response.status, text: await response.text(), url: response.url };
        } catch (err) {
          return { status: 0, text: String(err?.message || err), url: "" };
        }
      },
      url,
      accept
    ),
    timeoutMs,
    { status: 0, text: "", url: "" }
  );
}

function isLoadingShell(html) {
  return /asynchhttp:|loading\.gif/i.test(html || "") && !/cdReferentiel=FTN/i.test(html || "");
}

async function search(isin) {
  const encoded = encodeURIComponent(isin);
  const url = `https://mabanque.fortuneo.fr/fr/prive/recherche.jsp?saisie=${encoded}&pattern=${encoded}&typeVal=0&length=100`;
  let answer = { status: 0, text: "", url: "" };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    answer = await fetchInPage(url);
    if (answer.status !== 200 || /identifiant|connexion/i.test(answer.text || "")) {
      await refreshSession();
      await sleep(300);
      continue;
    }
    if (isLoadingShell(answer.text)) {
      await sleep(400 * (attempt + 1));
      continue;
    }
    return answer;
  }
  return answer;
}

async function instrument(id) {
  const href = `https://api.fortuneo.fr/trading-instrument/v1/instruments/${id}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fromPage = await fetchInPage(href, 10000, "application/json");
    if (fromPage.status === 200 && fromPage.text.trim().startsWith("{")) {
      try {
        return { status: 200, json: JSON.parse(fromPage.text) };
      } catch {
        /* keep trying */
      }
    }
    if (fromPage.status === 404 || fromPage.status === 410) {
      return { status: fromPage.status, json: null };
    }
    await sleep(250 + attempt * 300);
  }
  return { status: 0, json: null };
}

async function fiche(id) {
  return fetchInPage(
    `https://mabanque.fortuneo.fr/fr/prive/bourse/fiche-valeur.jsp?cdReferentiel=${encodeURIComponent(id)}&activeTab=resume`
  );
}

await refreshSession();
if (!cookieHeader) {
  throw new Error("Could not read the Fortuneo session. Is mabanque.fortuneo.fr signed in?");
}
let sample = { status: 0, text: "" };
for (let attempt = 0; attempt < 4 && !/cdReferentiel=FTN/i.test(sample.text || ""); attempt += 1) {
  if (attempt) await refreshSession();
  sample = await search("US0378331005");
  if (!/cdReferentiel=FTN/i.test(sample.text || "")) await sleep(400);
}
if (!/cdReferentiel=FTN/i.test(sample.text || "")) {
  throw new Error(
    `Could not read the Fortuneo session (${sample.status}, ${sample.text?.length || 0} bytes). Is mabanque.fortuneo.fr signed in?`
  );
}

const pending = queries.filter((isin) => !lookedUp.has(isin));
console.error(`${pending.length} ISINs to look up (${lookedUp.size} already done)`);

const skipped = new Map();
const bump = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);

function saveResults() {
  fs.writeFileSync(outputPath, JSON.stringify(stampRows(results, import.meta.url), null, 2));
}

const CONCURRENCY = 1;

for (let offset = 0; offset < pending.length; offset += CONCURRENCY) {
  const batch = pending.slice(offset, offset + CONCURRENCY);
  const answers = await Promise.all(batch.map((isin) => search(isin)));

  for (const [index, isin] of batch.entries()) {
    lookedUp.add(isin);
    const answer = answers[index];
    if (answer.status !== 200) {
      bump("search failed");
      console.error(`  ${isin}: search failed`);
      continue;
    }

    let hits = parseSearch(answer.text, isin);
    if (!hits.length && answer.url) {
      const fromUrl = String(answer.url).match(/cdReferentiel=(FTN\d{6}[A-Z0-9]+)/i);
      if (fromUrl) hits = [{ id: fromUrl[1], isin, name: "", place: "", ticker: "", typeLabel: "" }];
    }
    if (!hits.length) {
      bump("not listed");
      continue;
    }

    let kept = 0;
    for (const hit of hits) {
      if (SKIP_PLACE.test(hit.place)) {
        bump("satellite tape");
        continue;
      }

      let place = hit.place;
      let ticker = hit.ticker;
      let typeLabel = hit.typeLabel;
      let name = hit.name;
      let summary = {};
      let mic = "";
      let exchange = mapPlace(place);
      let type = mapType(typeLabel);
      let currency = currencyGuess({ currency: "", mic, exchange, place });

      if (!place || !ticker || !typeLabel || !exchange || !type || !currency) {
        const sheet = await instrument(hit.id);
        summary = sheet.json?.summary || {};
        const eligibility = sheet.json?.eligibility || {};
        if (sheet.status === 410 || summary.isDisplayable === false) {
          bump("not visible");
          continue;
        }
        if (summary.isTradable === false || eligibility.cto === false) {
          bump("not tradable");
          continue;
        }
        mic = String(summary.exchange?.mic || "").toUpperCase();
        exchange = MIC_EXCHANGE[mic] || exchange;
        type = mapType(summary.type?.name) || mapType(summary.nature?.name) || type;
        currency = currencyGuess({
          currency: summary.currency,
          mic,
          exchange,
          place: place || summary.exchange?.longName,
        });
        place = place || summary.exchange?.longName || place;
        ticker = ticker || String(summary.symbol || "").trim().toUpperCase();
        name = name || String(summary.shortName || summary.longName || "").trim();
      }

      if ((!exchange || !type || !currency) && hit.id) {
        const pageHtml = await fiche(hit.id);
        const titled = parseTitle(pageHtml.text);
        if (titled) {
          place = place || titled.place;
          ticker = ticker || titled.ticker;
          typeLabel = typeLabel || titled.typeLabel;
          name = name || titled.name;
          exchange = exchange || mapPlace(place);
          type = type || mapType(typeLabel);
          currency = currency || currencyGuess({ currency, mic, exchange, place });
        }
      }

      if (SKIP_PLACE.test(place)) {
        bump("satellite tape");
        continue;
      }

      if (!exchange) {
        bump("unknown venue");
        continue;
      }
      if (!type) {
        bump("skipped type");
        continue;
      }
      if (fundsOnly && type !== "ETF" && type !== "ETC" && type !== "ETN") continue;
      if (stocksOnly && type !== "STOCK") continue;

      const csvRows = byIsin.get(isin);
      if (csvRows?.length) {
        const hasEtf = csvRows.some((row) => row.kind === "ETF");
        const hasStock = csvRows.some((row) => row.kind === "STOCK");
        if (type === "STOCK" && !hasStock && hasEtf) {
          bump("csv type");
          continue;
        }
        if ((type === "ETF" || type === "ETC" || type === "ETN") && !hasEtf && hasStock) {
          bump("csv type");
          continue;
        }
      }

      if (!currency) {
        bump("no currency");
        continue;
      }

      const symbol =
        String(summary.symbol || "").trim().toUpperCase() ||
        ticker ||
        tickerFor(csvRows, exchange, type, isin);
      const label = nameFor(
        csvRows,
        exchange,
        type,
        String(summary.shortName || summary.longName || name || "").replace(/\s+/g, " ").trim()
      );

      const key = entryKey(isin, symbol, exchange, currency);
      if (seen.has(key)) continue;
      seen.add(key);
      kept += 1;

      results.push({
        query: isin,
        ticker: symbol,
        name: label,
        exchange,
        currency,
        type,
        raw: [summary.longName || name, isin, summary.exchange?.longName || place, summary.type?.name || typeLabel]
          .filter(Boolean)
          .join(" "),
        isin,
      });
    }
    if (kept === 0 && hits.length > 0) bump("no usable listing");
    await sleep(80);
  }

  if (offset > 0 && offset % 200 === 0) await refreshSession();

  const done = offset + batch.length;
  if (done <= 8 || done % 200 < CONCURRENCY || done >= pending.length) {
    const why = [...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ");
    console.error(`  looked up ${done}/${pending.length}, ${results.length} listings` + (why ? ` (${why})` : ""));
  }
  if (done % 100 < CONCURRENCY) saveResults();
}

saveResults();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})`
);
for (const [reason, count] of [...skipped].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)} ${reason}`);
}

if (cliQueries.length) console.log(JSON.stringify(results.filter((row) => cliQueries.includes(row.isin)), null, 2));

await browser.disconnect();
