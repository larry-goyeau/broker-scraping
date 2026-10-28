// The book of the Kazakhstan Stock Exchange (KASE, Almaty), with no login,
// for the brokers whose catalogue is the whole of KASE (UD Capital in
// ./udcapitaludcinve). Every share, depositary receipt and ETF that KASE
// lists today, minus the lines that cannot be bought.
//
// Source: the instruments API behind KASE's market pages. Each call gives
// one sector, with the line's ISIN (ticker.nin), trading currency, last
// trade time (date0) and KASE's own suspension and resumption dates
// (ticker.susp_trddat, ticker.resum_trddat). is_excluded=false leaves out
// the delisted lines (about 490 local share lines on 25 October 2026).
//
//   sec_type=share&is_kase_global=false   main and alternative boards, and
//                                          the unlisted sector (KASE's own
//                                          shares, AMGZp)
//   sec_type=share&is_kase_global=true    KASE Global: foreign shares
//                                          (AAPL_KZ, MSFT_KZ ...)
//   sec_type=dept                          depositary receipts (KSPId,
//                                          HSBKd, KZAPd, BABAd ...)
//   sec_type=mif                           investment fund units: the
//                                          KASE Global ETFs (SPY_KZ, QQQ_KZ,
//                                          GLD_KZ, IBIT_KZ ...), the local
//                                          ETFs (KASXf, MBM_f) and interval
//                                          mutual funds (BCCIbe, FHJIpc ...)
//
//   https://kase.kz/en/markets/shares-and-adr-gdr
//   https://kase.kz/api/instruments/securities/?sec_type=share&is_kase_global=false&is_excluded=false&search=
//
// Name: the issuer's English name; an ETF's name comes from
// assets/etfs.csv by ISIN when it is there (KASE prints the fund manager).
//
// ISIN: a share or ETF line has its own (ticker.nin). A depositary receipt
// carries the underlying share's ISIN in nin and the receipt's own ISIN in
// nind (KSPId: nin KZ1C00001536, nind US48581R2058, the Nasdaq ADS); the
// receipt's ISIN is used, the first one when two are given (Reg S before
// 144A).
//
// Left out:
//   - suspended lines: KASE's suspension date is set, with no resumption
//     date after it (or a resumption still to come), and no trade since
//     the suspension. Record-date halts with a resumption that has come
//     (NBIS_KZ, 10 to 16 September 2026) do not remove a line, and an old
//     suspension followed by trades (CCBNp, suspended 2006, trading daily)
//     does not either.
//   - never-traded lines: no trade on KASE on record (date0 empty), e.g.
//     AMXP (listed 2019), GALP_KZ (admitted 16 September 2026, no trade
//     yet).
//   - idle lines: no trade on KASE in the last two years (as ../comafi/
//     byma.mjs does for BYMA): dormant issuers such as LNPT (last trade
//     2009), KATR (2016), TMLZ (2019). { keepIdle: true } keeps them.
//   - interval mutual fund units (sec_type=mif, "Mutual Funds"): not ETFs.
//     { funds: true } keeps them as FUND rows.
//   - bonds, derivatives and the rest of the official list are not asked
//     for.
//
// Every row is on KASE (MIC XKAZ) in the line's own trading currency (KZT
// for local lines, mostly USD for KASE Global and receipts; GALP_KZ, AIR_KZ
// and GB_ALTN trade in KZT).
//
// Call:
//   import { kaseBook, KASE } from "../udcapitaludcinve/kaseBook.mjs";
//   const { rows, leftOut } = await kaseBook();               // default
//   const { rows } = await kaseBook({ keepIdle: true, funds: true });
// rows are in the house row shape (query, ticker, name, exchange, mic,
// currency, type, isin, raw), not yet stamped (stampRows) or written.
// leftOut lists each dropped line with its reason. Four gentle calls.
//
//   node brokers/udcapitaludcinve/kaseBook.mjs     (prints counts)

import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const API = "https://kase.kz/api/instruments/securities/";
const DAY = 86_400_000;
const IDLE_DAYS = 730;

export const KASE = { exchange: "Kazakhstan Stock Exchange", mic: "XKAZ" };

const SECTORS = [
  { query: "sec_type=share&is_kase_global=false", sector: "local share" },
  { query: "sec_type=share&is_kase_global=true", sector: "KASE Global share" },
  { query: "sec_type=dept", sector: "depositary receipt" },
  { query: "sec_type=mif", sector: "fund unit" },
];

// Fund names: KASE prints the manager (BlackRock, Inc for LQD_KZ), so an
// ETF takes its name from the shared ETF list when the ISIN is there.
function etfNames() {
  const names = new Map();
  let text = "";
  try {
    text = fs.readFileSync(new URL("../../assets/etfs.csv", import.meta.url), "utf8");
  } catch {
    return names;
  }
  for (const line of text.split("\n").slice(1)) {
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const isin = parts[2];
    const name = parts.slice(3).join(",").replace(/^"|"\s*$/g, "").replace(/""/g, '"').trim();
    if (name && !names.has(isin)) names.set(isin, name);
  }
  return names;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// ISO 6166 check digit.
export function isIsin(value) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;
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
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

const day = (value) => (value ? String(value).slice(0, 10) : "");

// Suspended today: a suspension date in the past, no resumption since (or
// one still to come), and no trade after the suspension.
function suspended(item, today) {
  const from = day(item.ticker?.susp_trddat);
  if (!from || from > today) return false;
  const back = day(item.ticker?.resum_trddat);
  if (back && back >= from && back <= today) return false;
  const traded = day(item.date0);
  return !(traded && traded > from);
}

export async function kaseBook({ keepIdle = false, funds = false } = {}) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const rows = [];
  const leftOut = [];
  const seen = new Map();
  let fundNames = null;
  for (const [index, { query, sector }] of SECTORS.entries()) {
    if (index) await sleep(1500);
    const items = await getJson(`${API}?${query}&is_excluded=false&search=`);
    if (!Array.isArray(items)) throw new Error(`KASE ${sector}: no list`);
    for (const item of items) {
      const ticker = clean(item.code);
      const drop = (reason) => leftOut.push({ ticker, sector, reason });
      const kind = clean(item.subcategory_name_en);
      let type = "STOCK";
      if (sector === "fund unit") {
        if (/^ETF$/i.test(kind)) type = "ETF";
        else if (/mutual fund/i.test(kind)) {
          if (!funds) {
            drop("interval mutual fund unit, not an ETF");
            continue;
          }
          type = "FUND";
        } else throw new Error(`KASE ${ticker}: fund kind "${kind}"`);
      }
      let isin = clean(item.ticker?.nin).toUpperCase();
      if (sector === "depositary receipt") isin = clean(item.ticker?.nind).toUpperCase() || isin;
      if (!isIsin(isin)) {
        drop(`no valid ISIN (${isin || "empty"})`);
        continue;
      }
      const currency = clean(item.currency_type).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`KASE ${ticker}: currency "${item.currency_type}"`);
      if (suspended(item, today)) {
        drop(`suspended since ${day(item.ticker.susp_trddat)}`);
        continue;
      }
      const traded = day(item.date0);
      if (!traded) {
        drop("never traded on KASE");
        continue;
      }
      if (!keepIdle && now - Date.parse(traded) > IDLE_DAYS * DAY) {
        drop(`no trade since ${traded}`);
        continue;
      }
      const key = `${isin}|${currency}`;
      if (seen.has(key)) throw new Error(`KASE ${key} twice (${seen.get(key)}, ${ticker})`);
      seen.set(key, ticker);
      const board = clean(item.board_en) && clean(item.board_en) !== "mix" ? `${clean(item.board_en)} board` : clean(item.ticker?.ticker_category);
      let name = clean(item.org_name_en);
      if (type !== "STOCK") {
        fundNames ??= etfNames();
        name = fundNames.get(isin) ?? name;
      }
      rows.push({
        query: isin,
        ticker,
        name,
        exchange: KASE.exchange,
        mic: KASE.mic,
        currency,
        type,
        isin,
        raw: [ticker, name, KASE.exchange, currency, isin, type, sector, kind, board, `last trade ${traded}`].filter(Boolean).join(" "),
      });
    }
  }
  const count = (test) => rows.filter(test).length;
  if (count((r) => / local share /.test(r.raw)) < 30) throw new Error("KASE gave fewer than 30 local shares");
  if (count((r) => /KASE Global share/.test(r.raw)) < 30) throw new Error("KASE gave fewer than 30 KASE Global shares");
  if (count((r) => r.type === "ETF") < 10) throw new Error("KASE gave fewer than 10 ETFs");
  for (const isin of ["KZ1C00001536", "KZ1C00001619", "US5949181045", "US78462F1030", "US48581R2058"]) {
    if (!rows.some((r) => r.isin === isin)) throw new Error(`KASE ${isin} is missing`);
  }
  return { rows, leftOut };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, leftOut } = await kaseBook();
  const tally = {};
  for (const r of rows) {
    const sector = r.raw.match(/(local share|KASE Global share|depositary receipt|fund unit)/)[1];
    const key = `${sector} ${r.type} ${r.currency}`;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  console.log(`${rows.length} rows`, tally);
  for (const line of leftOut) console.log(`left out ${line.ticker} (${line.sector}): ${line.reason}`);
}
