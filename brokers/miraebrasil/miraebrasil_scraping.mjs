// What Mirae Asset Brasil sells on B3, with no login. Mirae prints no
// list of its own. Its variable-income page lists "Ações", "BDR", "FII"
// and "ETF" ("Os ETFs também são negociados na bolsa de valores da B3"),
// and its cost page charges "Ações | BDR | Opções R$ 0,99" per order on
// the Home Broker (FII: "ISENTO"). No page names a segment, a board or a
// kind of share it does not sell. So the catalogue is the whole B3 cash
// book: shares and units, BDRs of foreign shares and ETFs, Brazilian
// ETFs (fixed-income ones too), and the 21Shares crypto ETP BDRs. The
// "ADR" tab only explains what an ADR is; Mirae's US market is another
// place.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://corretora.miraeasset.com.br/costs   (fees)
//   https://corretora.miraeasset.com.br/variable-income
//
//   node brokers/miraebrasil/miraebrasil_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "miraebrasil-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Mirae Asset Brasil catalogue`);
}
