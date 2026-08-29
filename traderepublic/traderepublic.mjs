import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      // Supports both: symbol,isin,name and symbol,exchange,isin,name.
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

      for (const col of cols) {
        const isin = toIsin(col);
        if (isin) return isin;
      }
      return "";
    })
    .filter(Boolean);
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the calls below.
const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("traderepublic.com")) ||
  (await browser.newPage());

if (!page.url().includes("traderepublic.com")) {
  await page.goto("https://app.traderepublic.com/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to traderepublic-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();
const csvQueries = loadIsinsFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = new URL("traderepublic-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin) seen.add(`ISIN:${entry.isin}`);
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

// Which country's rules the account trades under. It decides whether a fund is
// offered at all, so asking as the wrong country would answer for someone else.
const jurisdiction = await page.evaluate(async () => {
  try {
    const response = await fetch("https://api.traderepublic.com/api/v2/auth/account", {
      credentials: "include",
    });
    const account = await response.json();
    return account?.jurisdiction || "";
  } catch {
    return "";
  }
});

if (!jurisdiction) {
  throw new Error(
    "Could not read the account's jurisdiction. Is the Trade Republic session still signed in?"
  );
}

// Trade Republic's app talks over one WebSocket: `sub <id> {...}` asks, and the
// answer comes back as `<id> A {...}`. One socket serves the whole run, and
// several questions can be in flight on it at once.
const IN_FLIGHT = 15;

async function openSocket() {
  const opened = await page.evaluate(async () => {
    if (window.__trSub && window.__trSocket?.readyState === WebSocket.OPEN) return true;

    const socket = new WebSocket("wss://api.traderepublic.com/");
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener("message", (event) => {
      const text = String(event.data);
      if (text === "connected") {
        pending.get("connect")?.(true);
        return;
      }
      const match = text.match(/^(\d+)\s+([ACDE])\s?([\s\S]*)$/);
      if (!match) return;

      const [, id, kind, body] = match;
      const resolve = pending.get(id);
      if (!resolve) return;
      // "A" is the answer, "E" an error; "C"/"D" close and update a
      // subscription we have already stopped caring about.
      if (kind !== "A" && kind !== "E") return;

      pending.delete(id);
      socket.send(`unsub ${id}`);
      if (kind === "E") {
        resolve({ error: body });
        return;
      }
      try {
        resolve({ data: JSON.parse(body) });
      } catch {
        resolve({ error: body });
      }
    });

    const ready = await new Promise((resolve) => {
      socket.addEventListener("open", () => resolve(true));
      socket.addEventListener("error", () => resolve(false));
      setTimeout(() => resolve(false), 15000);
    });
    if (!ready) return false;

    const connected = await new Promise((resolve) => {
      pending.set("connect", resolve);
      socket.send(
        `connect 34 ${JSON.stringify({
          locale: "en",
          platformId: "webtrading",
          platformVersion: "chrome",
          clientId: "app.traderepublic.com",
          clientVersion: "1.2635.0",
        })}`
      );
      setTimeout(() => resolve(false), 15000);
    });
    pending.delete("connect");
    if (!connected) return false;

    window.__trSocket = socket;
    window.__trSub = (payload) =>
      new Promise((resolve) => {
        const id = String(nextId++);
        pending.set(id, resolve);
        socket.send(`sub ${id} ${JSON.stringify(payload)}`);
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          socket.send(`unsub ${id}`);
          resolve({ timeout: true });
        }, 15000);
      });
    return true;
  });

  if (!opened) throw new Error("Could not open Trade Republic's WebSocket.");
}

async function ask(payloads) {
  await openSocket();
  return page.evaluate(
    (batch) => Promise.all(batch.map((payload) => window.__trSub(payload))),
    payloads
  );
}

// An ISIN Trade Republic does not carry is refused outright, which is a
// different thing from one it carries but will not let this account trade.
const notCarried = (answer) => /NOT_FOUND/.test(answer?.error || "");

function isAvailable(instrument) {
  return (
    instrument.active !== false &&
    instrument.tradable !== false &&
    instrument.jurisdictions?.[jurisdiction]?.active !== false
  );
}

function rowFrom(query, instrument, exchange) {
  const fund = instrument.fundInfo || instrument.mutualFundInfo || {};
  const name = (instrument.name || "").replace(/\s+/g, " ").trim();
  const ticker = (instrument.homeSymbol || instrument.intlSymbol || "").toUpperCase();
  return {
    query,
    isin: instrument.isin || query,
    ticker: ticker || null,
    name,
    shortName: (instrument.shortName || "").replace(/\s+/g, " ").trim() || null,
    exchange: exchange?.exchangeId || null,
    exchangeName: exchange?.exchange?.name || null,
    // What the account pays in, which is not always what the fund itself is
    // denominated in: a USD world tracker still trades here in euros.
    currency: exchange?.currency?.id || null,
    fundCurrency: fund.currency || instrument.notionalCurrency || null,
    type: (fund.category || instrument.typeId || "").toUpperCase() || null,
    // "accumulating" or "distributing": which share class this is.
    distributionPolicy: fund.useOfProfits || null,
    ter: fund.ter ? Number(fund.ter) : null,
    raw: [ticker, name, exchange?.exchangeId, exchange?.currency?.id]
      .filter(Boolean)
      .join(" "),
  };
}

// The same lookup the fund browser runs. An empty query with the account's
// jurisdiction lists every fund TR will actually offer, so a long CSV can be
// answered by reading that list once instead of asking about each ISIN.
async function fetchOfferedIsins() {
  const filter = [
    { key: "type", value: "fund" },
    { key: "jurisdiction", value: jurisdiction },
  ];
  const pageSize = 50;

  const first = await ask([
    { type: "neonSearch", data: { q: "", page: 1, pageSize, filter } },
  ]);
  const total = first[0]?.data?.resultCount;
  if (!Number.isFinite(total)) {
    throw new Error("Trade Republic did not hand over its fund list. Is the session still signed in?");
  }

  const isins = new Set(
    (first[0].data.results || []).map((hit) => (hit.isin || "").toUpperCase()).filter(Boolean)
  );
  const pages = Math.ceil(total / pageSize);
  console.error(`  page 1/${pages} (${isins.size} unique)`);

  async function searchPage(pageNo) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answer = await ask([
        { type: "neonSearch", data: { q: "", page: pageNo, pageSize, filter } },
      ]);
      const rows = answer[0]?.data?.results || [];
      // A middle page that comes back empty is the socket dropping a reply,
      // not the catalogue running out.
      if (rows.length || pageNo === pages) return rows;
    }
    return [];
  }

  // Pages have to be asked one at a time: asking several at once makes the
  // search skip or repeat a page, and some funds then never appear.
  for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
    for (const hit of await searchPage(pageNo)) {
      if (hit.isin) isins.add(hit.isin.toUpperCase());
    }
    if (pageNo === pages || pageNo % 10 === 0) {
      console.error(`  page ${pageNo}/${pages} (${isins.size} unique)`);
    }
  }

  return isins;
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

const pending = queries.slice(startIndex - 1);
const useUniverse = pending.length >= 50;

let offered = null;
if (useUniverse) {
  console.error("reading Trade Republic's offered funds");
  offered = await fetchOfferedIsins();
  console.error(`${offered.size} funds offered in ${jurisdiction}`);
}

console.error(`${queries.length} ISINs to check, as a ${jurisdiction} account`);

let silences = 0;

for (let offset = startIndex - 1; offset < queries.length; offset += IN_FLIGHT) {
  const batch = queries.slice(offset, offset + IN_FLIGHT);
  const lookup = offered ? batch.filter((isin) => offered.has(isin)) : batch;

  for (const [batchIndex, query] of batch.entries()) {
    console.error(`[${offset + batchIndex + 1}/${queries.length}] ${query}`);
  }

  if (lookup.length === 0) continue;

  const instruments = await ask(
    lookup.map((isin) => ({ type: "instrument", id: isin, jurisdiction }))
  );

  const available = [];
  for (const [index, isin] of lookup.entries()) {
    const answer = instruments[index];
    const instrument = answer?.data;
    if (instrument) {
      silences = 0;
      if (!isAvailable(instrument)) {
        console.error(`  ${instrument.shortName || isin}: not offered in ${jurisdiction} — skipped`);
        continue;
      }
      available.push({ isin, instrument });
      continue;
    }
    if (notCarried(answer)) continue;
    console.error(`  ${isin}: no answer: ${answer?.error || "timed out"}`);
    silences += 1;
    if (silences >= 5) {
      throw new Error("Trade Republic stopped answering. Is the session still signed in?");
    }
  }

  const exchangeAnswers = available.length
    ? await ask(available.map(({ isin }) => ({ type: "homeInstrumentExchange", id: isin })))
    : [];

  for (const [index, { isin, instrument }] of available.entries()) {
    const key = `ISIN:${instrument.isin || isin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(rowFrom(isin, instrument, exchangeAnswers[index]?.data || null));
  }

  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
