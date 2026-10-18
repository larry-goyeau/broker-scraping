// Shared code for the Vietnamese broker price boards. Most brokers rent
// their web board from one of a few vendors, so the same endpoint shape
// shows up on many hosts. Each broker's scraper names its own host and
// calls one of the readers below. Every reader returns plain lines
// { ticker, name, exchange, type, isin? }, and finish() checks them,
// fills the ISIN and builds the catalogue rows.
//
// Vendors read here:
//   FSS FlexTrade (".../xxxtrade/"):  <host>/datafeed/instruments and /datafeed/oddLotInstruments
//   Altisss ("Web Trading System"):   <host>/market/socket.io, topic KRXMDDS|STKLST|<board>|VI
//   static symbol file:               symbol_static_data.json (SHS, Kafi; PHS's /api/v1/market/all-stock)
//   StockBoard REST (PSI, Artex):     <host>/rest/market/api/initSession?marketIndexCd=100|200|300
//   gRPC-web and protobuf helpers for the boards that speak it (ACBS, MBS).
// One-off boards (AIS, KBSV, ABS, TVS, VTS) keep their reading in their own
// scraper and use the checks here.
//
// Kept: shares and exchange-traded funds on HOSE, HNX and UPCOM. Left out:
// covered warrants, bonds, futures, indexes and closed-end fund
// certificates (a "Quỹ" that is not an ETF), which are other products.
// A line the board marks as having no session today is a delisted name
// left in the vendor's master file and is not written.

import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
export const BOARDS = ["HOSE", "HNX", "UPCOM"];
const MIC = { HOSE: "XSTC", HNX: "HSTC" };
// A full board carries about 400 HOSE, 300 HNX and 800 UPCOM shares and
// about 20 ETFs. Fewer than this means the read stopped early.
const FLOOR = { HOSE: 350, HNX: 250, UPCOM: 650, ETF: 15 };
// The KRX feed codes and the names the boards use for the three floors.
const BOARD_OF = {
  HOSE: "HOSE", HSX: "HOSE", STO: "HOSE", 10: "HOSE",
  HNX: "HNX", STX: "HNX", "02": "HNX",
  UPCOM: "UPCOM", UPX: "UPCOM", "03": "UPCOM", "04": "UPCOM",
};

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function clean(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.toLowerCase() === "null" ? "" : text;
}

export function boardOf(code) {
  return BOARD_OF[String(code ?? "").trim().toUpperCase()] || "";
}

// "Quỹ ETF …" is an exchange-traded fund. Any other "Quỹ …" or fund
// certificate is a closed-end fund; their tickers start FUC (ETFs FUE).
export function fundType(name) {
  return /\bETF\b/i.test(name) ? "ETF" : "";
}

export function isClosedEnd(name, ticker = "") {
  return (/^(chứng chỉ )?qu[ỹy](\s|$)/iu.test(name) || /^FUC[A-Z0-9]{5}$/.test(ticker)) && !fundType(name);
}

export async function request(url, options = {}, tries = 4) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", ...(options.headers || {}) },
        signal: AbortSignal.timeout(options.timeout || 60_000),
      });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.cause?.code || error.message || error} ${url}`;
    }
    await pause(500 * (attempt + 1));
  }
  throw new Error(last);
}

export async function getJson(url, options = {}) {
  const response = await request(url, options);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} is not JSON: ${text.slice(0, 80)}`);
  }
}

export async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// The Vietnamese depository number is the ticker, padded on the left with
// zeros to nine characters, with the country in front and the ISO check
// digit behind. Doubling starts at the rightmost digit.
export function isinOf(ticker) {
  if (!/^[A-Z0-9]{1,9}$/.test(ticker)) throw new Error(`no ISIN for ${ticker}`);
  const body = `VN${ticker.padStart(9, "0")}`;
  const digits = [...body].map((character) => (/[0-9]/.test(character) ? character : String(character.charCodeAt(0) - 55))).join("");
  let sum = 0;
  let double = true;
  for (let position = digits.length - 1; position >= 0; position -= 1) {
    let digit = Number(digits[position]);
    if (double) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
    sum += digit;
    double = !double;
  }
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function tally(map, label, count = 1) {
  map.set(label, (map.get(label) || 0) + count);
}

// Checks the lines, fills the ISIN, and returns sorted catalogue rows.
// Throws when a floor or the ETFs are missing or short.
export function finish(lines, leftOut = new Map()) {
  const byTicker = new Map();
  for (const line of lines) {
    const ticker = clean(line.ticker).toUpperCase();
    const name = clean(line.name) || ticker;
    const exchange = line.exchange;
    const type = line.type;
    if (!ticker) throw new Error(`a line has no ticker: ${JSON.stringify(line).slice(0, 120)}`);
    if (!BOARDS.includes(exchange)) throw new Error(`${ticker} is on ${exchange || "no board"}`);
    if (type !== "STOCK" && type !== "ETF") throw new Error(`${ticker} has type ${type}`);
    const isin = clean(line.isin).toUpperCase() || isinOf(ticker);
    if (!/^VN[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ticker} has ISIN ${isin}`);
    const before = byTicker.get(ticker);
    if (before) {
      if (before.exchange !== exchange || before.type !== type) {
        throw new Error(`${ticker} is both ${before.exchange} ${before.type} and ${exchange} ${type}`);
      }
      continue;
    }
    byTicker.set(ticker, { ticker, name, exchange, type, isin });
  }

  const isins = new Set();
  const rows = [];
  for (const line of byTicker.values()) {
    if (isins.has(line.isin)) throw new Error(`ISIN ${line.isin} repeats`);
    isins.add(line.isin);
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name: line.name,
      exchange: line.exchange,
      ...(MIC[line.exchange] ? { mic: MIC[line.exchange] } : {}),
      currency: "VND",
      type: line.type,
      isin: line.isin,
      raw: [line.ticker, line.name, line.exchange, line.isin, line.type].join(" "),
    });
  }

  const count = new Map();
  for (const row of rows) tally(count, `${row.exchange} ${row.type}`);
  for (const exchange of BOARDS) {
    const shares = count.get(`${exchange} STOCK`) || 0;
    if (shares < FLOOR[exchange]) throw new Error(`${exchange} has only ${shares} shares`);
  }
  const funds = rows.filter((row) => row.type === "ETF").length;
  if (funds < FLOOR.ETF) throw new Error(`only ${funds} ETFs`);

  rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
  const counts = [...count].sort().map(([label, value]) => `${label} ${value}`).join(", ");
  const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
  console.error(`${rows.length} listings: ${counts}. Left out: ${skipped || "none"}.`);
  return rows;
}

// FSS FlexTrade. The board has a round-lot snapshot (/datafeed/instruments)
// and an odd-lot snapshot per floor (/datafeed/oddLotInstruments). Both
// name the floor and a type: StockType 2 is a share, 3 a fund (FundType E,
// or a "Quỹ ETF" name, is an ETF; the rest are closed-end funds), 4 a
// covered warrant, 1 a bond. A line with no trading date has no session
// today. Several hosts leave recent listings (or whole floors) out of the
// round-lot snapshot while the odd-lot snapshot carries them, so the book
// is the union of the two, round-lot line first.
export async function fssBoard(base) {
  const sources = [`${base}/datafeed/instruments`, ...BOARDS.map((exchange) => `${base}/datafeed/oddLotInstruments?exchange=${exchange}`)];
  const leftOut = new Map();
  const lines = [];
  const seen = new Set();
  const undated = new Set();
  const kinds = { 1: "bonds", 4: "covered warrants" };
  let oddOnly = 0;
  for (const [index, url] of sources.entries()) {
    const body = await getJson(url);
    if (body?.s !== "ok" || !Array.isArray(body.d) || !body.d.length) throw new Error(`${url} has no listings`);
    for (const line of body.d) {
      const exchange = boardOf(line.exchange);
      const ticker = clean(line.symbol).toUpperCase();
      if (seen.has(`${exchange} ${ticker}`)) continue;
      seen.add(`${exchange} ${ticker}`);
      const name = clean(line.FullName);
      const kind = String(line.StockType ?? "").trim();
      const count = (label) => index === 0 && tally(leftOut, label);
      if (!exchange) {
        count(clean(line.exchange).toUpperCase() === "XHNF" ? "futures" : `${clean(line.exchange) || "unplaced"} lines`);
        continue;
      }
      if (kinds[kind]) {
        count(kinds[kind]);
        continue;
      }
      if (!clean(line.tradingdate)) {
        seen.delete(`${exchange} ${ticker}`);
        undated.add(`${exchange} ${ticker}`);
        continue;
      }
      undated.delete(`${exchange} ${ticker}`);
      let type = "";
      if (kind === "2") type = "STOCK";
      else if (kind === "3") {
        const fund = clean(line.FundType).toUpperCase();
        if (fund === "E" || (fund !== "M" && fundType(name))) type = "ETF";
        else tally(leftOut, "closed-end funds");
      } else throw new Error(`${ticker} has StockType ${kind || "none"}`);
      if (!type) continue;
      lines.push({ ticker, name, exchange, type });
      if (index > 0) oddOnly += 1;
    }
  }
  if (undated.size) tally(leftOut, "names with no session today", undated.size);
  if (oddOnly) console.error(`${oddOnly} names are only on the odd-lot snapshot of ${base}.`);
  return { lines, leftOut };
}

// Altisss. The stream server speaks socket.io; this uses the polling
// transport. One subscription to KRXMDDS|STKLST|<board>|VI returns that
// board's whole symbol list: T is ST for a share, MF for a fund, EW for a
// covered warrant. STO is HOSE, STX is HNX, UPX is UPCOM.
export async function altisssBoard(streamBase, path = "/market") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const lists = await altisssLists(streamBase, path);
      const leftOut = new Map();
      const lines = [];
      for (const [code, list] of Object.entries(lists)) {
        const exchange = boardOf(code);
        for (const item of list) {
          const ticker = clean(item.S).toUpperCase();
          const name = clean(item.N);
          const kind = clean(item.T).toUpperCase();
          if (kind === "ST") lines.push({ ticker, name, exchange, type: "STOCK" });
          else if (kind === "MF" && fundType(name)) lines.push({ ticker, name, exchange, type: "ETF" });
          else if (kind === "MF") tally(leftOut, "closed-end funds");
          else if (kind === "EW") tally(leftOut, "covered warrants");
          else tally(leftOut, `type ${kind || "none"} lines`);
        }
      }
      return { lines, leftOut };
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(800 * (attempt + 1));
  }
  throw new Error(last);
}

async function altisssLists(streamBase, path) {
  let cookie = "";
  async function poll(url, body) {
    const response = await request(
      url,
      {
        method: body ? "POST" : "GET",
        body,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "text/plain;charset=UTF-8" } : {}) },
        timeout: 40_000,
      },
      1
    );
    const set = response.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map((line) => line.split(";")[0]).join("; ");
    return response.text();
  }
  const base = `${streamBase}${path}/socket.io/?EIO=4&transport=polling`;
  const open = await poll(base);
  const sid = JSON.parse(open.slice(open.indexOf("{"))).sid;
  if (!sid) throw new Error(`${streamBase} gave no session`);
  const url = `${base}&sid=${encodeURIComponent(sid)}`;
  await poll(url, "40");
  await poll(url);
  const wanted = ["STO", "STX", "UPX"];
  const topic = wanted.map((code) => `KRXMDDS|STKLST|${code}|VI`);
  await poll(url, `42${JSON.stringify(["SUB_REQ", { ClientSeq: 1, TransId: "123-abc", topic, value: [""] }])}`);
  const lists = {};
  for (let round = 0; round < 30 && Object.keys(lists).length < wanted.length; round += 1) {
    for (const packet of (await poll(url)).split("\x1e")) {
      if (packet === "2") await poll(url, "3");
      if (!packet.startsWith("42")) continue;
      const [event, data] = JSON.parse(packet.slice(2));
      if (event !== "onFOSStream" || !String(data?.topic || "").includes("|STKLST|")) continue;
      const code = clean(data.data?.exchange).toUpperCase();
      if (wanted.includes(code) && Array.isArray(data.data?.STOCK)) lists[code] = data.data.STOCK;
    }
  }
  const short = wanted.filter((code) => !lists[code]?.length);
  if (short.length) throw new Error(`${streamBase} sent no list for ${short.join(", ")}`);
  return lists;
}

// The static symbol file (SHS, Kafi, and PHS's all-stock call): s is the
// ticker, m the floor, t the type (STOCK, ETF; FUND and PHS's OPTION are
// closed-end funds), isin when printed. When lines carry a session date
// (dts), only the newest date is today's board.
export async function staticBoard(url, options = {}) {
  const body = await getJson(url, options);
  if (!Array.isArray(body) || !body.length) throw new Error(`${url} has no listings`);
  const newest = body.reduce((top, line) => (clean(line.dts) > top ? clean(line.dts) : top), "");
  const leftOut = new Map();
  const lines = [];
  const other = { CW: "covered warrants", BOND: "bonds", FUTURES: "futures", INDEX: "indexes", FUND: "closed-end funds", OPTION: "closed-end funds" };
  for (const line of body) {
    const kind = clean(line.t).toUpperCase();
    if (other[kind]) {
      tally(leftOut, other[kind]);
      continue;
    }
    if (kind !== "STOCK" && kind !== "ETF") throw new Error(`${line.s} has type ${kind || "none"}`);
    if (newest && clean(line.dts) !== newest) {
      tally(leftOut, `lines last seen before ${newest}`);
      continue;
    }
    if ("re" in line && !(line.re && line.ce && line.fl)) {
      tally(leftOut, "lines with no price band");
      continue;
    }
    const exchange = boardOf(line.m);
    if (!exchange) throw new Error(`${line.s} is on ${line.m || "no board"}`);
    lines.push({ ticker: line.s, name: clean(line.n1) || clean(line.n2), exchange, type: kind, isin: line.isin });
  }
  return { lines, leftOut };
}

// StockBoard REST (PSI and Artex run the same board). initSession returns
// one floor: marketIndexCd 100 is HOSE, 200 HNX, 300 UPCOM. secType 1 is a
// share (or a closed-end "Quỹ"), 4 an ETF, 3 a bond. A ticker can appear
// once per order book on the same floor.
export async function stockBoardRest(base) {
  const leftOut = new Map();
  const lines = [];
  for (const [code, exchange] of [[100, "HOSE"], [200, "HNX"], [300, "UPCOM"]]) {
    const url = `${base}/rest/market/api/initSession?marketIndexCd=${code}&secType=0`;
    const body = await getJson(url, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" } });
    if (!Array.isArray(body?.data) || !body.data.length) throw new Error(`${url} has no listings`);
    const seen = new Set();
    for (const line of body.data) {
      const ticker = clean(line.secCd).toUpperCase();
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      if (Number(line.marketCd) !== code) throw new Error(`${ticker} is market ${line.marketCd} on the ${exchange} call`);
      const name = clean(line.secName);
      const kind = Number(line.secType);
      if (kind === 1 && isClosedEnd(name, ticker)) tally(leftOut, "closed-end funds");
      else if (kind === 1) lines.push({ ticker, name, exchange, type: "STOCK" });
      else if (kind === 4) lines.push({ ticker, name, exchange, type: "ETF" });
      else if (kind === 3) tally(leftOut, "bonds");
      else tally(leftOut, `secType ${kind} lines`);
    }
  }
  return { lines, leftOut };
}

// gRPC-web over fetch. A request is one frame: flag 0, a four-byte length
// and the protobuf body. The answer is data frames then a trailer frame.
export async function grpcWeb(url, message, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const frame = Buffer.alloc(5 + message.length);
      frame.writeUInt32BE(message.length, 1);
      message.copy(frame, 5);
      const response = await request(
        url,
        {
          method: "POST",
          body: frame,
          headers: { "Content-Type": "application/grpc-web+proto", "X-Grpc-Web": "1", Accept: "application/grpc-web+proto", ...headers },
        },
        1
      );
      const buffer = Buffer.from(await response.arrayBuffer());
      const messages = [];
      let trailer = response.headers.get("grpc-status") ? `grpc-status:${response.headers.get("grpc-status")}` : "";
      for (let at = 0; at + 5 <= buffer.length; ) {
        const length = buffer.readUInt32BE(at + 1);
        const body = buffer.subarray(at + 5, at + 5 + length);
        if (buffer[at] & 0x80) trailer = body.toString();
        else messages.push(body);
        at += 5 + length;
      }
      const status = /grpc-status:\s*(\d+)/.exec(trailer)?.[1];
      if (status && status !== "0") throw new Error(`${url} answered gRPC status ${status}`);
      return messages;
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(500 * (attempt + 1));
  }
  throw new Error(last);
}

// Protobuf wire format, enough to read the board messages: returns
// { field: [values] } where a length-delimited value stays a Buffer.
export function protoFields(buffer) {
  const fields = {};
  let at = 0;
  const varint = () => {
    let value = 0n;
    let shift = 0n;
    for (;;) {
      const byte = buffer[at];
      at += 1;
      value |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if (!(byte & 0x80)) return value;
    }
  };
  while (at < buffer.length) {
    const key = varint();
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    let value;
    if (wire === 0) value = Number(varint());
    else if (wire === 1) {
      value = buffer.readDoubleLE(at);
      at += 8;
    } else if (wire === 2) {
      const length = Number(varint());
      value = buffer.subarray(at, at + length);
      at += length;
    } else if (wire === 5) {
      value = buffer.readFloatLE(at);
      at += 4;
    } else throw new Error(`protobuf wire type ${wire}`);
    (fields[field] ||= []).push(value);
  }
  return fields;
}

export function protoString(fields, field) {
  const value = fields[field]?.[0];
  return value instanceof Buffer ? value.toString("utf8") : value === undefined ? "" : String(value);
}

// Builds a message from [field, value] pairs: a number is a varint, a
// string is length-delimited.
export function protoMessage(pairs) {
  const parts = [];
  const varint = (number) => {
    const bytes = [];
    let rest = number;
    do {
      let byte = rest & 0x7f;
      rest >>>= 7;
      if (rest) byte |= 0x80;
      bytes.push(byte);
    } while (rest);
    return Buffer.from(bytes);
  };
  for (const [field, value] of pairs) {
    if (typeof value === "number") parts.push(varint(field << 3), varint(value));
    else {
      const bytes = Buffer.from(String(value), "utf8");
      parts.push(varint((field << 3) | 2), varint(bytes.length), bytes);
    }
  }
  return Buffer.concat(parts);
}
