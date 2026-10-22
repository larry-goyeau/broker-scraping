// The US exchange listings of the day and the open trade halts, for the
// US catalogues of raseed, slayz and grifin.
//
// usDirectory(): Nasdaq Trader's symbol directories (nasdaqlisted.txt and
// otherlisted.txt), test issues left out. Each symbol gives its primary
// listing (exchange code mapped to a MIC), its ETF flag and its security
// name. The files end with "File Creation Time: MMDDYYYYHH:MM"; a file
// older than the current New York date is refused (the directory of the
// day comes out around 03:00 ET, and a fund closed the day before is
// still in yesterday's file). On a Saturday or Sunday Friday's file or a
// later one is taken.
//
// openHalts(): the symbols with a halt and no resumption date, from the
// NYSE current trade halts download (all US venues, Nasdaq ones included)
// and the Nasdaq Trader trade-halts RSS. The NYSE file is required: it
// failing or changing shape throws. The RSS is added when it answers; it
// sits behind a bot wall that sometimes answers with a challenge page
// instead of the feed, and then the NYSE file alone stands (the returned
// map's "sources" says which were read). An RSS that answers with a feed
// of another shape throws.
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (same files as https://www.nasdaqtrader.com/dynamic/SymDir/)
//   https://www.nyse.com/api/trade-halts/current/download
//   https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts

import { execFileSync } from "node:child_process";
import { parseCsv } from "../mitsubishiufjesmart/japan.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
// The directory's exchange codes. F is the Texas Stock Exchange: its test
// symbols say "TXSE", and Energy Transfer, Sunoco and others now list there.
export const LISTING = { Q: "XNAS", N: "XNYS", A: "XASE", P: "ARCX", Z: "BATS", F: "TXSE" };

// One spelling for a US symbol across feeds: BRK.B, BRK/B, BRK-B and
// BRK B are one class; a preferred keeps its "$" (GL$D is not GLD).
export const tapeKey = (symbol) => String(symbol || "").trim().toUpperCase().replace(/[/\- ]+/g, ".");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function newYork(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}

// The oldest directory date accepted now: today in New York, or the last
// Friday at a weekend.
function oldestAccepted(now = new Date()) {
  const { day, weekday } = newYork(now);
  const back = { Sat: 1, Sun: 2 }[weekday] || 0;
  if (!back) return day;
  return newYork(new Date(now.getTime() - back * 86_400_000)).day;
}

export async function usDirectory() {
  const symbols = new Map();
  const created = {};
  const floor = oldestAccepted();
  for (const [file, header] of [
    ["nasdaqlisted.txt", "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF"],
    ["otherlisted.txt", "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue"],
  ]) {
    let body = "";
    try {
      body = execFileSync("curl", ["-s", "--max-time", "120", `ftp://ftp.nasdaqtrader.com/symboldirectory/${file}`], { maxBuffer: 64 << 20 }).toString("utf8");
    } catch {
      body = "";
    }
    if (!body.startsWith(header)) body = await get(`https://www.nasdaqtrader.com/dynamic/SymDir/${file}`, "text/plain");
    if (!body.startsWith(header)) throw new Error(`${file}: unexpected header ${body.slice(0, 60)}`);
    const stamp = body.match(/File Creation Time: (\d{2})(\d{2})(\d{4})(\d{2}:\d{2})/);
    if (!stamp) throw new Error(`${file}: no File Creation Time line`);
    created[file] = `${stamp[3]}-${stamp[1]}-${stamp[2]} ${stamp[4]}`;
    if (created[file].slice(0, 10) < floor) {
      throw new Error(`${file} was made ${created[file]} ET, before ${floor}: run again once the directory of the day is out (about 03:00 ET)`);
    }
    const nasdaq = file === "nasdaqlisted.txt";
    for (const line of body.split(/\r?\n/).slice(1)) {
      const cells = line.split("|");
      if (cells.length < 7 || line.startsWith("File Creation Time")) continue;
      if ((nasdaq ? cells[3] : cells[6]) === "Y") continue;
      const code = nasdaq ? "Q" : cells[2];
      symbols.set(cells[0], { mic: LISTING[code], code, etf: (nasdaq ? cells[6] : cells[4]) === "Y", name: cells[1].trim() });
    }
  }
  if (symbols.size < 10000) throw new Error(`the US directories hold only ${symbols.size} lines`);
  const byKey = new Map();
  for (const [symbol, entry] of symbols) if (!byKey.has(tapeKey(symbol))) byKey.set(tapeKey(symbol), { symbol, ...entry });
  return { symbols, byKey, created };
}

// Symbol key -> "SYMBOL halt date reason (source)" for halts with no
// resumption date.
export async function openHalts() {
  const open = new Map();
  open.sources = [];
  const nyse = parseCsv(await get("https://www.nyse.com/api/trade-halts/current/download", "text/csv"));
  const head = (nyse[0] || []).map((cell) => cell.replace(/^﻿/, "").trim());
  const want = ["Halt Date", "Halt Time", "Symbol", "Name", "Exchange", "Reason", "Resume Date"];
  if (want.some((name, index) => head[index] !== name)) throw new Error(`NYSE trade halts header is ${head.join(",")}`);
  for (const [date, , symbol, , exchange, reason, resume] of nyse.slice(1)) {
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`NYSE trade halts line ${date} ${symbol}`);
    if (!String(resume || "").trim()) open.set(tapeKey(symbol), `${symbol} ${date} ${reason} on ${exchange} (NYSE)`);
  }
  open.sources.push(`NYSE ${nyse.length - 1} halts`);
  let rss = "";
  for (let attempt = 0; attempt < 3 && !rss.includes("<rss"); attempt += 1) {
    if (attempt) await sleep(3000 * attempt);
    rss = await get("https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts", "application/rss+xml");
  }
  if (!rss.includes("<rss") && /_Incapsula_Resource/.test(rss)) {
    open.sources.push("Nasdaq RSS behind its bot wall, not read");
    return open;
  }
  const count = rss.match(/<ndaq:numItems>(\d+)<\/ndaq:numItems>/);
  if (!count || !/NASDAQ Trade Halts/.test(rss)) throw new Error(`Nasdaq trade halts RSS changed: ${rss.slice(0, 120)}`);
  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  if (items.length !== Number(count[1])) throw new Error(`Nasdaq trade halts RSS: ${items.length} items for ${count[1]}`);
  const tag = (item, name) => {
    const found = item.match(new RegExp(`<ndaq:${name}>([^<]*)</ndaq:${name}>|<ndaq:${name}\\s*/>`));
    return found ? (found[1] || "").trim() : null;
  };
  for (const item of items) {
    const symbol = tag(item, "IssueSymbol");
    const resume = tag(item, "ResumptionDate");
    if (!symbol || resume === null) throw new Error(`Nasdaq trade halts RSS item without symbol or resumption field: ${item.slice(0, 160)}`);
    if (!resume && !open.has(tapeKey(symbol))) open.set(tapeKey(symbol), `${symbol} ${tag(item, "HaltDate")} ${tag(item, "ReasonCode")} on ${tag(item, "Market")} (Nasdaq)`);
  }
  open.sources.push(`Nasdaq RSS ${items.length} halts`);
  return open;
}
