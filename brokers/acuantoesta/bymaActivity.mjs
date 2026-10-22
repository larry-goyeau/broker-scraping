// A second check on the rows ../comafi/byma.mjs writes, shared by the
// Argentine brokers whose own feed shows whether a line traded today
// (brokers/acuantoesta, brokers/hipotecario).
//
// byma.mjs counts a line as quoted when anything has a price on it: a
// trade, a bid, an offer or a previous close. BYMA and the brokers' feeds
// carry stub bids (ADS at 10 pesos against a last of 3,980, YZCA at 0.01),
// lone offers (ELPCD) and frozen previous closes (0.01) on lines that have
// not traded for years, so those lines never reach its history check.
// Here every row that did not trade today on the broker's own feed is
// looked up in BYMA's daily history (chart/historical-series, the 24HS
// term, about 800 days deep; BYMA answers no_data for every CI series).
// A day counts only when its volume is above zero: the series carries the
// last close forward on days with no trade. The row is not written when
//   - BYMA shows no trade on it in that time, or
//   - its last trade is more than 180 days old, or
//   - it traded on fewer than 5 days and not in the last 30 (SBSPD: 1
//     day, 2026-08-14; YELPD: 2 days, the last 2026-08-10). A new or thin
//     line with a trade in the last month stays (EMBJC, CRWVC).
// A row that traded today stays without a lookup.
//
// A CEDEAR of a bond (DJNJ3, DJN3C, DJN3D: "Johnson & Johnson 6,95
// 01/09/29") is a Cedears kind on BYMA like a share certificate, so
// byma.mjs writes it as a STOCK. A CEDEAR whose name carries a maturity
// date, or a coupon with a percent sign, is not a share and is not
// written.
//
// The history must answer for every row, in the shape it has today
// (s, t, v); a symbol it never answers for, or a changed shape, stops the
// run rather than keeping or dropping the row unseen. AAPL 24HS is read
// first and must show at least 100 trade days.
//
//   https://open.bymadata.com.ar/ (chart/historical-series/history)

import { getText, pause } from "../comafi/byma.mjs";

const HISTORY = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/chart/historical-series/history";
const DEPTH = 800;
const RECENT = 180;
const FEW = 5;
const QUIET = 30;
const DAY = 86400;

const iso = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

// { days, last, sessions } of the 24HS line of a symbol: days with a
// trade, the last of them (seconds, 0 when none) and the sessions the
// series covers.
export async function tradeHistory(symbol) {
  const to = Math.floor(Date.now() / 1000);
  const url = `${HISTORY}?symbol=${encodeURIComponent(`${symbol} 24HS`)}&resolution=D&from=${to - DEPTH * DAY}&to=${to}`;
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let parsed = null;
    try {
      parsed = JSON.parse(await getText(url));
    } catch (error) {
      last = `${error.message || error}`;
    }
    if (parsed && typeof parsed.s === "string") {
      if (parsed.s === "no_data") return { days: 0, last: 0, sessions: 0 };
      if (parsed.s !== "ok") throw new Error(`BYMA history of ${symbol} answered s=${parsed.s}`);
      const times = parsed.t;
      const volume = parsed.v;
      if (!Array.isArray(times) || !Array.isArray(volume) || times.length !== volume.length) {
        throw new Error(`BYMA history of ${symbol} changed shape: ${Object.keys(parsed).join(",")}`);
      }
      const traded = times.filter((_, index) => Number(volume[index]) > 0);
      await pause(200);
      return { days: traded.length, last: traded.length ? Math.max(...traded) : 0, sessions: times.length };
    }
    if (parsed) last = `no status field (${Object.keys(parsed).join(",")})`;
    await pause(1500 * (attempt + 1));
  }
  throw new Error(`BYMA history of ${symbol} did not answer: ${last}`);
}

// The reason a row is dormant, or "".
function dormancy({ days, last, sessions }, now) {
  if (!days) return "no trade on BYMA in two years";
  if (now - last > RECENT * DAY) return `last trade on BYMA ${iso(last)}`;
  if (days < FEW && now - last > QUIET * DAY) return `${days} trade days on BYMA in ${sessions} sessions, the last ${iso(last)}`;
  return "";
}

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return out;
}

// rows: byma.mjs rows; tradedToday: the tickers with a trade today on the
// broker's own feed. Returns the rows kept and the lines left out, each
// "TICKER reason", and counts by reason.
export async function withoutDormant(rows, tradedToday, label) {
  const probe = await tradeHistory("AAPL");
  if (probe.days < 100) throw new Error(`BYMA history of AAPL shows only ${probe.days} trade days`);
  const now = Math.floor(Date.now() / 1000);
  const quiet = rows.filter((row) => !tradedToday.has(row.ticker)).map((row) => row.ticker);
  let done = 0;
  const reasons = new Map(
    await pool(quiet, 2, async (symbol) => {
      done += 1;
      if (done % 100 === 0) console.error(`${label} BYMA history ${done}/${quiet.length}`);
      return [symbol, dormancy(await tradeHistory(symbol), now)];
    })
  );
  const dropped = [];
  const counts = { never: 0, stale: 0, few: 0 };
  const kept = rows.filter((row) => {
    const reason = reasons.get(row.ticker);
    if (!reason) return true;
    dropped.push(`${row.ticker} ${reason}`);
    if (reason.startsWith("no trade")) counts.never += 1;
    else if (reason.startsWith("last trade")) counts.stale += 1;
    else counts.few += 1;
    return false;
  });
  return { rows: kept, dropped, counts, checked: quiet.length };
}

// A CEDEAR of a bond: a maturity date (01/09/29) or a coupon with a
// percent sign in its name.
export function isBondCedear(row) {
  return row.panel === "cedear" && (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(row.name) || /\b\d+(?:[.,]\d+)?\s?%/.test(row.name));
}
