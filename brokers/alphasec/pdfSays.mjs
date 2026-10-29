// Reads a broker page or PDF (fee schedule, FAQ) as plain text with Node
// only, and stops the run when a sentence a catalogue rests on is gone.
//
//   import { pdfSays, pageSays } from "../alphasec/pdfSays.mjs";
//   await pdfSays(url, [/Commission - Minimum of \.0025/]);
//   await pageSays(url, [/any issue listed at the Philippine Stock Exchange/]);
//
// A PDF's text is its show-text strings (Tj / TJ) in page order, from its
// Flate streams: good enough to find a printed sentence, not to lay out a
// page. Several small brokers' sites serve an expired or incomplete
// certificate chain; when fetch fails on the certificate, the page is read
// again with certificate checks off for that one request (curl -k), since
// only public text is read, never sent.

import https from "node:https";
import zlib from "node:zlib";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function insecureGet(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": UA }, rejectUnauthorized: false, timeout: 60_000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        response.resume();
        resolve(insecureGet(new URL(response.headers.location, url).href, redirects - 1));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks) }));
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

// { status, body (Buffer) }
export async function getBytes(url) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
    return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    if (/CERT|certificate|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(String(error.cause?.code || error.cause?.message || ""))) return insecureGet(url);
    throw error;
  }
}

export function plainText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|’/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ");
}

export function pdfText(buffer) {
  const raw = buffer.toString("latin1");
  let streams = "";
  const start = /(?<!end)stream\r?\n/g;
  let match;
  while ((match = start.exec(raw))) {
    const from = match.index + match[0].length;
    const to = raw.indexOf("endstream", from);
    if (to < 0) break;
    try {
      streams += zlib.inflateSync(buffer.subarray(from, to)).toString("latin1") + "\n";
    } catch {
      // not a Flate stream (image, font): skipped
    }
    start.lastIndex = to;
  }
  const strings = (block) =>
    (block.match(/\((?:[^()\\]|\\.)*\)/g) || []).map((s) => s.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
  const words = [];
  for (const op of streams.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|(\((?:[^()\\]|\\.)*\))\s*(?:Tj|'|")|(ET)/g)) {
    if (op[1] !== undefined) words.push(strings(op[1]));
    else if (op[2] !== undefined) words.push(strings(op[2]));
    else words.push(" ");
  }
  return words.join("").replace(/\s+/g, " ");
}

async function says(url, patterns, read) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { status, body } = await getBytes(url);
      if (status >= 200 && status < 300) {
        const text = read(body);
        for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
        return text;
      }
      last = `${url} answered ${status}`;
    } catch (error) {
      if (/no longer/.test(error.message)) throw error;
      last = `${url}: ${error.message}`;
    }
    await pause(2_000 * (attempt + 1));
  }
  throw new Error(last);
}

export function pdfSays(url, patterns) {
  return says(url, patterns, (body) => {
    if (body.subarray(0, 4).toString() !== "%PDF") throw new Error(`${url} is no longer a PDF`);
    return pdfText(body);
  });
}

export function pageSays(url, patterns, { raw = false } = {}) {
  return says(url, patterns, (body) => (raw ? body.toString("utf8") : plainText(body.toString("utf8"))));
}
