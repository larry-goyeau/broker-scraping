// What NH Securities Vietnam (NHSV) sells in shares and exchange-traded
// funds, with no login. The broker's web trading system has a public
// master list (the code search behind its stock board) and the stock
// board itself, both on the same host. The master list names each code's
// market: 01 is a HOSE share, 04 a HOSE ETF, 03 a HOSE closed-end fund,
// 07 a covered warrant, 11 an HNX share, 31 an UPCOM share, 15 a future.
// Each kept code is then asked of the board (codes padded to twelve
// characters, as the board sends them). A code the board does not return,
// or returns with status 0 and no session, is a name the master list still
// carries but that does not trade today, and is not written. Shares and
// ETFs on HOSE, HNX and UPCOM are kept. Covered warrants, futures and
// closed-end funds are other products and are not written. The board
// prints no ISIN; the Vietnamese number is built from the ticker.
//
// The host's TLS certificate is sent without its intermediate. This
// fetches that intermediate from the address the certificate itself names
// (GlobalSign) and verifies the chain with it; nothing is left unverified.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://webtrading.nhsv.vn/v4/market/stock-board/
//   https://webtrading.nhsv.vn/c3/master (action=stocks)
//   https://webtrading.nhsv.vn/c3/stock (action=stockBoard)
//   http://secure.globalsign.com/cacert/gsgccr3evtlsca2025.crt
//
//   node brokers/nhsv/nhsv_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";
import { UA, clean, finish, fundType, isClosedEnd, pause, request, tally } from "../vix/vnboard.mjs";

const HOST = "https://webtrading.nhsv.vn";
const INTERMEDIATE = "http://secure.globalsign.com/cacert/gsgccr3evtlsca2025.crt";
const MARKETS = {
  "01": ["HOSE", "STOCK"],
  "04": ["HOSE", "ETF"],
  11: ["HNX", "STOCK"],
  31: ["UPCOM", "STOCK"],
};
const LEFT_OUT = { "03": "closed-end funds", "07": "covered warrants", 15: "futures" };
const BATCH = 50;

const der = Buffer.from(await (await request(INTERMEDIATE)).arrayBuffer());
const agent = new https.Agent({ ca: [...tls.rootCertificates, new crypto.X509Certificate(der).toString()] });

function postOnce(path, form) {
  const body = new URLSearchParams({ ...form, lang: "vi" }).toString();
  return new Promise((resolve, reject) => {
    const sent = https.request(
      `${HOST}${path}`,
      {
        method: "POST",
        agent,
        timeout: 60_000,
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          Referer: `${HOST}/v4/market/stock-board/`,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode !== 200) return reject(new Error(`${response.statusCode} ${path}`));
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`${path} is not JSON: ${text.slice(0, 80)}`));
          }
        });
      }
    );
    sent.on("timeout", () => sent.destroy(new Error(`timeout ${path}`)));
    sent.on("error", reject);
    sent.end(body);
  });
}

async function post(path, form) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const answer = await postOnce(path, form);
      if (answer?.success && Array.isArray(answer.list)) return answer;
      last = `${path} ${form.action} answered ${JSON.stringify(answer).slice(0, 120)}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(600 * (attempt + 1));
  }
  throw new Error(last);
}

const master = await post("/c3/master", { action: "stocks", type: "", maxResult: "5000", searchKey: "" });
if (master.hasNext) throw new Error("the master list has more pages than one call returns");
if (master.list.length < 1500) throw new Error(`the master list has only ${master.list.length} codes`);

const leftOut = new Map();
const wanted = new Map();
for (const line of master.list) {
  const market = clean(line.market);
  const ticker = clean(line.code).toUpperCase();
  const name = clean(line.name) || ticker;
  if (LEFT_OUT[market]) {
    tally(leftOut, LEFT_OUT[market]);
    continue;
  }
  const place = MARKETS[market];
  if (!place) throw new Error(`${ticker} is on market ${market || "none"}`);
  const [exchange, type] = place;
  if (type === "ETF" && !fundType(name)) throw new Error(`${ticker} is on the ETF market but is named ${name}`);
  if (type === "STOCK" && isClosedEnd(name, ticker)) {
    tally(leftOut, "closed-end funds");
    continue;
  }
  if (wanted.has(ticker)) throw new Error(`repeated ${ticker}`);
  wanted.set(ticker, { ticker, name, exchange, type, market });
}

const codes = [...wanted.keys()];
const board = new Map();
for (let start = 0; start < codes.length; start += BATCH) {
  const slice = codes.slice(start, start + BATCH);
  const answer = await post("/c3/stock", {
    action: "stockBoard",
    marketType: "",
    codes: slice.map((code) => code.padEnd(12)).join(""),
    index: "",
    big: "1",
    nextKey: "",
  });
  if (answer.hasNext) throw new Error(`the board split codes ${slice[0]}… over pages`);
  for (const quote of answer.list) board.set(clean(quote.code).toUpperCase(), quote);
  await pause(150);
}

const lines = [];
let quiet = 0;
for (const line of wanted.values()) {
  const quote = board.get(line.ticker);
  if (!quote) {
    tally(leftOut, "names not on the board today");
    continue;
  }
  if (clean(quote.market) !== line.market) throw new Error(`${line.ticker} is market ${line.market} in the master list and ${quote.market} on the board`);
  if (Number(quote.status) === 0) {
    quiet += 1;
    tally(leftOut, "names with no session today");
    continue;
  }
  if (!(Number(quote.refPrice) > 0 && Number(quote.ceiling) > 0 && Number(quote.floor) > 0)) {
    throw new Error(`${line.ticker} has no price band on the board`);
  }
  lines.push(line);
}
// A few stale names carry status 0. Many would mean the board is between
// sessions or the field changed, not that the names stopped trading.
if (quiet > 20) throw new Error(`${quiet} codes have status 0 on the board`);

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("nhsv-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
