// What PagBank sells on B3, with no login. PagBank prints no list of its
// own. Its cost page prices "Bovespa (Ações, ETF, BDR e FIIs)": "De 0 a 4
// ordens por mês: custo zero | Acima de 5 ordens por mês: R$2,99 por
// ordem (swingtrade)". Its variable-income page says "Comece a investir
// em ações, fundos imobiliários, BDRs e ETFs", and the help page has the
// client type any ticker in the order ticket ("insira o código da ação que
// quer negociar"). No page names a segment, a board or a kind of share it
// does not sell. So the catalogue is the whole B3 cash book: shares and
// units, BDRs of foreign shares and ETFs, Brazilian ETFs (fixed-income
// ones too), and the 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://pagbank.com.br/conta-digital/investimentos/custos-operacionais   (fees)
//   https://pagbank.com.br/conta-digital/investimentos/renda-variavel
//   https://faq.pagbank.com.br/duvida/como-comprar-ou-vender-acoes-atraves-do-aplicativo-pagbank/1579
//
//   node brokers/pagbank/pagbank_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "pagbank-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the PagBank catalogue`);
}
