// What Itaú íon sells on B3, with no login. Itaú prints no list of its
// own. Its cost page gives "AÇÕES, OPÇÕES, ETFs E BDRs Taxa zero de
// corretagem" for its clients, "exclusivamente via canais digitais da Itaú
// Corretora e app íon Itaú". The íon platform page sends the client to a
// shelf of every asset of each kind ("uma lista com todos os ativos
// disponíveis do tipo escolhido": ações, fundos imobiliários, ETFs, BDRs).
// No page names a segment, a board or a kind of share it does not sell.
// So the catalogue is the whole B3 cash book: shares and units, BDRs of
// foreign shares and ETFs, Brazilian ETFs (fixed-income ones too), and the
// 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
// meu.itau/custosoperacionais (the link on ion.itau) redirects to an
// itau.com.br page that refuses scripts; the Itaú Corretora copy below is
// public.
//
//   https://www.itaucorretora.com.br/explore/custosoperacionais.aspx   (fees)
//   https://meu.itau/custosoperacionais
//   https://www.ion.itau/
//   https://www.ion.itau/informacoes-sobre-a-plataforma-ion/
//
//   node brokers/itauion/itauion_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "itauion-parsed.json");
for (const ticker of ["PETR4", "ITUB4", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Itaú íon catalogue`);
}
