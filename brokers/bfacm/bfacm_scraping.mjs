// What BFA CM Broker (the web trading platform of BFA Capital Markets, the
// securities house of Banco de Fomento Angola) sells in shares, with no
// login. Its only place is BODIVA, the Luanda exchange: the platform
// "permite realizar operações nos mercados BODIVA, assim como negociar
// acções, títulos do tesouro, fundos de investimento" (broker page), and
// the FAQ lists "Negociação de instrumentos no mercado secundário" with no
// board, segment or share left out. Neither page, the custody account page
// nor the tariff names an exception, so the catalogue is every share with a
// live book at BODIVA (../bfacm/bodivaBook.mjs): seven companies today, BFA's
// own shares included, all in kwanzas (AOA). Shares with no trade at all or
// none for 60 days are dropped as suspended or never traded by the module.
// Left out: treasury and private bonds (debt), and the MBUP fund units
// (closed-end funds with a maturity date, not ETFs, as in the NEPSE
// catalogues). Angola lists no ETF, ETN or ETC.
//
// Fees: the tariff in force from 16/01/2026, "1.3.2. Negociação em Mercado
// Secundário ... Acções 0,4950%" plus 14% IVA, account upkeep Kz 4 200 a
// half-year for individuals.
//
//   https://www.bfa.ao/pt/bfa-capital-markets/servicos/bfa-cm-broker/
//   https://www.bfa.ao/pt/o-bfa/perguntas-frequentes/?category=29402&term=
//   https://www.bfa.ao/pt/bfa-capital-markets/contas/conta-custodia/
//   https://www.bfa.ao/media/8123/precario-sdvm-bfa-cm.pdf   (tariff)
//   https://www.bodiva.ao/estatistica
//
//   node brokers/bfacm/bfacm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bodivaBook } from "./bodivaBook.mjs";
import fs from "node:fs";

const rows = await bodivaBook();
// The book must keep the big names; a broken read fails here.
for (const ticker of ["BAIAAAAA", "BFAAAAAA", "UNTLAAAA"]) {
  if (!rows.some((row) => row.ticker === ticker && /^AO/.test(row.isin))) throw new Error(`${ticker} is missing from the BFA CM Broker catalogue`);
}

fs.writeFileSync(new URL("bfacm-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({ "BODIVA STOCK": rows.length, dropped: bodivaBook.dropped });
