// What Sita Corretora (Sita Sociedade CCVM, Belo Horizonte) sells on B3,
// with no login. Its home broker page offers "Compra e venda de ações na
// B3", its services page "Operação de compra e venda de ações na
// BOVESPA", and its menu has "Como investir em ações" and "Como investir
// em Etfs" (both pointing to B3's own share and ETF pages). The cost page
// prints the Bovespa brokerage table (R$ 2,70 fixed up to R$ 498,62, then
// 2% / 1,5% / 1% / 0,5%, minimum R$ 10,00). The broker prints no security
// list of its own and names no board, segment or line it does not trade,
// so the book is the whole B3 cash equity book: shares, units, BDRs of
// foreign shares, Brazilian ETFs (equity and fixed income), BDRs of
// foreign ETFs and the 21Shares crypto ETP BDRs, read by
// ../nubank/b3Book.mjs (what it keeps and leaves out, suspended and
// never-traded lines included, is written there). Listed property funds,
// options, rights, warrants and subscription receipts stay out. One
// place, B3 (MIC BVMF), everything in reais.
//
//   https://sita.com.br/sita/custos/   (tariff)
//   https://sita.com.br/sita/sobre-o-home-broker/
//   https://sita.com.br/sita/servicos/
//
//   node brokers/sitacorretora/sitacorretora_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "sitacorretora-parsed.json");
