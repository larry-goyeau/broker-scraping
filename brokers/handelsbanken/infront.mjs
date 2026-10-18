// A small client for the Infront realtime protocol that the Handelsbanken
// market pages run in the browser (Infront Web Toolkit). It logs in with
// the anonymous page token and reads list ("chain") contents, which is all
// the scraper needs.
//
// Wire format: every message is a little-endian int32 length, then tags.
// A tag is <varint tag><varint data type><payload>; type 0 is a varint,
// 17 a varint length plus UTF-8 bytes, 3 an int32. The header runs until
// tag 63. A reply can come in parts: header tag 13 counts 0, 1, ... and 2
// marks the last part. Tag 0 separates records in a body.
//
// Login (pid 0 / sid 0 on login1.infrontservices.com): connect (request 1),
// then login (request 5) with the user name and the signed token. The
// replies give the login id (request 5, tag 9), the servers (request 6:
// pid, sid, host) and which server serves which feed and property
// (request 12). Lists live on the server that has feed 990 with the
// Chains property (8192). That server is opened with request 1 carrying
// the login id, and asked for a list with request 39 (feed, list name,
// optional provider id).

const DT = { Int: 0, Int32: 3, String: 17, Float: 1, Double: 2, BCD: 4, DeltaBCD: 5, DeltaInt: 6, Binary: 22, Int64: 26, Null: 32 };
const H = { PID: 1, SID: 7, Request: 8, UserData: 11, LoginId: 12, ReplyNu: 13, TickCount: 18, AppVersion: 24, UniqueId: 39, Properties: 59, End: 63 };
const REQ = { Connect: 1, Ping: 0, Login: 5, Servers: 6, FeedServices: 12, ChainContent: 39 };
const T = { Separator: 0, Feed: 6, Symbol: 5, FullName: 29, ISIN: 30, SymbolType: 518, SymbolSubType: 513, Currency: 521, ChainName: 8214, ProviderId: 8236, ExchangeSymbol: 8200 };
const GLOBAL_CHAINS_FEED = 990;
const CHAINS_PROPERTY = 8192;
const APP_VERSION = 3003000;
const LOGIN_HOST = "wss://login1.infrontservices.com/wsrt/0/0";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function varint(value) {
  const out = [];
  let o = value;
  if (o < 64) return [o];
  if (o < 8192) return [128 | (31 & o), (o >> 5) & 255];
  let n;
  if (o < 1048576) { out.push(192 | (15 & o)); o = Math.floor(o / 16); n = 2; }
  else if (o < 134217728) { out.push(224 | (7 & o)); o = Math.floor(o / 8); n = 3; }
  else if (o < 17179869184) { out.push(240 | (3 & o)); o = Math.floor(o / 4); n = 4; }
  else { out.push(248 | (1 & o)); o = Math.floor(o / 2); n = 5; }
  for (let i = 0; i < n; i += 1) { out.push(o % 256); o = Math.floor(o / 256); }
  return out;
}

function lenOf(buf, p) {
  const r = 255 ^ buf[p];
  for (let bit = 7, n = 1; bit >= 0; bit -= 1, n += 1) if (r & (1 << bit)) return n;
  return 1;
}

function intOf(buf, s, n) {
  switch (n) {
    case 1: return buf[s];
    case 2: return ((31 & buf[s]) | (buf[s + 1] << 5)) >>> 0;
    case 3: return ((15 & buf[s]) | (buf[s + 1] << 4) | (buf[s + 2] << 12)) >>> 0;
    case 4: return ((7 & buf[s]) | (buf[s + 1] << 3) | (buf[s + 2] << 11) | (buf[s + 3] << 19)) >>> 0;
    default: {
      let h = 7 - n;
      let value = buf[s] & ((1 << h) - 1);
      for (let i = 1; i < n; i += 1) { value += buf[s + i] * 2 ** h; h += 8; }
      return value;
    }
  }
}

class Message {
  constructor() { this.bytes = [0, 0, 0, 0]; }
  int(tag, value) { this.bytes.push(...varint(tag), ...varint(DT.Int), ...varint(value)); return this; }
  string(tag, value) {
    const raw = encoder.encode(value);
    this.bytes.push(...varint(tag), ...varint(DT.String), ...varint(raw.length), ...raw);
    return this;
  }
  build() {
    const out = Uint8Array.from(this.bytes);
    new DataView(out.buffer).setUint32(0, out.length - 4, true);
    return out;
  }
}

// Returns { header: Map, records: [Map tag -> value] }.
export function parse(buf) {
  const header = new Map();
  const records = [];
  let current = new Map();
  let inHeader = true;
  let p = 4;
  while (p < buf.length) {
    if (buf[p] === 255) { p += 1; p += lenOf(buf, p); }
    let n = lenOf(buf, p); const tag = intOf(buf, p, n); p += n;
    n = lenOf(buf, p); const type = intOf(buf, p, n); p += n;
    let value;
    switch (type) {
      case DT.Int: case DT.DeltaInt: n = lenOf(buf, p); value = intOf(buf, p, n); p += n; break;
      case DT.Int32: value = new DataView(buf.buffer, buf.byteOffset + p, 4).getUint32(0, true); p += 4; break;
      case DT.Float: value = new DataView(buf.buffer, buf.byteOffset + p, 4).getFloat32(0, true); p += 4; break;
      case DT.Double: value = new DataView(buf.buffer, buf.byteOffset + p, 8).getFloat64(0, true); p += 8; break;
      case DT.BCD: case DT.DeltaBCD: value = null; p += 1 + ((buf[p] >> 4) / 2 >> 0); break;
      case DT.Int64: value = null; p += 9; break;
      default: {
        n = lenOf(buf, p); const length = intOf(buf, p, n); p += n;
        value = type === DT.String ? decoder.decode(buf.subarray(p, p + length)).replace(/\0+$/, "") : buf.subarray(p, p + length);
        p += length;
      }
    }
    if (inHeader) {
      if (tag === H.End) inHeader = false; else header.set(tag, value);
      continue;
    }
    if (tag === T.Separator) { if (current.size) records.push(current); current = new Map(); continue; }
    if (!current.has(tag)) current.set(tag, value);
    else { const held = current.get(tag); current.set(tag, Array.isArray(held) ? [...held, value] : [held, value]); }
  }
  if (current.size) records.push(current);
  return { header, records };
}

function headerMessage(pid, sid, request, uniqueId, extra = []) {
  const m = new Message().int(H.PID, pid).int(H.SID, sid).int(H.Request, request).int(H.UserData, 1).int(H.UniqueId, uniqueId);
  for (const [tag, value] of extra) m.int(tag, value);
  return m.int(H.End, 0);
}

// One websocket. Replies are gathered per unique id until the last part.
class Connection {
  constructor(url) {
    this.url = url;
    this.pending = new Map();
    this.nextId = 1;
  }

  open(timeout = 20_000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = "arraybuffer";
      const timer = setTimeout(() => reject(new Error(`${this.url}: no connection`)), timeout);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = (event) => { clearTimeout(timer); reject(new Error(`${this.url}: ${event.message || "socket error"}`)); };
      ws.onclose = () => { for (const job of this.pending.values()) job.reject(new Error(`${this.url} closed`)); this.pending.clear(); };
      ws.onmessage = (event) => this.receive(new Uint8Array(event.data));
      this.ws = ws;
    });
  }

  receive(buf) {
    const message = parse(buf);
    const job = this.pending.get(message.header.get(H.UniqueId));
    if (!job) return;
    job.parts.push(message);
    if (job.done(job.parts, message)) {
      this.pending.delete(message.header.get(H.UniqueId));
      clearTimeout(job.timer);
      job.resolve(job.parts);
    }
  }

  // Sends `build(uniqueId)` and resolves with every reply part once `done`
  // says so; by default at the part marked last (reply number 2).
  request(build, done = (parts, last) => last.header.get(H.ReplyNu) !== 0 && last.header.get(H.ReplyNu) !== 1, timeout = 60_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${this.url}: request ${id} timed out`)); }, timeout);
      this.pending.set(id, { parts: [], done, resolve, reject, timer });
      this.ws.send(build(id).build());
    });
  }

  close() { try { this.ws?.close(); } catch {} }
}

function userOf(token) {
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  if (!claims.preferred_username) throw new Error("token has no preferred_username");
  return claims.preferred_username;
}

function hostUrl(host, pid, sid) {
  const [ip, port] = String(host).split(":");
  const name = /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? `${ip.replace(/\./g, "-")}.infrontservices.com` : ip;
  return `wss://${name}:${port || 443}/wsrt/${pid}/${sid}`;
}

// Logs in and opens the list server. Returns { chain(feed, name, provider), close() }.
export async function openChains(token) {
  const login = new Connection(LOGIN_HOST);
  await login.open();
  await login.request((id) => headerMessage(0, 0, REQ.Connect, id, [[H.Properties, 1], [H.TickCount, 0], [H.AppVersion, APP_VERSION]]).int(91, 1));
  const uuid = crypto.randomUUID();
  const loginMessage = (id) => headerMessage(0, 0, REQ.Login, id)
    .string(5, userOf(token)).string(180, token).int(58, 7).int(183, 2)
    .string(82, uuid).string(179, uuid).string(170, uuid);
  const seen = new Set();
  const parts = await login.request(loginMessage, (got) => {
    for (const part of got) if (part.header.get(H.ReplyNu) === 2) seen.add(part.header.get(H.Request));
    return [REQ.Login, REQ.Servers, REQ.FeedServices].every((type) => seen.has(type));
  });
  login.close();

  const loginReply = parts.find((part) => part.header.get(H.Request) === REQ.Login);
  const loginId = loginReply?.records.flatMap((r) => r.get(9) ?? [])[0];
  if (!loginId) throw new Error("Infront login gave no login id");

  // Body records of request 6: a server is <8 pid, 11 sid, 13 host>.
  const hosts = new Map();
  for (const part of parts.filter((p) => p.header.get(H.Request) === REQ.Servers)) {
    for (const record of part.records) {
      if (record.has(13) && record.has(8) && record.has(11)) {
        const key = `${[].concat(record.get(8))[0]}:${[].concat(record.get(11))[0]}`;
        if (!hosts.has(key)) hosts.set(key, []);
        hosts.get(key).push(...[].concat(record.get(13)));
      }
    }
  }
  // Request 12: <8 pid, 11 sid, 28 feed, 44 properties>.
  let chainServer = null;
  const feeds = new Map();
  for (const part of parts.filter((p) => p.header.get(H.Request) === REQ.FeedServices)) {
    for (const record of part.records) {
      const key = `${[].concat(record.get(8))[0]}:${[].concat(record.get(11))[0]}`;
      const feed = [].concat(record.get(28))[0];
      if (feed === undefined) continue;
      if (!feeds.has(key)) feeds.set(key, new Set());
      feeds.get(key).add(feed);
      if (feed === GLOBAL_CHAINS_FEED && ((record.get(44) ?? 0) & CHAINS_PROPERTY) === CHAINS_PROPERTY) chainServer = key;
    }
  }
  if (!chainServer) throw new Error("Infront login named no list server");
  const servers = new Map();
  async function serverFor(key) {
    if (servers.has(key)) return servers.get(key);
    const [pid, sid] = key.split(":").map(Number);
    const candidates = hosts.get(key) || [];
    if (!candidates.length) throw new Error(`no host for server ${key}`);
    let server = null;
    let lastError;
    for (const host of candidates) {
      server = new Connection(hostUrl(host, pid, sid));
      try { await server.open(); break; } catch (error) { lastError = error; server = null; }
    }
    if (!server) throw lastError;
    await server.request((id) => {
      const m = headerMessage(pid, sid, REQ.Connect, id, [[H.Properties, 1], [H.LoginId, loginId], [H.TickCount, 0], [H.AppVersion, APP_VERSION]]).int(91, 1);
      for (const feed of [...(feeds.get(key) || [])].sort((a, b) => a - b)) m.int(16, feed);
      return m;
    });
    server.pid = pid;
    server.sid = sid;
    servers.set(key, server);
    return server;
  }
  const server = await serverFor(chainServer);
  const { pid, sid } = server;

  return {
    async chain(feed, name, provider) {
      const replies = await server.request((id) => {
        const m = headerMessage(pid, sid, REQ.ChainContent, id).int(T.Feed, feed).string(T.ChainName, name);
        if (provider) m.int(T.ProviderId, provider);
        return m;
      });
      const items = [];
      for (const reply of replies) {
        for (const record of reply.records) {
          if (!record.has(T.Symbol)) continue;
          items.push({
            feed: [].concat(record.get(T.Feed)).at(-1),
            symbol: record.get(T.Symbol),
            symbolType: record.get(T.SymbolType),
            symbolSubType: record.get(T.SymbolSubType),
            isin: record.get(T.ISIN) || "",
            currency: record.get(T.Currency) || "",
            fullName: record.get(T.FullName) || "",
            exchangeSymbol: record.get(T.ExchangeSymbol) || "",
          });
        }
      }
      return items;
    },
    close() { for (const held of servers.values()) held.close(); },
  };
}
