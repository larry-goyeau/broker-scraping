// What Planner Corretora sells in shares and exchange-traded funds on
// B3, with no login. Planner prints no list of its own. Its stock market
// page says "Acesse a B3 e negocie em tempo real" and offers Ações,
// Opções, Futuros, ETFs, BDRs and FIIs; of the BDRs it says "Se você
// sabe negociar uma ação, você também vai saber negociar um BDR". So
// the catalogue is B3's whole cash equity book: every share, unit, BDR
// and ETF that trades today (the shared book in ../nubank/b3Book.mjs).
// Planner names no segment, board or line it does not sell.
//
// Left out: the listed real-estate and other closed-end funds (FII,
// FIAGRO...), which are funds and not shares or ETFs; options and
// futures; and what the shared book drops (odd and block lots, rights,
// receipts, warrants, lines with no trade in a year, issuers suspended
// or in liquidation at the CVM).
//
// Fees: "A Planner segue a Tabela Bovespa como política de corretagem,
// com o mínimo de R$ 20,00/dia de corretagem nota."
//
//   https://www.planner.com.br/investimentos-para-voce/bolsa-de-valores/
//   https://www.planner.com.br/tarifas-custos-operacionais/
//
//   node brokers/plannercorretora/plannercorretora_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "plannercorretora-parsed.json");
