// What Nova Futura sells on B3, with no login. Nova Futura prints no list
// of its own. Its cost page charges the "Mercado à vista" ("Ações, BDRs,
// opções e FIIs") at "R$ 3,49 por ordem em day trade e R$ 6,98 em swing
// trade, mesmo valor para BDRs, ETFs e opções", and its variable-income
// page sells "Ações, ETFs e BDRs num só Home Broker", with "Apple,
// Microsoft, S&P, Nasdaq e cripto via BDRs listados na B3". No page names
// a segment, a board or a kind of share it does not sell. So the
// catalogue is the whole B3 cash book: shares and units, BDRs of foreign
// shares and ETFs, Brazilian ETFs (fixed-income ones too, e.g. IMAB11 on
// its ETF shelf), and the 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.novafutura.com.br/custos   (fees)
//   https://www.novafutura.com.br/renda-variavel
//
//   node brokers/novafutura/novafutura_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "novafutura-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "IMAB11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Nova Futura catalogue`);
}
