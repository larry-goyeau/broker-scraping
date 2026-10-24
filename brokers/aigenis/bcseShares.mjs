// The shares of the Belarusian Currency and Stock Exchange (BCSE), from its
// public securities directory ("Справочник ценных бумаг"). No login.
//
// The directory's search answers JSON: kinds 101,102,801,802 are the four
// share types (ordinary and preferred, resident and non-resident issuers),
// and accessTrades=True keeps the issues admitted to circulation ("Выпуск
// допущен к обращению": Да). Each line gives the issuer, the exchange
// ticker (T0146-S0012, SberB-S0009; a trailing P is a preferred share) and
// the state registration number. The line's own page gives the ISIN ("Код
// выпуска"), the admission level ("Уровень допуска": the "Международный",
// "Национальный" or "Базовый" quotation list, or "Внесписочные", the
// off-list segment), the nominal currency and whether it trades today.
// A share whose level is "Не допущ." (segment "Не допущена") is not
// admitted to the exchange and is left out. Every admitted share is kept,
// off-list ones too: they trade in the same system, and a broker that
// trades BCSE shares is not limited to a list. About half the admitted
// shares say "Торгуется сегодня: Нет" on a given trading day, almost all
// off-list lines with no trade in a year (Belgazprombank BGPB-S0008): the
// flag moves from day to day, so it is written in raw and not filtered.
// Shares trade in Belarusian roubles.
//
//   https://bcse.by/for_investors/securities_directory
//   https://bcse.by/Stock/GetSCatalog?kinds=101,102,801,802&accessTrades=True
//   https://bcse.by/stock/securitydirectory/<issuer UNP>/<registration number>
//
// www.bcse.by does not answer from every network; bcse.by does.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://bcse.by";
const SHARE_KINDS = "101,102,801,802";
const SHARE_TYPES = new Set([
  "Простые акции эмитента-резидента",
  "Привилегированные акции эмитента-резидента",
  "Простые акции эмитента-нерезидента",
  "Привилегированные акции эмитента-нерезидента",
]);
const LEVELS = new Set(["Международный", "Национальный", "Базовый", "Внесписочные"]);
const NOT_ADMITTED = "Не допущ.";
const WORKERS = 6;

export const EXCHANGE = { exchange: "Belarusian Currency and Stock Exchange", mic: "BCSE", currency: "BYN" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ru" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

export function words(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function field(text, label, next) {
  const found = text.match(new RegExp(`${label} (.+?) ${next}`));
  return found ? found[1].trim() : "";
}

async function detail(line) {
  const url = `${SITE}/stock/securitydirectory/${line.tin}/${encodeURIComponent(line.number)}`;
  const html = await getText(url);
  const text = words(html);
  if (!text.includes(line.ticker)) throw new Error(`${url} does not name ${line.ticker}`);
  const isin = text.match(/Код выпуска (BY[0-9A-Z]{10})\b/)?.[1] || "";
  // 'кот. лист "Базовый"' is the Basic quotation list.
  const level = field(text, "Уровень допуска", "Сегмент рынка").replace(/^кот\. лист [«"](.+)[»"]$/, "$1");
  const nominal = text.match(/Валюта номинальной стоимости ([A-Z]{3})\b/)?.[1] || "";
  const today = html.match(/Торгуется сегодня[\s\S]{0,400}?<span class="text-(deepblue|mouse)">\s*Да\s*<\/span>/)?.[1];
  if (!LEVELS.has(level) && level !== NOT_ADMITTED) throw new Error(`${url}: admission level ${JSON.stringify(level)}`);
  return { isin, level, nominal, tradesToday: today === "deepblue", noTradeYear: /За последний год сделки с данной ценной бумагой/.test(text) };
}

// Rows in the shared catalogue shape, and the counts of what was seen.
export async function bcseShares() {
  const query = new URLSearchParams({ issuer: "", kinds: SHARE_KINDS, types: "", revenueTypes: "", tin: "", regnumber: "", accessTrades: "True", codes: "", approved: "" });
  const body = JSON.parse(await getText(`${SITE}/Stock/GetSCatalog?${query}`));
  if (!Array.isArray(body.list)) throw new Error("the BCSE directory answered no list");
  const lines = body.list;
  for (const line of lines) {
    if (!SHARE_TYPES.has(line.type)) throw new Error(`BCSE directory type ${JSON.stringify(line.type)} (${line.ticker})`);
    if (!line.ticker || !line.tin || !line.number) throw new Error(`BCSE directory line without ticker or number: ${JSON.stringify(line)}`);
  }
  if (new Set(lines.map((line) => line.ticker)).size !== lines.length) throw new Error("the BCSE directory repeats a ticker");
  // 1,143 admitted shares on 23 October 2026.
  if (lines.length < 800) throw new Error(`the BCSE directory lists only ${lines.length} admitted shares`);

  const details = new Array(lines.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < lines.length) {
        const index = next++;
        details[index] = await detail(lines[index]);
      }
    }),
  );

  const counts = { levels: {}, noIsin: 0, notToday: 0, noTradeYear: 0 };
  const rows = [];
  lines.forEach((line, index) => {
    const info = details[index];
    counts.levels[info.level] = (counts.levels[info.level] || 0) + 1;
    if (info.level === NOT_ADMITTED) return;
    if (!info.isin) counts.noIsin += 1;
    if (!info.tradesToday) counts.notToday += 1;
    if (info.noTradeYear) counts.noTradeYear += 1;
    const name = line.issuer.replace(/\s+/g, " ").trim();
    rows.push({
      query: info.isin || line.ticker,
      ticker: line.ticker,
      name,
      ...EXCHANGE,
      type: "STOCK",
      isin: info.isin,
      raw: [line.ticker, name, line.type, info.level, `nominal ${info.nominal}`, line.number, info.tradesToday ? "" : "not trading today"].filter(Boolean).join(" | "),
    });
  });
  if (rows.length < 900) throw new Error(`only ${rows.length} BCSE shares are admitted to the exchange`);
  if (counts.noIsin > rows.length * 0.02) throw new Error(`${counts.noIsin} BCSE shares have no ISIN on their page`);
  return { rows, counts };
}
