import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  // Drop venue suffixes eToro appends (IBCK.DE, VUSA.NV, IB01.L) or the CSV
  // carries (.GB/.USD) so one bare ticker keys both sides.
  return (afterExchange || "").split(".")[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// The CSV rows are `ticker,exchange,isin,name`; one ISIN recurs across venues
// under differently worded names, so every spelling and venue is kept and the
// closest wording decides a match.
function loadTickerCandidatesFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "GMBH",
  "THE",
  "CO",
  "TRUST",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

// Fund names are shortened inconsistently between sources ("Small Cap" against
// "Small-Ca"), so tokens are compared by prefix rather than equality.
function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return matched / Math.max(scraped.length, candidate.length);
}

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// eToro prices every US listing off "NASDAQ" and lumps European ones by
// operator, so each price source expands to the CSV venue codes it can cover;
// the fund's own listing then narrows it down.
const PRICE_SOURCE_VENUES = {
  NASDAQ: ["NASDAQ", "AMEX", "NYSE", "CBOE", "OTC"],
  "OTC Markets": ["OTC", "NASDAQ", "AMEX", "NYSE"],
  eToro: ["NASDAQ", "AMEX", "NYSE", "CBOE", "OTC"],
  Xetra: ["XETR"],
  "LSE PLC": ["LSE", "LSIN"],
  Euronext: ["EURONEXT"],
  "CBOE EU": ["EURONEXT", "XETR", "LSE"],
  "CBOE AUS": ["ASX"],
  HKEX: ["HKEX"],
  ADX: ["ADX"],
};

// Only EU-domiciled (UCITS) ETFs may be sold to European retail as the real
// fund; everything else -- US listings above all -- reaches them as a CFD. The
// price source eToro assigns is a faithful stand-in for that line.
const REAL_ETF_SOURCES = new Set(["Xetra", "LSE PLC", "Euronext", "CBOE EU"]);

// A shared ticker is not a shared fund. When the listing venue eToro implies
// matches where the CSV carries the ticker, the venue settles it and a verbose
// legal name need not be re-derived; without venue agreement the name must
// carry the match so a cross-border ticker clash cannot slip through.
function resolveIsin(tickerCandidates, ticker, name, venues) {
  const candidates = tickerCandidates.get(ticker) || [];
  if (candidates.length === 0) return null;

  const allowed = new Set(venues || []);
  const sameVenue =
    allowed.size > 0
      ? candidates.filter((candidate) => [...candidate.exchanges].some((exchange) => allowed.has(exchange)))
      : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    candidate,
    isin: candidate.isin,
    ...scoreCandidate(name, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((entry) => entry.score));
  if (sameVenue.length === 0 && bestScore < MIN_NAME_SCORE) return null;

  let winner;
  if (scored.length === 1) {
    winner = scored[0];
  } else {
    const winners = scored.filter((entry) => entry.score === bestScore);
    if (winners.length !== 1) return null;
    winner = winners[0];
  }

  const exchange =
    [...winner.candidate.exchanges].find((code) => allowed.has(code)) ||
    [...winner.candidate.exchanges][0] ||
    "";
  return { isin: winner.isin, name: winner.name, exchange };
}

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const outputPath = "parsed_json/etoro-parsed.json";

// eToro publishes its whole instrument catalogue unauthenticated, so the ETF
// universe -- real UCITS funds and the US ETFs it can only offer as CFDs alike
// -- comes down in one call, no logged-in browser or per-ISIN search needed.
const ETF_TYPE_ID = 6;

async function loadEtfs() {
  const url = "https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });
      if (response.ok) {
        const data = await response.json();
        return (data.InstrumentDisplayDatas || []).filter(
          (instrument) => instrument.InstrumentTypeID === ETF_TYPE_ID
        );
      }
    } catch {
      // Fall through to the pause and try again.
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error("could not fetch eToro instrument metadata");
}

const etfs = await loadEtfs();
console.error(`${etfs.length} ETFs in eToro's catalogue`);

const results = [];
let realCount = 0;
let cfdCount = 0;
let unmatched = 0;

for (const instrument of etfs) {
  const ticker = normalizeTicker(instrument.SymbolFull || "");
  if (!ticker) continue;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  const name = (instrument.InstrumentDisplayName || "").replace(/\s+/g, " ").trim();
  const priceSource = instrument.PriceSource || "";
  const cfd = !REAL_ETF_SOURCES.has(priceSource);

  const match = resolveIsin(tickerCandidates, ticker, name, PRICE_SOURCE_VENUES[priceSource]);
  if (!match) {
    unmatched += 1;
    continue;
  }

  if (cfd) cfdCount += 1;
  else realCount += 1;

  results.push({
    ticker,
    name,
    exchange: match.exchange || priceSource,
    type: "ETF",
    cfd,
    raw: [ticker, name, priceSource].filter(Boolean).join(" "),
    isin: match.isin,
  });
}

results.sort((left, right) => left.ticker.localeCompare(right.ticker));

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(
  `${results.length} ETFs matched to ${csvPath} | ${realCount} real UCITS | ${cfdCount} offered as CFD | ${unmatched} eToro ETFs with no CSV match`
);
console.log(JSON.stringify(results, null, 2));
