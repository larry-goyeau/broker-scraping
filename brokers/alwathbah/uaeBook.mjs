// Every share and ETF of the Dubai Financial Market and the Abu Dhabi
// Securities Exchange, with no login, for a broker that deals in the whole
// of both (../alwathbah). The exchanges' own lists are read.
//
// dfmListings(): DFM's listed-securities page loads its list from one API
// call (FreshSecuritiesLists), as ../ivestor reads it. Active DFM
// equities, ETFs and REITs are kept; a REIT is a listed share of a
// closed-end trust and is written as STOCK. Bonds, sukuk, listed mutual
// funds, rights issues and delisted names are left out, and so are the
// Nasdaq Dubai lines the same list carries (another exchange). Each kept
// symbol must be on the market-watch board, in dirhams; its company
// profile gives the ISIN.
//
//   https://www.dfm.ae/the-exchange/market-information/listed-securities/equities
//   POST https://api2.dfm.ae/web/widgets/v1/data   Command=FreshSecuritiesLists
//   POST https://api2.dfm.ae/web/widgets/v1/data   Command=companyprofile&symbol=…
//   https://api2.dfm.ae/mw/v1/stocks
//
// adxListings(): ADX's market watch (the gateway behind adx.ae/all-equities,
// with the key its own page publishes, as ../../spreads/gulf.mjs reads it)
// prints each line's symbol, ISIN, name, board and trading state. The main
// board (EQTY), the private-companies board (PRCN) and the dual listings
// (DUAL: GFH, Ooredoo, Sudatel...) are shares; the FUND board is the ETFs.
// Warrants (SPCW) and suspended lines are left out. ADX quotes in dirhams.
//
//   https://www.adx.ae/all-equities
//   https://apigateway.adx.ae/adx/marketwatch-delayed/1.1/securityBoard/marketwatch

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const DFM_API = "https://api2.dfm.ae/web/widgets/v1/data";
const DFM_BOARD = "https://api2.dfm.ae/mw/v1/stocks";
const ADX_BOARD = "https://apigateway.adx.ae/adx/marketwatch-delayed/1.1/securityBoard/marketwatch";
const ADX_HEADERS = {
  accept: "application/json",
  "channel-id": "OSS WEB",
  "x-correlation-id": "uuid",
  "x-uuid": "",
  "adx-gateway-apikey": "1863a94c-582b-46f9-b4f0-0d02c0cc5307",
  Referer: "https://www.adx.ae/",
  Origin: "https://www.adx.ae",
};
const ADX_BOARDS = { EQTY: "STOCK", PRCN: "STOCK", DUAL: "STOCK", FUND: "ETF" };
const ADX_LEFT_OUT = { SPCW: "warrants" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isIsin = (value) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value);

async function getJson(url, { body, headers = {} } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = `${url} ${body || ""}: ${error.message}`;
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

const DFM_SHELVES = { Equities: "STOCK", REITs: "STOCK", ETFs: "ETF" };
const DFM_KINDS = { Equities: "equities", REITs: "realEstateInvestmentTrust", ETFs: "exchangeTradedFunds" };

export async function dfmListings() {
  const headers = { Referer: "https://www.dfm.ae/" };
  const lists = await getJson(DFM_API, { body: "Command=FreshSecuritiesLists&Language=en&lang=en", headers });
  for (const shelf of [...Object.keys(DFM_SHELVES), "Bonds", "Sukuks", "Funds"]) {
    if (!Array.isArray(lists?.[shelf])) throw new Error(`DFM list has no ${shelf} shelf`);
  }
  const board = await getJson(DFM_BOARD, { headers });
  if (!Array.isArray(board) || board.length < 200) throw new Error(`DFM board printed ${board?.length ?? 0} lines`);
  const onBoard = new Map(board.map((line) => [clean(line.id).toUpperCase(), line]));

  const picked = [];
  const leftOut = { "Nasdaq Dubai": 0, inactive: 0 };
  for (const [shelf, type] of Object.entries(DFM_SHELVES)) {
    for (const entry of lists[shelf]) {
      const ticker = clean(entry.SecuritySymbol).toUpperCase();
      if (!ticker) throw new Error(`unreadable ${shelf} entry ${JSON.stringify(entry).slice(0, 120)}`);
      if (!entry.Active) {
        leftOut.inactive += 1;
        continue;
      }
      if (entry.Exchange === "Nasdaq Dubai") {
        leftOut["Nasdaq Dubai"] += 1;
        continue;
      }
      if (entry.Exchange !== "DFM") throw new Error(`${ticker} is on ${entry.Exchange}`);
      picked.push({ ticker, name: clean(entry.FullName), shelf, type });
    }
  }
  if (picked.length < 60) throw new Error(`DFM list gave only ${picked.length} active securities`);

  const rows = [];
  for (const item of picked) {
    const line = onBoard.get(item.ticker);
    if (!line) throw new Error(`${item.ticker} is listed but not on the DFM board`);
    if (Number(line.rate) !== 1) throw new Error(`${item.ticker} is quoted at rate ${line.rate}, not in dirhams`);
    const profile = await getJson(DFM_API, {
      body: `Command=companyprofile&lang=en&symbol=${encodeURIComponent(item.ticker)}`,
      headers,
    });
    const card = Array.isArray(profile) ? profile[0] : profile;
    if (!card || clean(card.Symbol).toUpperCase() !== item.ticker) throw new Error(`no profile for ${item.ticker}`);
    if (card.Market !== "DFM") throw new Error(`${item.ticker} profile says market ${card.Market}`);
    const isin = clean(card.ISIN).toUpperCase();
    if (!isIsin(isin)) throw new Error(`no ISIN for ${item.ticker}`);
    if (clean(card.InstrumentType) !== DFM_KINDS[item.shelf]) {
      throw new Error(`${item.ticker} is ${card.InstrumentType}, not ${DFM_KINDS[item.shelf]}`);
    }
    const name = item.name || clean(card.FullName);
    rows.push({
      query: isin,
      ticker: item.ticker,
      name,
      exchange: "DFM",
      mic: "XDFM",
      currency: "AED",
      type: item.type,
      isin,
      raw: [item.ticker, name, "DFM", "AED", isin, item.type].join(" "),
    });
    await sleep(150);
  }
  if (new Set(rows.map((row) => row.isin)).size !== rows.length) throw new Error("two DFM symbols share an ISIN");
  return { rows: rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker)), leftOut };
}

export async function adxListings() {
  const body = await getJson(ADX_BOARD, { headers: ADX_HEADERS });
  const lines = body?.response?.results;
  if (!Array.isArray(lines) || lines.length < 100) throw new Error(`ADX board printed ${lines?.length ?? 0} lines`);
  const rows = [];
  const leftOut = { suspended: 0, warrants: 0 };
  const seen = new Set();
  for (const line of lines) {
    const ticker = clean(line.companySymbol).toUpperCase();
    const name = clean(line.companyID).replace(/�/g, "-");
    const board = clean(line.boardId).toUpperCase();
    const isin = clean(line.companyISIN).toUpperCase();
    if (!ticker || !name) throw new Error(`unreadable ADX line ${JSON.stringify(line).slice(0, 160)}`);
    if (ADX_LEFT_OUT[board]) {
      leftOut[ADX_LEFT_OUT[board]] += 1;
      continue;
    }
    const type = ADX_BOARDS[board];
    if (!type) throw new Error(`unknown ADX board ${board || "(none)"} on ${ticker}`);
    if (/suspend/i.test(line.tradingState)) {
      leftOut.suspended += 1;
      continue;
    }
    if (type === "ETF" && !/\bETF\b/i.test(name)) throw new Error(`${ticker} on the FUND board is not named an ETF: ${name}`);
    if (!isIsin(isin)) throw new Error(`no ISIN for ADX ${ticker}`);
    if (seen.has(ticker)) throw new Error(`ADX ${ticker} repeats`);
    seen.add(ticker);
    rows.push({
      query: isin,
      ticker,
      name,
      exchange: "ADX",
      mic: "XADS",
      currency: "AED",
      type,
      isin,
      raw: [ticker, name, board, "ADX", "AED", isin, type].join(" "),
    });
  }
  if (new Set(rows.map((row) => row.isin)).size !== rows.length) throw new Error("two ADX symbols share an ISIN");
  return { rows: rows.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker)), leftOut };
}

// nasdaqDubaiListings(): the Nasdaq Dubai lines of the same DFM list, for a
// broker that deals on Nasdaq Dubai (../birzhevoy). Active equities are
// shares; of the fund shelf only exchange-traded products (21Shares Bitcoin
// ETP) are kept, as ETN. Bonds and sukuk stay out. DFM's company profile
// prints no ISIN for these lines, so it comes from the asset lists
// (NASDAQDUBAI:<symbol>); a line with none there is left out. The DFM board
// quotes each line with its rate to the dirham: 1 is dirhams, 3.67 dollars.
export async function nasdaqDubaiListings() {
  const fs = await import("node:fs");
  const isins = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split("\n")) {
      const [ticker, exchange, isin] = line.split(",");
      if (exchange === "NASDAQDUBAI" && isIsin(isin)) isins.set(ticker.split(":")[1], isin);
    }
  }
  const headers = { Referer: "https://www.dfm.ae/" };
  const lists = await getJson(DFM_API, { body: "Command=FreshSecuritiesLists&Language=en&lang=en", headers });
  const board = await getJson(DFM_BOARD, { headers });
  const onBoard = new Map(board.map((line) => [clean(line.id).toUpperCase(), line]));
  const rows = [];
  const leftOut = [];
  for (const [shelf, wanted] of [["Equities", "STOCK"], ["Funds", "ETN"]]) {
    for (const entry of lists[shelf] || []) {
      if (entry.Exchange !== "Nasdaq Dubai" || !entry.Active) continue;
      const ticker = clean(entry.SecuritySymbol).toUpperCase();
      const name = clean(entry.FullName);
      if (wanted === "ETN" && !/\bETP\b|\bETF\b/i.test(name)) continue;
      const isin = isins.get(ticker);
      if (!isin) {
        leftOut.push(`${ticker} no ISIN in the asset lists`);
        continue;
      }
      const rate = Number(onBoard.get(ticker)?.rate);
      const currency = rate === 1 ? "AED" : Math.abs(rate - 3.6725) < 0.01 ? "USD" : "";
      if (!currency) throw new Error(`Nasdaq Dubai ${ticker} is quoted at rate ${rate}`);
      rows.push({
        query: isin,
        ticker,
        name,
        exchange: "Nasdaq Dubai",
        mic: "DIFX",
        currency,
        type: wanted,
        isin,
        raw: [ticker, name, "Nasdaq Dubai", currency, isin, wanted].join(" "),
      });
    }
  }
  if (rows.filter((row) => row.type === "STOCK").length < 4) throw new Error("Nasdaq Dubai gave fewer than 4 shares");
  return { rows, leftOut };
}
