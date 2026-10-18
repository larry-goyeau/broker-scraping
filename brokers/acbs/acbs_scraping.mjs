// What ACB Securities (ACBS) sells in shares and exchange-traded funds,
// with no login. The ACBS web trading board loads every security from one
// gRPC-web call on its market host, and that list is the book. Each item
// names the market (100 HOSE, 200 HNX, 300 UPCOM, 500 derivatives) and a
// type: 1 a share, 4 an ETF, 3 a bond, 5 a covered warrant. A type-1 line
// named "Quỹ …" is a closed-end fund. Shares and ETFs are kept; closed-end
// funds, bonds, covered warrants and derivatives are other products and
// are not written. The call carries the web app's fixed public auth code,
// the same for every visitor. The list prints no ISIN; the Vietnamese
// number is built from the ticker. The shared rules are in
// ../vix/vnboard.mjs.
//
//   https://smart.acbs.com.vn/
//   https://vmarket.acbs.com.vn/market_api.MarketApi/getAllMrktSecInfo
//
//   node brokers/acbs/acbs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { clean, finish, grpcWeb, isClosedEnd, protoFields, protoMessage, protoString, tally } from "../vix/vnboard.mjs";

const CALL = "https://vmarket.acbs.com.vn/market_api.MarketApi/getAllMrktSecInfo";
// MrktSecInfoParam { authencode = 1 }, the app's REACT_APP_AUTHEN_CODE_GRPC.
const PARAM = protoMessage([[1, "vgaia-front-market-api"]]);
const HEADERS = { Origin: "https://smart.acbs.com.vn", Referer: "https://smart.acbs.com.vn/" };
const MARKET = { 100: "HOSE", 200: "HNX", 300: "UPCOM" };
const OTHER = { 3: "bonds", 5: "covered warrants" };

const [reply] = await grpcWeb(CALL, PARAM, HEADERS);
if (!reply) throw new Error("the market host sent no reply");
// MrktSecInfoResponse { result = 1, error = 2, message = 3, data = 4 (repeated) }
const answer = protoFields(reply);
const items = (answer[4] || []).map(protoFields);
if (!items.length) throw new Error(`no securities: ${protoString(answer, 2)} ${protoString(answer, 3)}`);

const lines = [];
const leftOut = new Map();
for (const item of items) {
  // MrktSecInfoItem { seccd = 1, sectype = 2, secname = 3, secnameen = 4, marketcd = 5 }
  const ticker = protoString(item, 1).trim().toUpperCase();
  const kind = Number(protoString(item, 2) || 0);
  const name = clean(protoString(item, 3)) || clean(protoString(item, 4));
  const exchange = MARKET[Number(protoString(item, 5) || 0)];
  if (!exchange) {
    tally(leftOut, "derivatives");
  } else if (kind === 1 && isClosedEnd(name, ticker)) {
    tally(leftOut, "closed-end funds");
  } else if (kind === 1) {
    lines.push({ ticker, name, exchange, type: "STOCK" });
  } else if (kind === 4) {
    lines.push({ ticker, name, exchange, type: "ETF" });
  } else if (OTHER[kind]) {
    tally(leftOut, OTHER[kind]);
  } else {
    throw new Error(`${ticker} has sectype ${kind}`);
  }
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("acbs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
