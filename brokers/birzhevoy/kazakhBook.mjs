// Every share and ETF of Kazakhstan's two exchanges, with no login, for a
// broker whose tariff covers the whole of KASE and AIX (./birzhevoy).
//
// kaseListings(): the instruments API behind KASE's "Shares and ADR/GDR"
// page. sec_type=share gives the main and alternative boards
// (is_kase_global=false) and the KASE Global sector of foreign shares
// (is_kase_global=true, MSFT_KZ, AAPL_KZ...); sec_type=dept the depositary
// receipts. Each line carries its ISIN (ticker.nin) and its trading
// currency. Excluded (delisted) lines are not asked for. KASE lists no ETF.
//
//   https://kase.kz/en/markets/shares-and-adr-gdr
//   https://kase.kz/api/instruments/securities/?sec_type=share&is_kase_global=false&is_excluded=false&search=
//
// aixListings(): the market-watch API behind market.aixkz.com. Active
// ordinary and preferred shares, GDRs and ADSs are kept from the main
// records; from the ETF board, the active equity fund units whose name says
// ETF (single-stock ETF units, ITS World ETF, Fonte Bitcoin ETF...).
// Private investment companies, closed-end funds, bonds, ETNs and
// structured notes stay out. A second currency line of a share (AIRA.U,
// KSPI.S, CORE.K) prints a placeholder ISIN; it takes the ISIN of the same
// issuer's line of the same instrument that has a real one.
//
//   https://market.aixkz.com/official-list
//   https://market-backend.aixkz.com/api/table/mw-main-records
//   https://market-backend.aixkz.com/api/table/etf-main-records

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const KASE_API = "https://kase.kz/api/instruments/securities/";
const AIX_API = "https://market-backend.aixkz.com/api/table";

export const KASE = { exchange: "Kazakhstan Stock Exchange", mic: "XKAZ" };
export const AIX = { exchange: "Astana International Exchange", mic: "AIXK" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// ISO 6166 check digit. AIX's placeholders (KZ1CCCCCCCC3, KZAAAAAAAAA5)
// pass it, so a run of six equal characters is refused too.
export function isIsin(value) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value) || /(.)\1{5}/.test(value)) return false;
  const digits = value
    .slice(0, 11)
    .split("")
    .map((char) => (/[0-9]/.test(char) ? char : String(char.charCodeAt(0) - 55)))
    .join("");
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10 === Number(value[11]);
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

function row(place, { ticker, name, currency, type, isin, note }) {
  return {
    query: isin,
    ticker,
    name,
    exchange: place.exchange,
    mic: place.mic,
    currency,
    type,
    isin,
    raw: [ticker, name, place.exchange, currency, isin, type, note].filter(Boolean).join(" "),
  };
}

export async function kaseListings() {
  const asks = [
    ["sec_type=share&is_kase_global=false", "main/alternative"],
    ["sec_type=share&is_kase_global=true", "KASE Global"],
    ["sec_type=dept", "depositary receipt"],
  ];
  const rows = [];
  const leftOut = [];
  for (const [query, sector] of asks) {
    const items = await getJson(`${KASE_API}?${query}&is_excluded=false&search=`);
    if (!Array.isArray(items)) throw new Error(`KASE ${sector}: no list`);
    for (const item of items) {
      const ticker = clean(item.code);
      const isin = clean(item.ticker?.nin).toUpperCase();
      const currency = clean(item.currency_type).toUpperCase();
      if (!isIsin(isin)) {
        leftOut.push(`${ticker} no ISIN`);
        continue;
      }
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`KASE ${ticker}: currency ${item.currency_type}`);
      const kind = clean(item.subcategory_name_en || item.ticker?.typesec_en);
      rows.push(row(KASE, { ticker, name: clean(item.org_name_en), currency, type: "STOCK", isin, note: `${sector} ${kind}` }));
    }
  }
  const counts = (test) => rows.filter(test).length;
  if (counts((r) => /main\/alternative/.test(r.raw)) < 60) throw new Error("KASE gave fewer than 60 local shares");
  if (counts((r) => /KASE Global/.test(r.raw)) < 30) throw new Error("KASE gave fewer than 30 KASE Global shares");
  for (const isin of ["KZ1C00001536", "KZ1C00001619", "US5949181045"]) {
    if (!rows.some((r) => r.isin === isin)) throw new Error(`KASE ${isin} is missing`);
  }
  const keys = new Set();
  for (const r of rows) {
    const key = `${r.isin}|${r.currency}`;
    if (keys.has(key)) throw new Error(`KASE ${key} twice`);
    keys.add(key);
  }
  return { rows, leftOut };
}

const AIX_SHARES = new Set(["ordinary shares", "preferred shares", "gdrs", "adss"]);

export async function aixListings() {
  const main = await getJson(`${AIX_API}/mw-main-records`);
  const funds = await getJson(`${AIX_API}/etf-main-records`);
  if (!Array.isArray(main) || main.length < 100) throw new Error(`AIX main records: ${main?.length ?? 0} lines`);
  if (!Array.isArray(funds)) throw new Error("AIX ETF records: no list");

  const shares = main.filter((item) => AIX_SHARES.has(clean(item.instrument).toLowerCase()) && item.state === "Active");
  const realIsin = new Map();
  for (const item of shares) {
    const isin = clean(item.isin).toUpperCase();
    if (isIsin(isin)) realIsin.set(`${clean(item.issuer)}|${clean(item.instrument)}`.toLowerCase(), isin);
  }

  const rows = [];
  const leftOut = [];
  for (const item of shares) {
    const ticker = clean(item.secCode);
    let isin = clean(item.isin).toUpperCase();
    let note = clean(item.instrument);
    if (!isIsin(isin)) {
      const twin = realIsin.get(`${clean(item.issuer)}|${clean(item.instrument)}`.toLowerCase());
      if (!twin) {
        leftOut.push(`${ticker} placeholder ISIN ${isin}`);
        continue;
      }
      note += `, AIX ISIN ${isin}`;
      isin = twin;
    }
    rows.push(row(AIX, { ticker, name: clean(item.issuer), currency: clean(item.currency).toUpperCase(), type: "STOCK", isin, note }));
  }
  for (const item of funds) {
    if (item.assetClass !== "EQTY" || item.state !== "Active") continue;
    const name = clean(item.name);
    if (!/\bETFU?\b|exchange traded fund/i.test(name)) continue;
    const isin = clean(item.isin).toUpperCase();
    const ticker = clean(item.secCode);
    if (!isIsin(isin)) {
      leftOut.push(`${ticker} no ISIN`);
      continue;
    }
    rows.push(row(AIX, { ticker, name, currency: clean(item.currency).toUpperCase(), type: "ETF", isin, note: "ETF board" }));
  }
  if (rows.filter((r) => r.type === "STOCK").length < 15) throw new Error("AIX gave fewer than 15 shares");
  if (!rows.some((r) => r.isin === "KZ1C00001619")) throw new Error("AIX Kazatomprom is missing");
  const keys = new Set();
  for (const r of rows) {
    const key = `${r.isin}|${r.currency}`;
    if (keys.has(key)) throw new Error(`AIX ${key} twice`);
    keys.add(key);
  }
  return { rows, leftOut };
}
