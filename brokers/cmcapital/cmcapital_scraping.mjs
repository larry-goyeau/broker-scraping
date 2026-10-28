// What CM Capital (CM Capital Markets CCTVM, São Paulo) sells on B3, with
// no login. Its account page lists "Ações, Opções, Fundos de Investimento,
// Fundos Imobiliários, BDRs, ETFs, minicontratos, contratos futuros e muito
// mais. Tudo com corretagem zero." Its help centre gives the tariff: "A
// corretagem na CM Capital para operações no lote cheio e no lote
// fracionário é ZERO!", and an order sent through the desk (or a forced
// close by Risk) costs "0,5% sobre o volume negociado, com mínimo de R$
// 45,00". The broker prints no security list of its own and names no
// board, segment or kind of share it does not trade, so the catalogue is
// the whole B3 cash book: shares and units, BDRs of foreign shares and
// ETFs, Brazilian ETFs (fixed-income ones too) and the 21Shares crypto ETP
// BDRs. One place, B3 (MIC BVMF), everything in reais.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs, as in the other B3 scrapers), options and
// futures, and what the shared book drops: odd and block lots, receipts,
// rights, warrants, indexes, financing-rate lines, and lines that are
// suspended, delisted, in liquidation or have not traded in twelve months.
// The reading is in ../nubank/b3Book.mjs. The main site cmcapital.com.br
// sits behind a Cloudflare challenge, so the tariff is read from the
// account page and the public help centre.
//
//   https://mkt.cmcapital.com.br/abertura-de-conta-versao-2   (products, "corretagem zero")
//   https://ajuda.cmcapital.com.br/hc/pt-br/articles/360043007933   (fees: zero brokerage, full and odd lot)
//   https://ajuda.cmcapital.com.br/hc/pt-br/articles/360043008373   (fees: desk order 0,5%, min R$ 45)
//
//   node brokers/cmcapital/cmcapital_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "cmcapital-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the CM Capital catalogue`);
}
