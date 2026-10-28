// What Terra Investimentos sells on B3, with no login. Terra prints no
// list of its own. Its variable-income page sells "Ações", "BDRs" and
// "ETFs", and its cost page has a regressive "Corretagem Bovespa" for
// self-service, from "R$ 4,50 por ordem" (1 to 10 orders a month) down to
// "R$ 0,25 por ordem". No page names a segment, a board or a kind of
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
//   https://www.terrainvestimentos.com.br/custos/   (fees)
//   https://www.terrainvestimentos.com.br/renda-variavel/
//   https://www.terrainvestimentos.com.br/duvidas-frequentes/
//
//   node brokers/terrainvestiment/terrainvestiment_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "terrainvestiment-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Terra Investimentos catalogue`);
}
