// What SBS Securities sells in shares and exchange-traded funds, with no
// login. The SBS price board (stockboard.sbsc.com.vn, an RPSoft board) is
// the book. It talks to its server over one WebSocket whose requests are
// scrambled with a key the page computes, so plain HTTP cannot read it:
// this scraper drives the board in a browser instead.
//
// For each floor (STO is HOSE, STX HNX, UPX UPCOM) the board's own symbol
// search, asked for the whole floor, returns every code with its group and
// name: ST is a share, EF an ETF, MF a closed-end fund, EW a covered
// warrant, IDX an index. Shares and ETFs are kept; the rest are other
// products. Opening the floor's page makes the board send a quote line for
// every code on that floor (WebSocket frames, read here through the Chrome
// DevTools protocol). The board's parser reads the reference price from
// field 4 of a share line and field 3 of an ETF line. A code with no quote
// line or no reference price has no session today (a delisted name) and is
// not written. The board prints no ISIN; the Vietnamese number is built
// from the ticker. The shared rules are in ../vix/vnboard.mjs.
//
//   https://stockboard.sbsc.com.vn/k9/market/STO   (STX, UPX)
//   wss://stockboard.sbsc.com.vn/api/ws
//
// Needs a Chrome listening for DevTools on port 9222 (started with
// --remote-debugging-port=9222). The scraper opens its own tab there and
// closes only that tab.
//
//   node brokers/sbs/sbs_scraping.mjs

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, pause, tally } from "../vix/vnboard.mjs";

const HOST = "https://stockboard.sbsc.com.vn/k9";
const FLOORS = ["STO", "STX", "UPX"];
const KINDS = { ST: "STOCK", EF: "ETF" };
const OTHER = { MF: "closed-end funds", EW: "covered warrants", IDX: "indexes" };
// Position of the reference price in a quote line, as the board parses it.
const REF_FIELD = { STOCK: 4, ETF: 3 };

// The search answers a small CSV: header, type row, then lines. A name
// holding a comma is quoted.
function parseCsv(text) {
  const rows = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line) continue;
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let at = 0; at < line.length; at += 1) {
      const character = line[at];
      if (quoted) {
        if (character === '"' && line[at + 1] === '"') {
          cell += '"';
          at += 1;
        } else if (character === '"') quoted = false;
        else cell += character;
      } else if (character === '"') quoted = true;
      else if (character === ",") {
        cells.push(cell);
        cell = "";
      } else cell += character;
    }
    cells.push(cell);
    rows.push(cells);
  }
  const [header] = rows;
  return rows.slice(2).map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""])));
}

// A quote line is "|"-separated; a field written "n^value" jumps to
// position n, as the board's parser reads it.
function quoteFields(line) {
  const fields = [];
  let position = 0;
  for (const part of String(line).split("|")) {
    const caret = part.indexOf("^");
    if (caret > 0 && /^\d+$/.test(part.slice(0, caret))) {
      position = Number(part.slice(0, caret));
      fields[position] = part.slice(caret + 1);
    } else fields[position] = part;
    position += 1;
  }
  return fields;
}

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = await browser.newPage();
const lines = [];
const leftOut = new Map();

try {
  const devtools = await page.createCDPSession();
  await devtools.send("Network.enable");
  let quotes = new Map();
  devtools.on("Network.webSocketFrameReceived", ({ response }) => {
    const text = response?.payloadData || "";
    if (!text.startsWith("[")) return;
    try {
      for (const item of JSON.parse(text)) {
        const fields = quoteFields(item?.d || "");
        if (fields[0] && !quotes.has(fields[0])) quotes.set(fields[0], fields);
      }
    } catch {
      // Not a quote batch.
    }
  });

  async function openFloor(floor) {
    quotes = new Map();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.goto(`${HOST}/market/${floor}`, { waitUntil: "networkidle2", timeout: 90_000 });
        return;
      } catch (error) {
        if (attempt === 2) throw error;
        await pause(2000 * (attempt + 1));
      }
    }
  }

  // The board's own symbol search, called inside the page once its socket is up.
  async function searchFloor(floor) {
    let last = "";
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const answer = await page.evaluate(async (marketId) => {
        let require;
        globalThis.webpackChunksb6.push([[Symbol("sbs")], {}, (inner) => (require = inner)]);
        let proxy;
        for (const module of Object.values(require.c)) {
          try {
            for (const value of Object.values(module.exports || {})) if (typeof value?.PxSearchSymbols === "function") proxy = value;
          } catch {
            // A module whose exports cannot be read.
          }
        }
        if (!proxy) return { error: "no board client" };
        if (proxy.websocket?.readyState !== 1) return { error: "socket not open" };
        const timeout = new Promise((resolve) => setTimeout(() => resolve({ C: -1, D: "timeout" }), 30_000));
        const reply = await Promise.race([proxy.PxSearchSymbols({ marketId, all: 1, startWith: 0 }), timeout]);
        return reply?.C === 0 ? { data: reply.D } : { error: `code ${reply?.C}: ${String(reply?.D).slice(0, 80)}` };
      }, floor);
      if (answer.data) return parseCsv(answer.data);
      last = answer.error;
      await pause(2000 * (attempt + 1));
    }
    throw new Error(`the ${floor} symbol search failed: ${last}`);
  }

  for (const floor of FLOORS) {
    const exchange = boardOf(floor);
    await openFloor(floor);
    const listed = await searchFloor(floor);
    if (!listed.length) throw new Error(`the ${floor} search returned nothing`);

    const wanted = [];
    for (const line of listed) {
      const ticker = clean(line.Symbol).toUpperCase();
      const group = clean(line.GroupId).toUpperCase();
      if (clean(line.MarketId).toUpperCase() !== floor) throw new Error(`${ticker} is market ${line.MarketId} on the ${floor} search`);
      if (KINDS[group]) wanted.push({ ticker, name: clean(line.Name) || clean(line.NameEn), exchange, type: KINDS[group] });
      else tally(leftOut, OTHER[group] || `group ${group || "none"} lines`);
    }

    // Wait until the floor's quote lines stop arriving.
    let seen = -1;
    for (let round = 0; round < 30; round += 1) {
      await pause(2000);
      const have = wanted.filter((line) => quotes.has(line.ticker)).length;
      if (have === wanted.length || (have === seen && have > 0)) break;
      seen = have;
    }
    const missing = wanted.filter((line) => !quotes.has(line.ticker));
    if (missing.length > wanted.length * 0.05) {
      throw new Error(`${floor}: no quote for ${missing.length} of ${wanted.length} codes (${missing.slice(0, 5).map((line) => line.ticker).join(", ")}…)`);
    }
    for (const line of wanted) {
      const fields = quotes.get(line.ticker);
      if (!fields || !(Number(fields[REF_FIELD[line.type]]) > 0)) tally(leftOut, "names with no session today (delisted)");
      else lines.push(line);
    }
    console.error(`${exchange}: ${listed.length} codes listed, ${quotes.size} quote lines`);
  }
} finally {
  await page.close().catch(() => {});
  await browser.disconnect();
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("sbs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
