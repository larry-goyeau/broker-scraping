// What Halyk Bank (Halyk Invest, in the Halyk app) sells online, with no
// login: every share, depositary receipt and ETF on the Kazakhstan Stock
// Exchange (KASE) and the Astana International Exchange (AIX).
//
// Its Halyk Invest page: "Halyk Invest is a simple and convenient way to
// invest using Halyk app, where the securities of local and international
// companies are available", with "direct access to KASE and AIX
// exchanges". Its brokerage tariff prices "Покупка / продажа финансовых
// инструментов на KASE" and "... на AIX" (and a third line for the
// "международном рынке" through a foreign broker, with US exchange fees;
// broker-list.json gives KASE and AIX only and the page names no foreign
// exchange, so that line is noted, not built). No board, sector or fund is
// named as out, so the catalogue is both exchanges' books:
//   KASE (../udcapitaludcinve/kaseBook.mjs): the main and alternative
//     boards, KASE Global (foreign shares such as AAPL_KZ), depositary
//     receipts and the KASE Global and local ETFs, less suspended lines,
//     lines that never traded and lines with no trade in two years;
//     interval mutual funds and bonds stay out. Each line in its own
//     trading currency (KZT, or USD for most KASE Global lines), XKAZ.
//   AIX (../birzhevoy/kazakhBook.mjs, aixListings): the active ordinary and
//     preferred shares, GDRs and ADSs, and the ETF board's equity ETFs;
//     a share quoted in two currencies is one row per currency (the
//     exchange gives each line's currency). Closed-end funds, ETNs,
//     structured notes and bonds stay out. AIXK.
// A title on both exchanges is one row per exchange.
//
//   https://halykbank.kz/en/other/halyk-invest
//   https://kase.kz/en/markets/shares-and-adr-gdr
//   https://market.aixkz.com/official-list
//
// Fees: https://halykbank.kz/storage/app/media/Tarify/2026/RUS_Tariffs_for_brokerage.pdf
// (linked from https://halykbank.kz/tariffs, "Тарифы на оказание брокерских
// услуг на рынке ценных бумаг": KASE and AIX "0,03% от суммы сделки,
// минимум 30 тенге"; international market 0,05 % plus the foreign
// broker's and custodian's fees).
//
//   node brokers/halykbank/halykbank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { kaseBook } from "../udcapitaludcinve/kaseBook.mjs";
import { aixListings } from "../birzhevoy/kazakhBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";
import fs from "node:fs";

const TARIFF = "https://halykbank.kz/storage/app/media/Tarify/2026/RUS_Tariffs_for_brokerage.pdf";

await says("https://halykbank.kz/en/other/halyk-invest", [/direct access to KASE and AIX exchanges/, /securities of local and international companies are available/]);
await says("https://halykbank.kz/tariffs", [/RUS_Tariffs_for_brokerage\.pdf/], { raw: true });
await pdfAnswers(TARIFF);

const kase = await kaseBook();
const aix = await aixListings();
for (const ticker of ["KSPI", "HSBK", "KZAP"]) {
  if (!kase.rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the KASE book`);
}
const rows = stampRows(withoutObligations([...kase.rows, ...aix.rows]));
if (rows.length < 130) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("halykbank-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type} ${row.currency}`] = (counts[`${row.mic} ${row.type} ${row.currency}`] || 0) + 1;
console.error(`halykbank: ${rows.length} rows (${Object.entries(counts).map(([key, n]) => `${n} ${key}`).join(", ")})`);
console.error(`KASE left out ${kase.leftOut.length}; AIX left out ${aix.leftOut.length}: ${aix.leftOut.join("; ") || "none"}`);
