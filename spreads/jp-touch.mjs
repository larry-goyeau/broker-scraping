// Delayed Tokyo touch, from the signed-in Interactive Brokers portal.
// Bid and ask are the quote. A last trade is never written in their place.
// One side missing stays missing. The account has no Tokyo depth, and the
// top of book comes back delayed. The readings stay in spreads/jp-touch.json.
//
// The portal tab is the one already open. Nothing else in that browser is
// navigated.
//
//   node jp-touch.mjs

import fs from "node:fs";
import { createRequire } from "node:module";
import { parseCsv } from "../indianCash.mjs";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const STORE = new URL("./jp-touch.json", import.meta.url);
const API = "/portal.proxy/v1/portal";
const FIELDS = "84,86,85,88,6509";

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
  for (const file of ["../assets/etfs.csv", "../assets/stocks.csv"]) {
    for (const row of parseCsv(fs.readFileSync(new URL(file, import.meta.url), "utf8"))) {
      if (row.exchange !== "TSE" && row.exchange !== "TYO") continue;
      const ticker = String(row.ticker || "").split(":").pop().trim().toUpperCase();
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!ticker || !isin || seen.has(ticker)) continue;
      seen.add(ticker);
      rows.push({ ticker, isin, name: row.name || "", venue: "TSEJ", mic: "XTKS" });
    }
  }
  return rows;
}

const jobs = names();
console.error(`${jobs.length} actions et ETF à Tokyo.`);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 180000,
});

async function portal() {
  const pages = await browser.pages();
  return pages.find((page) => /interactivebrokers\.(ie|com)\/portal/.test(page.url())) || null;
}

let page = await portal();
if (!page) {
  console.error("Onglet du portail Interactive Brokers introuvable.");
  await browser.disconnect();
  process.exit(1);
}

async function api(path, options = {}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    page = (await portal()) || page;
    if (!page) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
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
    } catch {
      page = null;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return { status: 0, json: null };
}

function pick(hits) {
  const list = Array.isArray(hits) ? hits : [];
  for (const hit of list) {
    if (!hit?.conid || hit.conid === "2147483647" || hit.conid === 2147483647) continue;
    const header = String(hit.companyHeader || "");
    if (hit.description === "TSEJ" || header.endsWith(" - TSEJ")) return String(hit.conid);
  }
  return "";
}

const found = [];
const missed = [];

function save() {
  fs.writeFileSync(
    STORE,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        delayed: true,
        asked: jobs.length,
        quoted: found.length,
        missing: missed.length,
        rows: found,
        absent: missed,
        contracts: jobs.filter((job) => job.conid).map((job) => ({ ticker: job.ticker, conid: job.conid })),
      },
      null,
      2
    )
  );
}

const prior = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, "utf8")) : null;
const known = new Map((prior?.contracts || []).map((row) => [row.ticker, row.conid]));
for (const job of jobs) {
  if (known.has(job.ticker)) job.conid = known.get(job.ticker);
}
if (known.size) console.error(`${known.size} contrats déjà trouvés.`);

console.error("Recherche des contrats…");
let resolved = 0;
for (const job of jobs) {
  if (job.conid) {
    resolved += 1;
    continue;
  }
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
  job.conid = pick(answer.json);
  resolved += 1;
  if (!job.conid) missed.push({ isin: job.isin, ticker: job.ticker, why: "contrat absent" });
  if (resolved % 100 === 0) {
    save();
    console.error(`${resolved} recherchés, ${jobs.filter((row) => row.conid).length} contrats`);
  }
}

if (Array.isArray(prior?.rows)) found.push(...prior.rows);
const already = new Set(found.map((row) => row.ticker));
const quoted = jobs.filter((job) => job.conid && !already.has(job.ticker));
console.error(`${quoted.length} contrats. Touches…`);

for (let i = 0; i < quoted.length; i += 30) {
  const batch = quoted.slice(i, i + 30);
  const ids = batch.map((job) => job.conid).join(",");
  const byId = new Map();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snap = await api(`iserver/marketdata/snapshot?conids=${ids}&fields=${FIELDS}`);
    for (const row of Array.isArray(snap.json) ? snap.json : []) {
      const bid = num(row["84"]);
      const ask = num(row["86"]);
      if (bid || ask) byId.set(String(row.conid), { bid, ask, bidSize: num(row["88"]), askSize: num(row["85"]), mark: row["6509"] || "" });
    }
    if (batch.every((job) => byId.has(job.conid))) break;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await api("iserver/marketdata/unsubscribeall").catch(() => null);
  for (const job of batch) {
    const touch = byId.get(job.conid);
    if (!touch || touch.bid == null || touch.ask == null) {
      missed.push({ isin: job.isin, ticker: job.ticker, why: "touche incomplète", mark: touch?.mark || "" });
      continue;
    }
    found.push({
      isin: job.isin,
      ticker: job.ticker,
      name: job.name,
      venue: "TSEJ",
      mic: "XTKS",
      currency: "JPY",
      bid: touch.bid,
      ask: touch.ask,
      bidSize: touch.bidSize,
      askSize: touch.askSize,
      mark: touch.mark,
      bp: bpFrom(touch.bid, touch.ask),
    });
  }
  if ((i + batch.length) % 90 < 30) {
    save();
    console.error(`${Math.min(i + batch.length, quoted.length)} cotés, ${found.length} touches`);
  }
}

save();
await browser.disconnect();
console.error(`${found.length} touches, ${missed.length} sans touche complète. Écrit dans spreads/jp-touch.json.`);
