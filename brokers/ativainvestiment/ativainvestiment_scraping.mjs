// What Ativa Investimentos sells on B3, with no login. Ativa prints no
// list of its own. Its cost page charges "Bovespa / Mercado à vista e
// Fracionário (Swing Trade)" at R$ 4,90 per order and "Day Trade
// Bovespa" at R$ 2,90 through the home broker, with a desk table ("CUSTO
// MESA DE OPERAÇÕES - TABELA BOVESPA") for orders by phone. Its shares
// page says "Invista em ações e seja sócio das maiores empresas do
// Brasil e do mundo". No page names a segment, a board or a kind of
// share it does not sell. So the catalogue is the whole B3 cash book:
// shares and units, BDRs of foreign shares and ETFs, Brazilian ETFs
// (fixed-income ones too), and the 21Shares crypto ETP BDRs.
//
// The site sits behind a bot filter that answers 403 to a bare request;
// the cost table is in the page's script bundle and reads fine with
// ordinary browser headers.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.ativainvestimentos.com.br/Investimentos/Custos/   (fees)
//   https://www.ativainvestimentos.com.br/renda-variavel/acoes
//
//   node brokers/ativainvestiment/ativainvestiment_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "ativainvestiment-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Ativa catalogue`);
}
