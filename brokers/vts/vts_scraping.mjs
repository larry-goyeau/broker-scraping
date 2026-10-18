// What Viet Thanh Securities (VTS) sells in shares and exchange-traded
// funds, with no login. The VTS price board (the same SignalR board as
// VCBS) is the book: the hub's GetAllStocks returns one floor per call,
// mk-11 HOSE, mk-12 HNX, mk-13 UPCOM. ST 2 is a share, ST 3 a fund, ST 12 a
// bond. The board keeps names that have left the market on its UPCOM page;
// those rows have no exchange security id (SI) and no status (V5) and are
// not written. The board prints the ticker, not the company name, so the
// name is the ticker. A fund is an ETF when its code is FUE… or E1V…; FUC…
// codes are closed-end funds and are not written, nor are bonds. The board
// prints no ISIN; the Vietnamese number is built from the ticker.
//
// The board's TLS certificate is sent without its intermediate. This
// fetches that intermediate from the address the certificate itself names
// (GlobalSign) and verifies the chain with it; nothing is left unverified.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://vts.com.vn:8888/priceboard
//   https://vts.com.vn:8888/Priceboard/signalr/hubs
//   http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt
//
//   node brokers/vts/vts_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";
import { UA, clean, finish, pause, request, tally } from "../vix/vnboard.mjs";

const HUB = "https://vts.com.vn:8888/Priceboard/signalr";
const INTERMEDIATE = "http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt";
const CONNECTION = JSON.stringify([{ name: "pbhub" }]);
const FLOORS = [
  ["mk-11", "HOSE", "10"],
  ["mk-12", "HNX", "02"],
  ["mk-13", "UPCOM", "04"],
];

const der = Buffer.from(await (await request(INTERMEDIATE)).arrayBuffer());
const agent = new https.Agent({ ca: [...tls.rootCertificates, new crypto.X509Certificate(der).toString()] });

function call(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const sent = https.request(url, { method, agent, timeout: 60_000, headers: { "User-Agent": UA, ...headers } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    sent.on("timeout", () => sent.destroy(new Error(`timeout ${url}`)));
    sent.on("error", reject);
    if (body) sent.write(body);
    sent.end();
  });
}

async function floor(market) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const negotiate = await call(`${HUB}/negotiate?clientProtocol=1.5&connectionData=${encodeURIComponent(CONNECTION)}`);
      if (negotiate.status !== 200) throw new Error(`${negotiate.status} negotiate`);
      const token = JSON.parse(negotiate.text).ConnectionToken;
      if (!token) throw new Error("the price board gave no session");
      const cookie = (negotiate.headers["set-cookie"] || []).map((line) => line.split(";")[0]).join("; ");
      const query = `transport=longPolling&clientProtocol=1.5&connectionToken=${encodeURIComponent(token)}&connectionData=${encodeURIComponent(CONNECTION)}`;
      // getAllStocks(selectedStocks, lastTick, isTl, isMk, tlSymbol, pthMktId, isPercent, isOddLot, oddLotStocks)
      const payload = JSON.stringify({ H: "pbhub", M: "GetAllStocks", A: ["", 0, false, true, "", market, false, false, ""], I: 1 });
      const body = `data=${encodeURIComponent(payload)}`;
      const sent = await call(`${HUB}/send?${query}`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
        body,
      });
      const rows = JSON.parse(sent.text)?.R?.pb?.f;
      if (!Array.isArray(rows) || !rows.length) throw new Error(`${market} has no rows: ${sent.text.slice(0, 120)}`);
      return rows.map((row) => (typeof row === "string" ? JSON.parse(row) : row));
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(600 * (attempt + 1));
  }
  throw new Error(last);
}

const lines = [];
const leftOut = new Map();
for (const [market, exchange, code] of FLOORS) {
  for (const row of await floor(market)) {
    const ticker = clean(row.SB).toUpperCase();
    if (clean(row.FC) !== code) throw new Error(`${ticker} is on floor ${row.FC} in ${market}`);
    const kind = clean(row.ST);
    if (kind === "12") {
      tally(leftOut, "bonds");
    } else if (!clean(row.SI) || !clean(row.V5)) {
      tally(leftOut, "rows with no exchange id (delisted)");
    } else if (kind === "2") {
      lines.push({ ticker, name: ticker, exchange, type: "STOCK" });
    } else if (kind === "3" && /^(FUE|E1V)[A-Z0-9]{5}$/.test(ticker)) {
      lines.push({ ticker, name: ticker, exchange, type: "ETF" });
    } else if (kind === "3") {
      tally(leftOut, "closed-end funds");
    } else {
      throw new Error(`${ticker} has ST ${kind || "none"}`);
    }
  }
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("vts-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
