// ASX book and Cboe Australia touch, from the signed-in Interactive Brokers
// portal. Bid and ask are the quote. A last trade is never written in their
// place. One side missing stays missing. The cash session is 10:00–16:00
// Sydney time. Past the close the script stops asking.
//
// The portal tab is the one already open. Nothing else in that browser is
// navigated. The readings stay in parsed_json/au-touch.json.
//
//   node au-touch.mjs

import fs from "node:fs";
import { createRequire } from "node:module";
import { parseCsv } from "./indianCash.mjs";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const STORE = new URL("parsed_json/au-touch.json", import.meta.url);
const API = "/portal.proxy/v1/portal";
const FIELDS = "84,86,85,88";
const isIbPortal = (url) =>
  /ndcdyn\.interactivebrokers\.com\/portal/.test(url) ||
  /interactivebrokers\.(ie|com|co\.uk)\/portal/.test(url);

const sydney = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Sydney",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && minutes >= 10 * 60 && minutes < 16 * 60;
  return { weekday: parts.weekday, minutes, open, clock: `${parts.hour}:${parts.minute}` };
};

const num = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

function names() {
  const rows = [];
  const seen = new Set();
  const add = (file, exchange, venue, mic) => {
    for (const row of parseCsv(fs.readFileSync(new URL(file, import.meta.url), "utf8"))) {
      if (row.exchange !== exchange) continue;
      const ticker = String(row.ticker || "").split(":").pop().trim().toUpperCase();
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!ticker || !isin) continue;
      const key = `${venue}|${ticker}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ticker, isin, name: row.name || "", venue, mic, book: venue === "ASX" });
    }
  };
  add("etfs.csv", "ASX", "ASX", "XASX");
  add("stocks.csv", "ASX", "ASX", "XASX");
  add("etfs.csv", "CXA", "CHIXAU", "CHIA");
  return rows;
}

if (process.argv.includes("--books")) {
  const store = JSON.parse(fs.readFileSync(STORE, "utf8"));
  const pending = store.rows.filter((row) => row.venue === "ASX" && !row.book);
  console.error(`Sydney ${sydney().clock}. ${pending.length} carnets ASX restants.`);
  const browser = await puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
    defaultViewport: null,
    protocolTimeout: 180000,
  });
  const portal = async () => (await browser.pages()).find((page) => isIbPortal(page.url()));
  let page = await portal();
  if (!page) {
    console.error("Onglet du portail Interactive Brokers introuvable.");
    await browser.disconnect();
    process.exit(1);
  }
  let done = store.rows.filter((row) => row.book).length;
  const conidOf = async (ticker) => {
    page = (await portal()) || page;
    const hits = await page.evaluate(async (base, symbol) => {
      const response = await fetch(`${base}/iserver/secdef/search`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ symbol, name: false, secType: "STK" }),
      });
      const json = await response.json();
      return Array.isArray(json) ? json : [];
    }, API, ticker);
    return pick(hits, "ASX");
  };
  for (let i = 0; i < pending.length && sydney().open; i += 20) {
    page = (await portal()) || page;
    const batch = pending.slice(i, i + 20);
    const byIsin = new Map(batch.map((row) => [row.isin, row]));
    const jobs = [];
    for (const row of batch) {
      const conid = row.conid || await conidOf(row.ticker);
      if (conid) jobs.push({ isin: row.isin, conid });
    }
    let books = {};
    try {
      books = await page.evaluate(async (base, jobs) => {
      const ws = new WebSocket(location.origin.replace("https", "wss") + `${base}/ws`);
      const textOf = async (data) => (typeof data === "string" ? data : data instanceof Blob ? data.text() : String(data));
      let acct = "";
      const waitAcct = new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        ws.addEventListener("message", async (event) => {
          const text = await textOf(event.data);
          try {
            const body = JSON.parse(text);
            if (body?.args?.accounts?.[0]) {
              acct = body.args.accounts[0];
              clearTimeout(timer);
              resolve();
            }
          } catch {}
        });
      });
      await waitAcct;
      const out = {};
      for (const job of jobs) {
        if (!acct || ws.readyState !== 1) break;
        const levels = new Map();
        const onMessage = async (event) => {
          const text = await textOf(event.data);
          let body;
          try { body = JSON.parse(text); } catch { return; }
          if (!String(body.topic || "").endsWith(`+${job.conid}`)) return;
          for (const level of body.data || []) {
            const price = Number(level.price);
            if (!(price > 0) || String(level.price).includes("@")) continue;
            const prior = levels.get(level.row) || {};
            const next = { price };
            if (level.ask != null) next.ask = Number(level.ask);
            else if (prior.ask != null && level.bid == null) next.ask = prior.ask;
            if (level.bid != null) next.bid = Number(level.bid);
            else if (prior.bid != null && level.ask == null) next.bid = prior.bid;
            levels.set(level.row, next);
          }
        };
        ws.addEventListener("message", onMessage);
        ws.send(`sbd+${acct}+${job.conid}`);
        await new Promise((resolve) => setTimeout(resolve, 900));
        ws.send(`ubd+${acct}+${job.conid}`);
        ws.removeEventListener("message", onMessage);
        const bids = [];
        const asks = [];
        for (const level of levels.values()) {
          if (level.bid > 0) bids.push({ price: level.price, size: level.bid });
          if (level.ask > 0) asks.push({ price: level.price, size: level.ask });
        }
        bids.sort((a, b) => b.price - a.price);
        asks.sort((a, b) => a.price - b.price);
        if (bids.length || asks.length) out[job.isin] = { bids, asks };
      }
      try { ws.close(); } catch {}
      return out;
    }, API, jobs);
    } catch (error) {
      console.error(`lot ignoré (${String(error.message || error).slice(0, 100)})`);
      page = (await portal()) || page;
      continue;
    }
    for (const [isin, book] of Object.entries(books || {})) {
      const row = byIsin.get(isin);
      if (!row) continue;
      row.book = book;
      const bid = book.bids[0]?.price ?? null;
      const ask = book.asks[0]?.price ?? null;
      if (bid != null && ask != null) {
        row.bid = bid;
        row.ask = ask;
        row.bidSize = book.bids[0].size;
        row.askSize = book.asks[0].size;
        row.bp = bpFrom(bid, ask);
      }
      done += 1;
    }
    store.session = sydney();
    store.at = new Date().toISOString();
    fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
    console.error(`${done} carnets, Sydney ${sydney().clock}`);
  }
  await browser.disconnect();
  console.error(`Sydney ${sydney().clock}. ${done} carnets ASX.`);
  process.exit(0);
}

const clock = sydney();
if (!clock.open) {
  console.error(`Séance cash fermée à Sydney (${clock.weekday} ${clock.clock}). Rien n'est écrit.`);
  process.exit(0);
}

const jobs = names();
console.error(`Sydney ${clock.clock}. ${jobs.length} actions et ETF.`);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 180000,
});

async function portal() {
  const pages = await browser.pages();
  return pages.find((page) => isIbPortal(page.url())) || null;
}

let page = await portal();
if (!page) {
  console.error("Onglet du portail Interactive Brokers introuvable.");
  await browser.disconnect();
  process.exit(1);
}

async function api(path, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    page = (await portal()) || page;
    if (!page) return { status: 0, error: "portail absent" };
    try {
      return await page.evaluate(
        async (base, target, opts) => {
          const response = await fetch(`${base}/${target}`, {
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            method: opts.method || "GET",
            body: opts.body || undefined,
          });
          const text = await response.text();
          try {
            return { status: response.status, json: JSON.parse(text) };
          } catch {
            return { status: response.status, error: text.slice(0, 180) };
          }
        },
        API,
        path,
        options
      );
    } catch (error) {
      if (attempt === 2) throw error;
      console.error(`portail rechargé (${String(error.message || error).slice(0, 80)}). Nouvel essai.`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function pick(hits, venue) {
  const list = Array.isArray(hits) ? hits : [];
  for (const hit of list) {
    if (!hit?.conid || hit.conid === "2147483647" || hit.conid === 2147483647) continue;
    const header = String(hit.companyHeader || "");
    if (hit.description === venue || header.endsWith(` - ${venue}`)) return String(hit.conid);
  }
  return "";
}

const found = [];
const missed = [];
const written = new Set();
const priorAbsent = [];
const resume = process.argv.includes("--resume") && fs.existsSync(STORE);
if (resume) {
  const prior = JSON.parse(fs.readFileSync(STORE, "utf8"));
  priorAbsent.push(...(prior.absent || []));
  for (const row of prior.rows || []) {
    if (row.bid == null || row.ask == null) continue;
    found.push(row);
    written.add(`${row.venue}|${row.isin}`);
  }
  console.error(
    `Reprise : ${found.length} touches déjà écrites, ${found.filter((row) => row.book).length} carnets. ` +
      `${jobs.filter((job) => !written.has(`${job.venue}|${job.isin}`)).length} touches à reprendre.`
  );
}

function save() {
  const attempted = new Set([
    ...found.map((row) => `${row.venue}|${row.isin}`),
    ...missed.map((row) => `${row.venue}|${row.isin}`),
  ]);
  const absent = [
    ...missed,
    ...priorAbsent.filter((row) => !attempted.has(`${row.venue}|${row.isin}`)),
  ];
  const body = {
    at: new Date().toISOString(),
    session: sydney(),
    asked: jobs.length,
    quoted: found.length,
    missing: absent.length,
    rows: found,
    absent,
  };
  fs.writeFileSync(STORE, JSON.stringify(body, null, 2));
}

console.error("Recherche des contrats…");
let resolved = 0;
const pendingQuotes = resume ? jobs.filter((job) => !written.has(`${job.venue}|${job.isin}`)) : jobs;
for (const job of pendingQuotes) {
  if (!sydney().open) break;
  let answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol: job.ticker, name: false, secType: "STK" }),
  });
  if (!Array.isArray(answer.json)) {
    await api("tickle").catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 800));
    answer = await api("iserver/secdef/search", {
      method: "POST",
      body: JSON.stringify({ symbol: job.ticker, name: false, secType: "STK" }),
    });
  }
  job.conid = pick(answer.json, job.venue);
  resolved += 1;
  if (!job.conid) missed.push({ isin: job.isin, ticker: job.ticker, venue: job.venue, why: "contrat absent" });
  if (resolved % 100 === 0) console.error(`${resolved} recherchés, ${jobs.filter((row) => row.conid).length} contrats, Sydney ${sydney().clock}`);
}

const quoted = pendingQuotes.filter((job) => job.conid);
console.error(`${quoted.length} contrats. Touches…`);

const quoteOf = (row) => ({
  bid: num(row?.["84"]),
  ask: num(row?.["86"]),
  bidSize: num(row?.["88"]),
  askSize: num(row?.["85"]),
});

for (let i = 0; i < quoted.length && sydney().open; i += 30) {
  const batch = quoted.slice(i, i + 30);
  const ids = batch.map((job) => job.conid).join(",");
  let byId = new Map();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snap = await api(`iserver/marketdata/snapshot?conids=${ids}&fields=${FIELDS}`);
    for (const row of Array.isArray(snap.json) ? snap.json : []) {
      const touch = quoteOf(row);
      if (touch.bid || touch.ask) byId.set(String(row.conid), touch);
    }
    if (batch.every((job) => byId.has(job.conid))) break;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await api("iserver/marketdata/unsubscribeall").catch(() => null);
  for (const job of batch) {
    const touch = byId.get(job.conid);
    if (!touch || touch.bid == null || touch.ask == null) {
      missed.push({ isin: job.isin, ticker: job.ticker, venue: job.venue, why: "touche incomplète" });
      continue;
    }
    found.push({
      isin: job.isin,
      ticker: job.ticker,
      name: job.name,
      venue: job.venue,
      mic: job.mic,
      currency: "AUD",
      bid: touch.bid,
      ask: touch.ask,
      bidSize: touch.bidSize,
      askSize: touch.askSize,
      bp: bpFrom(touch.bid, touch.ask),
      book: null,
    });
  }
  if ((i + batch.length) % 90 < 30) {
    save();
    console.error(`${Math.min(i + batch.length, quoted.length)} cotés, ${found.length} touches, Sydney ${sydney().clock}`);
  }
}
save();

async function bookOf(conid) {
  page = (await portal()) || page;
  return page.evaluate(async (base, id) => {
    const ws = new WebSocket(location.origin.replace("https", "wss") + `${base}/ws`);
    const textOf = async (data) => (typeof data === "string" ? data : data instanceof Blob ? data.text() : String(data));
    const levels = new Map();
    let acct = "";
    await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), 8000);
      ws.onmessage = async (event) => {
        const text = await textOf(event.data);
        let body;
        try { body = JSON.parse(text); } catch { return; }
        if (!acct && body?.args?.accounts?.[0]) {
          acct = body.args.accounts[0];
          ws.send(`sbd+${acct}+${id}`);
          setTimeout(() => {
            ws.send(`ubd+${acct}+${id}`);
            clearTimeout(timer);
            ws.close();
            resolve();
          }, 1200);
        }
        if (!String(body.topic || "").endsWith(`+${id}`)) return;
        for (const row of body.data || []) {
          const price = Number(row.price);
          if (!(price > 0) || String(row.price).includes("@")) continue;
          const prior = levels.get(row.row) || {};
          const next = { price };
          if (row.ask != null) next.ask = Number(row.ask);
          else if (prior.ask != null && row.bid == null) next.ask = prior.ask;
          if (row.bid != null) next.bid = Number(row.bid);
          else if (prior.bid != null && row.ask == null) next.bid = prior.bid;
          levels.set(row.row, next);
        }
      };
    });
    const bids = [];
    const asks = [];
    for (const level of levels.values()) {
      if (level.bid > 0) bids.push({ price: level.price, size: level.bid });
      if (level.ask > 0) asks.push({ price: level.price, size: level.ask });
    }
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    return bids.length || asks.length ? { bids, asks } : null;
  }, API, conid);
}

console.error("Carnets ASX…");
let books = 0;
for (const row of found) {
  if (!sydney().open) break;
  if (row.venue !== "ASX") continue;
  if (row.book && (row.book.bids?.length || row.book.asks?.length)) continue;
  let job = quoted.find((item) => item.isin === row.isin && item.venue === "ASX");
  if (!job) {
    let answer = await api("iserver/secdef/search", {
      method: "POST",
      body: JSON.stringify({ symbol: row.ticker, name: false, secType: "STK" }),
    });
    if (!Array.isArray(answer.json)) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      answer = await api("iserver/secdef/search", {
        method: "POST",
        body: JSON.stringify({ symbol: row.ticker, name: false, secType: "STK" }),
      });
    }
    const conid = pick(answer.json, "ASX");
    if (!conid) continue;
    job = { isin: row.isin, venue: "ASX", conid };
    quoted.push(job);
  }
  const book = await bookOf(job.conid).catch(() => null);
  if (book && (book.bids.length || book.asks.length)) {
    row.book = book;
    const bid = book.bids[0]?.price ?? null;
    const ask = book.asks[0]?.price ?? null;
    if (bid != null && ask != null) {
      row.bid = bid;
      row.ask = ask;
      row.bidSize = book.bids[0].size;
      row.askSize = book.asks[0].size;
      row.bp = bpFrom(bid, ask);
    }
    books += 1;
  }
  if (books % 25 === 0 && books) {
    save();
    console.error(`${books} carnets, Sydney ${sydney().clock}`);
  }
}
save();
await browser.disconnect();
const session = sydney();
console.error(`Sydney ${session.clock}. ${found.length} touches, ${books} carnets, ${missed.length} sans touche complète. Écrit dans parsed_json/au-touch.json.`);
