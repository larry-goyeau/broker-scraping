// What CAIXA Ações Online (Caixa Econômica Federal) sells on B3, with no
// login. CAIXA prints no list of its own. Its product page says "você
// pode comprar e vender ações e outros valores mobiliários disponíveis no
// mercado à vista da B3", and its rules (regras.pdf, 3.4) accept "ordens
// de lote padrão e fracionário para operações no mercado à vista". The
// cost page charges "R$ 4,49 + 0,02% sobre o volume operado" per executed
// order. No page names a segment, a board or a kind of share it does not
// sell. So the catalogue is the whole B3 cash book: shares and units,
// BDRs of foreign shares and ETFs, Brazilian ETFs (fixed-income ones
// too), and the 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.caixa.gov.br/voce/poupanca-e-investimentos/acoes-online/custos-operacionais/   (fees)
//   https://www.caixa.gov.br/voce/poupanca-e-investimentos/acoes-online/
//   https://acoesonline.caixa.gov.br/sinacstatic/internet/share/pdf/regras.pdf
//
//   node brokers/caixaacoesonline/caixaacoesonline_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "caixaacoesonline-parsed.json");
for (const ticker of ["PETR4", "BBAS3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the CAIXA Ações Online catalogue`);
}
