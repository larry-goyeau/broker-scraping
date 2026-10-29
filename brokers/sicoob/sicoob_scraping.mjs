// What Sicoob (the Sicoob credit-cooperative system, Brazil) sells on B3,
// with no login. Its Home Broker is in the App Sicoob and the internet
// banking. The Home Broker page (read 2026-10-28): "com o Home Broker,
// terão a opção de investir em renda variável, incluindo ações, fundos
// imobiliários, ETFs e BDRs", "a taxa de corretagem será de R$ 2,10 para
// ações e BDRs. Já as operações com fundos imobiliários e ETFs são isentas
// de taxa", and "Para os demais ativos, como ações e BDRs, é cobrada uma
// taxa de R$ 2,10 por ordem". Sicoob prints no list and names no segment,
// board or kind of share it does not sell. So the catalogue is the whole
// B3 cash book: shares and units, BDRs of foreign shares and ETFs,
// Brazilian ETFs (fixed-income ones too), and the 21Shares crypto ETP
// BDRs. broker-list.json gives the place "Brazil"; B3 is Brazil's only
// equity exchange.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
// sicoob.com.br answers scripts from outside Brazil with 403 ("Acesso
// Bloqueado"), so the run does not re-read the page.
//
//   https://www.sicoob.com.br/web/sicoob/home-broker   (offer and fees)
//
//   node brokers/sicoob/sicoob_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "sicoob-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Sicoob catalogue`);
}
