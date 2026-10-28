// What Safra Corretora (Banco Safra) sells on B3, with no login. Safra
// prints no list of its own. Its cost page charges "O valor da corretagem
// à vista, através do Homebroker (aplicativo ou desktop), é de R$ 4,50
// sobre cada ordem executada" under "Ações e fundos imobiliários", and its
// variable-income pages sell shares, ETFs ("Aplique em diferentes ETFs")
// and BDRs ("Invista em BDRs com facilidade por meio da B3"). No page
// names a segment, a board or a kind of share it does not sell. So the
// catalogue is the whole B3 cash book: shares and units, BDRs of foreign
// shares and ETFs, Brazilian ETFs (fixed-income ones too), and the
// 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.safra.com.br/corretora/custos-operacionais.htm   (fees)
//   https://www.safra.com.br/investimentos/renda-variavel/acoes.htm
//   https://www.safra.com.br/investimentos/renda-variavel/bdr.htm
//
//   node brokers/bancosafra/bancosafra_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "bancosafra-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Banco Safra catalogue`);
}
