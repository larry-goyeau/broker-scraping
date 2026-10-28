// What Trigon Dom Maklerski sells.
//
// Trigon is a Kraków broker and a direct member of the Warsaw exchange. Its
// account page offers "bezpośredni dostęp do Giełdy Papierów Wartościowych"
// and its pages name no foreign market (the terms only allow for one).
// The catalogue is the whole Warsaw book from ./gpwBook.mjs:
//
//   - the GPW main market. The order execution policy names the "rynek
//     podstawowy i rynek równoległy" first among its venues;
//   - NewConnect. The same policy names the domestic alternative trading
//     systems next, and the 2025 retail best-execution report shows
//     NewConnect (MIC XNCO) as the second venue for shares;
//   - GlobalConnect. The 2025 retail report also lists "Global Connect –
//     rynek akcji spółek zagranicznych" (MIC XGLO) among the venues where
//     Trigon executed client share orders, so it is in;
//   - the GPW ETF board (ETFs, ETNs, the ETC). The tariff's share line
//     covers "jednostek indeksowych ... oraz pozostałych papierów
//     wartościowych innych niż obligacje", and nothing on Trigon's pages
//     leaves ETFs out.
//
// The module drops suspended, withdrawn, never-traded and wound-up lines.
// Rights, warrants, futures, options, bonds (Catalyst, BondSpot) and fund
// certificates are not in this catalogue, as in the other scrapers.
//
// Shares the GPW marks "REGS" or "S144" (Regulation S, Rule 144A) need a
// statement that the buyer is not a US person. That depends on the client,
// so it is a remark and no line is removed for it.
//
// Fees: the "Tabela prowizji i opłat" in force since 1 May 2021, linked
// from the regulations page: 0.39% online, at least 6 zł, for shares.
//
//   https://www.trigon.pl/dom-maklerski/zaloz-rachunek
//   https://www.trigon.pl/dom-maklerski/klient-indywidualny/regulacje
//   https://www.trigon.pl/dom-maklerski/klient-indywidualny/regulacje/mifid-ii
//   https://www.trigon.pl/dom-maklerski/klient-indywidualny/regulacje/regulacja-s-osoby-amerykanskie
//   https://cdn.prod.website-files.com/665ef65b5b3c9f72b25a006f/694a5a9483c14a0bd685d729_Polityka%20wykonywania%20zlece%C5%84%20oraz%20poltyka%20dzia%C5%82ania%20w%20najlepiej%20poj%C4%99tym%20interesie%20klienta.pdf
//   https://cdn.prod.website-files.com/665ef65b5b3c9f72b25a006f/69ea08d12c0d7567b0e1511f_RAPORT%20BEST%20EXECUTION%202025%20KLIENT%20DETALICZNY.pdf
//   https://cdn.prod.website-files.com/665ef65b5b3c9f72b25a006f/67e132b4d34a31e7956eb628_tpio_20210501%20(1).pdf
//
//   node brokers/trigondommaklers/trigondommaklers_scraping.mjs

import { writeGpwCatalogue } from "./gpwBook.mjs";

await writeGpwCatalogue(import.meta.url, "trigondommaklers-parsed.json", {
  newConnect: true,
  etps: true,
  globalConnect: true,
});
