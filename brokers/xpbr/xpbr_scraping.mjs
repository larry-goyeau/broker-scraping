// What XP Investimentos (XP Investimentos CCTVM) sells in shares and
// exchange-traded funds, with no login. XP prints no list. Its pages
// answer some clients with 403, so the run reads the newest Wayback Machine
// copy of a page when the live one refuses (the copies are XP's own
// pages).
//
// B3. The cost page, "Autoatendimento" (orders the client places on the
// electronic platforms): "Ações e BDRs Day Trade aderindo ao RLP: R$ 0,00
// Day Trade não aderindo ao RLP: R$ 2,90 Swing Trade: R$ 4,90", plus "uma
// taxa operacional de 5,9% sobre o valor da corretagem, emolumentos e taxa
// de liquidação". No page names a segment, a board or a kind of B3 share
// it does not sell, so the B3 part is the whole cash book read by
// ../nubank/b3Book.mjs: shares and units, BDRs of foreign shares and ETFs,
// Brazilian ETFs, the 21Shares crypto ETP BDRs. Left out there: listed
// real-estate and other closed-end funds (FII, FIAGRO, FIP, FIDC; not
// shares or ETFs), odd and block lots, receipts, rights, warrants, and
// lines that are suspended, delisted, in liquidation or have not traded in
// twelve months.
//
// United States. The Conta Investimento Global is held at XP's US broker,
// XP Investments US, LLC ("XP International"). The cost page prices
// "Corretagens & comissões de Ações, ETFs, REITS e ADRs" from U$ 1,00 (up
// to U$ 100) to U$ 8,60 (above U$ 2.000), and the help centre's "Ativos
// (Ações, ETFs, ADRs)" category says "utilize a barra de pesquisa para
// buscar qualquer ativo listado na NYSE ou NASDAQ". There is no list, so
// the owner's rule for a place with no list applies: the whole US exchange
// book of the day (../wellstrade/usBook.mjs), kept to the two markets XP
// names: shares, ADRs and ETFs listed on the NYSE or Nasdaq ("NYSE" read as
// the NYSE-named markets NYSE, NYSE American, NYSE Arca and NYSE Texas; see
// ../tfcapital/usTop.mjs). Lines listed on Cboe BZX (mostly ETFs), the
// Texas Stock Exchange or IEX stay out. No page names another exception
// (no OTC, leveraged-ETF or price rule). usBook drops warrants, rights,
// units, when-issued lines, listed notes and lines with an open trade
// halt; bonds go through withoutObligations. OTC Markets lines are not
// added: no page mentions them. The US is one NBBO market: one row per
// title, on its listing market, in dollars. broker-list.json gives "B3 São
// Paulo" and "United States"; its US restriction (an account only for
// Brazilian nationals resident in Brazil with active XP accounts) depends
// on the client, not the title, so it is a remark, not a removal.
// UCITS ETFs: the cost page prices "UCITs Operações de compra & venda
// 0,25%" and XP "oferece uma seleção de ETFs UCITS na Conta Investimento
// Global"; no place is named, the account is in dollars and none is listed, so (owner, 2026-10-26)
// every UCITS ETF line the London Stock Exchange quotes in USD with an EEA
// ISIN (../xpbr/ucitsBook.mjs: VWRA, CSPX, IWDA, EIMI...; ETCs and ETNs
// are not UCITS funds). One row per line, LSE, USD.
//
//   https://www.xpi.com.br/custos-operacionais/   (fees)
//   https://www.xpi.com.br/produtos/conta-investimento-global/
//   https://atendimento.xpi.com.br/categoria/conta-investimento-global/ativos-acoes-etfs-adrs
//
//   node brokers/xpbr/xpbr_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { b3Book } from "../nubank/b3Book.mjs";
import { NYSE_NASDAQ } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { ucitsBook } from "./ucitsBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  return { status: response.status, text: response.ok ? await response.text() : "" };
}

// The live page, or the newest Wayback copy when the site refuses scripts.
async function page(url) {
  const live = await get(url).catch(() => ({ status: 0, text: "" }));
  if (live.text) return { text: live.text, from: "live" };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(3000 * (attempt + 1));
    const cdx = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=-1&filter=statuscode:200`).catch(() => ({ text: "" }));
    const rows = (() => {
      try {
        return JSON.parse(cdx.text);
      } catch {
        return [];
      }
    })();
    const stamp = rows.length > 1 ? rows[rows.length - 1][1] : "";
    if (!stamp) continue;
    await sleep(2000);
    const copy = await get(`https://web.archive.org/web/${stamp}id_/${url}`).catch(() => ({ text: "" }));
    if (copy.text) return { text: copy.text, from: `Wayback ${stamp}` };
  }
  throw new Error(`${url} answered ${live.status} and no Wayback copy came back`);
}

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const { text: source, from } = await page(url);
  const text = source
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text) && !pattern.test(source)) throw new Error(`${url} (${from}) no longer says ${pattern}`);
  return from;
}

const seen = [];
seen.push(
  await evidence("https://www.xpi.com.br/custos-operacionais/", [
    /Ações e BDRs Day Trade aderindo ao RLP : R\$ 0,00/,
    /Swing Trade: R\$ 4,90/,
    /Corretagens (?:&amp;|&) comissões de Ações, ETFs, REITS e ADRs/,
    /Operações acima de U\$ 2\.000 U\$ 8,60/,
  ])
);
seen.push(
  await evidence("https://atendimento.xpi.com.br/categoria/conta-investimento-global/ativos-acoes-etfs-adrs", [
    /buscar qualquer ativo listado na NYSE ou NASDAQ/,
  ])
);

const { date, history, listed, leftOut } = await b3Book();
const b3 = listed.filter((row) => ["STOCK", "ETF", "ETN"].includes(row.type)).map((row) => ({ ...row }));
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) if (!b3.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from B3`);

const book = await usBook();
const us = book.filter((row) => NYSE_NASDAQ.has(row.mic));
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);
const ucits = await ucitsBook();
const rows = stampRows(withoutObligations([...b3, ...us, ...ucits]));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("xpbr-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`pages read: ${seen.join(", ")}`);
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`B3 file of ${date}, trades to ${history}; ${Object.entries(leftOut).map(([reason, list]) => `${list.length} ${reason}`).join("; ")}`);
console.error(`US directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`US left out ${list.length} ${what}`);
console.error(`US left out ${book.length - us.length} lines listed off NYSE/Nasdaq`);
console.error(ucits.report);
