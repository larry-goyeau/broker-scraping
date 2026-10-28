// What Galapagos Capital (Galapagos Capital DTVM, São Paulo) sells on B3,
// with no login. Its investments page lists, under "Renda Variável":
// "Ações", "BDR", "FII", "Opções" and "ETF", and its cost table prices
// "Ações e BDRs" (home broker swing trade R$4,65 per order, day trade
// R$2,75, desk orders on the Bovespa table) and "ETF's" (R$ 0,00). The
// broker prints no security list of its own and names no board, segment
// or line it does not trade; its rules (Regras e Parâmetros de Atuação)
// cover every B3 market ("operações nos mercados da B3"). So the book is
// the whole B3 cash equity book: shares, units, BDRs of foreign shares,
// Brazilian ETFs (equity and fixed income), BDRs of foreign ETFs and the
// 21Shares crypto ETP BDRs, read by ../nubank/b3Book.mjs (what it keeps
// and leaves out, suspended and never-traded lines included, is written
// there). Listed property funds (FII) are sold too but are funds, not
// shares or ETFs, so they stay out like in the other B3 books. Options,
// rights, warrants and subscription receipts stay out. One place, B3
// (MIC BVMF), everything in reais.
//
//   https://galapagoscapital.com/investimentos   (products and tariff)
//   https://galapagoscapital.com/wp-content/uploads/2024/10/GalapagosDTVM_RPA-atualizacoes-Revisado-Set-24-1.pdf
//
//   node brokers/galapagos/galapagos_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "galapagos-parsed.json");
