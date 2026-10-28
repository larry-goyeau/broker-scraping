// What Sofisa Direto (Banco Sofisa) sells on B3, with no login. Sofisa
// prints no list of its own. Its variable-income page says "Invista em
// ações, FIIs, BDRs e ETFs sem complicação e com corretagem ZERO" and
// "Corretagem com custo ZERO", which is its tariff. No page names a
// segment, a board or a kind of share it does not sell. So the catalogue
// is the whole B3 cash book: shares and units, BDRs of foreign shares and
// ETFs, Brazilian ETFs (fixed-income ones too), and the 21Shares crypto
// ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.sofisadireto.com.br/investimentos/renda-variavel/   (fees and products)
//
//   node brokers/sofisadireto/sofisadireto_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "sofisadireto-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Sofisa Direto catalogue`);
}
