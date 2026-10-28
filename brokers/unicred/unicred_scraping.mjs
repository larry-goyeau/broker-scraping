// What Unicred sells in shares and exchange-traded funds on B3, through
// its broker ZIIN (Unicred DTVM), with no login. ZIIN prints no list of
// its own. Its fee page charges one regressive per-order tariff on
// "Bovespa (Ações, Opções, Fracionário, ETF, BDR etc.)", from R$ 4,50 an
// order on the Home Broker, and names no segment, board or line it does
// not sell. So the catalogue is B3's whole cash equity book: every
// share, unit, BDR and ETF that trades today (the shared book in
// ../nubank/b3Book.mjs).
//
// Left out: the listed real-estate and other closed-end funds (FII,
// FIAGRO, FIP, FI-Infra), which are funds and not shares or ETFs (ZIIN
// prices them on their own line); options and futures; and what the
// shared book drops (odd and block lots, rights, receipts, warrants,
// lines with no trade in a year, issuers suspended or in liquidation at
// the CVM). The fee page is an Angular app: the tariff text is in its
// script bundle, not in the HTML.
//
//   https://www.unicred.com.br/solucoes/ziin/custos
//   https://www.unicred.com.br/site/ziin_Regras_e_Parametros_de_Atuacao_Unicred_DTVM_versaofinal-timbrado_0225.pdf
//
//   node brokers/unicred/unicred_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "unicred-parsed.json");
