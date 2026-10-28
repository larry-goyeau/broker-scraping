// The Bolsa de Madrid book, for the Spanish banks whose only place is the
// Madrid exchange and which print no list of their own (Kutxabank, Deutsche
// Bank España, Caixa Rural Galega). The book is every line BME's own price
// pages show for the Madrid exchange, minus the suspended ones.
//
// Source, public, no login: the price tables of bolsasymercados.es
// ("Mercado Continuo", "ETFs", "Latibex", "Corros Madrid") are filled by a
// SignalR hub, apiweb.bolsasymercados.es/Market/v1/SignalR/EQ/Prices, whose
// GetSessionData call takes a market group (SIBE, ETF, Latibex, FloorMadrid,
// MTF) and answers every line of it with its ISIN, ticker, name, trading
// system, trading currency, the session's volume, the year's turnover and,
// for a suspended line, the date of the suspension (the site prints
// "Suspendido <date>" in place of the session date). The hub speaks the
// MessagePack hub protocol only; the few lines of MessagePack below read it.
//   https://www.bolsasymercados.es/es/bme-exchange/mercados-y-cotizaciones/acciones/mercado-continuo.html
//   https://www.bolsasymercados.es/es/bme-exchange/mercados-y-cotizaciones/acciones/corros-madrid.html
//   https://apiweb.bolsasymercados.es/Market/v1/SignalR/EQ/Prices
//
// Kept (exchange "Bolsa de Madrid", MIC XMAD, as the IBKR and Renta 4
// scrapers write Madrid):
// - SIBE, the Mercado Continuo: every share, Spanish or foreign (Airbus,
//   ArcelorMittal, Ferrovial N.V., Coca-Cola Europacific...). Type STOCK.
// - ETF, BME's ETF segment (six funds in October 2026). Type ETF.
// - Latibex, the Latin American shares Bolsa de Madrid lists on the same
//   trading system. BME's data gives these the home currency of the issuer
//   (BRL, MXN, ARS, PEN), but they trade in euros: "Todas las acciones
//   negocian en euros" (https://www.bolsasymercados.es/es/latibex/cotizar/que-es.html),
//   so they are written EUR. Type STOCK; raw ends with "| Latibex".
// - FloorMadrid, the Madrid electronic floor ("corros"). Raw ends with
//   "| Madrid floor".
// Left out:
// - A suspended line (a suspension date on BME's table). In October 2026:
//   Tubos Reunidos (since 4 May 2026), Urbas (30 April 2025), Innovative
//   Solutions Ecosystem (2022), CAM cuotas participativas (2011), Cleop
//   (2012), and on the floor Liwe Española and Urbar Ingenieros.
// - A line with no trade at all this year (no volume today, year turnover
//   zero), counted from February so January does not empty the book: never
//   traded in practice. In October 2026 this is Ayco on the Madrid floor.
// - The Barcelona, Bilbao and Valencia floors (other exchanges).
// - BME MTF Equity (BME Growth, BME ScaleUp, SICAVs, hedge funds): another
//   operator and another place. `growth: true` adds the BME Growth segment
//   as exchange "BME Growth", MIC MABX (Consorsbank's labels), for a broker
//   whose pages say it routes there.
// - Rights, warrants, bonds: BME does not put them in these groups.
//
// Every kept line trades in EUR. Four calls to the hub (five with growth), a pause between
// each; no cache needed.
//
// Use:
//   import { writeMadridCatalogue } from "../kutxabank/bmeBook.mjs";
//   await writeMadridCatalogue(import.meta.url, "kutxabank-parsed.json");
//   // options: { segments: ["SIBE", "ETF", "Latibex", "FloorMadrid"], growth: false }
//   // or: const { listed, suspended, idle, leftOut } = await madridBook();
//
//   node brokers/kutxabank/bmeBook.mjs     (prints the counts, writes nothing)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HUB = "https://apiweb.bolsasymercados.es/Market/v1/SignalR/EQ/Prices";
const ORIGIN = "https://www.bolsasymercados.es";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
export const SEGMENTS = ["SIBE", "ETF", "Latibex", "FloorMadrid"];
const TAG = { Latibex: " | Latibex", FloorMadrid: " | Madrid floor", BMEGrowth: " | BME Growth" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// ---- MessagePack, the subset the hub uses -------------------------------

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function pack(value, out = []) {
  if (value === null || value === undefined) out.push(0xc0);
  else if (value === true) out.push(0xc3);
  else if (value === false) out.push(0xc2);
  else if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 128) out.push(value);
  else if (typeof value === "number") {
    const bytes = Buffer.alloc(9);
    bytes[0] = 0xcb;
    bytes.writeDoubleBE(value, 1);
    out.push(...bytes);
  } else if (typeof value === "string") {
    const bytes = textEncoder.encode(value);
    if (bytes.length < 32) out.push(0xa0 | bytes.length);
    else if (bytes.length < 256) out.push(0xd9, bytes.length);
    else out.push(0xda, bytes.length >> 8, bytes.length & 255);
    out.push(...bytes);
  } else if (Array.isArray(value)) {
    if (value.length >= 16) throw new Error("array too long for this packer");
    out.push(0x90 | value.length);
    for (const item of value) pack(item, out);
  } else {
    const keys = Object.keys(value);
    if (keys.length >= 16) throw new Error("map too long for this packer");
    out.push(0x80 | keys.length);
    for (const key of keys) {
      pack(key, out);
      pack(value[key], out);
    }
  }
  return out;
}

function unpack(bytes) {
  let at = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const take = (n) => {
    const part = bytes.subarray(at, at + n);
    at += n;
    return part;
  };
  const string = (n) => textDecoder.decode(take(n));
  const array = (n) => Array.from({ length: n }, () => read());
  const map = (n) => {
    const object = {};
    for (let i = 0; i < n; i += 1) {
      const key = read();
      object[key] = read();
    }
    return object;
  };
  const ext = (n) => {
    const kind = view.getInt8(at);
    at += 1;
    return { ext: kind, data: take(n) };
  };
  const u8 = () => bytes[at++];
  const u16 = () => ((at += 2), view.getUint16(at - 2));
  const u32 = () => ((at += 4), view.getUint32(at - 4));
  function read() {
    const b = u8();
    if (b < 0x80) return b;
    if (b < 0x90) return map(b & 15);
    if (b < 0xa0) return array(b & 15);
    if (b < 0xc0) return string(b & 31);
    if (b >= 0xe0) return b - 256;
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return take(u8());
      case 0xc5: return take(u16());
      case 0xc6: return take(u32());
      case 0xc7: return ext(u8());
      case 0xc8: return ext(u16());
      case 0xc9: return ext(u32());
      case 0xca: return ((at += 4), view.getFloat32(at - 4));
      case 0xcb: return ((at += 8), view.getFloat64(at - 8));
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xcf: return ((at += 8), Number(view.getBigUint64(at - 8)));
      case 0xd0: return ((at += 1), view.getInt8(at - 1));
      case 0xd1: return ((at += 2), view.getInt16(at - 2));
      case 0xd2: return ((at += 4), view.getInt32(at - 4));
      case 0xd3: return ((at += 8), Number(view.getBigInt64(at - 8)));
      case 0xd4: return ext(1);
      case 0xd5: return ext(2);
      case 0xd6: return ext(4);
      case 0xd7: return ext(8);
      case 0xd8: return ext(16);
      case 0xd9: return string(u8());
      case 0xda: return string(u16());
      case 0xdb: return string(u32());
      case 0xdc: return array(u16());
      case 0xdd: return array(u32());
      case 0xde: return map(u16());
      case 0xdf: return map(u32());
      default: throw new Error(`MessagePack byte 0x${b.toString(16)}`);
    }
  }
  return read();
}

// A hub message is its MessagePack body behind a varint length.
function frame(message) {
  const body = pack(message);
  const head = [];
  let n = body.length;
  do {
    let byte = n & 0x7f;
    n >>= 7;
    if (n) byte |= 0x80;
    head.push(byte);
  } while (n);
  return Uint8Array.from([...head, ...body]);
}

function* messages(bytes) {
  let at = 0;
  while (at < bytes.length) {
    let n = 0;
    let shift = 0;
    let byte;
    do {
      byte = bytes[at++];
      n |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    yield unpack(bytes.subarray(at, at + n));
    at += n;
  }
}

// ---- the hub -------------------------------------------------------------

async function connect() {
  const response = await fetch(`${HUB}/negotiate?negotiateVersion=1`, {
    method: "POST",
    body: "",
    headers: { Origin: ORIGIN, "User-Agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`BME hub negotiate answered ${response.status}`);
  const { connectionToken } = await response.json();
  if (!connectionToken) throw new Error("BME hub gave no connection token");

  const socket = new WebSocket(`${HUB.replace(/^http/, "ws")}?id=${encodeURIComponent(connectionToken)}`);
  socket.binaryType = "arraybuffer";
  const pending = new Map();
  let closed = "";
  const failAll = (reason) => {
    closed = reason;
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  };
  const handshake = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("BME hub handshake timed out")), 30_000);
    socket.onopen = () => socket.send(`${JSON.stringify({ protocol: "messagepack", version: 1 })}\x1e`);
    socket.onerror = () => reject(new Error("BME hub socket error"));
    socket.onclose = (event) => {
      reject(new Error(`BME hub closed (${event.code})`));
      failAll(`BME hub closed (${event.code})`);
    };
    socket.onmessage = (event) => {
      let bytes = typeof event.data === "string" ? textEncoder.encode(event.data) : new Uint8Array(event.data);
      if (bytes[0] === 0x7b) {
        const end = bytes.indexOf(0x1e);
        const answer = JSON.parse(textDecoder.decode(bytes.subarray(0, end)));
        clearTimeout(timer);
        if (answer.error) return reject(new Error(`BME hub handshake: ${answer.error}`));
        resolve();
        bytes = bytes.subarray(end + 1);
      }
      for (const message of messages(bytes)) {
        const [type] = message;
        if (type === 3) {
          const [, , id, kind, result] = message;
          const waiting = pending.get(id);
          pending.delete(id);
          if (!waiting) continue;
          if (kind === 1) waiting.reject(new Error(`BME hub: ${result}`));
          else waiting.resolve(result);
        } else if (type === 7) {
          failAll(`BME hub closed the connection: ${message[1] || "no reason"}`);
        }
      }
    };
  });
  await handshake;

  let next = 0;
  const invoke = (target, argument) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new Error(closed));
      const id = String(next++);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`BME hub ${target} timed out`));
      }, 90_000);
      pending.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      socket.send(frame([1, {}, id, target, [argument], []]));
    });
  return { invoke, close: () => socket.close() };
}

// Every line of one market group, as objects keyed by BME's column names.
async function group(hub, name) {
  const out = await hub.invoke("GetSessionData", { Language: "es", IndexIsinOrGroup: null, ShareIsinOrGroup: name, TradingSystem: "" });
  if (!out || !Array.isArray(out.Data)) throw new Error(`BME group ${name} answered no data`);
  if (out.HasMoreResults) throw new Error(`BME group ${name} is paged`);
  const columns = new Map((out.ColumnNames || []).map(([kind, names]) => [kind, names]));
  return out.Data.map(([kind, values]) => {
    const names = columns.get(kind);
    if (!names) throw new Error(`BME group ${name}: no column names for kind ${kind}`);
    return Object.fromEntries(values.map((value, i) => [names[i], value]));
  });
}

async function readGroups(names) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(10_000);
    let hub;
    try {
      hub = await connect();
      const lines = {};
      for (const name of names) {
        lines[name] = await group(hub, name);
        await sleep(1500);
      }
      return lines;
    } catch (error) {
      last = error;
    } finally {
      hub?.close();
    }
  }
  throw last;
}

// ---- the book ------------------------------------------------------------

export async function madridBook({ segments = SEGMENTS, growth = false } = {}) {
  for (const segment of segments) if (!SEGMENTS.includes(segment)) throw new Error(`unknown segment ${segment}`);
  const names = [...SEGMENTS, ...(growth ? ["MTF"] : [])];
  const groups = await readGroups(names);
  const today = new Date().toISOString().slice(5, 7);
  const countIdle = today !== "01";

  const listed = [];
  const suspended = [];
  const idle = [];
  const leftOut = [];
  const seen = new Set();
  const take = (segment, line) => {
    const ticker = clean(line.Ticker);
    const isin = clean(line.Isin).toUpperCase();
    const name = clean(line.Name);
    const label = `${ticker} ${name}`;
    if (line.SuspensionDate) return suspended.push({ ticker, name, isin, segment, date: line.SuspensionDate });
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return leftOut.push(`${label}: no ISIN`);
    const type = segment === "ETF" ? "ETF" : "STOCK";
    if (countIdle && type === "STOCK" && !line.Volume && !line.YearTurnover) return idle.push({ ticker, name, isin, segment });
    let currency = clean(line.TradingCurrency);
    if (segment === "Latibex") currency = "EUR";
    if (currency !== "EUR") throw new Error(`${label} on ${segment} trades in ${currency || "nothing"}`);
    const [exchange, mic] = segment === "BMEGrowth" ? ["BME Growth", "MABX"] : ["Bolsa de Madrid", "XMAD"];
    const key = `${mic} ${isin}`;
    if (seen.has(key)) return leftOut.push(`${label}: twice on ${exchange}`);
    seen.add(key);
    listed.push({
      query: ticker,
      ticker,
      name,
      exchange,
      mic,
      currency,
      type,
      isin,
      raw: `${ticker} ${name} ${line.TradingSystem} ${isin} ${currency}${TAG[segment] || ""}`,
    });
  };

  for (const segment of SEGMENTS) {
    const lines = groups[segment];
    if (!segments.includes(segment)) continue;
    for (const line of lines) {
      const system = segment === "FloorMadrid" ? "Floor" : segment;
      if (line.TradingSystem !== system) throw new Error(`${line.Ticker} in ${segment} has trading system ${line.TradingSystem}`);
      take(segment, line);
    }
  }
  if (growth) for (const line of groups.MTF) if (line.MtfSegment === "BMEGrowth") take("BMEGrowth", line);

  listed.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  // Sanity: the big names are there, a suspended one is not, counts hold.
  const has = (ticker) => listed.some((row) => row.ticker === ticker);
  if (segments.includes("SIBE")) {
    for (const ticker of ["SAN", "ITX", "IBE", "BBVA", "TEF", "MTS", "GRF", "GRF.P"]) if (!has(ticker)) throw new Error(`${ticker} missing`);
    const shares = groups.SIBE.length;
    if (shares < 100) throw new Error(`only ${shares} lines on the Mercado Continuo`);
  }
  if (segments.includes("ETF") && groups.ETF.length < 3) throw new Error(`only ${groups.ETF.length} ETFs`);
  if (segments.includes("Latibex") && groups.Latibex.length < 10) throw new Error(`only ${groups.Latibex.length} Latibex lines`);
  if (suspended.length > 25) throw new Error(`${suspended.length} lines read as suspended`);
  if (idle.length > 30) throw new Error(`${idle.length} lines read as never traded: ${idle.map((line) => line.ticker).join(" ")}`);
  if (leftOut.length > 5) throw new Error(`${leftOut.length} lines left out: ${leftOut.join(", ")}`);
  return { listed, suspended, idle, leftOut };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types (["STOCK"] for a broker that sells no ETF); `segments` drops a
// Madrid segment the broker's pages exclude (Latibex, the floor, ETFs);
// `growth: true` adds BME Growth.
export async function writeMadridCatalogue(here, file, { types = ["STOCK", "ETF"], segments = SEGMENTS, growth = false } = {}) {
  const book = await madridBook({ segments, growth });
  const rows = book.listed.filter((row) => types.includes(row.type)).map((row) => ({ ...row }));
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  report(book, kept);
  return kept;
}

function report(book, kept) {
  const counts = {};
  for (const row of kept) {
    const tag = row.raw.split(" | ")[1];
    const key = tag ? `${row.type} (${tag})` : row.type;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(`${kept.length} Madrid lines ${JSON.stringify(counts)}`);
  console.error(`${book.suspended.length} suspended left out: ${book.suspended.map((line) => `${line.ticker} (${line.segment}, ${line.date})`).join(", ")}`);
  if (book.idle.length) console.error(`no trade this year, left out: ${book.idle.map((line) => `${line.ticker} (${line.segment})`).join(", ")}`);
  if (book.leftOut.length) console.error(`left out: ${book.leftOut.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await madridBook({ growth: process.argv.includes("--growth") });
  report(book, book.listed);
}
