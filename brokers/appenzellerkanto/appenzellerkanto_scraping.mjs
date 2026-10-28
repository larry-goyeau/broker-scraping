// What Appenzeller Kantonalbank (APPKB) sells on the Swiss exchange, with
// no login. APPKB trades through e-banking ("Börsentitel kaufen und
// verkaufen") and its advisers and publishes no list of the titles it
// offers. Its tariff prices "Aktien Schweiz, Aktien ETF's Schweiz und
// Strukturierte Produkte" together, next to "Aktien Ausland". So the
// Swiss place is the whole SIX Swiss Exchange book (shares, ETFs, listed
// funds and ETPs, one row per ISIN and trading currency), read by
// ../migros/sixBook.mjs.
//
//   https://www.appkb.ch/private/zahlen/e-banking
//   https://www.appkb.ch/private/anlegen/anlageformen-direktanlagen
//
// Left out: nothing on APPKB's pages narrows the Swiss book. Its
// execution-only page asks the reader to confirm a Swiss residence and
// that they are not a US person; that depends on the client, so it is a
// remark, not a removal. sixBook drops the derivatives and bond segments,
// rights, second trading lines, suspended, delisted, never-traded and
// dormant lines.
//
// Fees ("Aktien Schweiz ... bis CHF 100'000 0.90 %", "Minimum pro Ticket
// CHF 80", "Für E-Banking-Transaktionen wird 50 % Rabatt auf die
// ordentlichen Tarife gewährt"):
//   https://www.appkb.ch/private/anlegen/konditionen-courtagen
//
//   node brokers/appenzellerkanto/appenzellerkanto_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Appenzeller Kantonalbank",
  out: new URL("appenzellerkanto-parsed.json", import.meta.url),
});
