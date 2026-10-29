// What Revolut Brasil sells in shares and exchange-traded funds, with no
// login. The service is Revolut Securities Singapore Pte. Ltd.'s, "oferecidos
// no Brasil pela Ativa Investimentos S.A.", in the Revolut app. Its one
// place is the United States.
//
// The stock-trading page (read 2026-10-28): "Escolha entre mais de mais de
// 5.000 ações dos EUA diretamente pelo app", "Invista com 0% de comissão
// ... invista em ações sem comissão, dentro do seu limite mensal. Aplicam-se
// outras taxas." The plan comparison gives the monthly commission-free
// trades: "Negociação sem comissões ... 1 por mês, 3 por mês, 5 por mês, 10
// por mês, 10 por mês" (Standard, Plus, Premium, Metal, Ultra). The trading
// terms (section 49): a commission is charged on each trade beyond the plan
// limit, its rate given in the "Fee Disclosure (Trading) available via the
// investment platform" (in the app only); the terms let clients "trade
// securities issued and admitted for trading in jurisdictions outside of
// Brazil, such as stocks and exchange-traded funds ("ETFs")".
//
// There is no list, but a stated number, so the owner's rule for a stated
// count applies: the 5,000 most popular titles of the US exchange book of
// the day (../wellstrade/usBook.mjs), ranked by 30-day average traded
// value on TradingView's US scanner (../tfcapital/usTop.mjs). The number
// counts "ações"; the terms put ETFs in the same app with no count of
// their own, so shares and ETFs are ranked together and the 5,000 bound
// the whole place. No page names an exchange, an OTC tier or another
// exception. usBook drops warrants, rights, units, when-issued lines,
// listed notes and lines with an open trade halt; bonds go through
// withoutObligations. One row per title, on its listing market, in
// dollars. broker-list.json gives "United States".
//
// revolut.com answers scripts with a bot wall (403), so the run does not
// re-read the pages.
//
//   https://www.revolut.com/pt-BR/stock-trading/   (offer, commission-free trades)
//   https://www.revolut.com/pt-BR/our-pricing-plans/   (free trades per plan)
//   https://www.revolut.com/en-BR/legal/trading/   (terms: stocks and ETFs, commission beyond the plan limit)
//
//   node brokers/revolutbr/revolutbr_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const N = 5000;
const book = await usBook();
const top = await usTop(withoutObligations(book), N);
for (const ticker of ["AAPL", "NVDA", "SPY", "QQQ"]) if (!top.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the top ${N}`);
const rows = stampRows(top.sort((a, b) => a.ticker.localeCompare(b.ticker)));
if (rows.length < N * 0.95) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("revolutbr-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`ranking: ${JSON.stringify(top.report)}`);
