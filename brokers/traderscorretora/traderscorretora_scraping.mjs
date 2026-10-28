// What Traders Corretora sells in shares and exchange-traded funds, with
// no login. Traders DTVM (Traders Club, ticker TRAD3) trades on B3 through
// Terra Investimentos. It prints no list of its own. Its variable-income
// page names "Ações", "BDRs", "ETFs", "Fundos Imobiliários", options and
// futures, all on B3. So the catalogue is the whole cash market of B3:
// Brazilian shares and units, the BDRs of foreign shares and ETFs, and the
// Brazilian ETFs. A BDR is the B3 certificate in BRL, not the listing
// abroad.
//
// Left out: listed property and other closed-end funds (FIIs, typed FUND,
// out as in the other B3 catalogues), options, futures, rights, warrants,
// receipts, indexes, odd and block lots, and the suspended, cancelled,
// bankrupt or never-traded lines that the shared B3 book drops.
//
// Fees: "Bovespa - R$ 1,99 por ordem executada" (R$ 30,00 for an order
// closed by the desk), in the FAQ "Qual a corretagem da Traders?".
//   https://traders.com.br/investimentos/renda-variavel
//
//   node brokers/traderscorretora/traderscorretora_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "traderscorretora-parsed.json");
