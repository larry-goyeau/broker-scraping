import fs from "node:fs";

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  if (!firstColumn) return "";

  const afterExchange = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;

  // Drop common exchange/currency suffix chunks.
  return (afterExchange || "").split(/[./]/)[0].trim();
}

function loadJsonArray(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`Missing ${path}. Run the related scraper first.`);
  }
  const content = fs.readFileSync(path, "utf8").trim();
  if (!content) {
    throw new Error(`Empty ${path}. Run the related scraper first.`);
  }
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(`Invalid JSON in ${path}.`);
  }
}

function buildBrokerTickerSet(rows) {
  const tickers = new Set();
  for (const row of rows) {
    const queryTicker = normalizeTicker(row?.query || "");
    const resultTicker = normalizeTicker(row?.ticker || "");
    if (queryTicker) tickers.add(queryTicker);
    if (resultTicker) tickers.add(resultTicker);
  }
  return tickers;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const etfsPath = "etfs.csv";
if (!fs.existsSync(etfsPath)) {
  console.error("Missing etfs.csv");
  process.exit(1);
}

const etfsLines = fs
  .readFileSync(etfsPath, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0);

try {
  const tradingRows = loadJsonArray("trading212-parsed.json");
  const etoroRows = loadJsonArray("etoro-parsed.json");
  const tradeRepublicRows = loadJsonArray("traderepublic-parsed.json");

  const tradingTickers = buildBrokerTickerSet(tradingRows);
  const etoroTickers = buildBrokerTickerSet(etoroRows);
  const tradeRepublicTickers = buildBrokerTickerSet(tradeRepublicRows);

  const report = etfsLines.map((line) => {
    const [symbol = "", name = ""] = line.split(",");
    const ticker = normalizeTicker(symbol);
    const inTrading212 = tradingTickers.has(ticker);
    const inEtoro = etoroTickers.has(ticker);
    const inTradeRepublic = tradeRepublicTickers.has(ticker);

    return {
      symbol: symbol.trim(),
      ticker,
      name: (name || "").trim(),
      in_trading212: inTrading212,
      in_etoro: inEtoro,
      in_traderepublic: inTradeRepublic,
      in_any: inTrading212 || inEtoro || inTradeRepublic,
    };
  });

  fs.writeFileSync("broker-coverage.json", JSON.stringify(report, null, 2));

  const csvHeader = "symbol,ticker,name,in_trading212,in_etoro,in_traderepublic,in_any";
  const csvRows = report.map((row) =>
    [
      csvEscape(row.symbol),
      csvEscape(row.ticker),
      csvEscape(row.name),
      row.in_trading212,
      row.in_etoro,
      row.in_traderepublic,
      row.in_any,
    ].join(",")
  );
  fs.writeFileSync("broker-coverage.csv", [csvHeader, ...csvRows].join("\n") + "\n");

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
