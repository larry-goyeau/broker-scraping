// What Clear (a brand of XP Investimentos CCTVM) sells in shares and
// exchange-traded funds, with no login. Clear prints no list for either
// of its two places.
//
// B3. The cost page: "Na Clear, a corretagem é zero para todos os
// produtos", Day Trade and Swing Trade "Corretagem R$ 0,00", and the
// compulsory close-out priced "para ações, BDRs, ETFs, FIIs, Opções e
// Termo". The menu lists Ações, ETFs and Fundos Imobiliários. No page names
// a segment, a board or a kind of B3 share it does not sell, so the B3
// part is the whole cash book read by ../nubank/b3Book.mjs: shares and
// units, BDRs of foreign shares and ETFs, Brazilian ETFs, the 21Shares
// crypto ETP BDRs. Left out there: listed real-estate and other closed-end
// funds (FII, FIAGRO, FIP, FIDC; not shares or ETFs), odd and block lots,
// receipts, rights, warrants, and lines that are suspended, delisted, in
// liquidation or have not traded in twelve months.
//
// United States. The Conta Investimento Global "é um serviço disponibilizado
// pela XP Investments US, LLC" that Clear opens to investors resident in
// Brazil, in the Clear app. Its page: "É possível investir diretamente em
// ações de empresas negociadas nas principais bolsas dos Estados Unidos,
// como NYSE e NASDAQ", and Stocks, ETFs, REITs and ADRs. The cost page
// prices "operações em Ações, ETFs, REITs e ADRs" from U$ 1,00 (up to U$
// 100) to U$ 8,60 (above U$ 2.000); desk orders cost 0,5% (minimum U$ 10).
// There is no list, so the owner's rule for a place with no list applies:
// the whole US exchange book of the day (../wellstrade/usBook.mjs). NYSE
// and Nasdaq are named as examples ("como"), which implies the other US
// exchanges, so the whole book stays (owner's rule, 2026-10-25). No page
// names an exception (no OTC, leveraged-ETF or price rule) and none
// mentions OTC Markets, so no OTC lines. usBook drops warrants, rights,
// units, when-issued lines, listed notes and lines with an open trade
// halt; bonds go through withoutObligations. The US is one NBBO market:
// one row per title, on its listing market, in dollars. Unlike XP and Rico,
// Clear's cost page prices no UCITS ETFs, so none are added.
// broker-list.json gives "B3 São Paulo" and "United States"; its US
// restriction (individuals resident in Brazil with active Clear accounts)
// depends on the client, not the title: a remark, not a removal. It says
// the help centre names NYSE and NASDAQ; the product page names them as
// examples.
//
// www.clear.com.br answers scripts with 403; the corretora. and lp. hosts
// carry the same pages and answer.
//
//   https://corretora.clear.com.br/custos/   (fees)
//   https://lp.clear.com.br/conta-investimento-global
//
//   node brokers/clear/clear_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { b3Book } from "../nubank/b3Book.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await pageSays("https://corretora.clear.com.br/custos/", [
  /Na Clear, a corretagem é zero para todos os produtos/,
  /Swing Trade Taxa Valor Corretagem R\$ 0,00/,
  /Operações acima de U\$ 2\.000: corretagem de U\$ 8,60/,
]);
await pageSays("https://lp.clear.com.br/conta-investimento-global", [
  /principais bolsas dos Estados Unidos, como NYSE e NASDAQ/,
  /XP Investments US, LLC/,
]);

const { date, history, listed, leftOut } = await b3Book();
const b3 = listed.filter((row) => ["STOCK", "ETF", "ETN"].includes(row.type)).map((row) => ({ ...row }));
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) if (!b3.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from B3`);

const us = await usBook();
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);

const rows = stampRows(withoutObligations([...b3, ...us]));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("clear-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`B3 file of ${date}, trades to ${history}; ${Object.entries(leftOut).map(([reason, list]) => `${list.length} ${reason}`).join("; ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(us.report.leftOut)) if (list.length) console.error(`US left out ${list.length} ${what}`);
