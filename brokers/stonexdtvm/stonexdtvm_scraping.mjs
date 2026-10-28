// What StoneX DTVM (Brazil) sells in shares and exchange-traded funds on
// B3, with no login. StoneX prints no list of its own. Its rules say "A
// STONEX acatará ordens de seus Clientes para operações nos mercados: à
// vista, a termo, de opções, futuros, swap, renda fixa e aluguel de
// ações", and its client information page prices B3 shares with the
// "Tabela de Corretagem – Ações B3" (the Bovespa table). Nothing on the
// cash market is carved out, so the catalogue is B3's whole cash equity
// book: every share, unit, BDR and ETF that trades today (the shared
// book in ../nubank/b3Book.mjs).
//
// Left out: the listed real-estate and other closed-end funds (FII,
// FIAGRO...), which are funds and not shares or ETFs; options, forwards
// and futures; and what the shared book drops (odd and block lots,
// rights, receipts, warrants, lines with no trade in a year, issuers
// suspended or in liquidation at the CVM). The fee page sits behind a
// Cloudflare check that a plain request does not pass.
//
//   https://www.stonex.com/pt-br/empresas/dtvm/informacoes-ao-cliente/
//   https://www.filesandimages.com/Brand/StoneXBrasil/RPA_OperatingRulesandParameters_v12.pdf
//
//   node brokers/stonexdtvm/stonexdtvm_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "stonexdtvm-parsed.json");
