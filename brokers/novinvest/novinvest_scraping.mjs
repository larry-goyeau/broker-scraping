// What NovInvest sells in shares and exchange-traded funds on B3, with
// no login. NovInvest prints no list of its own. Its cash market page
// says "Para investir em Ações negociadas na B3 é necessário
// inicialmente abrir uma conta na corretora", and its fee page prices
// "Corretagem – Ações e Opções" at "R$ 12,00, por ordem enviada" on the
// Home Broker, with no product carved out. So the catalogue is B3's
// whole cash equity book: every share, unit, BDR and ETF that trades
// today (the shared book in ../nubank/b3Book.mjs). NovInvest names no
// segment, board or line it does not sell.
//
// Left out: the listed real-estate and other closed-end funds (FII,
// FIAGRO...), which are funds and not shares or ETFs; options, forwards
// and futures; and what the shared book drops (odd and block lots,
// rights, receipts, warrants, lines with no trade in a year, issuers
// suspended or in liquidation at the CVM).
//
//   https://novinvest.com.br/mercado-a-vista/
//   https://novinvest.com.br/custos-operacionais/
//
//   node brokers/novinvest/novinvest_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "novinvest-parsed.json");
