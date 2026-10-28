// What Guru sells in shares and exchange-traded funds, with no login.
// Guru is a Brazilian app that routes orders to B3 through its partner
// broker, Genial Investimentos ("Corretora homologada"). It prints no list
// of its own. The home page says "Compre e venda ações, FIIs, BDRs ... sem
// corretagem", and the FAQ says the app shows "as ações que compõe a
// Bovespa, ETF's ... e os FII's". So the catalogue is the whole cash
// market of B3: Brazilian shares and units, the BDRs of foreign shares and
// ETFs, and the Brazilian ETFs (no page excludes ETFs). A BDR is the B3
// certificate in BRL, not the listing abroad.
//
// Left out: listed property and other closed-end funds (FIIs, typed FUND,
// out as in the other B3 catalogues), rights, warrants, receipts, indexes,
// odd and block lots, and the suspended, cancelled, bankrupt or
// never-traded lines that the shared B3 book drops.
//
// Fees: no brokerage on shares, FIIs and BDRs ("sem corretagem").
//   https://guru.com.vc/
//   https://guru.com.vc/faq/
//
//   node brokers/gurubr/gurubr_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "gurubr-parsed.json");
