// A search over every broker catalogue at once: type a ticker, an ISIN or a name
// and see who actually lists it. The page lives at the root because the answer is
// a fact about the instrument, not about any one broker.
//
//   node front.mjs
//   node front.mjs --port=3470

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { catalogueFiles } from "./catalogues.mjs";
import { resolveVenue } from "./venues.mjs";
import { accepts, countryOptions, listingAccepts } from "./accepted.mjs";
import { toUsd } from "./fx.mjs";

const PORT = (() => {
  const m = process.argv.find((a) => a.startsWith("--port="));
  return m ? Number(m.split("=")[1]) : 3470;
})();

const HTML = new URL("front.html", import.meta.url);
const LIST = new URL("broker-list.txt", import.meta.url);

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function prettyFolder(folder) {
  return folder
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d+)/g, " $1 ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function loadBrokerMeta() {
  const rows = [];
  if (fs.existsSync(LIST)) {
    for (const line of fs.readFileSync(LIST, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [name, country, type, , url] = line.split("\t");
      if (name) rows.push({ name, country: country || "", type: type || "", url: url || "" });
    }
  }
  return rows;
}

const FOLDER_NAME = {
  saxo: "Saxo Bank",
  bhmuae: "BHM Capital",
  bunq: "Bunq",
  century: "Century Financial",
  boursobank: "BoursoBank",
  alramz: "Al Ramz Capital",
  tastytrade: "Tastytrade",
  bux: "BUX",
  davy: "Davy Select",
  easyequities: "EasyEquities",
  efocs: "EuroFinance",
  elana: "Elana Trading",
};

function metaFor(folder, list) {
  const aliased = FOLDER_NAME[folder];
  if (aliased) {
    const hit = list.find((row) => row.name === aliased) || list.find((row) => slug(row.name) === slug(aliased));
    if (hit) return { ...hit, name: aliased };
    return { name: aliased, country: "", type: "", url: "" };
  }
  const s = slug(folder);
  const exact = list.find((row) => slug(row.name) === s);
  if (exact) return exact;
  // Prefix only: "boursobank" contains "sob" (from ČSOB) and "tiger" contains "ig".
  let best = null;
  for (const row of list) {
    const n = slug(row.name);
    if (n.length < 4 && s.length < 4) continue;
    if (n.startsWith(s) || (s.startsWith(n) && n.length >= 4)) {
      if (!best || n.length < slug(best.name).length) best = row;
    }
  }
  return best || { name: prettyFolder(folder), country: "", type: "", url: "" };
}

const list = loadBrokerMeta();
const brokers = new Map();
const instruments = new Map();

function instrumentKey(row) {
  const isin = String(row.isin || "").trim().toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return isin;
  const ticker = String(row.ticker || row.query || "").trim().toUpperCase();
  const type = String(row.type || "").trim().toUpperCase() || "OTHER";
  if (!ticker) return "";
  return `${type}:${ticker}`;
}

const UNSOURCED_EN = {
  "Euronext, place non précisée": "Euronext",
  "places américaines, sans précision": "US (unspecified)",
  "Trade Republic (TIB)": "N/A",
};

function displayExchange(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const { venue, unsourced } = resolveVenue({ exchange: text });
  if (venue) return venue.name;
  if (unsourced?.name) return UNSOURCED_EN[unsourced.name] || unsourced.name;
  return text;
}

function addName(set, counts, value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name || name === "0" || name.length <= 1) return;
  set.add(name);
  counts.set(name, (counts.get(name) || 0) + 1);
}

console.error("indexation des catalogues…");
const t0 = Date.now();
let listings = 0;
for (const file of catalogueFiles()) {
  const folder = file.split("/").slice(-2, -1)[0];
  if (!brokers.has(folder)) brokers.set(folder, { folder, ...metaFor(folder, list) });
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.instruments || [];
  for (const row of rows) {
    const key = instrumentKey(row);
    if (!key) continue;
    listings += 1;
    let inst = instruments.get(key);
    if (!inst) {
      inst = {
        key,
        isin: /^[A-Z]{2}[A-Z0-9]{10}$/.test(key) ? key : "",
        tickers: new Set(),
        tickerCounts: new Map(),
        names: new Set(),
        nameCounts: new Map(),
        types: new Set(),
        byBroker: new Map(),
      };
      instruments.set(key, inst);
    }
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (ticker) {
      inst.tickers.add(ticker);
      inst.tickerCounts.set(ticker, (inst.tickerCounts.get(ticker) || 0) + 1);
    }
    addName(inst.names, inst.nameCounts, row.name);
    addName(inst.names, inst.nameCounts, row.label);
    if (row.type) inst.types.add(String(row.type).toUpperCase());
    const exchangeRaw = String(row.exchange || "").trim();
    const listing = {
      ticker: ticker || String(row.query || ""),
      name: String(row.name || row.label || "").trim(),
      exchange: displayExchange(exchangeRaw),
      exchangeRaw,
      currency: String(row.currency || "").trim(),
      type: String(row.type || "").trim(),
    };
    if (row.nonEuResident) listing.nonEuResident = true;
    if (row.usResidentsOnly) listing.usResidentsOnly = true;
    if (Array.isArray(row.supportedCountries)) listing.supportedCountries = row.supportedCountries;
    const held = inst.byBroker.get(folder) || [];
    const dup = held.some(
      (h) =>
        h.ticker === listing.ticker &&
        h.exchange === listing.exchange &&
        h.currency === listing.currency
    );
    if (!dup) held.push(listing);
    inst.byBroker.set(folder, held);
  }
}
console.error(
  `${instruments.size} instruments, ${listings} cotations, ${brokers.size} brokers en ${Date.now() - t0} ms`
);

const NA = "N/A";
const estimators = new Map();
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
for (const folder of brokers.keys()) {
  const file = path.join(ROOT_DIR, folder, `${folder}_cost.mjs`);
  if (!fs.existsSync(file)) continue;
  try {
    const mod = await import(pathToFileURL(file));
    if (typeof mod.roundTripCost === "function") estimators.set(folder, mod.roundTripCost);
  } catch (err) {
    console.error(`estimateur ${folder} : ${err.message}`);
  }
}
console.error(
  `estimateurs : ${[...estimators.keys()].join(", ") || "aucun"}`
);

function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return NA;
  const x = Number(n);
  if (x === 0) return "0";
  return String(Number(x.toPrecision(4)));
}

function fmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return NA;
  const x = Number(n);
  if (x === 0) return "0";
  return String(Number(x.toFixed(2)));
}

const MIN_FEE_CCY = {
  $: "USD",
  USD: "USD",
  "€": "EUR",
  EUR: "EUR",
  "£": "GBP",
  GBP: "GBP",
  CHF: "CHF",
  CAD: "CAD",
  AED: "AED",
  HKD: "HKD",
  AUD: "AUD",
  JPY: "JPY",
};

// Tickets written as `min fees …` are a floor on the % already in `a`, not a
// third addend. The page shows them in the order column (USD) with **.
function pullMinFees(remark) {
  const text = String(remark || "").trim();
  if (!text) return { minFees: null, remark: "" };
  const match = text.match(/min fees\s+(.+?)(?:\.(\s|$)|$)/i);
  if (!match) return { minFees: null, remark: text };
  const cleaned = `${text.slice(0, match.index)}${text.slice(match.index + match[0].length)}`
    .replace(/^\s*\.\s*/, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { minFees: match[1].trim(), remark: cleaned };
}

function numericFloor(cost) {
  const f = cost?.floor;
  return typeof f === "number" && Number.isFinite(f) ? f : null;
}

function minFeesUsd(text, cost) {
  const raw = String(text || "").replace(/\(odd lot[^)]*\)/gi, "").trim();
  if (/in listing currency/i.test(raw)) {
    const n = Number(String(raw.match(/[\d.]+/) || "") );
    return toUsd(n, cost.listing?.currency || cost.currency);
  }
  const euroFirst = raw.match(/^€\s*([\d.]+)/);
  if (euroFirst) return toUsd(Number(euroFirst[1]), "EUR");
  const m = raw.match(/^([\d.]+)\s*(USD|EUR|GBP|CHF|CAD|AED|HKD|AUD|JPY|\$|£|€)?/i);
  if (!m) return null;
  const token = (m[2] || "USD").toUpperCase();
  const ccy = MIN_FEE_CCY[token] || MIN_FEE_CCY[m[2]] || token;
  return toUsd(Number(m[1]), ccy);
}

function formatCost(cost) {
  if (!cost) return { spread: NA, perShare: NA, perOrder: NA, remark: "", perOrderMin: false };
  // a is a factor of the amount (the book in Europe, taxes, SEC). The American
  // book is published per share and already sits in b, so it must not appear here.
  // b and c are dollars in every *_cost.mjs the page loads.
  // A missing book used to land as 0 and read as a free trade. Unknown is
  // `null`. A known 0 (no % commission, book already in b) is 0 %.
  // A flat ticket in `c` (Davy overseas settlement, ChoiceTrade OTC) owns the
  // order column. `min fees` then stays in the remark, in the published unit.
  const ticket = Number(cost.c);
  const hasTicket = Number.isFinite(ticket) && ticket !== 0;
  const pulled = hasTicket ? { minFees: null, remark: String(cost.remark || "").trim() } : pullMinFees(cost.remark);
  const missingA = cost.a == null;
  const minUsd = pulled.minFees ? numericFloor(cost) ?? minFeesUsd(pulled.minFees, cost) : null;
  return {
    spread: missingA ? NA : `${fmtNum(cost.a * 100)}%`,
    perShare: cost.b == null ? NA : fmtNum(cost.b),
    perOrder: hasTicket ? fmtUsd(ticket) : minUsd != null ? fmtUsd(minUsd) : cost.c == null ? NA : fmtUsd(cost.c),
    perOrderMin: !hasTicket && minUsd != null,
    remark: pulled.remark || "",
    buyable: cost.onlineBuy !== false,
  };
}

function estimateListing(folder, listing, inst, extra = {}) {
  const fn = estimators.get(folder);
  if (!fn) return { spread: NA, perShare: NA, perOrder: NA, remark: "" };
  try {
    const cost = fn({
      etf: inst.isin || listing.ticker,
      place: listing.exchangeRaw || listing.exchange || "",
      currency: listing.currency || "",
      ...extra,
    });
    return formatCost(cost);
  } catch {
    return { spread: NA, perShare: NA, perOrder: NA, remark: "" };
  }
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = "";
  let n = 0;
  for (const [v, c] of counts) {
    if (c > n || (c === n && v.length > best.length)) {
      best = v;
      n = c;
    }
  }
  return best;
}

function preferredName(inst) {
  let best = "";
  let n = 0;
  for (const [name, count] of inst.nameCounts) {
    // Frequency first. On a tie, the shorter name: one mislabelled listing
    // ("Morgan Stanley Emerging Markets Fund" on Microsoft's ISIN) must not win.
    if (count > n || (count === n && (!best || name.length < best.length))) {
      best = name;
      n = count;
    }
  }
  return best;
}

function preferredTicker(inst, hint) {
  const H = String(hint || "").trim().toUpperCase();
  if (H && inst.tickers.has(H)) return H;
  let best = "";
  let n = 0;
  for (const [ticker, count] of inst.tickerCounts) {
    const bare = !ticker.includes(".");
    const bestBare = !best.includes(".");
    if (count > n || (count === n && bare && !bestBare) || (count === n && ticker.length < best.length)) {
      best = ticker;
      n = count;
    }
  }
  return best;
}

function brokerFolder(folder) {
  return String(folder || "").split(":")[0];
}

function acceptsNat(folder, nat) {
  const meta = brokers.get(brokerFolder(folder));
  return accepts(brokerFolder(folder), nat, meta?.country);
}

function listingOpen(listing, nat) {
  return listingAccepts(listing, nat);
}

function visibleBrokers(inst, nat) {
  let n = 0;
  for (const [folder, listingsOf] of inst.byBroker) {
    if (!acceptsNat(folder, nat)) continue;
    if (listingsOf.some((listing) => listingOpen(listing, nat))) n += 1;
  }
  return n;
}

function summarize(inst, hint = "", nat = "") {
  return {
    key: inst.key,
    isin: inst.isin,
    ticker: preferredTicker(inst, hint),
    name: preferredName(inst),
    type: mostCommon(inst.types),
    brokers: visibleBrokers(inst, nat),
  };
}

function isWholeWord(text, q, i) {
  const after = i + q.length;
  if (i > 0 && /[A-Z0-9]/.test(text[i - 1])) return false;
  if (after < text.length && /[A-Z0-9]/.test(text[after])) return false;
  return true;
}

function score(inst, q) {
  const Q = q.toUpperCase();
  let s = 0;
  if (inst.isin === Q) s = Math.max(s, 120);
  else if (Q.length >= 3 && inst.isin.startsWith(Q)) s = Math.max(s, 85);
  else if (inst.isin.includes(Q) && Q.length >= 6) s = Math.max(s, 55);
  for (const t of inst.tickers) {
    if (t === Q) s = Math.max(s, 110);
    else if (Q.length >= 3 && t.startsWith(Q)) s = Math.max(s, 75);
  }
  if (Q.length >= 2) {
    const N = preferredName(inst).toUpperCase();
    if (N === Q) s = Math.max(s, 100);
    else if (Q.length >= 3 && N.startsWith(Q)) s = Math.max(s, 50);
    else if (Q.length >= 3) {
      let i = 0;
      while ((i = N.indexOf(Q, i)) !== -1) {
        if (isWholeWord(N, Q, i)) {
          s = Math.max(s, 35);
          break;
        }
        i += 1;
      }
    }
  }
  return s;
}

function search(q, limit = 20, nat = "") {
  const query = String(q || "").trim();
  if (query.length < 1) return [];
  const hits = [];
  for (const inst of instruments.values()) {
    const s = score(inst, query);
    if (s <= 0) continue;
    const n = visibleBrokers(inst, nat);
    if (n <= 0) continue;
    hits.push({ s, brokers: n, inst });
  }
  hits.sort((a, b) => b.brokers - a.brokers || b.s - a.s);
  return hits.slice(0, limit).map((h) => summarize(h.inst, query, nat));
}

function resolve(key) {
  const k = String(key || "").trim().toUpperCase();
  if (!k) return null;
  const exact = instruments.get(k);
  if (exact) return exact;
  let best = null;
  let bestScore = 0;
  for (const inst of instruments.values()) {
    if (!inst.tickers.has(k) && inst.isin !== k) continue;
    const s = (inst.tickers.has(k) ? 10 : 0) + inst.byBroker.size;
    if (s > bestScore) {
      best = inst;
      bestScore = s;
    }
  }
  return best;
}

const EASYBOURSE_PLANS = [
  { id: "premium", name: "EasyBourse Découverte / Premium" },
  { id: "expert", name: "EasyBourse Expert" },
  { id: "intense", name: "EasyBourse Intense" },
];

const BUNQ_PLANS = [
  { id: "free", name: "Bunq Free" },
  { id: "core", name: "Bunq Core" },
  { id: "pro", name: "Bunq Pro" },
  { id: "elite", name: "Bunq Elite" },
];

const BOURSOBANK_PLANS = [
  { id: "decouverte", name: "BoursoBank Découverte" },
  { id: "classic", name: "BoursoBank Classic" },
  { id: "trader", name: "BoursoBank Trader" },
  { id: "ultimate", name: "BoursoBank Ultimate Trader" },
];

const BUX_PLANS = [
  { id: "basic", name: "BUX Basic" },
  { id: "plus", name: "BUX Plus" },
  { id: "prime", name: "BUX Prime" },
];

const DAVY_PLANS = [
  { id: "pia", name: "Davy Select PIA" },
  { id: "io", name: "Davy Select Investment Only" },
  { id: "tradingplus", name: "Davy Select Trading Plus" },
];

const FREEDOM24_PLANS = [
  { id: "smart", name: "Freedom24 Smart" },
  { id: "allinc", name: "Freedom24 All-inclusive" },
];

function sameCostListings(a, b) {
  if (a.length !== b.length) return false;
  return a.every((l, i) => {
    const r = b[i];
    return (
      l.exchange === r.exchange &&
      l.currency === r.currency &&
      l.spread === r.spread &&
      l.perShare === r.perShare &&
      l.perOrder === r.perOrder &&
      l.perOrderMin === r.perOrderMin &&
      l.remark === r.remark
    );
  });
}

function collapseEasyBourse(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `easybourse:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseBunq(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `bunq:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseBux(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `bux:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseDavy(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `davy:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseBoursobank(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `boursobank:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function detail(key, nat = "") {
  const inst = resolve(key);
  if (!inst) return null;
  const rows = [];
  const easy = [];
  for (const [folder, listingsOf] of inst.byBroker) {
    if (!acceptsNat(folder, nat)) continue;
    const meta = brokers.get(folder);
    const listings = (extra) =>
      listingsOf
        .filter((listing) => listingOpen(listing, nat))
        .slice()
        .sort((a, b) => a.exchange.localeCompare(b.exchange, "en") || a.currency.localeCompare(b.currency))
        .map((listing) => ({
          ...listing,
          ...estimateListing(folder, listing, inst, extra),
        }))
        .filter((listing) => listing.buyable !== false)
        .map(({ buyable, nonEuResident, usResidentsOnly, supportedCountries, exchangeRaw, ...listing }) => listing);
    const base = {
      folder,
      family: meta?.name || prettyFolder(folder),
      country: meta?.country || "",
      kind: meta?.type || "",
      url: meta?.url || "",
      plan: "",
      planRank: 0,
    };
    const asPlan = (plan, i, listed) => ({
      ...base,
      folder: `${folder}:${plan.id}`,
      name: plan.name,
      plan: plan.id,
      planRank: i + 1,
      listings: listed,
    });
    if (folder === "easybourse") {
      const built = [];
      EASYBOURSE_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      easy.push(...collapseEasyBourse(built));
      continue;
    }
    if (folder === "bunq") {
      const built = [];
      BUNQ_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseBunq(built)) rows.push(row);
      continue;
    }
    if (folder === "boursobank") {
      const built = [];
      BOURSOBANK_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseBoursobank(built)) rows.push(row);
      continue;
    }
    if (folder === "bux") {
      const built = [];
      BUX_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseBux(built)) rows.push(row);
      continue;
    }
    if (folder === "davy") {
      const built = [];
      DAVY_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseDavy(built)) rows.push(row);
      continue;
    }
    if (folder === "freedom24") {
      FREEDOM24_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) rows.push(asPlan(plan, i, listed));
      });
      continue;
    }
    const listed = listings({});
    if (!listed.length) continue;
    rows.push({
      ...base,
      name: meta?.name || prettyFolder(folder),
      listings: listed,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "en"));
  const at = rows.findIndex((r) => r.name.localeCompare("EasyBourse", "en") > 0);
  rows.splice(at === -1 ? rows.length : at, 0, ...easy);
  return { ...summarize(inst, "", nat), soldBy: rows };
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/search") {
    return json(res, 200, search(url.searchParams.get("q") || "", 20, url.searchParams.get("nat") || ""));
  }
  if (url.pathname === "/api/instrument") {
    const found = detail(url.searchParams.get("key") || "", url.searchParams.get("nat") || "");
    return found ? json(res, 200, found) : json(res, 404, { error: "unknown" });
  }
  if (url.pathname === "/api/countries") return json(res, 200, countryOptions());
  if (url.pathname === "/api/stats") {
    return json(res, 200, {
      instruments: instruments.size,
      listings,
      brokers: brokers.size,
    });
  }
  if (url.pathname === "/" || url.pathname === "/front.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(HTML));
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`http://127.0.0.1:${PORT}`);
});
