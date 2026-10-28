// What Bull Market Brokers (Bull Market Brokers S.A., ALyC Propio n° 247
// CNV) sells in shares and exchange-traded funds online, with no login. One
// account trades Buenos Aires and the US: the renta variable menu lists
// "Acciones Argentinas", "CEDEARs", "Acciones US", "ADRs" and "ETFs", and
// "Dólar MEP" and "Dólar CCL". It publishes no list of either place.
//
// Buenos Aires: BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C)
// lines of every local share and CEDEAR (CEDEARs of US ETFs included) that
// BYMA quotes and that trades. Cable lines are kept: the broker sells
// "Dólar CCL" and funds US trades with it ("Moneda de inversión : Dólar
// Cable (CCL)"). Block lines, closed-end funds, bond CEDEARs, rights,
// warrants and dormant or delisted lines are left out by the shared module.
//
// United States: the page names the exchanges and states a number:
//   https://bullmarket.com.ar/inversion/renta-variable/acciones-us/
//   "te damos acceso directo a las bolsas de Nueva York (NYSE y NASDAQ)",
//   "Mercados : NYSE (New York Stock Exchange) y NASDAQ (Tecnológicas)",
//   "Accede a más de 5.000 acciones y ETFs".
//   https://bullmarket.com.ar/inversion/renta-variable/etfs/
//   "Mercado : NYSE (New York Stock Exchange) y NASDAQ.", "En Bull Market
//   tienes acceso al universo completo", with SPY, VOO, GLD, EEM, XLE and
//   XLF among the ETFs it sells.
// Those ETFs list on NYSE Arca, so "NYSE" there is the NYSE group's equity
// exchanges for listed funds too: the US catalogue is the US exchange book
// of the day (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds,
// closed-end funds, ETFs and ETNs, less open trade halts, warrants, rights,
// units, when-issued lines and listed notes) on NYSE, NYSE Arca and Nasdaq,
// where the owner's rule keeps only the exchanges a broker names. NYSE
// American, Cboe BZX, the Texas Stock Exchange, NYSE Texas and IEX lines are
// left out. Then, by the owner's rule for a stated number, the 5,000 most
// traded of those titles are kept (./usTop.mjs: FINRA's daily volumes over
// ten days times the last price). The US is one NBBO market: one row per
// title, in dollars. broker-list.json names Nasdaq and the New York Stock
// Exchange with BYMA; NYSE Arca is the third.
//
// Fees ("Tabla de Aranceles y Comisiones", May 2026, online self-directed
// trading): "Acciones y CEDEARs 0,50%" (Digital Account) and "Mercado
// Internacional ... Acciones, ADRs y ETFs 0,50%", no minimum; the aranceles
// page: "Acciones, CEDEARs, Bonos, ONs, Opciones 0,50% Sin comisiones
// mínimas":
//   https://bullmarket.com.ar/aranceles/
//   https://s3-sa-east-1.amazonaws.com/bmb.s3.webbucket/System/Files/Tarifario.pdf
//
//   node brokers/bullmarket/bullmarket_scraping.mjs

import { bymaUs, evidence, pdf } from "./bymaUs.mjs";

await evidence("https://bullmarket.com.ar/inversion/renta-variable/acciones-us/", [
  /NYSE y NASDAQ/,
  /más de 5\.000 acciones y ETFs/i,
  /Dólar Cable \(CCL\)/,
]);
await evidence("https://bullmarket.com.ar/inversion/renta-variable/etfs/", [/universo completo/i, /\bGLD\b/]);
await evidence("https://bullmarket.com.ar/aranceles/", [/Acciones, CEDEARs, Bonos, ONs, Opciones\s*0,50%/i, /Tarifario\.pdf/]);
await pdf("https://s3-sa-east-1.amazonaws.com/bmb.s3.webbucket/System/Files/Tarifario.pdf");

await bymaUs("Bull Market Brokers", new URL("bullmarket-parsed.json", import.meta.url), {
  cable: true,
  mics: ["XNYS", "ARCX", "XNAS"],
  usTop: 5000,
});
