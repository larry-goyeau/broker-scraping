// What Modalmais (Banco Modal's broker, now part of XP Inc.) sells on B3,
// with no login. Modalmais prints no list of its own. Its menu lists
// "Ações na B3", "Ações", "ETFs", "IPO/OPA" and "Opções"; the cost page
// charges "Swing Trade ... Corretagem R$ 0,00" and "Day Trade ...
// Corretagem R$ 0,00" (R$ 50,00 for an order sent through the desk), and
// prices the compulsory close-out "para ações, BDRs, ETFs, FIIs, Opções e
// Termo". No page names a segment, a board or a kind of share it does not
// sell. So the catalogue is the whole B3 cash book: shares and units, BDRs
// of foreign shares and ETFs, Brazilian ETFs (fixed-income ones too), and
// the 21Shares crypto ETP BDRs. broker-list.json gives "B3 São Paulo".
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.modalmais.com.br/custos-modalmais/   (fees)
//   https://www.modalmais.com.br/
//
//   node brokers/modalmais/modalmais_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await pageSays("https://www.modalmais.com.br/custos-modalmais/", [/Swing Trade Taxa Valor Corretagem R\$ 0,00/, /ações, BDRs, ETFs/]);
await pageSays("https://www.modalmais.com.br/", [/Ações na B3/, /ETFs/]);

const rows = await writeB3Catalogue(import.meta.url, "modalmais-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Modalmais catalogue`);
}
