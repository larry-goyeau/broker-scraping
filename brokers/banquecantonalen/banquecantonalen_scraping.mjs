// What Banque Cantonale Neuchâteloise (BCN) sells on the Swiss exchange,
// with no login. BCN trades through BCN-Netbanking and its advisers and
// publishes no list of the titles it offers. Its online trading page
// promises "Un accès direct aux plus importantes places de bourse
// internationales", and its tariff prices "Actions, titres assimilés"
// on "Places suisses" alike. So the Swiss place is the whole SIX Swiss
// Exchange book (shares, ETFs, listed funds and ETPs, one row per ISIN and
// trading currency), read by ../migros/sixBook.mjs. BX Swiss is not read:
// no BCN page names it.
//
//   https://www.bcn.ch/prives/investir/bourse-en-ligne
//   https://www.bcn.ch/e-services/e-banking/banque-en-ligne/bcn-netbanking
//
// Left out: nothing on BCN's pages narrows the Swiss book. sixBook drops
// the derivatives and bond segments, rights, second trading lines,
// suspended, delisted, never-traded and dormant lines.
//
// Fees: brochure "Prestations et tarifs", section Courtages ("Les ordres
// transmis par internet et mobile banking bénéficient d'un rabais de 50%",
// "Minimum CHF 80.- pour les places suisses"). The page is a Frontify
// share; the PDF is BCN_Brochure_Tarifs_A4_070826.pdf.
//   https://bcn.ch/brochure/prestations-et-tarifs
//
//   node brokers/banquecantonalen/banquecantonalen_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Banque Cantonale Neuchâteloise",
  out: new URL("banquecantonalen-parsed.json", import.meta.url),
});
