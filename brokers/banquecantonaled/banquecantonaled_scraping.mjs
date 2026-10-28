// What Banque Cantonale du Jura (BCJ) sells on the Swiss exchange, with
// no login. BCJ trades through BCJ-Net, mobile banking and its advisers,
// and publishes no list of the titles it offers. Its online trading page
// promises "Accès direct : accédez aux principales places boursières
// internationales", and its tariff prices "Actions | Obligations | Fonds |
// Produit structurés | Warrants" on the "Marché suisse" alike. So the
// Swiss place is the whole SIX Swiss Exchange book (shares, ETFs, listed
// funds and ETPs, one row per ISIN and trading currency), read by
// ../migros/sixBook.mjs.
//
//   https://www.bcj.ch/fr/Particuliers/Produits-d-investissement/Bourse-en-ligne/Bourse-en-ligne.html
//
// Left out: nothing on BCJ's pages narrows the Swiss book. The free first
// purchase of up to 10 BCJ shares is adviser-only ("pas par BCJ-Net ou
// mobile banking"); that is a fee note, not a removal. sixBook drops the
// derivatives and bond segments, rights, second trading lines, suspended,
// delisted, never-traded and dormant lines.
//
// Fees ("Tarif des prestations financières", valid from 1 October 2025:
// Marché suisse 1.00% up to CHF 50,000, "Courtage minimum CHF 80.–",
// "Courtage BCJ-Net 50% du tarif standard"):
//   https://www.bcj.ch/Htdocs/Files/v/88cbf8c7140727ac6270d4899f9fba9e4c682ed1604dcab19190d9d34cae2845.pdf/250826_BCJ_tarif_prestations_financieres_2025.pdf
//
//   node brokers/banquecantonaled/banquecantonaled_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Banque Cantonale du Jura",
  out: new URL("banquecantonaled-parsed.json", import.meta.url),
});
