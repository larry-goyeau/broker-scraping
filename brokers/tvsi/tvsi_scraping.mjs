// What Tan Viet Securities (TVSI) sells in shares and exchange-traded
// funds, with no login. The broker's public price board (price.tvsi.com.vn)
// is the book. It gets everything over one websocket: each message is
// JSON compressed with lz-string (base64). Asking for msgType 2 (the
// share board) brings, among other things, a msgType 4 message with the
// board's whole symbol list. That message is "$"-separated lines, each
// "CODE|field*value|…", with the field numbers of the board's own column
// list: 34 the market (STO HOSE, STX HNX, UPX UPCOM), 45 the security type
// (ST a share, EF an ETF, MF a closed-end fund, CW a covered warrant), 59
// the name, 3 the reference price. Shares and ETFs are kept; closed-end
// funds and covered warrants are other products and are not written. A
// line with no reference price has no session and is not written. The
// board prints no ISIN; the Vietnamese number is built from the ticker.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://price.tvsi.com.vn/
//   wss://stream.tvsi.com.vn:5000/ws   (send {"msgType":2}, read msgType 4)
//
//   node brokers/tvsi/tvsi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { UA, boardOf, clean, finish, pause, tally } from "../vix/vnboard.mjs";

const STREAM = "wss://stream.tvsi.com.vn:5000/ws";
const ASK = 2;
const SYMBOLS = 4;
const FIELD = { refPrice: 3, marketCode: 34, securityType: 45, symbolName: 59 };
const OTHER = { MF: "closed-end funds", CW: "covered warrants" };

// lz-string decompressFromBase64 (the board's own decoder, written out).
const KEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const VALUE = Object.fromEntries([...KEY].map((character, index) => [character, index]));
function decompress(input) {
  if (!input) return "";
  const data = { value: VALUE[input[0]], position: 32, index: 1 };
  const bits = (count) => {
    let out = 0;
    for (let power = 1; power !== 2 ** count; power *= 2) {
      const bit = data.value & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = 32;
        data.value = VALUE[input[data.index]];
        data.index += 1;
      }
      if (bit > 0) out |= power;
    }
    return out;
  };
  const dictionary = [0, 1, 2];
  let enlargeIn = 4;
  let size = 4;
  let width = 3;
  const first = bits(2);
  if (first > 1) return "";
  let word = String.fromCharCode(bits(first === 0 ? 8 : 16));
  dictionary[3] = word;
  const result = [word];
  for (;;) {
    if (data.index > input.length) throw new Error("lz-string stream ended early");
    let code = bits(width);
    if (code === 0 || code === 1) {
      dictionary[size] = String.fromCharCode(bits(code === 0 ? 8 : 16));
      size += 1;
      code = size - 1;
      enlargeIn -= 1;
    } else if (code === 2) return result.join("");
    if (enlargeIn === 0) {
      enlargeIn = 2 ** width;
      width += 1;
    }
    let entry;
    if (dictionary[code] !== undefined) entry = dictionary[code];
    else if (code === size) entry = word + word[0];
    else throw new Error("lz-string stream is corrupt");
    result.push(entry);
    dictionary[size] = word + entry[0];
    size += 1;
    enlargeIn -= 1;
    word = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** width;
      width += 1;
    }
  }
}

function symbolList() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(STREAM, { headers: { "User-Agent": UA, Origin: "https://price.tvsi.com.vn" } });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${STREAM} sent no symbol list`));
    }, 60_000);
    socket.onopen = () => socket.send(JSON.stringify({ msgType: ASK }));
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`${STREAM} ${event.message || "failed"}`));
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(decompress(String(event.data)));
        if (message?.msgType !== SYMBOLS) return;
        clearTimeout(timer);
        socket.close();
        resolve(String(message.message || ""));
      } catch (error) {
        clearTimeout(timer);
        socket.close();
        reject(error);
      }
    };
  });
}

async function readList() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const text = await symbolList();
      if (text) return text;
      last = "the symbol list is empty";
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(800 * (attempt + 1));
  }
  throw new Error(last);
}

const lines = [];
const leftOut = new Map();
for (const item of (await readList()).split("$")) {
  if (!item) continue;
  const cut = item.indexOf("|");
  if (cut <= 0) throw new Error(`unreadable line: ${item.slice(0, 80)}`);
  const ticker = clean(item.slice(0, cut)).toUpperCase();
  const fields = {};
  for (const part of item.slice(cut + 1).split("|")) {
    const [number, value] = part.split("*");
    if (number !== "") fields[Number(number)] = value ?? "";
  }
  const kind = clean(fields[FIELD.securityType]).toUpperCase();
  const market = clean(fields[FIELD.marketCode]).toUpperCase();
  if (OTHER[kind]) {
    tally(leftOut, OTHER[kind]);
    continue;
  }
  if (kind !== "ST" && kind !== "EF") throw new Error(`${ticker} has security type ${kind || "none"}`);
  const exchange = boardOf(market);
  if (!exchange) throw new Error(`${ticker} is on market ${market || "none"}`);
  if (!(Number(fields[FIELD.refPrice]) > 0)) {
    tally(leftOut, "lines with no reference price");
    continue;
  }
  lines.push({ ticker, name: clean(fields[FIELD.symbolName]), exchange, type: kind === "EF" ? "ETF" : "STOCK" });
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("tvsi-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
