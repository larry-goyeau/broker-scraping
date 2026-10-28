// What PicPay sells on B3, with no login. PicPay prints no list of its
// own. Its help centre says the products are "Ações nacionais e
// internacionais, incluindo BDRs", "ETFs" and "FIIs", bought in the app
// by searching the asset ("Busque o ativo"), and only on the cash market
// ("O PicPay só permite operações no 'mercado à vista'"). Its cost
// article names no brokerage: the costs are "taxas da B3", income tax and
// the funds' own fees. No page names a segment, a board or a kind of
// share it does not sell. So the catalogue is the whole B3 cash book:
// shares and units, BDRs of foreign shares and ETFs, Brazilian ETFs
// (fixed-income ones too), and the 21Shares crypto ETP BDRs.
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://meajuda.picpay.com/hc/pt-br/articles/52896249054739   (fees)
//   https://meajuda.picpay.com/hc/pt-br/articles/52896035931411   (products)
//   https://meajuda.picpay.com/hc/pt-br/articles/52896181711251   (buying)
//
//   node brokers/picpay/picpay_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const rows = await writeB3Catalogue(import.meta.url, "picpay-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the PicPay catalogue`);
}
