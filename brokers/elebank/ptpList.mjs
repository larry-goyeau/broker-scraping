// EleBank's published list of US publicly traded partnership (PTP)
// securities, those subject to the IRC 1446(f) withholding, from its help
// centre article "美國公開交易合夥企業 (PTP)相關證券預扣税及交易安排":
//   "鑒於 該扣税的複雜性，大象將禁止交易相關股票。 ... PTP相關證券名單： 此表列出了
//   根據國內税收法規(IRC Section)第1446條(f)確定將被執行預扣税政策的PTP證券名單。"
// followed by a numbered SYMBOL table, and "以上PTP 相關證券名單並非完整清單".
// Symbols are written as the house tickers of ../wellstrade/usBook.mjs
// (BEP.PRA, ET.PRI); the Toronto lines (.TO) and OTC symbols in it simply
// match no US exchange row.
//
//   https://support.platform.elebank.com/personal/zh-hk/topic15_771
//
// Use:
//   import { ptpList } from "../elebank/ptpList.mjs";
//   const { symbols, url } = await ptpList();   // Set of tickers

export const PTP_URL = "https://support.platform.elebank.com/personal/zh-hk/topic15_771";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function ptpList() {
  const response = await fetch(PTP_URL, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`${response.status} ${PTP_URL}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  if (!/大象將禁止交易相關股票/.test(text)) throw new Error(`${PTP_URL} no longer says EleBank bars PTP securities`);
  const start = text.indexOf("SYMBOL");
  const end = text.indexOf("免責聲明", start);
  if (start < 0 || end < 0) throw new Error(`${PTP_URL}: no PTP table`);
  const symbols = new Set();
  for (const match of text.slice(start + 6, end).matchAll(/\b\d{1,4}\s+([A-Z][A-Z0-9.]*)/g)) symbols.add(match[1]);
  for (const known of ["EPD", "ET", "MPLX", "USO", "UNG"]) {
    if (!symbols.has(known)) throw new Error(`${PTP_URL}: PTP table lacks ${known}`);
  }
  if (symbols.size < 80) throw new Error(`${PTP_URL}: only ${symbols.size} PTP symbols`);
  return { symbols, url: PTP_URL };
}
