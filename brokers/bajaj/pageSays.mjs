// Reads a broker page as plain text and stops the run when a sentence the
// catalogue rests on is gone. Used by the Indian scrapers that import
// ./indiaBook.mjs.
//
//   import { pageSays } from "../bajaj/pageSays.mjs";
//   const text = await pageSays(url, [/partnership with Vested/i]);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function plainText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|’/g, "'")
    .replace(/\\u2019/g, "'")
    .replace(/\s+/g, " ");
}

export async function pageSays(url, patterns, { raw = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) {
        const body = await response.text();
        const text = raw ? body : plainText(body);
        for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
        return text;
      }
      last = `${url} answered ${response.status}`;
    } catch (error) {
      if (/no longer says/.test(error.message)) throw error;
      last = `${url}: ${error.message}`;
    }
    await pause(1_500 * (attempt + 1));
  }
  throw new Error(last);
}
