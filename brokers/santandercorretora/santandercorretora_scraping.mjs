// What Santander Corretora (Santander Corretora de Câmbio e Valores
// Mobiliários, Brazil) sells on B3, with no login. It prints no list of its
// own. Its "Invista" menu lists "Ações", "Empresas americanas (BDR)",
// "Fundos de índice (ETF)", "ETF Renda Fixa", "ETF Renda Variável",
// "Fundos Imobiliários" and options. The brokerage page: for digital
// clients, "Autoatendimento via App Corretora ou App Santander" and
// "Autoatendimento via Home Broker": "Corretagem zero" (since 21/08/2023),
// and "Autoatendimento via APP Santander Trader": "Corretagem Zero"; desk
// orders pay the "Corretagem Mesa" table (R$ 20,00 up to R$ 1.167,33, then
// 1,5% to 0,50% plus a fixed part). No page names a segment, a board or a
// kind of share it does not sell. So the catalogue is the whole B3 cash
// book: shares and units, BDRs of foreign shares and ETFs, Brazilian ETFs
// (fixed-income ones too), and the 21Shares crypto ETP BDRs.
// broker-list.json gives "B3 São Paulo".
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.santandercorretora.com.br/corretora/home/taxas/taxas-de-corretagem.html   (fees)
//   https://www.santandercorretora.com.br/corretora/home/invista/tesouro-direto.html   (the Invista menu)
//
//   node brokers/santandercorretora/santandercorretora_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await pageSays("https://www.santandercorretora.com.br/corretora/home/taxas/taxas-de-corretagem.html", [
  /Autoatendimento via App Corretora ou App Santander Corretagem Mesa Corretagem zero/,
  /Autoatendimento via Home Broker Corretagem Mesa Corretagem zero/,
]);
await pageSays("https://www.santandercorretora.com.br/corretora/home/invista/tesouro-direto.html", [/Empresas americanas \(BDR\)/, /Fundos de índice \(ETF\)/]);

const rows = await writeB3Catalogue(import.meta.url, "santandercorretora-parsed.json");
for (const ticker of ["PETR4", "SANB11", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Santander Corretora catalogue`);
}
