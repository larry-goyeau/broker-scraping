// Tadawul touch, from the signed-in Interactive Brokers portal.
// Bid and ask are the quote. A last trade is never read. A delayed mark is
// kept. A frozen mark (Z) is left out. One side missing stays missing.
//
// The cash session is 10:00–15:00 Riyadh, Sunday to Thursday. Past the close
// the script stops asking. The portal tab is the one already open.
//
//   node tadawul-touch.mjs

import fs from "node:fs";
import { createRequire } from "node:module";
import { catalogueFiles } from "../catalogues.mjs";
import { fileURLToPath } from "node:url";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const STORE = new URL("./tadawul-touch.json", import.meta.url);
const SPREAD = fileURLToPath(new URL("./spread.json", import.meta.url));
const API = "/portal.proxy/v1/portal";
const FIELDS = "84,86,85,88,6509";
const VENUES = new Set(["TADAWUL", "TDWL", "SAUDI", "XSAU", "SAUDIEXCHANGE"]);

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

const riyadh = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Riyadh",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const open =
    ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(parts.weekday) &&
    minutes >= 10 * 60 &&
    minutes < 15 * 60;
  return { open, clock: `${parts.hour}:${parts.minute}`, weekday: parts.weekday };
};

function names() {
  const jobs = [];
  const seen = new Set();
  for (const file of catalogueFiles()) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const type = String(row.type || "").toUpperCase();
      if (type !== "STOCK" && type !== "ETF") continue;
      const exchange = String(row.exchange || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (!VENUES.has(exchange)) continue;
      const isin = String(row.isin || "").toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || seen.has(isin)) continue;
      seen.add(isin);
      jobs.push({
        isin,
        ticker: String(row.ticker || "").toUpperCase(),
        name: row.name || "",
        type,
      });
    }
  }
  return jobs;
}

const clock = riyadh();
if (!clock.open) {
  console.error(`Séance Tadawul fermée à Riyad (${clock.weekday} ${clock.clock}). Rien n'est écrit.`);
  process.exit(0);
}

console.error(`Riyad ${clock.clock}. Liste des actions et ETF…`);
const jobs = names();
console.error(`${jobs.length} actions et ETF Tadawul.`);

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

function pick(hits, ticker) {
  const want = String(ticker || "").toUpperCase();
  for (const hit of Array.isArray(hits) ? hits : []) {
    if (!hit?.conid || hit.conid === "2147483647" || hit.conid === 2147483647) continue;
    const where = `${hit.description || ""} ${hit.companyHeader || ""}`.toUpperCase();
    const symbol = String(hit.symbol || "").toUpperCase();
    if (!where.includes("TADAWUL")) continue;
    if (want && symbol && symbol !== want) continue;
    return String(hit.conid);
  }
  return "";
}

const found = [];
const missed = [];
const marks = new Map();

function save() {
  fs.writeFileSync(
    STORE,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        session: riyadh(),
        rows: found,
        absent: missed,
        contracts: jobs.filter((job) => job.conid).map((job) => ({ isin: job.isin, conid: job.conid })),
      },
      null,
      2
    )
  );
}

const prior = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, "utf8")) : null;
const known = new Map((prior?.contracts || []).map((row) => [row.isin, row.conid]));
const already = new Set();
for (const row of prior?.rows || []) {
  if (row.bid == null || row.ask == null) continue;
  found.push(row);
  already.add(row.isin);
}
for (const job of jobs) if (known.has(job.isin)) job.conid = known.get(job.isin);
if (already.size) console.error(`${already.size} touches déjà écrites.`);

console.error("Recherche des contrats…");
let resolved = 0;
for (const job of jobs) {
  if (!riyadh().open) break;
  if (already.has(job.isin)) continue;
  if (!job.conid) {
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
    job.conid = pick(answer.json, job.ticker);
  }
  resolved += 1;
  if (!job.conid) missed.push({ isin: job.isin, ticker: job.ticker, why: "contrat absent" });
  if (resolved % 50 === 0) {
    save();
    console.error(`${resolved} recherchés, ${jobs.filter((row) => row.conid).length} contrats, Riyad ${riyadh().clock}`);
  }
}

const quoted = jobs.filter((job) => job.conid && !already.has(job.isin));
console.error(`${quoted.length} contrats. Touches…`);

for (let i = 0; i < quoted.length && riyadh().open; i += 30) {
  const batch = quoted.slice(i, i + 30);
  const ids = batch.map((job) => job.conid).join(",");
  const byId = new Map();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snap = await api(`iserver/marketdata/snapshot?conids=${ids}&fields=${FIELDS}`);
    for (const row of Array.isArray(snap.json) ? snap.json : []) {
      const bid = num(row["84"]);
      const ask = num(row["86"]);
      const mark = String(row["6509"] || "");
      if (bid || ask || mark) byId.set(String(row.conid), { bid, ask, bidSize: num(row["88"]), askSize: num(row["85"]), mark });
    }
    if (batch.every((job) => byId.has(job.conid))) break;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await api("iserver/marketdata/unsubscribeall").catch(() => null);
  for (const job of batch) {
    const touch = byId.get(job.conid);
    const mark = touch?.mark || "";
    marks.set(mark || "(vide)", (marks.get(mark || "(vide)") || 0) + 1);
    const usable =
      Boolean(touch) &&
      (mark.startsWith("R") || mark.startsWith("D")) &&
      !mark.includes("Z") &&
      touch.bid != null &&
      touch.ask != null;
    const bp = usable ? bpFrom(touch.bid, touch.ask) : null;
    if (!usable || bp == null) {
      missed.push({
        isin: job.isin,
        ticker: job.ticker,
        why: !touch ? "touche absente" : mark.includes("Z") ? `écarté ${mark}` : "touche incomplète",
      });
      continue;
    }
    found.push({
      isin: job.isin,
      ticker: job.ticker,
      name: job.name,
      type: job.type,
      mic: "XSAU",
      currency: "SAR",
      bid: touch.bid,
      ask: touch.ask,
      bidSize: touch.bidSize,
      askSize: touch.askSize,
      mark,
      bp,
    });
  }
  save();
  console.error(`${Math.min(i + batch.length, quoted.length)} cotés, ${found.length} touches, Riyad ${riyadh().clock}`);
}

if (found.length) {
  const store = fs.existsSync(SPREAD) ? JSON.parse(fs.readFileSync(SPREAD, "utf8")) : {};
  const spreads = (store.spreads ||= {});
  const state = (store.state ||= {});
  const at = new Date().toISOString();
  for (const row of found) {
    const byCcy = ((spreads[row.isin] ||= {})[row.mic] ||= {});
    byCcy.SAR = {
      bp: row.bp,
      url: `https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/main-market-watch?symbol=${encodeURIComponent(row.ticker)}`,
    };
    state[`${row.isin}|${row.mic}|SAR`] = { bp: [row.bp], at };
  }
  store.generatedAt = at;
  fs.writeFileSync(SPREAD, JSON.stringify(store, null, 2));
}

save();
await browser.disconnect();
const summary = [...marks.entries()].map(([mark, n]) => `${mark} ${n}`).join(", ");
console.error(`${found.length} touches, ${missed.length} écartées (${summary}). Riyad ${riyadh().clock}.`);
