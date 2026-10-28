// What RB Investimentos sells in shares and exchange-traded funds on
// B3, with no login. RB prints no list of its own. Its fee page prices
// "Renda Variável - Para Ações, ETF e FII" at "Via HB: R$ 14,90 por
// ordem" and by the Bovespa table through the desk, and its rules
// ("Regras e Parâmetros de Atuação") take orders on the B3 markets with
// no product carved out. So the catalogue is B3's whole cash equity
// book: every share, unit, BDR and ETF that trades today (the shared
// book in ../nubank/b3Book.mjs). A BDR trades on the same cash market
// as a share; RB names no segment, board or line it does not sell.
//
// Left out: the listed real-estate and other closed-end funds (FII,
// FIAGRO...), which are funds and not shares or ETFs; options and
// futures; and what the shared book drops (odd and block lots, rights,
// receipts, warrants, lines with no trade in a year, issuers suspended
// or in liquidation at the CVM).
//
//   https://www.rbinvestimentos.com/custos-operacionais/
//   https://www.rbinvestimentos.com/wp-content/uploads/2026/09/RB_Investimentos_Regras_e_Parametros_de_Atuacao_29092026.pdf
//   https://www.rbinvestimentos.com/wp-content/uploads/2024/05/manual-do-usuario-hb.pdf
//
//   node brokers/rbinvestimentos/rbinvestimentos_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "rbinvestimentos-parsed.json");
