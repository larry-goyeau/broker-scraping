// The Northbound Stock Connect book, for the Hong Kong brokers of this
// group that sell China A-shares through Shanghai and Shenzhen Connect and
// publish no list of their own (welllink, shkdirect, standardcharteredhk,
// valuable, usmarthk, chiyu). Each of them points at, or rests on, the
// exchange's list.
//
// The list is HKEX's "List of SSE Securities / China Connect Securities
// (eligible for both buy and sell)" and its SZSE twin, one line per
// six-digit code, with an instrument type: EQTY (A-share, type STOCK) or
// TRST (exchange-traded fund, type ETF). The sell-only lists (shares that
// left the eligible indices, B-shares never are) are not read: a client
// cannot buy their lines. Both files are old-style Excel (BIFF8), read here
// with Node only (xlsRows).
//
//   https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SSE_Securities.xls
//   https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/SZSE_Securities.xls
//
// Each line is then checked against Sina's quote of the day (the source
// ../../spreads/venues.mjs reads for the Shanghai and Shenzhen books):
// a line Sina marks suspended (status 02 for the day, 03 until further
// notice), has no quote for, or last quoted more than a week before the
// latest session, is dropped. The day's traded value (成交额,
// yuan) is kept on the row as `turnover`, for a broker that states how many
// A-shares it offers (owner rule: the N most popular titles of the place).
//
//   https://hq.sinajs.cn/list=sh600000,sz000001,...  (Referer finance.sina.com.cn)
//
// Northbound trades settle in offshore renminbi: currency CNH, as in
// ../futuhk and ../webullhk. Places: "Shanghai Stock Exchange" (XSHG) and
// "Shenzhen Stock Exchange" (XSHE). ISIN: the SSE / SZSE lines of
// ../../assets/stocks.csv and etfs.csv, when one matches the code.
//
// ChiNext (Shenzhen 300-302) and STAR Market (Shanghai 688, 689) shares are
// on the buy-and-sell lists, but Northbound they are for institutional
// professional investors only. That depends on the client, not the title,
// so the rows stay and carry `board` ("ChiNext" / "STAR Market"); a broker
// scraper writes the remark (connectRemark).
//
// Use:
//   import { connectBook, connectRemark } from "../welllink/connectBook.mjs";
//   const { rows, dropped, listDates, quoteDay } = await connectBook();
//
//   node brokers/welllink/connectBook.mjs      prints the counts

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../jtrust/jp_listings.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities_xls/";
export const CONNECT_LISTS = [
  { file: "SSE_Securities.xls", exchange: "Shanghai Stock Exchange", mic: "XSHG", place: "SSE", sina: "sh", floor: 1500 },
  { file: "SZSE_Securities.xls", exchange: "Shenzhen Stock Exchange", mic: "XSHE", place: "SZSE", sina: "sz", floor: 1500 },
];
const SINA = "https://hq.sinajs.cn/list=";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function connectBoard(mic, ticker) {
  if (mic === "XSHE" && /^30[0-2]/.test(ticker)) return "ChiNext";
  if (mic === "XSHG" && /^68[89]/.test(ticker)) return "STAR Market";
  return "";
}

export function connectRemark(board) {
  return board ? `${board} via Stock Connect is for institutional professional investors only.` : "";
}

async function bytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// ---- BIFF8 (.xls) reader: first worksheet, text and numbers ------------------

function oleStream(buffer, wanted) {
  if (buffer.readUInt32LE(0) !== 0xe011cfd0 || buffer.readUInt32LE(4) !== 0xe11ab1a1) throw new Error("not an OLE2 file");
  const sectorSize = 1 << buffer.readUInt16LE(0x1e);
  const fatCount = buffer.readUInt32LE(0x2c);
  const firstDir = buffer.readUInt32LE(0x30);
  let difatSector = buffer.readUInt32LE(0x44);
  const sector = (n) => 512 + n * sectorSize;
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < fatCount; i += 1) fatSectors.push(buffer.readUInt32LE(0x4c + 4 * i));
  while (fatSectors.length < fatCount && difatSector < 0xfffffffa) {
    const at = sector(difatSector);
    for (let i = 0; i < sectorSize / 4 - 1 && fatSectors.length < fatCount; i += 1) fatSectors.push(buffer.readUInt32LE(at + 4 * i));
    difatSector = buffer.readUInt32LE(at + sectorSize - 4);
  }
  const fat = [];
  for (const s of fatSectors) for (let i = 0; i < sectorSize / 4; i += 1) fat.push(buffer.readUInt32LE(sector(s) + 4 * i));
  const chain = (start) => {
    const parts = [];
    for (let s = start, guard = 0; s < 0xfffffffa && guard < fat.length; s = fat[s], guard += 1) parts.push(buffer.subarray(sector(s), sector(s) + sectorSize));
    return Buffer.concat(parts);
  };
  const dir = chain(firstDir);
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const nameLength = dir.readUInt16LE(at + 64);
    const name = dir.subarray(at, at + Math.max(0, nameLength - 2)).toString("utf16le");
    if (!wanted.includes(name)) continue;
    const size = dir.readUInt32LE(at + 120);
    if (size < buffer.readUInt32LE(0x38)) throw new Error(`${name} stream is in the mini stream`);
    return chain(dir.readUInt32LE(at + 116)).subarray(0, size);
  }
  throw new Error(`no ${wanted.join("/")} stream`);
}

function rkValue(rk) {
  let value;
  if (rk & 2) value = rk >> 2;
  else {
    const raw = Buffer.alloc(8);
    raw.writeInt32LE(rk & 0xfffffffc, 4);
    value = raw.readDoubleLE(0);
  }
  return rk & 1 ? value / 100 : value;
}

export function xlsRows(buffer) {
  const book = oleStream(buffer, ["Workbook", "Book"]);
  const records = [];
  for (let at = 0; at + 4 <= book.length;) {
    const type = book.readUInt16LE(at);
    const length = book.readUInt16LE(at + 2);
    records.push({ type, data: book.subarray(at + 4, at + 4 + length) });
    at += 4 + length;
  }
  // Shared strings: the SST record and its CONTINUE records. A string cut
  // by a CONTINUE goes on with a fresh option byte (compressed or not).
  const strings = [];
  const sstAt = records.findIndex((record) => record.type === 0x00fc);
  if (sstAt >= 0) {
    const pieces = [records[sstAt].data];
    for (let i = sstAt + 1; records[i]?.type === 0x003c; i += 1) pieces.push(records[i].data);
    let piece = 0;
    let at = 8;
    const need = () => {
      if (at >= pieces[piece].length) { piece += 1; at = 0; }
    };
    const u8 = () => { need(); const value = pieces[piece][at]; at += 1; return value; };
    const u16 = () => { const low = u8(); return low | (u8() << 8); };
    const u32 = () => (u16() | (u16() << 16)) >>> 0;
    const skip = (count) => { for (let i = 0; i < count; i += 1) u8(); };
    const total = records[sstAt].data.readUInt32LE(4);
    for (let n = 0; n < total; n += 1) {
      const length = u16();
      let flags = u8();
      const runs = flags & 0x08 ? u16() : 0;
      const extra = flags & 0x04 ? u32() : 0;
      let text = "";
      for (let read = 0; read < length;) {
        if (at >= pieces[piece].length) { piece += 1; at = 0; flags = pieces[piece][at]; at += 1; }
        const wide = flags & 0x01;
        const room = Math.floor((pieces[piece].length - at) / (wide ? 2 : 1));
        const take = Math.min(room, length - read);
        const chunk = pieces[piece].subarray(at, at + take * (wide ? 2 : 1));
        text += wide ? chunk.toString("utf16le") : chunk.toString("latin1");
        at += chunk.length;
        read += take;
      }
      skip(runs * 4 + extra);
      strings.push(text);
    }
  }
  // First worksheet: the records between its BOF and EOF.
  const sheets = records.map((record, index) => (record.type === 0x0809 && record.data.readUInt16LE(2) === 0x0010 ? index : -1)).filter((index) => index >= 0);
  if (!sheets.length) throw new Error("no worksheet");
  const grid = [];
  const put = (row, col, value) => {
    (grid[row] ||= [])[col] = value;
  };
  for (let i = sheets[0] + 1; i < records.length && records[i].type !== 0x000a; i += 1) {
    const { type, data } = records[i];
    if (type === 0x00fd) put(data.readUInt16LE(0), data.readUInt16LE(2), strings[data.readUInt32LE(6)] ?? "");
    else if (type === 0x0203) put(data.readUInt16LE(0), data.readUInt16LE(2), data.readDoubleLE(6));
    else if (type === 0x027e) put(data.readUInt16LE(0), data.readUInt16LE(2), rkValue(data.readInt32LE(6)));
    else if (type === 0x00bd) {
      const row = data.readUInt16LE(0);
      const first = data.readUInt16LE(2);
      const count = (data.length - 6) / 6;
      for (let k = 0; k < count; k += 1) put(row, first + k, rkValue(data.readInt32LE(4 + 6 * k + 2)));
    } else if (type === 0x0204) {
      const length = data.readUInt16LE(6);
      const wide = data[8] & 1;
      put(data.readUInt16LE(0), data.readUInt16LE(2), wide ? data.subarray(9, 9 + 2 * length).toString("utf16le") : data.subarray(9, 9 + length).toString("latin1"));
    }
  }
  return Array.from(grid, (row) => Array.from(row || [], (cell) => cell ?? ""));
}

// ---- HKEX lists -----------------------------------------------------------------

async function eligible(spec) {
  const grid = xlsRows(await bytes(BASE + spec.file));
  const title = clean(grid[0]?.[0]);
  if (!/eligible for both buy and sell/i.test(title)) throw new Error(`${spec.file} is titled "${title}"`);
  const updated = clean(grid.slice(0, 5).map((row) => row?.[0]).find((cell) => /^Updated/i.test(clean(cell))));
  const at = grid.findIndex((row) => clean(row?.[0]) === "No.");
  const head = (grid[at] || []).map(clean);
  if (at < 0 || !/Stock Code/.test(head[1]) || head[3] !== "Name" || head[5] !== "Instrument Type") throw new Error(`${spec.file} header is ${head.join(" | ")}`);
  const lines = [];
  for (const row of grid.slice(at + 1)) {
    const raw = row[1];
    if (raw === "" || raw == null) continue;
    const code = String(typeof raw === "number" ? Math.round(raw) : clean(raw)).padStart(6, "0");
    if (!/^\d{6}$/.test(code)) throw new Error(`${spec.file}: code ${raw}`);
    lines.push({ code, name: clean(row[3]), kind: clean(row[5]) });
  }
  if (lines.length < spec.floor) throw new Error(`${spec.file} has ${lines.length} lines`);
  return { lines, updated: updated.replace(/^Updated:?\s*/i, "") };
}

// ---- Sina quotes ----------------------------------------------------------------

// Sina's quote line: name, open, previous close, price, high, low, bid,
// ask, volume, traded value (yuan), five bid and ask levels, date, time,
// status ("00" trading; "02" suspended for the day, "03" suspended).
async function sinaBatch(codes) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(`${SINA}${codes.join(",")}`, {
        headers: { "User-Agent": UA, Referer: "https://finance.sina.com.cn/" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return new TextDecoder("gbk").decode(await response.arrayBuffer());
      last = `${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`Sina quotes: ${last}`);
}

// "sh600000" -> { date, status, previous, turnover }
async function sinaQuotes(keys) {
  const out = new Map();
  for (let i = 0; i < keys.length; i += 400) {
    const text = await sinaBatch(keys.slice(i, i + 400));
    for (const match of text.matchAll(/hq_str_(\w+)="([^"]*)"/g)) {
      const cells = match[2].split(",");
      if (cells.length < 33) continue;
      out.set(match[1], { date: cells[30], status: cells[32], previous: Number(cells[2]) || 0, turnover: Number(cells[9]) || 0 });
    }
    await sleep(500);
  }
  return out;
}

function assetIsins() {
  const byCode = new Map();
  for (const file of [STOCKS, ETFS]) {
    if (!fs.existsSync(file)) continue;
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    const head = table[0];
    const [t, e, i] = ["ticker", "exchange", "isin"].map((name) => head.indexOf(name));
    for (const row of table.slice(1)) {
      if (row[e] !== "SSE" && row[e] !== "SZSE") continue;
      const code = String(row[t] || "").split(":").pop().padStart(6, "0");
      const isin = String(row[i] || "").toUpperCase();
      if (!ISIN.test(isin)) continue;
      const key = `${row[e]}|${code}`;
      byCode.set(key, new Set([...(byCode.get(key) || []), isin]));
    }
  }
  return byCode;
}

export async function connectBook() {
  const lists = [];
  for (const spec of CONNECT_LISTS) {
    lists.push({ spec, ...(await eligible(spec)) });
    await sleep(800);
  }
  const quotes = await sinaQuotes(lists.flatMap(({ spec, lines }) => lines.map((line) => spec.sina + line.code)));
  const dates = [...quotes.values()].map((quote) => quote.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const quoteDay = dates[dates.length - 1];
  if (!quoteDay || Date.now() - Date.parse(quoteDay) > 10 * 86400_000) throw new Error(`Sina's latest A-share session is ${quoteDay}`);
  const isins = assetIsins();
  const rows = [];
  const dropped = [];
  const unknownKinds = new Set();
  for (const { spec, lines } of lists) {
    for (const line of lines) {
      const type = line.kind === "EQTY" ? "STOCK" : line.kind === "TRST" ? "ETF" : "";
      if (!type) { unknownKinds.add(line.kind); continue; }
      const quote = quotes.get(spec.sina + line.code);
      const drop = (reason) => dropped.push({ ticker: line.code, name: line.name, exchange: spec.exchange, reason });
      if (!quote) { drop("no Sina quote line (not trading)"); continue; }
      if (quote.status === "02" || quote.status === "03") { drop(`suspended (Sina status ${quote.status})`); continue; }
      if (!(Date.parse(quoteDay) - Date.parse(quote.date) <= 7 * 86400_000)) { drop(`no Sina session since ${quote.date || "listing"}`); continue; }
      const found = [...(isins.get(`${spec.place}|${line.code}`) || [])];
      const isin = found.length === 1 ? found[0] : "";
      const board = type === "STOCK" ? connectBoard(spec.mic, line.code) : "";
      rows.push({
        query: isin || line.code,
        ticker: line.code,
        name: line.name,
        exchange: spec.exchange,
        mic: spec.mic,
        currency: "CNH",
        type,
        isin,
        raw: [line.code, line.name, line.kind, spec.place, "Northbound buy and sell", "CNH"].join(" | "),
        ...(board ? { board } : {}),
        turnover: quote.turnover,
      });
    }
  }
  if (unknownKinds.size) throw new Error(`Stock Connect instrument types not classified: ${[...unknownKinds].join(", ")}`);
  if (rows.length < 3000) throw new Error(`only ${rows.length} Stock Connect lines kept`);
  if (dropped.length > 300) throw new Error(`${dropped.length} Stock Connect lines dropped, check the grid`);
  rows.sort((a, b) => a.mic.localeCompare(b.mic) || a.ticker.localeCompare(b.ticker));
  return {
    rows,
    dropped,
    listDates: Object.fromEntries(lists.map(({ spec, updated }) => [spec.file, updated])),
    quoteDay,
    urls: lists.map(({ spec }) => BASE + spec.file),
  };
}

// The N most traded A-shares of the book (ETFs untouched), for a broker
// that states how many A-shares it offers.
export function topShares(rows, count) {
  const shares = rows.filter((row) => row.type === "STOCK").sort((a, b) => b.turnover - a.turnover || a.ticker.localeCompare(b.ticker));
  const kept = new Set(shares.slice(0, count));
  return rows.filter((row) => row.type !== "STOCK" || kept.has(row));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const book = await connectBook();
  const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});
  console.log(`connectBook: ${book.rows.length} rows, lists ${JSON.stringify(book.listDates)}`);
  console.log(tally(book.rows, (row) => `${row.mic} ${row.type}${row.board ? ` ${row.board}` : ""}`));
  console.log(`ISIN ${book.rows.filter((row) => row.isin).length}/${book.rows.length}`);
  console.log("dropped", tally(book.dropped, (item) => item.reason), book.dropped.slice(0, 30).map((item) => `${item.ticker} ${item.name}`).join("; "));
}
