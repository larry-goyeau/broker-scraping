// What Sicredi sells on B3, with no login. Sicredi prints no list of its
// own. Its variable-income pages charge "R$ 2,20 para ações e BDRs e taxa
// zero para ETFs e FIIs" in the home broker, and "0,5% do valor da
// operação + R$ 25,21" at the desk. It sells shares ("Invista nas
// principais empresas do Brasil através da bolsa de valores brasileira"),
// BDRs ("Algumas das maiores empresas do mundo também são negociadas na
// bolsa Brasileira") and ETFs. No page names a segment, a board or a
// kind of share it does not sell. So the catalogue is the whole B3 cash
// book: shares and units, BDRs of foreign shares and ETFs, Brazilian ETFs
// (fixed-income ones too), and the 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.sicredi.com.br/site/investimentos/renda-variavel/acoes/   (fees)
//   https://www.sicredi.com.br/site/investimentos/renda-variavel/
//   https://www.sicredi.com.br/site/investimentos/renda-variavel/bdr-brazilian-depositary-receipts/
//   https://www.sicredi.com.br/site/investimentos/renda-variavel/etf-exchange-traded-funds/
//
//   node brokers/sicredi/sicredi_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "sicredi-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Sicredi catalogue`);
}
