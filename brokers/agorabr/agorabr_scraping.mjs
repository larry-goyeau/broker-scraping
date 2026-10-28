// What Ágora (Bradesco) sells on B3, with no login. Ágora prints no list
// of its own. Its cost page says "Zeramos a taxa de corretagem para você
// operar no mercado de ações, BDRs, ETFs, FIIs e opções pelo app e pelo
// site da Ágora", and links the Bolsa/Balcão tariff PDF. No page names a
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
//   https://www.agorainvestimentos.com.br/content/agora/home/investimentos/outros/custos-operacionais.html   (fees)
//   https://www.agorainvestimentos.com.br/content/dam/banco-bradesco/agora/staticfiles/dist/pdf/taxasparanegociacaobolsabalcaov4_140725.pdf
//
//   node brokers/agorabr/agorabr_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "agorabr-parsed.json");
for (const ticker of ["PETR4", "BBDC4", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Ágora catalogue`);
}
