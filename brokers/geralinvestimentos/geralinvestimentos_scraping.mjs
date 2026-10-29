// What Geral Investimentos (Geral Investimentos CCTVM, São Paulo) sells on
// B3, with no login. Its site sells "AÇÕES: Operações à Vista" ("negociações
// de compra e venda de ações emitidas pelas empresas de capital aberto,
// realizadas no âmbito da B3"), and links its Home Broker
// (homebroker.geralinvestimentos.com.br). The cost table ("TABELA DE
// CUSTOS OPERACIONAIS", 02/01/2026): "1.2 Operações através Home Broker -
// 1.2.1 Clientes não assessorados: ... por ordem executada 0 [% sobre o
// valor] R$ 20,00 [taxa fixa]", "ISS Municipal de 5% sobre corretagem";
// orders through the desk or an adviser pay table 1.1 (0% + R$ 2,70 ... 0,5%
// + R$ 25,21, "Valor mínimo de R$ 20,00"). Geral prints no list and names
// no segment, board or kind of share it does not sell. So the catalogue is
// the whole B3 cash book: shares and units, BDRs of foreign shares and
// ETFs, Brazilian ETFs (an exchange's shares include its ETFs, owner's
// rule), and the 21Shares crypto ETP BDRs. broker-list.json gives "B3 São
// Paulo".
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.geralinvestimentos.com.br/wp-content/uploads/2026/01/Tabela-de-Custos-Operacionais-02012026.pdf   (fees)
//   https://www.geralinvestimentos.com.br/operacoes-a-vista/
//
//   node brokers/geralinvestimentos/geralinvestimentos_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const table = await fetch("https://www.geralinvestimentos.com.br/wp-content/uploads/2026/01/Tabela-de-Custos-Operacionais-02012026.pdf", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
if (!table.ok || !Buffer.from(await table.arrayBuffer()).subarray(0, 5).toString().startsWith("%PDF-")) throw new Error(`the Geral cost table is no longer served (${table.status})`);
await pageSays("https://www.geralinvestimentos.com.br/operacoes-a-vista/", [/Operações à vista são negociações de compra e venda de ações/, /Home Broker/]);

const rows = await writeB3Catalogue(import.meta.url, "geralinvestimentos-parsed.json");
for (const ticker of ["PETR4", "VALE3", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Geral catalogue`);
}
