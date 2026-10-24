// Gazprombank Investments (Newton Investments LLC, Russia) sells what its
// app catalogue shows. A security outside the catalogue is not bought
// online: the client asks support, which checks whether it can be added.
//
//   "Если вы не нашли в приложении интересующую ценную бумагу, напишите в
//    чат службы поддержки или на почту help@gazprombank.investments . Мы
//    проверим возможность добавления инструмента в каталог и вернемся к
//    вам с ответом."
//   https://gazprombank.investments/help/instrumenty-i-rezhimy-torgov/
//   "Бумага торгуется на Московской бирже, но отсутствует в каталоге
//    приложения" / "Напишите в чат клиентской поддержки название или ISIN
//    бумаги с просьбой добавить ее в каталог приложения."
//   https://gazprombank.investments/help/torgi/
//
// So the public share catalogue is the offer, not a showcase. It is
// server-rendered (first 20 lines in catalogParams.firstData) and the
// "Показать еще" button pages the rest through a Bitrix component action;
// the anonymous session cookie and its CSRF token (bitrix_sessid, or the
// one Bitrix returns with "invalid_csrf") are enough, no login:
//
//   https://gazprombank.investments/market/stocks/   (about 257 shares)
//   POST /bitrix/services/main/ajax.php?mode=class&c=catalog:section.list&action=showMore
//
// Each line gives ticker, ISIN and currency but not the place. The broker
// trades the Moscow Exchange and SPB Exchange stock markets:
//
//   "Какие рынки доступны через брокера фондовый рынок Московской биржи и
//    СПБ Биржи" (https://gazprombank.investments/help/brokerskiy-schet/)
//   "В сервисе Газпромбанк Инвестиции с СПБ Биржи доступен ограниченный
//    набор российских ценных бумаг" (https://gazprombank.investments/help/torgi/)
//
// SPB Exchange gives a limited set of titles with no list, so a row is
// written on the Moscow Exchange only, where the catalogue ISIN has an
// admitted share line (moexBook.mjs: the exchange's ISS listing, ticker
// and currency from that book). A catalogue line with no such book is left
// out and named in the log.
//
// Funds: the app sells funds ("Вы можете выбрать акции, облигации, фонды,
// валюту и фьючерсы", help/torgi), but the public catalogue has shares
// only and there is no fund list. Every exchange fund (BPIF) of the Moscow
// Exchange is kept (owner's choice, 2026-10-24), in roubles and in yuan:
// "Пополните счет рублями или юанями". Unit funds that are not ETFs (OPIF,
// IPIF, ZPIF) stay out, as in the other MOEX catalogues.
//
//   https://gazprombank.investments/help/brokerskiy-schet/
//
// Fees: tariff «Базовый», "Покупка/продажа ценных бумаг на ПАО Московская
// Биржа (фондовый рынок), ПАО СПБ Биржа, внебиржевом рынке ... 0,3% от
// суммы сделки" (https://gazprombank.investments/files/tariffs/Tariff_base.pdf).
//
// Restriction in broker-list.json: "Foreign (non-EAEU) securities for
// qualified investors only". The broker's test page applies the Bank of
// Russia rule ("Акции и депозитарные расписки иностранных эмитентов ... С 1
// октября 2022 года покупка таких ценных бумаг, имеющих листинг в
// недружественных ..."; help/testirovanie-nekvalifitsirovannykh-investorov):
// it depends on the client, so the foreign-issuer lines are kept and
// flagged in raw.
//
//   node brokers/gazprombank/gazprombank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { UA, checkPages, countRows, moexBook, moexRow, normalize, sleep } from "../sber/moexBook.mjs";

const SITE = "https://gazprombank.investments";
const LIST = `${SITE}/market/stocks/`;
const ACTION = `${SITE}/bitrix/services/main/ajax.php?mode=class&c=catalog:section.list&action=showMore`;

await checkPages([
  {
    url: `${SITE}/help/instrumenty-i-rezhimy-torgov/`,
    phrases: ["Если вы не нашли в приложении интересующую ценную бумагу", "Мы проверим возможность добавления инструмента в каталог"],
  },
  {
    url: `${SITE}/help/torgi/`,
    phrases: ["Бумага торгуется на Московской бирже, но отсутствует в каталоге приложения", "В сервисе Газпромбанк Инвестиции с СПБ Биржи доступен ограниченный набор российских ценных бумаг"],
  },
  { url: `${SITE}/files/tariffs/Tariff_base.pdf`, pdf: true },
]);

const cookies = new Map();
function keepCookies(response) {
  for (const line of response.headers.getSetCookie?.() || []) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}
const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");

async function request(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: "follow",
        headers: { "User-Agent": UA, Referer: LIST, Cookie: cookieHeader(), ...(init.headers || {}) },
        signal: AbortSignal.timeout(90_000),
      });
      keepCookies(response);
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

const html = await request(LIST);
const signed = html.match(/'signedParameters':\s*"([^"]+)"/)?.[1];
const pageCount = Number(html.match(/'pageCount':\s*(\d+)/)?.[1]);
const firstData = html.match(/'firstData':\s*(\[[\s\S]*?\])\s*\}\s*;?\s*\n/)?.[1];
let token = html.match(/bitrix_sessid['"]?\s*:\s*['"]([0-9a-f]{32})/)?.[1] || "";
if (!signed || !pageCount || !firstData) throw new Error("the stock catalogue page changed (catalogParams)");

const catalogue = JSON.parse(firstData);
async function showMore(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = new URLSearchParams({ signedParameters: signed, page: String(page), sessid: token });
    const answer = JSON.parse(
      await request(ACTION, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Bitrix-Csrf-Token": token, "X-Requested-With": "XMLHttpRequest" },
        body,
      })
    );
    if (answer.status === "success") return answer.data || [];
    const csrf = answer.errors?.find((error) => error.code === "invalid_csrf")?.customData?.csrf;
    if (!csrf) throw new Error(`page ${page}: ${JSON.stringify(answer.errors).slice(0, 200)}`);
    token = csrf;
  }
  throw new Error(`page ${page}: CSRF token refused`);
}
for (let page = 2; page <= pageCount; page += 1) {
  catalogue.push(...(await showMore(page)));
  await sleep(500);
}
const ids = new Set(catalogue.map((item) => item.ID));
if (ids.size !== catalogue.length) throw new Error(`catalogue repeats lines (${catalogue.length} read, ${ids.size} distinct)`);
if (catalogue.length < (pageCount - 1) * 20 + 1) throw new Error(`only ${catalogue.length} lines for ${pageCount} pages`);

const lines = await moexBook();
const shares = new Map();
for (const line of lines) {
  if (line.kind !== "STOCK") continue;
  if (!shares.has(line.isin)) shares.set(line.isin, []);
  shares.get(line.isin).push(line);
}

const rows = [];
const missing = [];
for (const item of catalogue) {
  if (item.ACTIVE !== "Y") continue;
  const isin = normalize(item.ISIN_VALUE || item.NAME).toUpperCase();
  const found = (shares.get(isin) || []).filter((line) => line.currency === "RUB");
  if (!found.length) {
    missing.push(`${item.TICKER_VALUE} ${isin} ${item.SEC_NAME_VALUE}`);
    continue;
  }
  for (const line of found) {
    rows.push(moexRow(line, { name: item.SEC_NAME_VALUE, notes: [`catalogue ${item.TICKER_VALUE} ${item.CURRENCY_VALUE}`] }));
  }
}

const funds = lines.filter((line) => line.kind === "ETF" && ["RUB", "CNY"].includes(line.currency));
if (funds.length < 80) throw new Error(`only ${funds.length} MOEX exchange funds`);
for (const line of funds) rows.push(moexRow(line));

const seen = new Set();
for (const row of rows) {
  const key = `${row.isin}|${row.mic}|${row.currency}`;
  if (seen.has(key)) throw new Error(`${key} twice`);
  seen.add(key);
}
const shareRows = rows.filter((row) => row.type === "STOCK").length;
if (shareRows < 200) throw new Error(`only ${shareRows} MOEX shares`);
for (const [isin, label] of [["RU0009029540", "Sberbank"], ["RU0007661625", "Gazprom"], ["RU0009024277", "Lukoil"]]) {
  if (!rows.some((row) => row.isin === isin)) throw new Error(`${label} is missing`);
}

rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("gazprombank-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`catalogue ${catalogue.length} lines, ${written.length} rows`, countRows(written));
console.error(`not an admitted MOEX share, left out: ${missing.length}`);
for (const item of missing) console.error(`  ${item}`);
