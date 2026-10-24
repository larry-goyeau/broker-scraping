// Every share and ETF on the Nigerian Exchange, with no login, for a broker
// that deals in the whole exchange (../meristem). The source is the public
// Standard Bank feed behind Stanbic IBTC's equities price listing, the one
// ../stanbicibtc reads: every NGX line of the day, each with its market
// segment. Main Board (EQTY), Premium, Growth and the listed REITs
// (REITCEF) are shares; the ETF segment is the funds, and the non-interest
// segment adds a bank and an ETF. Bonds and sukuk (DEBT, IMPACT, the
// non-interest debt), the NGX indexes (INDX), the memorandum mutual funds
// (MFUND) and the closed-end infrastructure and real-estate funds on the
// Main Board are other products and are left out. The feed prints an ISIN
// on most lines; a code with a bad check digit is dropped.
//
//   https://feeds.standardbank.com/Market-Data-Files/NSB/Rates/allNGAStock.json
//
// ngxListings() returns { rows, day, leftOut, badIsins }.

const FEED = "https://feeds.standardbank.com/Market-Data-Files/NSB/Rates/allNGAStock.json";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
export const PLACE = "Nigerian Exchange";
const SHARES = new Set(["EQTY", "PREMIUM", "GROWTH", "REITCEF"]);
const LEFT_OUT = { DEBT: "bonds", IMPACT: "impact bonds", INDX: "indexes", MFUND: "mutual funds" };
const COLUMNS = { Symbol: "1", Name: "2", Sector: "3", MktSegment: "20", ISINCode: "21", Date: "0" };
const FLOOR = { STOCK: 120, ETF: 8 };
const MUST = ["DANGCEM", "MTNN", "GTCO", "ZENITHBANK", "STANBICETF30"];

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.stanbicibtcstockbrokers.com/" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function isinCheck(code) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(code)) return false;
  const digits = code.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function kindOf(segment, sector, name) {
  if (segment === "ETF") return "ETF";
  if (segment === "NON-INTEREST") {
    if (sector === "ETF") return "ETF";
    if (sector === "DEBT" || sector === "NON-INTEREST") return "sukuk";
    return "STOCK";
  }
  if (SHARES.has(segment)) {
    if (/\bFUND\b/.test(name) && !/REIT/i.test(sector)) return "closed-end funds";
    return "STOCK";
  }
  if (LEFT_OUT[segment]) return LEFT_OUT[segment];
  throw new Error(`unknown market segment ${segment || "(none)"} on ${name}`);
}

export async function ngxListings() {
  const table = (await getJson(FEED))?.DataTable;
  for (const [label, index] of Object.entries(COLUMNS)) {
    if (table?.ColumnDef?.[index] !== label) throw new Error(`feed column ${index} is ${table?.ColumnDef?.[index]}, not ${label}`);
  }
  const lines = table.Rows;
  if (!Array.isArray(lines) || lines.length < 250) throw new Error(`feed has ${lines?.length ?? 0} lines`);

  const dateOf = (line) => Date.parse(clean(line[COLUMNS.Date]).split(" ")[0]);
  const latest = Math.max(...lines.map(dateOf).filter(Number.isFinite));
  const day = clean(lines.find((line) => dateOf(line) === latest)[COLUMNS.Date]).split(" ")[0];
  if (!((Date.now() - latest) / 86_400_000 < 10)) throw new Error(`feed is dated ${day}`);

  const rows = [];
  const seen = new Set();
  const leftOut = new Map();
  let badIsins = 0;
  for (const line of lines) {
    const ticker = clean(line[COLUMNS.Symbol]).toUpperCase();
    const name = clean(line[COLUMNS.Name]);
    const segment = clean(line[COLUMNS.MktSegment]).toUpperCase();
    const sector = clean(line[COLUMNS.Sector]);
    if (!ticker || !name) throw new Error(`unreadable line ${JSON.stringify(line).slice(0, 160)}`);
    const type = kindOf(segment, sector, name);
    if (type !== "STOCK" && type !== "ETF") {
      leftOut.set(type, (leftOut.get(type) || 0) + 1);
      continue;
    }
    if (seen.has(ticker)) throw new Error(`${ticker} repeats`);
    seen.add(ticker);
    let isin = clean(line[COLUMNS.ISINCode]).replace(/\s+/g, "").toUpperCase();
    if (isin && !isinCheck(isin)) {
      badIsins += 1;
      isin = "";
    }
    rows.push({
      query: isin || ticker,
      ticker,
      name,
      exchange: PLACE,
      mic: "XNGN",
      currency: "NGN",
      type,
      ...(isin ? { isin } : {}),
      raw: [ticker, name, sector, segment, isin, PLACE].filter(Boolean).join(" "),
    });
  }

  const isins = new Set();
  for (const row of rows) {
    if (!row.isin) continue;
    if (isins.has(row.isin)) throw new Error(`ISIN ${row.isin} repeats`);
    isins.add(row.isin);
  }
  const count = { STOCK: 0, ETF: 0 };
  for (const row of rows) count[row.type] += 1;
  for (const [type, floor] of Object.entries(FLOOR)) {
    if (count[type] < floor) throw new Error(`only ${count[type]} ${type} lines`);
  }
  for (const ticker of MUST) if (!seen.has(ticker)) throw new Error(`missing ${ticker}`);

  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  return { rows, day, leftOut, badIsins };
}
