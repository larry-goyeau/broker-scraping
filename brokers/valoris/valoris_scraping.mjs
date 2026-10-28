// What Valoris Securities sells in shares, with no login. Valoris is a
// Casablanca broker (societe de bourse); its only place is the Casablanca
// exchange. Its trades page names "Négociation de tout type de transactions
// à la bourse de Casablanca", and its online-trading agreement (Valoris
// Bourse Direct) covers "Toute opération d'achat ou de vente d'actions ou de
// souscription de rachat OPCVM". There is no Valoris list and no exclusion
// on its pages, so the book is every share of the exchange. The agreement
// adds that some orders may not be taken online and go by phone: that is
// how an order travels, not a removal.
//
// Left out: shares the exchange has suspended (casablancaBook.mjs reads the
// exchange's live status; today SAMIR, Delattre Levivier Maroc, Diac Salaf,
// halted for years), rights, bonds and funds (OPCVM are not exchange-traded).
// Casablanca lists no ETF. Every line trades in MAD on XCAS.
//
//   https://www.valorisgroup.ma/?Id=804&lang=fr               (trades)
//   https://www.valorisgroup.ma/upload/vs/BEL/Convention_BEL.pdf  (online agreement)
//   https://www.valorisgroup.ma/upload/vs/PP/Grille_tarifaire.pdf (fees)
//   https://www.casablanca-bourse.com/marches-produits/actions
//   https://www.casablanca-bourse.com/live-market/actions
//   https://www.casablanca-bourse.com/live-market/etf
//
//   node brokers/valoris/valoris_scraping.mjs

import { writeCasablancaCatalogue } from "./casablancaBook.mjs";

await writeCasablancaCatalogue(import.meta.url, "valoris-parsed.json");
