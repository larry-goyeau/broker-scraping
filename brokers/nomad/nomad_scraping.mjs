// What Nomad (Nomad Fintech, Brazil; investments by Nomad Investment
// Services, cleared by Apex Clearing, some services by DriveWealth) sells
// in shares and exchange-traded funds, with no login. Its one place is the
// United States: the investments page says "É lá que estão as duas maiores
// Bolsas do mundo, NYSE e Nasdaq", lists "Ações", "ETFs", "REITs" and
// "Bonds" as "as classes de ativos disponíveis para você no mercado
// americano", and "Taxa zero de corretagem: Economize nas suas
// movimentações sem pagar taxas de corretagem" (the costs PDF and the
// tarifas page carry the exchange fee of the Nomad Pass levels). Orders
// are placed in the app ("invista pelo aplicativo em poucos cliques").
//
// There is no list and no number, so the owner's rule for a place with no
// list applies: the whole US exchange book of the day
// (../wellstrade/usBook.mjs). NYSE and Nasdaq are named as where the two
// largest exchanges are, not as the only markets the account reaches, so
// the whole book stays. No page names an exception (no OTC, leveraged-ETF
// or price rule) and none mentions OTC Markets, so no OTC lines. usBook
// drops warrants, rights, units, when-issued lines, listed notes and lines
// with an open trade halt; bonds go through withoutObligations. One row
// per title, on its listing market, in dollars. broker-list.json gives
// "United States".
//
//   https://www.nomadglobal.com/investimentos   (offer and fees)
//   https://www.nomadglobal.com/tarifas-nomad
//
//   node brokers/nomad/nomad_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await pageSays("https://www.nomadglobal.com/investimentos", [/Taxa zero de corretagem/, /NYSE e Nasdaq/, /ETFs Fundos compostos/]);

const us = await usBook();
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);
const rows = stampRows(withoutObligations([...us]));
if (rows.length < 9000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("nomad-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(us.report.leftOut)) if (list.length) console.error(`US left out ${list.length} ${what}`);
