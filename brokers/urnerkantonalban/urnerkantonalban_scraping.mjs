// What Urner Kantonalbank (UKB) sells on the Swiss exchange, with no
// login. UKB trades through e-banking ("Börsentitel kaufen und verkaufen")
// and its advisers, and publishes no list of the titles it offers. Its
// "Wertschriftendepot Plus" lets clients "alle Anlageklassen und
// Wertschriften" hold and trade, and its tariff prices "Aktien,
// strukturierte Produkte aller Art, Optionen" in "Inland" and "Aktienfonds,
// ETF, Anlagestrategiefonds und Immobilienfonds" in "In- und Ausland". So
// the Swiss place is the whole SIX Swiss Exchange book (shares, ETFs,
// listed funds and ETPs, one row per ISIN and trading currency), read by
// ../migros/sixBook.mjs.
//
//   https://www.ukb.ch/private/digital-banking/e-banking
//
// Left out: nothing on UKB's pages narrows the Swiss book. sixBook drops
// the derivatives and bond segments, rights, second trading lines,
// suspended, delisted, never-traded and dormant lines.
//
// Fees (factsheet "Konditionen im Anlagegeschäft": Inland shares 1.10% up
// to CHF 25,000, "Rabatt für Online-Transaktionen 50 %", "Minimumgebühr
// für Online-Transaktionen CHF 40"). The fee page redirects to the PDF:
//   https://www.ukb.ch/anlegen-tarife
//   https://www.ukb.ch/dam/dokumente/private/sparen-und-anlegen/Factsheet-Konditionen-im-Anlagegeschaeft.pdf
//
//   node brokers/urnerkantonalban/urnerkantonalban_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Urner Kantonalbank",
  out: new URL("urnerkantonalban-parsed.json", import.meta.url),
});
