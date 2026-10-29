// Alpaca's US exchange book, for US apps whose broker or clearing firm is
// Alpaca Securities LLC (Greenlight ../greenlight, Bloom ../bloom): an
// order for a title Alpaca does not mark tradable cannot be placed in such
// an app, so the app's catalogue is drawn from Alpaca's own tradable book
// (../alpaca/alpaca-parsed.json, as ../tfcapital and ../investlink do,
// owner 2026-10-26), not from the whole exchange listing.
//
// Kept: shares (type STOCK: common and ordinary shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds) and exchange-traded
// products (type ETF) on Alpaca's US exchange venues, NYSE (XNYS), Nasdaq
// (XNAS), NYSE American (XASE), NYSE Arca (ARCX, filed as exchange "AMEX"
// as in the asset lists) and Cboe BZX (BATS, exchange "CBOE"). Left out:
// Alpaca's OTC lines (a broker that sells OTC adds them itself) and crypto.
// PTPs flagged `usResidentsOnly` stay: these apps open accounts for US
// residents only. One row per title on its listing market, in dollars.
//
// Use:
//   import { alpacaUsBook } from "../greenlight/alpacaUsBook.mjs";
//   const rows = alpacaUsBook();   // rows.report: age of the book, left out
//
// Run node brokers/alpaca/alpaca_scraping.mjs first when Alpaca's book is
// old (a warning is printed past 45 days).

import fs from "node:fs";

const ALPACA = new URL("../alpaca/alpaca-parsed.json", import.meta.url);
const VENUES = {
  NYSE: { exchange: "NYSE", mic: "XNYS" },
  NASDAQ: { exchange: "NASDAQ", mic: "XNAS" },
  AMEX: { exchange: "AMEX", mic: "XASE" },
  ARCA: { exchange: "AMEX", mic: "ARCX" },
  BATS: { exchange: "CBOE", mic: "BATS" },
};

export function alpacaUsBook() {
  if (!fs.existsSync(ALPACA)) throw new Error("Alpaca's book is missing: run node brokers/alpaca/alpaca_scraping.mjs");
  const ageDays = (Date.now() - fs.statSync(ALPACA).mtimeMs) / 86_400_000;
  if (ageDays > 45) console.error(`warning: Alpaca's book is ${Math.round(ageDays)} days old`);
  const left = {};
  const leave = (reason) => (left[reason] = (left[reason] || 0) + 1);
  const rows = [];
  for (const row of JSON.parse(fs.readFileSync(ALPACA, "utf8"))) {
    if (row.type !== "STOCK" && row.type !== "ETF") { leave(row.type === "CRYPTO" ? "crypto" : row.type); continue; }
    const venue = String(row.raw || "").trim().split(/\s+/).pop().toUpperCase();
    const place = VENUES[venue];
    if (!place) { leave(`${venue} line`); continue; }
    rows.push({ query: row.query, ticker: row.ticker, name: row.name, exchange: place.exchange, mic: place.mic, currency: "USD", type: row.type, isin: row.isin, raw: row.raw });
  }
  if (rows.length < 10000) throw new Error(`Alpaca's US exchange book has only ${rows.length} lines`);
  rows.report = { ageDays: Math.round(ageDays), lines: rows.length, leftOut: left };
  return rows;
}
