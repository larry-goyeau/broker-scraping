// What Banrisul Corretora sells on B3, with no login. Banrisul prints no
// list of its own. Its cost page charges new clients under "Renda
// Variável" "R$ 3,00 por ordem + 0,09% sobre o volume operado" through
// the home broker and app, and B3's table with a 30% discount at the
// desk. Its variable-income page sells "Ações", "Brazilian Depositary
// Receipts BDRs", "Fundos de Índices - ETF" (equity and fixed-income
// ETFs), FIIs and FIAGRO. The BDR page explains the BDR levels but sets
// no limit of its own. No page names a segment, a board or a kind of
// share it does not sell. So the catalogue is the whole B3 cash book:
// shares and units, BDRs of foreign shares and ETFs, Brazilian ETFs
// (fixed-income ones too), and the 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.banrisulcorretora.com.br/lxa/link/custos-tarifas.html   (fees)
//   https://www.banrisulcorretora.com.br/lxa/link/renda-variavel.html
//   https://www.banrisulcorretora.com.br/lxa/link/renda-variavel-bdr.html
//   https://www.banrisulcorretora.com.br/lxa/link/renda-variavel-fundos-indices.html
//
//   node brokers/banrisulcorretor/banrisulcorretor_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "banrisulcorretor-parsed.json");
for (const ticker of ["PETR4", "BRSR6", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Banrisul catalogue`);
}
