// What S&C Inversiones S.A. (Córdoba; ALyC y AN Propio CNV, "Agente Miembro
// de Bolsas y Mercados Argentinos S.A. (BYMA)", also A3 and MAV) sells in
// shares and ETFs, with no login. Clients trade through its web app
// (app.sycinversiones.com, also on the App Store and Google Play) and a DMA
// platform. Its home page sells "Acciones Invertí en acciones locales
// (BYMA) o del exterior (NYSE y otras bolsas internacionales)" and
// "CEDEARs". It publishes no list and names no restriction.
//
//   https://sycinversiones.com/
//
// So the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs) plus the whole US exchange book
// (../wellstrade/usBook.mjs), through ../bullmarket/bymaUs.mjs. "NYSE y otras
// bolsas internacionales" names NYSE as an example of others, so by the
// owner's rule the US place is the whole country (all US exchanges, one NBBO
// market); OTC is not named and is not added. broker-list.json gives BYMA
// and the New York Stock Exchange, with no restriction; whether the foreign
// orders go through the app or the desk, no page says they are offline
// ("Mandatos en el Exterior" in the tariff), so they are kept. Cable (C)
// lines on BYMA are kept: the tariff prices "Transferencias Bancarias
// emitidas en USD exterior" and the markets page quotes clients the cable
// rates ("Dólar a cable", "Cable a pesos").
//
// Fees ("Aranceles y Costos Administrativos", 20/11/2023, Renta Variable):
// "Contado $ 50 2,00%" (minimum, maximum); "Mandatos en el Exterior USD 50
// 5,00%":
//   https://sycinversiones.com/Aranceles_y_Costos%20Administrativos_20112023.pdf
//
//   node brokers/scinversiones/scinversiones_scraping.mjs

import { bymaUs, evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://sycinversiones.com/", [/acciones locales \(BYMA\) o del exterior \(NYSE y otras bolsas internacionales\)/]);
await evidence("https://sycinversiones.com/mercados/", [/D[oó]lar a cable/]);
await pdf("https://sycinversiones.com/Aranceles_y_Costos%20Administrativos_20112023.pdf");

await bymaUs("S&C Inversiones", new URL("scinversiones-parsed.json", import.meta.url), { cable: true });
