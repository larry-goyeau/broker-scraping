// What Banco do Brasil (BB Banco de Investimento, BB-BI, B3 participant
// 820) sells on B3, with no login. BB prints no list of its own. Its
// investment pages sell, in the app Investimentos BB and the Portal de
// Investimentos: Ações ("SEM TAXA de corretagem¹ e custódia", "Negociação
// no app Investimentos BB e no Portal de Investimentos"), BDRs ("SEM TAXA
// de corretagem¹ e custódia", "Acesso ao mercado estrangeiro") and ETFs
// ("SEM TAXA de corretagem¹ e custódia"). The Ações page: "Aqui no BB, a
// corretagem é ZERO para operações via canais digitais, seja pelo Painel
// de Investimentos ou app Investimentos BB", and "nós pagamos a custódia
// para você". No page names a segment, a board or a kind of share it does
// not sell. So the catalogue is the whole B3 cash book: shares and units,
// BDRs of foreign shares and ETFs, Brazilian ETFs (fixed-income ones too),
// and the 21Shares crypto ETP BDRs. broker-list.json gives "B3 São Paulo".
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
// bb.com.br answers scripts from outside Brazil with 403 ("Ops! Erro no
// acesso"), so the run does not re-read the pages (read in a browser on
// 2026-10-28).
//
//   https://www.bb.com.br/site/investimentos/acoes/   (fees)
//   https://www.bb.com.br/site/investimentos/bdr/
//   https://www.bb.com.br/site/investimentos/etf/
//
//   node brokers/bancodobrasil/bancodobrasil_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "bancodobrasil-parsed.json");
for (const ticker of ["PETR4", "BBAS3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Banco do Brasil catalogue`);
}
