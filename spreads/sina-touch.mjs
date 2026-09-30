// Onshore Shanghai and Shenzhen touch from Sina. Bid and ask are the quote.
// A last trade is never written in their place. Beijing and the B-share
// boards are not this session.
//
// Cash hours are 9:30–11:30 and 13:00–15:00, Shanghai time. Before the open
// the script waits. A missing side stays missing.
//
//   node sina-touch.mjs

import fs from "node:fs";
import { catalogueFiles } from "../catalogues.mjs";
import { fileURLToPath } from "node:url";

const SPREAD = fileURLToPath(new URL("./spread.json", import.meta.url));
const STORE = fileURLToPath(new URL("./sina-touch.json", import.meta.url));
const LIST = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.";
const NODES = [
  ["sh_a", "stock"],
  ["sz_a", "stock"],
  ["etf_hq_fund", "etf"],
];

const shanghai = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const weekday = parts.weekday;
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  let phase = "closed";
  if (day && minutes < 9 * 60 + 30) phase = "before";
  else if (day && minutes <= 11 * 60 + 30) phase = "morning";
  else if (day && minutes < 13 * 60) phase = "lunch";
  else if (day && minutes <= 15 * 60) phase = "afternoon";
  return { phase, minutes, clock: `${parts.hour}:${parts.minute}:${parts.second}` };
};

const num = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || text === "--" || text === "-") return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function text(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.sina.com.cn/" },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function isinsByTicker() {
  const map = new Map();
  for (const file of catalogueFiles()) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = String(row.isin || "").toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      const ticker = String(row.ticker || "").replace(/\D/g, "");
      if (ticker.length < 6) continue;
      const code = ticker.slice(-6);
      if (!map.has(code)) map.set(code, isin);
    }
  }
  return map;
}

async function listNode(node) {
  const count = Number(JSON.parse(await text(`${LIST}getHQNodeStockCount?node=${node}`)));
  const rows = [];
  const numPage = 80;
  for (let page = 1; rows.length < count; page += 1) {
    const body = JSON.parse(
      await text(
        `${LIST}getHQNodeData?page=${page}&num=${numPage}&sort=symbol&asc=1&node=${node}&symbol=&_s_r_a=page`
      )
    );
    if (!Array.isArray(body) || !body.length) break;
    rows.push(...body);
    if (body.length < numPage) break;
  }
  return rows;
}

function keep(row) {
  const symbol = String(row.symbol || "").toLowerCase();
  if (!/^s[hz]\d{6}$/.test(symbol)) return null;
  const code = symbol.slice(2);
  if (symbol.startsWith("sh") && code.startsWith("900")) return null;
  if (symbol.startsWith("sz") && code.startsWith("200")) return null;
  return { symbol, code, mic: symbol.startsWith("sz") ? "XSHE" : "XSHG", buy: row.buy, sell: row.sell };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function pageUrl(symbol) {
  return `https://finance.sina.com.cn/realstock/company/${symbol}/nc.shtml`;
}

function merge(found) {
  const store = fs.existsSync(SPREAD) ? JSON.parse(fs.readFileSync(SPREAD, "utf8")) : {};
  const spreads = (store.spreads ||= {});
  const state = (store.state ||= {});
  const at = new Date().toISOString();
  for (const row of found) {
    for (const ccy of ["CNY", "CNH"]) {
      const byCcy = ((spreads[row.isin] ||= {})[row.mic] ||= {});
      const key = `${row.isin}|${row.mic}|${ccy}`;
      const prev = state[key] || {};
      const readings = [...(prev.bp || []), row.bp].slice(-24);
      byCcy[ccy] = {
        bp: readings.length === 1 ? row.bp : Number(median(readings).toFixed(2)),
        url: row.url,
      };
      state[key] = { bp: readings, at };
    }
  }
  store.generatedAt = at;
  fs.writeFileSync(SPREAD, JSON.stringify(store, null, 2));
}

const clock = shanghai();
if (clock.phase === "closed" || clock.phase === "lunch") {
  console.error(`Séance fermée à Shanghai (${clock.clock}, ${clock.phase}). Rien n'est écrit.`);
  process.exit(0);
}

console.error(`Shanghai ${clock.clock}. ISINs des catalogues…`);
const isins = isinsByTicker();
console.error(`${isins.size} codes ont un ISIN.`);

while (shanghai().phase === "before") {
  const now = shanghai();
  console.error(`attente de 09:30, Shanghai ${now.clock}`);
  await sleep(15000);
}

console.error(`Shanghai ${shanghai().clock}. Relève du bid et de l'ask…`);
const found = [];
let noIsin = 0;
let noTouch = 0;
const seen = new Set();
for (const [node, kind] of NODES) {
  const rows = await listNode(node);
  console.error(`${node} : ${rows.length} lignes`);
  for (const row of rows) {
    const item = keep(row);
    if (!item || seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    const isin = isins.get(item.code);
    if (!isin) {
      noIsin += 1;
      continue;
    }
    const bid = num(item.buy);
    const ask = num(item.sell);
    const bp = bpFrom(bid, ask);
    if (bp == null) {
      noTouch += 1;
      continue;
    }
    found.push({ isin, mic: item.mic, code: item.code, symbol: item.symbol, kind, bid, ask, bp, url: pageUrl(item.symbol) });
  }
}

fs.mkdirSync(fileURLToPath(new URL("./", import.meta.url)), { recursive: true });
fs.writeFileSync(
  STORE,
  JSON.stringify({ at: new Date().toISOString(), rows: found, noIsin, noTouch }, null, 2)
);
if (found.length) merge(found);
const sh = found.filter((row) => row.mic === "XSHG").length;
const sz = found.filter((row) => row.mic === "XSHE").length;
console.error(
  `${found.length} touches (${sh} Shanghai, ${sz} Shenzhen), ${noTouch} sans bid et ask, ${noIsin} sans ISIN. Shanghai ${shanghai().clock}.`
);
