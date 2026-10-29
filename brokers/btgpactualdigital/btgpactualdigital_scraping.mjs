// What BTG Pactual digital (the retail investment platform of Banco BTG
// Pactual, Brazil) sells in shares and exchange-traded funds, with no
// login. It prints no list for either of its two places.
//
// B3. The cost page (read 2026-10-28): "trabalhamos com corretagem
// regressiva, ou seja, quanto mais você opera, menos você paga por ordem",
// counted monthly in four groups, the first "Bovespa (Ações, Opções,
// Fracionário, ETF, BDR etc.)"; "Renda Variável Taxa de custódia B3 Zero".
// Day trade with RLP: "corretagem ZERO para minicontratos de índice e
// dólar, ações e ETFs". The variable-income page: "Brasil, Estados Unidos,
// cripto e trends em uma só conta". No page names a segment, a board or a
// kind of B3 share it does not sell, so the B3 part is the whole cash book
// read by ../nubank/b3Book.mjs: shares and units, BDRs of foreign shares
// and ETFs, Brazilian ETFs, the 21Shares crypto ETP BDRs. Left out there:
// listed real-estate and other closed-end funds (FII, FIAGRO, FIP, FIDC;
// not shares or ETFs), odd and block lots, receipts, rights, warrants, and
// lines that are suspended, delisted, in liquidation or have not traded in
// twelve months.
//
// United States. The Conta Internacional de Investimentos is "oferecida em
// parceria com a Drivewealth, LLC" by BTG Pactual US Capital, LLC, opened
// and used in the BTG Pactual app: "Invista em ativos como Ações, REITs,
// ADRs e ETFs com a Conta Internacional de Investimentos". BTG Pactual
// US's disclosures: "Ações/ETF/ETN/Fundos Mútuos Fechados: a Empresa
// normalmente cobra até 2% por transação" (a range: the cost file takes
// the 2%). There is no list and no exchange is named, so the owner's rule
// for a place with no list applies: the whole US exchange book of the day
// (../wellstrade/usBook.mjs). No page names an exception (no OTC,
// leveraged-ETF or price rule) and none mentions OTC Markets, so no OTC
// lines. usBook drops warrants, rights, units, when-issued lines, listed
// notes and lines with an open trade halt; bonds go through
// withoutObligations. The US is one NBBO market: one row per title, on its
// listing market, in dollars. broker-list.json gives "B3 São Paulo" and
// "United States", the same places.
//
// The BTG pages are a script application whose text a plain fetch does not
// carry, so the run does not re-read them.
//
//   https://investimentos.btgpactual.com/custos   (B3 fees)
//   https://investimentos.btgpactual.com/renda-variavel
//   https://banking.btgpactual.com/conta-corrente/conta-internacional
//   https://www.btgpactual.us/pt/disclosures   (US fees)
//
//   node brokers/btgpactualdigital/btgpactualdigital_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { b3Book } from "../nubank/b3Book.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const { date, history, listed, leftOut } = await b3Book();
const b3 = listed.filter((row) => ["STOCK", "ETF", "ETN"].includes(row.type)).map((row) => ({ ...row }));
for (const ticker of ["PETR4", "BPAC11", "BOVA11", "AAPL34"]) if (!b3.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from B3`);

const us = await usBook();
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);

const rows = stampRows(withoutObligations([...b3, ...us]));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("btgpactualdigital-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`B3 file of ${date}, trades to ${history}; ${Object.entries(leftOut).map(([reason, list]) => `${list.length} ${reason}`).join("; ")}`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(us.report.leftOut)) if (list.length) console.error(`US left out ${list.length} ${what}`);
