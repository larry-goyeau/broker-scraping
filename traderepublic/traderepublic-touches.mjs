// Reads the Bestpreis touch Trade Republic shows on TIB (bid / ask in euro)
// and writes traderepublic-touches.json. `traderepublic_cost.mjs` reads that
// file for the Best plan; this script talks to the network.
//
// The socket answers `ticker` on `ISIN.TIB`. One instrument per subscribe.
// The catalogue is ~12 000 names, asked 15 at a time from the signed-in tab.
//
//   node traderepublic/traderepublic-touches.mjs
//   node traderepublic/traderepublic-touches.mjs --only=US0378331005,IE00BK5BQT80
//   node traderepublic/traderepublic-touches.mjs --limit=200

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const CATALOGUE = new URL("traderepublic-parsed.json", import.meta.url);
const OUT = new URL("traderepublic-touches.json", import.meta.url);
const IN_FLIGHT = 15;
const SAVE_INTERVAL_MS = 2000;

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const ONLY = new Set(
  (arg("only", "") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);
const LIMIT = Number(arg("limit", "0")) || 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isinOf = (s) => {
  const text = String(s || "").toUpperCase();
  const hit = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return hit ? hit[0] : "";
};

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = (Array.isArray(catalogue) ? catalogue : catalogue.rows || []).filter(
  (r) => String(r.type || "").toUpperCase() !== "CRYPTO" && isinOf(r.isin)
);
const byIsinRow = new Map();
for (const r of rows) {
  const isin = isinOf(r.isin);
  if (!byIsinRow.has(isin)) byIsinRow.set(isin, r);
}
const wanted = [...byIsinRow.values()].filter((r) => {
  if (!ONLY.size) return true;
  const isin = isinOf(r.isin);
  const ticker = String(r.ticker || "").toUpperCase();
  return ONLY.has(isin) || ONLY.has(ticker);
});
const list = LIMIT > 0 ? wanted.slice(0, LIMIT) : wanted;
if (!list.length) throw new Error("aucun ISIN à coter.");

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("traderepublic.com"));
if (!page) throw new Error("aucun onglet Trade Republic ouvert sur 9222.");

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
      }, 8000);
    });
  return true;
});
if (!opened) throw new Error("Could not open Trade Republic's WebSocket.");

async function ask(payloads) {
  return page.evaluate((batch) => Promise.all(batch.map((payload) => window.__trSub(payload))), payloads);
}

const existing = fs.existsSync(OUT) && !ONLY.size && !LIMIT ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const byIsin = existing.byIsin && typeof existing.byIsin === "object" ? existing.byIsin : {};
let quoted = Object.values(byIsin).filter((t) => t?.perShare > 0).length;
let empty = 0;
let failed = 0;
let savedAt = 0;

function save() {
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        asOf: new Date().toISOString(),
        source: "wss://api.traderepublic.com ticker ISIN.TIB",
        measure: "touche Bestpreis TIB, aller-retour (ask − bid), euro",
        asked: list.length,
        quoted,
        empty,
        failed,
        byIsin,
      },
      null,
      2
    )
  );
  savedAt = Date.now();
}

const pending = list.filter((r) => {
  const isin = isinOf(r.isin);
  return !byIsin[isin] || (ONLY.size && !LIMIT);
});

console.error(`${list.length} ISIN, ${pending.length} encore à coter`);

for (let offset = 0; offset < pending.length; offset += IN_FLIGHT) {
  const batch = pending.slice(offset, offset + IN_FLIGHT);
  const answers = await ask(batch.map((r) => ({ type: "ticker", id: `${isinOf(r.isin)}.TIB` })));
  for (const [index, r] of batch.entries()) {
    const isin = isinOf(r.isin);
    const ans = answers[index];
    if (ans?.timeout || ans?.error || !ans?.data) {
      failed += 1;
      byIsin[isin] = {
        ticker: r.ticker || null,
        bid: null,
        ask: null,
        last: null,
        mid: null,
        perShare: null,
        bp: null,
        currency: "EUR",
      };
      continue;
    }
    const bid = num(ans.data.bid?.price);
    const ask = num(ans.data.ask?.price);
    const last = num(ans.data.last?.price);
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
    const perShare = bid > 0 && ask > 0 && ask >= bid ? Number((ask - bid).toPrecision(8)) : null;
    const bp = perShare != null && mid > 0 ? Number(((1e4 * perShare) / mid).toPrecision(6)) : null;
    const stamp = num(ans.data.bid?.time) || num(ans.data.ask?.time);
    byIsin[isin] = {
      ticker: r.ticker || null,
      bid,
      ask,
      last,
      mid,
      perShare,
      bp,
      currency: "EUR",
      qualityId: ans.data.qualityId || null,
      at: stamp ? new Date(stamp).toISOString() : new Date().toISOString(),
    };
    if (perShare != null) quoted += 1;
    else empty += 1;
  }
  if (offset === 0 || (offset + IN_FLIGHT) % 150 === 0 || offset + IN_FLIGHT >= pending.length) {
    console.error(
      `[${Math.min(offset + IN_FLIGHT, pending.length)}/${pending.length}] ${quoted} touches, ${empty} vides, ${failed} erreurs`
    );
  }
  if (Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

save();
console.error(`écrit ${quoted} touches / ${list.length} dans ${OUT.pathname}`);
await browser.disconnect();
