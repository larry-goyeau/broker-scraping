// What Sogecapital Bourse sells in shares, with no login. Sogecapital
// Bourse was the Casablanca broker of Société Générale Maroc; the bank is
// now Saham Bank (renamed in 2025) and the broker Saham Capital Bourse. Its
// own site, sogecapitalbourse.com, no longer answers (no DNS), so the
// bank's pages stand in. The online service is Saham Bourse: "vous pouvez
// accéder au marché boursier et gérer votre portefeuille en toute
// autonomie". The advisers of Saham Capital Bourse work on "l'ensemble des
// valeurs du marché boursier". The fee sheet prices one line, "Commission
// sur achat / vente action 0,9%". There is no list and no exclusion on
// these pages, so the book is every share of the Casablanca exchange.
//
// Left out: shares the exchange has suspended (casablancaBook.mjs reads the
// exchange's live status; today SAMIR, Delattre Levivier Maroc, Diac Salaf,
// halted for years), rights, bonds and funds (OPCVM are not exchange-traded).
// Casablanca lists no ETF. Every line trades in MAD on XCAS.
//
//   https://www.sahambank.com/produit/execution-de-vos-ordres-de-bourse-en-ligne/
//   https://www.sahambank.com/produit/conseils-en-investissements-boursiers/
//   https://www.sahambank.com/wp-content/uploads/2026/02/Affiche-tarifaire-JAN-2026-Saham-Bank.pdf (fees)
//   https://www.casablanca-bourse.com/marches-produits/actions
//   https://www.casablanca-bourse.com/live-market/actions
//   https://www.casablanca-bourse.com/live-market/etf
//
//   node brokers/sogecapitalbours/sogecapitalbours_scraping.mjs

import { writeCasablancaCatalogue } from "../valoris/casablancaBook.mjs";

await writeCasablancaCatalogue(import.meta.url, "sogecapitalbours-parsed.json");
