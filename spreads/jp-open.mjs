// Tokyo cash touch, twenty minutes after the open. Bid and ask come from
// the signed-in Interactive Brokers portal. The quote is kept only when
// the availability mark says delayed and does not say frozen. A missing
// side stays missing: the last trade is not read and is not written in
// its place. The reading replaces a closing spread (the JPX quote page).
// An ETF whose leaf is the monthly average is left as it is.
//
// The portal tab is the one already open. Nothing else in that browser
// is navigated.
//
//   node spreads/jp-open.mjs

import fs from "node:fs";
import { createRequire } from "node:module";
import { parseCsv } from "../indianCash.mjs";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const SPREAD = new URL("./spread.json", import.meta.url);
const PRIOR = new URL("./jp-touch.json", import.meta.url);
const STORE = new URL("./jp-open.json", import.meta.url);
const API = "/portal.proxy/v1/portal";
// 84 bid, 86 ask, 88 bid size, 85 ask size, 6509 availability. No last.
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

const tokyo = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
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
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday);
  const morning = minutes >= 9 * 60 && minutes < 11 * 60 + 30;
  const afternoon = minutes >= 12 * 60 + 30 && minutes < 15 * 60;
  return { open: weekday && (morning || afternoon), clock: `${parts.hour}:${parts.minute}` };
};

if (!tokyo().open) {
  console.error(`Tokyo fermé (${tokyo().clock}). Rien n'est écrit.`);
  process.exit(0);
}

const stocks = new Map();
for (const row of parseCsv(fs.readFileSync(new URL("../assets/stocks.csv", import.meta.url), "utf8"))) {
  if (row.exchange !== "TSE" && row.exchange !== "TYO") continue;
  const ticker = String(row.ticker || "").split(":").pop().trim().toUpperCase();
  const isin = String(row.isin || "").trim().toUpperCase();
  if (ticker && isin && !stocks.has(ticker)) stocks.set(ticker, { isin, name: row.name || "" });
}

const raw = fs.readFileSync(SPREAD, "utf8");
const jobs = [];
const leaf = /"bp": ([0-9.]+),\n\s+"url": "https:\/\/quote\.jpx\.co\.jp\/jpx\/template\/quote\.cgi\?F=tmp\/e_stock_detail&MKTN=T&QCODE=([A-Z0-9]+)"/g;
let match;
while ((match = leaf.exec(raw))) {
  const bpText = match[1];
  const ticker = match[2];
  const stock = stocks.get(ticker);
  if (!stock) continue;
  jobs.push({ isin: stock.isin, ticker, name: stock.name, oldBp: Number(bpText), bpText });
}

console.error(`Tokyo ${tokyo().clock}. ${jobs.length} spreads de clôture à remplacer. Les moyennes d'ETF restent.`);

const prior = fs.existsSync(PRIOR) ? JSON.parse(fs.readFileSync(PRIOR, "utf8")) : null;
const known = new Map((prior?.contracts || []).map((row) => [row.ticker, String(row.conid)]));
for (const job of jobs) if (known.has(job.ticker)) job.conid = known.get(job.ticker);
console.error(`${jobs.filter((job) => job.conid).length} contrats déjà trouvés.`);

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
  const list = Array.isArray(hits) ? hits : [];
  for (const hit of list) {
    if (!hit?.conid || hit.conid === "2147483647" || hit.conid === 2147483647) continue;
    const header = String(hit.companyHeader || "");
    const symbol = String(hit.symbol || hit.companyName || "").toUpperCase();
    if ((hit.description === "TSEJ" || header.endsWith(" - TSEJ")) && (!symbol || symbol === ticker || header.startsWith(ticker))) {
      return String(hit.conid);
    }
  }
  for (const hit of list) {
    if (!hit?.conid || hit.conid === "2147483647" || hit.conid === 2147483647) continue;
    const header = String(hit.companyHeader || "");
    if (hit.description === "TSEJ" || header.endsWith(" - TSEJ")) return String(hit.conid);
  }
  return "";
}

const missed = [];
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
  job.conid = pick(answer.json, job.ticker);
  resolved += 1;
  if (!job.conid) missed.push({ isin: job.isin, ticker: job.ticker, why: "contrat absent", oldBp: job.oldBp });
  if (resolved % 50 === 0) console.error(`${resolved} recherchés, Tokyo ${tokyo().clock}`);
}

const found = [];
const marks = new Map();
const quoted = jobs.filter((job) => job.conid);
console.error(`${quoted.length} contrats. Touches différées…`);

for (let i = 0; i < quoted.length && tokyo().open; i += 30) {
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
    const delayed = mark.startsWith("D") && !mark.includes("Z");
    if (!delayed || touch?.bid == null || touch?.ask == null) {
      missed.push({
        isin: job.isin,
        ticker: job.ticker,
        why: !touch ? "touche absente" : mark.includes("Z") ? `gelée ${mark}` : !delayed ? `écartée ${mark || "(vide)"}` : "touche incomplète",
        oldBp: job.oldBp,
      });
      continue;
    }
    const bp = bpFrom(touch.bid, touch.ask);
    if (!(bp > 0)) {
      missed.push({ isin: job.isin, ticker: job.ticker, why: "carnet croisé ou verrouillé", oldBp: job.oldBp, mark });
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
      mark,
      bp,
      oldBp: job.oldBp,
      bpText: job.bpText,
    });
  }
  console.error(`${Math.min(i + batch.length, quoted.length)} cotés, ${found.length} touches, Tokyo ${tokyo().clock}`);
}

fs.writeFileSync(
  STORE,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      clock: tokyo().clock,
      delayed: true,
      asked: jobs.length,
      quoted: found.length,
      missing: missed.length,
      rows: found,
      absent: missed,
    },
    null,
    2
  )
);

let text = raw;
let replaced = 0;
for (const row of found) {
  const from = `"bp": ${row.bpText},\n          "url": "https://quote.jpx.co.jp/jpx/template/quote.cgi?F=tmp/e_stock_detail&MKTN=T&QCODE=${row.ticker}"`;
  const to = `"bp": ${row.bp},\n          "url": "https://quote.jpx.co.jp/jpx/template/quote.cgi?F=tmp/e_stock_detail&MKTN=T&QCODE=${row.ticker}"`;
  if (!text.includes(from)) {
    missed.push({ isin: row.isin, ticker: row.ticker, why: "feuille introuvable", oldBp: row.oldBp });
    continue;
  }
  text = text.replace(from, to);
  replaced += 1;
}
if (replaced) fs.writeFileSync(SPREAD, text);

await browser.disconnect();
const summary = [...marks.entries()].map(([mark, n]) => `${mark} ${n}`).join(", ");
console.error(`${replaced} spreads de clôture remplacés, ${missed.length} laissés. Marques : ${summary || "aucune"}.`);
