// The N most popular CEDEAR titles of BYMA's board, for a broker that
// publishes no list but states how many CEDEARs it offers ("Más de 300
// empresas internacionales"). The owner's rule (2026-10-25): with a stated
// number, the catalogue of that place is the N most popular titles, ranked
// by traded value.
//
// A title is one CEDEAR certificate (one ISIN) with its peso, MEP (D) and
// cable (C) lines. Its traded value is the peso line's value over the last
// 90 days of BYMA's daily history (close times volume, 24HS term), the
// lines most clients trade. A title with no peso line takes its MEP line's
// value at the rate of AAPL's last peso close to AAPLD's. The values are kept in
// cedear-value.json next to this file for MAX_AGE_DAYS.
//
//   https://open.bymadata.com.ar/ (chart/historical-series/history)
//
// Use:
//   import { topCedears } from "../lescinq/cedearTop.mjs";
//   const { rows, titles } = await topCedears(bymaRows, 300);
// rows: the local share rows untouched plus every line of the n CEDEAR
// titles with the highest value.

import fs from "node:fs";
import { getText, pause } from "../comafi/byma.mjs";

const HISTORY = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/chart/historical-series/history";
const WINDOW_DAYS = 90;
const MAX_AGE_DAYS = 3;
const CACHE = new URL("cedear-value.json", import.meta.url);

const isCedear = (row) => String(row.raw || "").split(" | ")[1] === "CEDEARs";

// Sum of close x volume of a symbol's 24HS line over the window.
async function tradedValue(symbol) {
  const to = Math.floor(Date.now() / 1000);
  const url = `${HISTORY}?symbol=${encodeURIComponent(`${symbol} 24HS`)}&resolution=D&from=${to - WINDOW_DAYS * 86400}&to=${to}`;
  const parsed = JSON.parse(await getText(url));
  if (parsed.s === "no_data") return 0;
  if (parsed.s !== "ok" || !Array.isArray(parsed.c) || !Array.isArray(parsed.v) || parsed.c.length !== parsed.v.length) {
    throw new Error(`BYMA history of ${symbol} answered ${JSON.stringify(parsed).slice(0, 120)}`);
  }
  let value = 0;
  for (let index = 0; index < parsed.c.length; index += 1) value += Number(parsed.c[index]) * Number(parsed.v[index]) || 0;
  return value;
}

function cached() {
  try {
    const book = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    const age = Date.now() - Date.parse(book.built);
    if (book.values && age >= 0 && age < MAX_AGE_DAYS * 86_400_000) return book.values;
  } catch {
    // none yet: read BYMA
  }
  return null;
}

export async function topCedears(rows, n) {
  const titles = new Map();
  for (const row of rows.filter(isCedear)) {
    const key = row.isin || row.ticker;
    if (!titles.has(key)) titles.set(key, []);
    titles.get(key).push(row);
  }
  const values = cached() || {};
  const missing = [];
  for (const [key, lines] of titles) {
    const line = lines.find((row) => row.currency === "ARS") || lines.find((row) => /D$/.test(row.ticker)) || lines[0];
    if (!(line.ticker in values)) missing.push(line.ticker);
  }
  let done = 0;
  for (const symbol of [...new Set(missing)]) {
    values[symbol] = await tradedValue(symbol);
    done += 1;
    if (done % 100 === 0) console.error(`  CEDEAR values: ${done} of ${missing.length}`);
    await pause(150);
  }
  if (missing.length) fs.writeFileSync(CACHE, JSON.stringify({ built: new Date().toISOString(), values }, null, 1));
  const rate = await mepRate();
  const scored = [...titles].map(([key, lines]) => {
    const peso = lines.find((row) => row.currency === "ARS");
    const line = peso || lines.find((row) => /D$/.test(row.ticker)) || lines[0];
    return { key, lines, value: (values[line.ticker] || 0) * (peso ? 1 : rate) };
  });
  scored.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  if (scored.filter((item) => item.value > 0).length < n) throw new Error(`fewer than ${n} CEDEAR titles traded on BYMA in ${WINDOW_DAYS} days`);
  const kept = new Set(scored.slice(0, n).map((item) => item.key));
  for (const ticker of ["AAPL", "SPY", "NVDA"]) {
    const row = rows.find((item) => item.ticker === ticker);
    if (row && !kept.has(row.isin || row.ticker)) throw new Error(`${ticker} is not among the ${n} most traded CEDEARs`);
  }
  return {
    rows: rows.filter((row) => !isCedear(row) || kept.has(row.isin || row.ticker)),
    titles: scored.length,
    cut: scored[n - 1]?.value || 0,
  };
}

// Pesos per MEP dollar: AAPL's last close over AAPLD's.
async function mepRate() {
  const to = Math.floor(Date.now() / 1000);
  const last = async (symbol) => {
    const parsed = JSON.parse(await getText(`${HISTORY}?symbol=${encodeURIComponent(`${symbol} 24HS`)}&resolution=D&from=${to - 15 * 86400}&to=${to}`));
    const closes = (parsed.c || []).map(Number).filter((value) => value > 0);
    return closes[closes.length - 1] || 0;
  };
  const peso = await last("AAPL");
  const dollar = await last("AAPLD");
  if (!(peso > 0 && dollar > 0)) throw new Error("no AAPL / AAPLD close on BYMA");
  return peso / dollar;
}
