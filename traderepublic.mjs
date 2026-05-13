import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toTickerOnly(value) {
  const text = (value || "").trim();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  if (!firstColumn) return "";

  const tickerWithSuffix = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;

  const baseTicker = (tickerWithSuffix || "").split(/[./]/)[0];
  return baseTicker.trim().toUpperCase();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      // Expected CSV shape: ticker,isin,name
      const cols = line.split(",");
      const isinCol = (cols[1] || "").trim();
      return toIsin(isinCol);
    })
    .filter(Boolean);
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseFundRow(text, query) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (/couldn['’]t find anything that matches/i.test(compact)) return null;

  const isinMatch = compact.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/);
  if (!isinMatch) return null;

  const isin = isinMatch[1];
  const name = compact.slice(0, isinMatch.index).trim();

  let rest = compact.slice((isinMatch.index || 0) + isin.length).trim();
  if (rest.startsWith(isin)) rest = rest.slice(isin.length).trim();

  let issuer = null;
  const issuerMatch = rest.match(/·\s*(.+)$/);
  if (issuerMatch) {
    issuer = issuerMatch[1].replace(/\s+[0-9].*$/, "").trim() || null;
  }

  return {
    query,
    ticker: query,
    isin,
    name,
    exchange: issuer,
    raw: issuer ? `${name} ${isin} · ${issuer}` : `${name} ${isin}`,
    found: true,
  };
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("traderepublic.com")) || (await browser.newPage());
await page.bringToFront();

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = process.argv.slice(2).filter(Boolean).map(toIsin).filter(Boolean);
const csvQueries = loadIsinsFromCsv("etfs.csv");
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const results = [];
const seen = new Set();

for (const query of queries) {
  const url = `https://app.traderepublic.com/browse/fund?q=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(900);

  const rowTexts = await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

    return [...new Set(
      [...document.querySelectorAll("tbody tr")]
        .map((row) => norm(row.innerText))
        .filter((text) => !!text && !/^Security\s+/i.test(text))
    )];
  });

  for (const text of rowTexts) {
    const parsed = parseFundRow(text, query);
    if (!parsed) continue;

    const key = parsed.isin ? `ISIN:${parsed.isin}` : `RAW:${parsed.raw.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(parsed);
  }
}

fs.writeFileSync("traderepublic-parsed.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
