// What Banco Daycoval sells on B3, with no login. Its Home Broker, in the
// Daycoval Digital account: "O nosso Home Broker é uma plataforma prática e
// intuitiva para você investir de onde estiver com total autonomia ...
// negociar ações, derivativos, cotas de fundos de investimento e outros
// ativos de renda variável" (the same post lists what a home broker trades
// on B3: "Ações; Fundos Imobiliários (FIIs); ETFs (fundos de índice; BDRs
// (recibos de ações estrangeiras)"). The cost sheet "Daycoval Investimentos
// Custo - taxa Renda Variável": "Operações via Home Broker – R$ 5,00 por
// ordem para: DayTrade, Swing Trade, Ações e BDRs, Opções, Fundo
// Imobiliário"; desk orders ("Operações Mesa Traders") follow B3's
// recommended table, 0,00% + R$ 2,70 up to 0,50% + R$ 25,21. Daycoval
// prints no list and names no segment, board or kind of share it does not
// sell, so the catalogue is the whole B3 cash book: shares and units, BDRs
// of foreign shares and ETFs, Brazilian ETFs (an exchange's shares include
// its ETFs, owner's rule), and the 21Shares crypto ETP BDRs.
// broker-list.json gives "B3 São Paulo".
//
// Left out: listed real-estate and other closed-end funds (FII, FIAGRO,
// FIP, FIDC; not shares or ETFs), and what the shared book drops: odd and
// block lots, receipts, rights, warrants, indexes, financing-rate lines,
// and lines that are suspended, delisted, in liquidation or have not
// traded in twelve months. The reading is in ../nubank/b3Book.mjs.
//
//   https://www.daycoval.com.br/cms/1/documento/files/c8c35942-cd81-43fe-b140-14ec8c7c46f0.pdf   (fees)
//   https://blog.daycoval.com.br/o-que-e-home-broker/
//   https://www.daycoval.com.br/investimentos/renda-variavel/
//
//   node brokers/bancodaycoval/bancodaycoval_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeB3Catalogue } from "../nubank/b3Book.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const sheet = await fetch("https://www.daycoval.com.br/cms/1/documento/files/c8c35942-cd81-43fe-b140-14ec8c7c46f0.pdf", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
if (!sheet.ok || !Buffer.from(await sheet.arrayBuffer()).subarray(0, 5).toString().startsWith("%PDF-")) throw new Error(`the Daycoval cost sheet is no longer served (${sheet.status})`);
await pageSays("https://blog.daycoval.com.br/o-que-e-home-broker/", [/Conheça o Home Broker do Banco Daycoval/, /negociar ações, derivativos, cotas de fundos de investimento/]);

const rows = await writeB3Catalogue(import.meta.url, "bancodaycoval-parsed.json");
for (const ticker of ["PETR4", "BOVA11", "AAPL34"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Daycoval catalogue`);
}
