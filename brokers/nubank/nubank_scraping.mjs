// What Nubank sells on B3, with no login. Nubank's broker (NuInvest) prints
// no list of its own: its Bolsa page says "é possível aplicar em ações,
// BDRs, fundos de investimentos, fundos Imobiliários, fundos de Índice e
// mais", and that both equity and fixed-income ETFs are in the app. The
// fee page charges "corretagem ZERO em Renda Fixa e em Renda Variável" in
// the app, and "taxa zero" on BDRs. No page names a segment, a board or a
// kind of share it does not sell. So the catalogue is the whole B3 cash
// book: shares and units, BDRs of foreign shares and ETFs, Brazilian ETFs
// (fixed-income ones too), and the 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ./b3Book.mjs.
//
//   https://nubank.com.br/sobre-investimentos/taxas-e-precos   (fees)
//   https://nubank.com.br/nu/investimentos/bolsa-de-valores
//
//   node brokers/nubank/nubank_scraping.mjs

import { writeB3Catalogue } from "./b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "nubank-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34", "NBOV11"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Nubank catalogue`);
}
