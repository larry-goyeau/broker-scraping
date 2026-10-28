// The UCITS ETFs a Brazilian global account (XP, Rico, Inter) sells with no
// list and no place named: the account is held in the United States and in
// dollars, the funds are European ("domiciliados na Irlanda e em
// Luxemburgo", XP), and the dollar lines of those funds trade on the
// London Stock Exchange (VWRA, CSPX, IWDA, EIMI...). So, by the owner's
// rule for a place with no list (2026-10-26: "ajoute les ETF UCITS
// européens"), the whole LSE book of exchange-traded funds in USD whose
// ISIN is from the EEA (Ireland and Luxembourg for almost all, a few French
// and Dutch funds), read with ../stratiphy/lseBook.mjs (the LSE price
// explorer: suspended, halted, trade-reporting-only and not-yet-trading
// lines out). ETCs and ETNs are not UCITS funds and stay out.
//
//   import { ucitsBook } from "../xpbr/ucitsBook.mjs";
//   const ucits = await ucitsBook();   // rows; ucits.report

import { lseRows } from "../stratiphy/lseBook.mjs";

const EEA = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK",
]);

export async function ucitsBook() {
  const lse = await lseRows({ iob: false });
  const etfs = lse.filter((row) => row.type === "ETF");
  const rows = etfs.filter((row) => row.currency === "USD" && EEA.has(row.isin.slice(0, 2)));
  for (const ticker of ["VWRA", "CSPX", "IWDA", "EIMI"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`UCITS: ${ticker} (USD) missing on the LSE`);
  if (rows.length < 1000) throw new Error(`only ${rows.length} USD UCITS ETF lines on the LSE`);
  const byDomicile = rows.reduce((acc, row) => ((acc[row.isin.slice(0, 2)] = (acc[row.isin.slice(0, 2)] || 0) + 1), acc), {});
  rows.report = `UCITS: ${rows.length} USD ETF lines of the ${etfs.length} LSE ETF lines ${JSON.stringify(byDomicile)}`;
  return rows;
}
