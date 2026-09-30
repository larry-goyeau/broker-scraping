// Live Xetra touch for listings that have no figure yet, from the signed-in
// Interactive Brokers portal. Bid and ask are the quote. A last trade is
// never written in their place. A delayed or frozen mark is left out.
//
//   node xetra-touch.mjs

import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const STORE = new URL("parsed_json/xetra-touch.json", import.meta.url);
const MISSING = "/tmp/xetra-missing.json";
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

const berlin = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
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
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && minutes >= 9 * 60 && minutes < 17 * 60 + 30;
  return { open, clock: `${parts.hour}:${parts.minute}` };
};

if (!berlin().open) {
  console.error(`Xetra fermé (${berlin().clock}). Rien n'est écrit.`);
  process.exit(0);
}

const jobs = JSON.parse(fs.readFileSync(MISSING, "utf8"));
console.error(`Berlin ${berlin().clock}. ${jobs.length} lignes Xetra sans touche.`);

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
  let best = "";
  let rank = 0;
  for (const hit of list) {
    if (!hit?.conid || hit.conid === "2147483647" || hit.conid === 2147483647) continue;
    const code = `${hit.description || ""} ${hit.companyHeader || ""}`;
    const score = /\bIBIS2?\b/.test(code) ? 2 : /\bFWB2?\b/.test(code) ? 1 : 0;
    if (score > rank) {
      rank = score;
      best = String(hit.conid);
    }
  }
  return best;
}

const found = [];
const missed = [];

function save() {
  fs.writeFileSync(
    STORE,
    JSON.stringify(
      {
        at: new Date().toISOString(),
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
for (const job of jobs) if (known.has(job.isin)) job.conid = known.get(job.isin);
if (Array.isArray(prior?.rows)) found.push(...prior.rows);

console.error("Recherche des contrats…");
let resolved = 0;
for (const job of jobs) {
  if (!berlin().open) break;
  if (job.conid) {
    resolved += 1;
    continue;
  }
  let answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol: job.isin, pattern: true, referrer: "" }),
  });
  if (!Array.isArray(answer.json)) {
    await api("tickle").catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 800));
    answer = await api("iserver/secdef/search", {
      method: "POST",
      body: JSON.stringify({ symbol: job.isin, pattern: true, referrer: "" }),
    });
  }
  job.conid = pick(answer.json);
  resolved += 1;
  if (!job.conid) missed.push({ isin: job.isin, ticker: job.ticker, why: "contrat absent" });
  if (resolved % 100 === 0) {
    save();
    console.error(`${resolved} recherchés, ${jobs.filter((row) => row.conid).length} contrats, Berlin ${berlin().clock}`);
  }
}

const already = new Set(found.map((row) => row.isin));
const quoted = jobs.filter((job) => job.conid && !already.has(job.isin));
console.error(`${quoted.length} contrats. Touches…`);

for (let i = 0; i < quoted.length && berlin().open; i += 30) {
  const batch = quoted.slice(i, i + 30);
  const ids = batch.map((job) => job.conid).join(",");
  const byId = new Map();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snap = await api(`iserver/marketdata/snapshot?conids=${ids}&fields=${FIELDS}`);
    for (const row of Array.isArray(snap.json) ? snap.json : []) {
      const bid = num(row["84"]);
      const ask = num(row["86"]);
      if (bid || ask) byId.set(String(row.conid), { bid, ask, mark: String(row["6509"] || "") });
    }
    if (batch.every((job) => byId.has(job.conid))) break;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await api("iserver/marketdata/unsubscribeall").catch(() => null);
  for (const job of batch) {
    const touch = byId.get(job.conid);
    const live = touch && touch.mark.startsWith("R") && touch.bid != null && touch.ask != null;
    if (!live) {
      missed.push({ isin: job.isin, ticker: job.ticker, why: touch ? `écarté ${touch.mark || "incomplet"}` : "touche incomplète" });
      continue;
    }
    found.push({
      isin: job.isin,
      ticker: job.ticker,
      name: job.name,
      mic: "XETR",
      currency: job.ccy,
      bid: touch.bid,
      ask: touch.ask,
      mark: touch.mark,
      bp: bpFrom(touch.bid, touch.ask),
    });
  }
  save();
  console.error(`${Math.min(i + batch.length, quoted.length)} cotés, ${found.length} touches, Berlin ${berlin().clock}`);
}

save();
await browser.disconnect();
console.error(`${found.length} touches, ${missed.length} écartées. Écrit dans parsed_json/xetra-touch.json.`);
