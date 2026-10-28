// What Monte Bravo Corretora (São Paulo) sells on B3, with no login. Its
// cost document says it is a "Participante de Negócio Aberta (PNA)" with
// XP Investimentos as clearing partner, and prices "Ações e BDRs" (self
// service: swing trade R$ 4,90, day trade R$ 2,90, or R$ 0,00 under the
// RLP) and, in its FAQ, "Ações / BDR / ETF" at the same rates; listed
// property funds pay no brokerage. The broker prints no security list of
// its own and names no board, segment or line it does not trade, so the
// book is the whole B3 cash equity book: shares, units, BDRs of foreign
// shares, Brazilian ETFs (equity and fixed income), BDRs of foreign ETFs
// and the 21Shares crypto ETP BDRs, read by ../nubank/b3Book.mjs (what it
// keeps and leaves out, suspended and never-traded lines included, is
// written there). Listed property funds (FII) are sold too but are funds,
// not shares or ETFs, so they stay out like in the other B3 books.
// Options, forwards, rights, warrants and subscription receipts stay
// out. One place, B3 (MIC BVMF), everything in reais.
//
//   https://www.montebravo.com.br/wp-content/uploads/2026/09/Custos_Monte_Bravo.pdf   (tariff)
//
//   node brokers/montebravo/montebravo_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "montebravo-parsed.json");
