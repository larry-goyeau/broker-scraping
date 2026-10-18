// What MB Securities (MBS) sells in shares and exchange-traded funds, with
// no login. The S24 board speaks gRPC-web. Its supported-securities list
// (the codes the board and order screen accept) is the book: each item
// gives the code, a type (1 a share, 8 an ETF, 3 a covered warrant, 4 a
// bond, 2 a derivative, 5 an index), the name and the market code (21 HOSE,
// 11 HNX, 19 UPCOM). A type-1 line named "Quỹ …" is a closed-end fund and is
// not written, nor are warrants, bonds, derivatives and indexes. The list
// keeps names that have left the market; the board's quote for those has
// no foreign-room block, while every traded name has one, so a code is
// written only when its quote carries that block. (The exchange tabs are
// not used: they lag new listings and also keep delisted names.) The board
// prints no ISIN; the Vietnamese number is built from the ticker. The
// shared rules are in ../vix/vnboard.mjs.
//
//   https://s24.mbs.com.vn/
//   https://mkt-api-web.mbs.com.vn/mktservice.MarketDataService/GetListSupportedSecurities
//   https://mkt-api-web.mbs.com.vn/mktservice.MarketDataService/GetPriceInfo
//
//   node brokers/mbs/mbs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { clean, finish, grpcWeb, isClosedEnd, mapLimit, pause, protoFields, protoMessage, protoString, tally } from "../vix/vnboard.mjs";

const MARKET = "https://mkt-api-web.mbs.com.vn/mktservice.MarketDataService";
const HEADERS = { Origin: "https://s24.mbs.com.vn", Referer: "https://s24.mbs.com.vn/", clienttype: "1" };
// EMarketCode
const FLOOR = { 21: "HOSE", 11: "HNX", 19: "UPCOM" };
const OTHER = { 2: "derivatives", 3: "covered warrants", 4: "bonds", 5: "indexes" };

// RequestListTickers {} ; TickerInfos { items = 1 }
// TickerInfo { ticker = 1, tickertype = 2, namevi = 3, nameen = 4, marketcode = 5 }
const [securities] = await grpcWeb(`${MARKET}/GetListSupportedSecurities`, protoMessage([]), HEADERS);
const leftOut = new Map();
const wanted = new Map();
for (const raw of protoFields(securities)[1] || []) {
  const item = protoFields(raw);
  const ticker = protoString(item, 1).trim().toUpperCase();
  const kind = Number(protoString(item, 2) || 0);
  const name = clean(protoString(item, 3)) || clean(protoString(item, 4));
  const code = Number(protoString(item, 5) || 0);
  let type = "";
  if (kind === 1 && isClosedEnd(name, ticker)) tally(leftOut, "closed-end funds");
  else if (kind === 1) type = "STOCK";
  else if (kind === 8) type = "ETF";
  else tally(leftOut, OTHER[kind] || `type ${kind} lines`);
  if (!type) continue;
  if (!FLOOR[code]) throw new Error(`${ticker} has market code ${code}`);
  if (wanted.has(ticker)) throw new Error(`${ticker} repeats`);
  wanted.set(ticker, { ticker, name, exchange: FLOOR[code], type });
}
if (wanted.size < 1500) throw new Error(`only ${wanted.size} shares and funds`);

// RequestPriceInfoTicker { requestid = 1, ticker = 2 }; PriceInfo { foreign = 7 }
const live = new Set();
await mapLimit([...wanted.keys()], 6, async (ticker) => {
  const [quote] = await grpcWeb(`${MARKET}/GetPriceInfo`, protoMessage([[1, "catalogue"], [2, ticker]]), HEADERS);
  if (quote && protoFields(quote)[7]) live.add(ticker);
  await pause(40);
});

const lines = [];
for (const line of wanted.values()) {
  if (live.has(line.ticker)) lines.push(line);
  else tally(leftOut, "codes with no live quote (delisted)");
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("mbs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
