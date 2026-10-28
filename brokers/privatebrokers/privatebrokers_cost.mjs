// What one round trip costs at Private Brokers (a trading name of HABERL
// Wealth Management, o.c.p., a.s., Bratislava, licensed by the National Bank
// of Slovakia): buy n shares at price p, sell them back at once, on the
// platform, in dollars. US-listed shares and ETFs (fractions for US shares).
//
// Pages read 2026-10-26:
//   https://www.privatebrokers.eu/poplatky-a-cennik/
//   https://www.privatebrokers.eu/wp-content/uploads/2026/01/PB-Cennik_02_2026.pdf
//     ("Tento sadzobník poplatkov je platný od 3. 2. 2026")
//   https://www.privatebrokers.eu/faq/
//
//   Akcie/ETF            "0,5% z hodnoty transakcie, min. 3 USD/EUR/CHF"
//                        ("Nákup 0,5 %", "Predaj 0,5 %": buy and sell)
//   Konverzia            "Zadarmo" (the badge on the fee page); FAQ: "Nákupy
//                        na burze sa totiž vykonávajú za stredový kurz banky,
//                        a preto nedochádza k žiadnej konverzii meny"
//   account, custody     "Účet je vedený zadarmo."
//   withdrawal           30 EUR under 300 EUR, else 0: not on an order
//   SEC / TAF / CAT      not printed: 0 (owner's rule)
//
// Formula: book (quoted NBBO) + max(0.5% × amount, 3 USD) × 2.
// The minimum is in the account's currency; a dollar line takes 3 USD.
//
// Routing: no page names a US dealer, so the book is the quoted NBBO.
//
// Cash: the client picks the account currency (USD, EUR or CHF, the three
// currencies of the minimum) at opening (FAQ "Kde si vo svojom účte zmením
// menu?"), and conversion is free anyway: no FX in the figure or the remark.
//
//   node brokers/privatebrokers/privatebrokers_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/privatebrokers/privatebrokers_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const RATE = 0.005;
const MIN_USD = 3;

const SCHEDULE = {
  broker: "Private Brokers",
  folder: "privatebrokers",
  catalogueUrl: new URL("privatebrokers-parsed.json", import.meta.url),
  url: "https://www.privatebrokers.eu/poplatky-a-cennik/",
  pdf: "https://www.privatebrokers.eu/wp-content/uploads/2026/01/PB-Cennik_02_2026.pdf",
  readOn: "2026-10-26",
  entity: "HABERL Wealth Management, o.c.p., a.s. (Private Brokers)",
  rule606: null,
  cash: "USD",
  deposits: ["USD", "EUR", "CHF"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    if (ctx.notionalUsd == null) return null;
    const leg = Math.max(RATE * ctx.notionalUsd, MIN_USD);
    return { buy: leg, sell: leg, note: `max(0,5 % ; 3 USD) = ${leg.toFixed(2)} $ à l'achat et à la vente` };
  },
  levies: { sec: false, taf: false, cat: false },
  remark: "",
  basis:
    "sadzobník Private Brokers valable dès le 2026-02-03, relu le 2026-10-26 : « Akcie/ETF 0,5% z hodnoty transakcie, " +
    "min. 3 USD/EUR/CHF », à l'achat comme à la vente",
  notes: [
    "conversion « Zadarmo » au cours moyen de la banque (FAQ) : aucun change",
    "aucun courtier US nommé : NBBO coté",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
