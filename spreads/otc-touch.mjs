// OTC Markets touch, from the signed-in Interactive Brokers portal.
// Bid and ask are the quote. A last trade is never read. A live mark and a
// delayed mark are both kept. A frozen mark (Z) is left out. One side
// missing stays missing.
//
// The cash session is 9:30–16:00 New York time. Past the close the script
// stops asking. The portal tab is the one already open.
//
//   node otc-touch.mjs

import fs from "node:fs";
import { createRequire } from "node:module";
import { catalogueFiles } from "../catalogues.mjs";
import { fileURLToPath } from "node:url";

const require = createRequire("/Users/larry/Downloads/broker-scraping/x.js");
const puppeteer = require("puppeteer-core");

const STORE = new URL("./otc-touch.json", import.meta.url);
const SPREAD = fileURLToPath(new URL("./spread.json", import.meta.url));
const API = "/portal.proxy/v1/portal";
const FIELDS = "84,86,85,88,6509";
const OTC = new Set(["OTC", "PINK", "OTCMKTS", "OTCQX", "OTCQB", "PINX", "OTCM", "GREY", "OOTC", "OTHEROTC", "OOTCOTHEROTC"]);

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

const ny = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
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
  const open = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
  return { open, clock: `${parts.hour}:${parts.minute}` };
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
      const exchange = String(row.exchange || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!OTC.has(exchange)) continue;
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

const clock = ny();
if (!clock.open) {
  console.error(`Séance OTC fermée à New York (${clock.clock}). Rien n'est écrit.`);
  process.exit(0);
}

console.error(`New York ${clock.clock}. Liste des actions et ETF…`);
const jobs = names();
console.error(`${jobs.length} actions et ETF OTC.`);

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
  for (const hit of Array.isArray(hits) ? hits : []) {
    if (!hit?.conid || hit.conid === "2147483647" || hit.conid === 2147483647) continue;
    const where = `${hit.description || ""} ${hit.companyHeader || ""}`.toUpperCase();
    if (/\b(PINK|OTC|OTCQX|OTCQB|GREY|EXPERT)\b/.test(where)) return String(hit.conid);
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
if (known.size) console.error(`${known.size} contrats déjà trouvés.`);

console.error("Recherche des contrats…");
let resolved = 0;
for (const job of jobs) {
  if (!ny().open) break;
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
    console.error(`${resolved} recherchés, ${jobs.filter((row) => row.conid).length} contrats, New York ${ny().clock}`);
  }
}

const already = new Set(found.map((row) => row.isin));
const quoted = jobs.filter((job) => job.conid && !already.has(job.isin));
console.error(`${quoted.length} contrats. Touches…`);

for (let i = 0; i < quoted.length && ny().open; i += 30) {
  const batch = quoted.slice(i, i + 30);
  const ids = batch.map((job) => job.conid).join(",");
  const byId = new Map();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snap = await api(`iserver/marketdata/snapshot?conids=${ids}&fields=${FIELDS}`);
    for (const row of Array.isArray(snap.json) ? snap.json : []) {
      const bid = num(row["84"]);
      const ask = num(row["86"]);
      const mark = String(row["6509"] || "");
      if (bid || ask || mark) byId.set(String(row.conid), { bid, ask, mark });
    }
    if (batch.every((job) => byId.has(job.conid))) break;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await api("iserver/marketdata/unsubscribeall").catch(() => null);
  for (const job of batch) {
    const touch = byId.get(job.conid);
    const mark = touch?.mark || "";
    marks.set(mark || "(vide)", (marks.get(mark || "(vide)") || 0) + 1);
    const usable = Boolean(touch) && (mark.startsWith("R") || mark.startsWith("D")) && !mark.includes("Z") && touch.bid != null && touch.ask != null;
    const bp = usable ? bpFrom(touch.bid, touch.ask) : null;
    if (!usable || bp == null) {
      missed.push({ isin: job.isin, ticker: job.ticker, why: !touch ? "touche absente" : mark.includes("Z") ? `écarté ${mark}` : "touche incomplète" });
      continue;
    }
    found.push({
      isin: job.isin,
      ticker: job.ticker,
      name: job.name,
      type: job.type,
      mic: "OTCM",
      currency: "USD",
      bid: touch.bid,
      ask: touch.ask,
      mark,
      bp,
    });
  }
  save();
  if ((i / 30) % 5 === 0) {
    console.error(`${Math.min(i + batch.length, quoted.length)} cotés, ${found.length} touches, New York ${ny().clock}`);
  }
}

if (found.length) {
  const store = fs.existsSync(SPREAD) ? JSON.parse(fs.readFileSync(SPREAD, "utf8")) : {};
  const spreads = (store.spreads ||= {});
  const state = (store.state ||= {});
  const at = new Date().toISOString();
  for (const row of found) {
    const byCcy = ((spreads[row.isin] ||= {})[row.mic] ||= {});
    const prev = state[`${row.isin}|${row.mic}|USD`] || {};
    const readings = [...(prev.bp || []), row.bp].slice(-24);
    const median = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    byCcy.USD = {
      bp: readings.length === 1 ? row.bp : Number(median(readings).toFixed(2)),
      url: "https://www.interactivebrokers.ie/portal/",
    };
    state[`${row.isin}|${row.mic}|USD`] = { bp: readings, at };
  }
  store.generatedAt = at;
  fs.writeFileSync(SPREAD, JSON.stringify(store, null, 2));
}

save();
await browser.disconnect();
const summary = [...marks.entries()].map(([mark, n]) => `${mark} ${n}`).join(", ");
console.error(`${found.length} touches, ${missed.length} écartées (${summary}). New York ${ny().clock}.`);
