// What Genial Investimentos (Genial Investimentos CVM S.A.) sells in shares
// and exchange-traded funds, with no login. Genial prints no list.
//
// B3. The cost page ("Tabela vigente a partir do pregão de 01/06/2026"),
// Bovespa, Swing Trade, Sem RLP / Com RLP ativo: "Ações Lote Padrão R$ 2,99
// / R$ 0,99", "Ações Fracionário R$ 0,99", "BDR R$ 2,99 / R$ 0,99", "ETF de
// Renda Variável ZERO", "DEB, CRI, CRA, FIDC e ETF de Renda Fixa 0,05% do
// volume operado"; orders through the desk "0,50% + R$ 25,21 | Mínimo de R$
// 40,00". The product menu lists Ações, BDRs, ETFs, Fundos Imobiliários and
// Fiagros. No page names a segment, a board or a kind of B3 share it does
// not sell, so the catalogue is the whole B3 cash book read by
// ../nubank/b3Book.mjs: shares and units, BDRs of foreign shares and ETFs,
// Brazilian ETFs (fixed-income ones too), the 21Shares crypto ETP BDRs.
// Left out there: listed real-estate and other closed-end funds (FII,
// FIAGRO, FIP, FIDC; not shares or ETFs), odd and block lots, receipts,
// rights, warrants, and lines that are suspended, delisted, in liquidation
// or have not traded in twelve months.
//
// BEE4. The same page prices "Mercado BEE4 ... Ações tokenizadas de PMEs
// ZERO" (a promotion "pelo prazo de 3 (três) meses a partir da data de
// 05/09/2024"), and broker-list.json gives BEE4 as Genial's second place.
// BEE4 is an organised over-the-counter market for tokenized shares of
// small companies; its issuer pages (bee4.com.br/emissores/) show eight
// issuers, two suspended, several of them debt-only, and give no ticker and
// no ISIN for any share, and the site has no BEE4 venue. With no line that
// can be named or priced, BEE4 is left out of the catalogue.
//
//   https://www.genialinvestimentos.com.br/custos-tarifas/   (fees)
//   https://bee4.com.br/emissores/
//
//   node brokers/genial/genial_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const source = (await pageSays("https://www.genialinvestimentos.com.br/custos-tarifas/", [], { raw: true })).replace(/\\"/g, '"');
for (const pattern of [
  /"title":"Ações Lote Padrão","value":"R\$ 2,99","value2":"R\$ 0,99"/,
  /"title":"BDR","value":"R\$ 2,99"/,
  /"title":"ETF de Renda Variável","value":"ZERO"/,
  /"title":"Ações tokenizadas de PMEs","value":"ZERO"/,
]) {
  if (!pattern.test(source)) throw new Error(`the Genial cost page no longer says ${pattern}`);
}

const rows = await writeB3Catalogue(import.meta.url, "genial-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Genial catalogue`);
}
