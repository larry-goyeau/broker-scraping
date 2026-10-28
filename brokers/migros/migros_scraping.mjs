// What Migros Bank sells on the Swiss exchange, with no login. The bank
// trades for its custody account holders through e-banking and its
// advisers, and publishes no list of the titles it offers. Its custody
// account page says the account holds "Aktien, Anleihen, Fondsanteile,
// ETFs (Exchange Traded Funds) und andere Finanzinstrumente", and its
// product sheet says "Wertschriftentransaktionen sind grundsätzlich
// weltweit möglich". The tariff prices shares and ETFs the same way
// ("Aktien, Exchange-Traded Funds (ETFs), Anlagefonds, ... Warrants")
// with a surcharge for "Börsenplatz Schweiz". So the Swiss place is the
// whole SIX Swiss Exchange book (shares, ETFs, listed funds and ETPs, one
// row per ISIN and trading currency), read by ../migros/sixBook.mjs.
//
//   https://www.migrosbank.ch/de/privatpersonen/anlegen/anlageloesungen/wertschriftendepot.html
//   https://www.migrosbank.ch/dam/jcr:b698d4dd-8371-44e5-88ce-62ef2a3ee5ec/Produktinfoblatt%20Depot.2026-10-23-06-02-34.pdf
//
// Left out: nothing on the bank's own pages narrows the Swiss book. The
// tariff's "keine «restricted shares»" is about restricted (unregistered)
// US shares, not a SIX segment. The product sheet warns that "Selten
// gehandelte Wertschriften sind teilweise nicht online handelbar", which
// is an e-banking limit on some thin lines (they stay orderable through
// the adviser), so it is a remark, not a removal. sixBook drops the
// derivatives and bond segments, rights, second trading lines, suspended,
// delisted, never-traded and dormant lines.
//
// Fees ("Kauf/Verkauf über E-Banking CHF 40", surcharge 0.020% from
// CHF 100,000 on the Swiss exchange):
//   https://www.migrosbank.ch/dam/jcr:f49f70eb-c052-49ff-92fc-a06630032018/preise_fuer_dienstleistungen_de.2026-06-01-13-26-09.pdf
//
//   node brokers/migros/migros_scraping.mjs

import { writeSixCatalogue } from "./sixBook.mjs";

await writeSixCatalogue({ broker: "Migros Bank", out: new URL("migros-parsed.json", import.meta.url) });
