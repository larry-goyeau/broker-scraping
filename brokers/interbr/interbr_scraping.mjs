// What Inter Invest (Inter DTVM, Banco Inter's broker in Brazil) sells in
// shares and exchange-traded funds, with no login. The app splits the
// variable-income shelf in two: "Mercado Brasil ... ações, FIIs, BDRs e
// ETFs negociados na B3" and "Mercado Global (EUA)" (help centre). Inter
// prints no list for either.
//
// B3. The variable-income page sells "Invista na bolsa de forma simples e
// com corretagem zero", and the Inter DTVM cost table charges "Operações
// via Home Broker e demais plataformas: Custo zero" for shares. No page
// names a segment, a board or a kind of B3 share it does not sell, so the
// B3 part is the whole cash book read by ../nubank/b3Book.mjs: shares and
// units, BDRs of foreign shares and ETFs, Brazilian ETFs, the 21Shares
// crypto ETP BDRs. Left out there: listed real-estate and other
// closed-end funds (FII, FIAGRO, FIP, FIDC; not shares or ETFs), odd and
// block lots, receipts, rights, warrants, and lines that are suspended,
// delisted, in liquidation or have not traded in twelve months.
//
// United States. US securities are sold by Inter Securities LLC (FINRA /
// SIPC; clearing through DriveWealth and Pershing), which Inter DTVM
// introduces to Brazilian residents. Its client relationship summary
// (CRS) says "Oferecemos ações listadas na NYSE e NASDAQ, ETFs, Renda Fixa,
// e American Depositary Receipts ("ADRs"), bem como determinadas ações e
// ADRs negociados em mercados de balcão", and "A Inter Securities não
// cobra comissões pela execução de ordens de compra e venda de ações e
// ETFs". Inter publishes no US list, so the owner's rule for a place with
// no list applies: the whole US exchange book of the day
// (../wellstrade/usBook.mjs), less what the broker's words leave out.
// - Shares and ADRs: only those listed on the NYSE and Nasdaq, the two
//   markets the CRS names ("NYSE" read as the NYSE-named markets NYSE,
//   NYSE American, NYSE Arca and NYSE Texas; see ../tfcapital/usTop.mjs).
//   Shares listed only on Cboe BZX, the Texas Stock Exchange or IEX stay
//   out.
// - ETFs (and ETNs, which the US books file with them): the CRS names no
//   market for them, so every US-listed one is kept.
// - OTC: "determinadas ações e ADRs" of the OTC markets, a selection with
//   no list; none is added (the book holds exchange lines only).
// - UCITS ETFs ("determinados produtos de investimento emitidos fora dos
//   Estados Unidos, como ETFs UCITS"; the investments page lists "UCITS
//   ETFs"): a selection with no list and no place named, bought in dollars
//   from the US account, so (owner, 2026-10-26) every UCITS ETF line the
//   London Stock Exchange quotes in USD with an EEA ISIN
//   (../xpbr/ucitsBook.mjs: VWRA, CSPX, IWDA, EIMI...; ETCs and ETNs are
//   not UCITS funds). One row per line, LSE, USD.
// usBook also drops warrants, rights, units, when-issued lines, listed
// notes and lines with an open trade halt; bonds go through
// withoutObligations. The US is one NBBO market: one row per title, on its
// listing market, in dollars. broker-list.json gives B3, NYSE and Nasdaq,
// the same places.
//
//   https://inter.co/pra-voce/investimentos/renda-variavel/
//   https://inter.co/pra-voce/investimentos/
//   https://ajuda.inter.co/investimentos/onde-encontro-etfs-acoes-fiis-e-bdrs-no-app-do-inter
//   https://static.bancointer.com.br/idtvm/home/files/b901066a474a448f8c680040460a955c_politica-de-corretagem-inter-dtvm.pdf   (B3 fees)
//   https://inter.co/en/us/securities/
//   https://static.bancointer.com.br/site/inter-co-securities/1fc1cfd3beea49c1b21df0ff92e3f055_resumo-do-relacionamento-com-o-cliente-crs.pdf   (US offer and fees)
//
//   node brokers/interbr/interbr_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { b3Book } from "../nubank/b3Book.mjs";
import { NYSE_NASDAQ } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { ucitsBook } from "../xpbr/ucitsBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://inter.co/pra-voce/investimentos/renda-variavel/", [/corretagem zero/i]);
await pause();
await evidence("https://inter.co/pra-voce/investimentos/", [/Ações \(Stocks\), ETFs, UCITS ETFs, REITs/, /Inter Securities LLC/]);
await pause();
await evidence("https://ajuda.inter.co/investimentos/onde-encontro-etfs-acoes-fiis-e-bdrs-no-app-do-inter", [
  /ações, FIIs, BDRs e ETFs negociados na B3/,
  /Mercado Global \(EUA\)/,
]);

const { date, history, listed, leftOut } = await b3Book();
const b3 = listed.filter((row) => ["STOCK", "ETF", "ETN"].includes(row.type)).map((row) => ({ ...row }));
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) if (!b3.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from B3`);

const book = await usBook();
const offVenue = [];
const us = book.filter((row) => {
  if (row.type !== "STOCK" || NYSE_NASDAQ.has(row.mic)) return true;
  offVenue.push(row.ticker);
  return false;
});
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);

const ucits = await ucitsBook();
const rows = stampRows(withoutObligations([...b3, ...us, ...ucits]));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("interbr-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`B3 file of ${date}, trades to ${history}; ${Object.entries(leftOut).map(([reason, list]) => `${list.length} ${reason}`).join("; ")}`);
console.error(`US directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`US left out ${list.length} ${what}`);
console.error(`US left out ${offVenue.length} shares listed off NYSE/Nasdaq`);
console.error(ucits.report);
