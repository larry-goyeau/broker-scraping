// What EQI Investimentos sells on B3, with no login. EQI prints no list
// of its own. Its cost page has one regressive tariff for "Bovespa
// (Ações, Opções, ETF's, BRD's, FIP, FI-Infra e etc)", from "R$ 4,50" an
// order (1 to 10 orders a month) down to "R$ 0,25", and "Taxa zero para
// Fundo de Investimento Imobiliário". No page names a segment, a board or
// a kind of share it does not sell. So the catalogue is the whole B3 cash
// book: shares and units, BDRs of foreign shares and ETFs, Brazilian ETFs
// (fixed-income ones too), and the 21Shares crypto ETP BDRs. The tariff
// table sits in the page's script bundle (the "bovespa" option of the
// cost selector), not in the first HTML.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FI-Infra, FIDC; not shares or ETFs), and what the shared book
// drops: odd and block lots, receipts, rights, warrants, indexes,
// financing-rate lines, and lines that are suspended, delisted, in
// liquidation or have not traded in twelve months. The reading is in
// ../nubank/b3Book.mjs.
//
//   https://eqi.com.br/renda-variavel/custos   (fees)
//   https://eqi.com.br/renda-variavel
//
//   node brokers/eqiinvestimentos/eqiinvestimentos_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "eqiinvestimentos-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the EQI Investimentos catalogue`);
}
