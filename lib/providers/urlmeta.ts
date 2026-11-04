/**
 * UrlMetaProvider: reads only <title>, meta description and OG title/description from a page.
 * SSRF-safe: https only; DNS is resolved first and every address must be public (no private,
 * loopback, link-local, CGNAT, multicast, reserved or cloud-metadata ranges); the socket connects
 * to the vetted address (no DNS rebinding); redirects are followed manually at most
 * hook.maxRedirects times and re-checked; 3s timeout; 256KB cap; no cookies; no JS.
 */
import dns from "node:dns";
import https from "node:https";
import net from "node:net";

export interface UrlMeta {
  url: string;
  title: string;
  description: string;
}

export class UrlMetaError extends Error {
  constructor(
    public code: "scheme" | "invalid" | "blocked_address" | "dns" | "timeout" | "too_large" | "redirects" | "http" | "not_html",
    message: string,
  ) {
    super(message);
  }
}

export interface UrlMetaProvider {
  readonly name: string;
  fetchMeta(url: string): Promise<UrlMeta>;
}

// ---------- Address policy ----------

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

export function isBlockedIPv4(ip: string): boolean {
  const x = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (x & mask) === (ipv4ToInt(base) & mask);
  });
}

function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  // Embedded IPv4 tail
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (s.includes("::")) {
    const fill = 8 - h.length - t.length;
    if (fill < 0) return null;
    return [...h, ...new Array(fill).fill("0"), ...t].map((x) => parseInt(x || "0", 16));
  }
  if (h.length !== 8) return null;
  return h.map((x) => parseInt(x, 16));
}

export function isBlockedIPv6(ip: string): boolean {
  const w = expandIPv6(ip);
  if (!w || w.some((x) => Number.isNaN(x))) return true;
  const all0 = w.every((x) => x === 0);
  if (all0) return true; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d, NAT64 64:ff9b::/96
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0xffff || w[5] === 0)) {
    return isBlockedIPv4(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`);
  }
  if (w[0] === 0x64 && w[1] === 0xff9b) return isBlockedIPv4(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`);
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((w[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((w[0] & 0xff00) === 0xff00) return true; // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // documentation
  if (w[0] === 0x2002) return true; // 6to4 can tunnel to private v4
  if (w[0] === 0xfd00 && w[1] === 0x0ec2) return true; // AWS metadata IPv6 (fd00:ec2::254)
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedIPv4(ip);
  if (fam === 6) return isBlockedIPv6(ip);
  return true;
}

const BLOCKED_HOSTNAMES = /^(localhost|localhost\.localdomain|metadata|metadata\.google\.internal|instance-data|.*\.internal|.*\.local|.*\.localhost)$/i;

export function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UrlMetaError("invalid", "That URL does not parse.");
  }
  if (u.protocol !== "https:") throw new UrlMetaError("scheme", "Only https URLs are read.");
  if (u.username || u.password) throw new UrlMetaError("invalid", "URLs with credentials are not read.");
  if (u.port && u.port !== "443") throw new UrlMetaError("invalid", "Only the default https port is read.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.test(host)) throw new UrlMetaError("blocked_address", "That host is not reachable from here.");
  if (net.isIP(host) && isBlockedAddress(host)) throw new UrlMetaError("blocked_address", "That address is private or reserved.");
  // Numeric-only hostnames like 2130706433 or 0x7f000001 are rejected outright.
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host) || /^[\d.]+$/.test(host) && !net.isIP(host)) throw new UrlMetaError("blocked_address", "Numeric hosts are not read.");
  return u;
}

// ---------- HTML parsing ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, attr: "name" | "property", key: string): string {
  const re = new RegExp(`<meta[^>]*${attr}\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  if (!tag) return "";
  return decodeEntities(tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? "");
}

export function parseMeta(html: string): { title: string; description: string } {
  const title = metaContent(html, "property", "og:title") || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = metaContent(html, "name", "description") || metaContent(html, "property", "og:description");
  return { title: title.slice(0, 200), description: description.slice(0, 400) };
}

// ---------- Network ----------

export type Lookup = (host: string) => Promise<Array<{ address: string; family: number }>>;

export interface RawResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
}

/** Performs one HTTPS GET to a pinned address. Injected in tests. */
export type Requester = (u: URL, address: string, family: number, opts: { timeoutMs: number; maxBytes: number }) => Promise<RawResponse>;

export const defaultLookup: Lookup = async (host) => dns.promises.lookup(host, { all: true, verbatim: true });

export const defaultRequester: Requester = (u, address, family, opts) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: u.hostname,
        servername: net.isIP(u.hostname) ? undefined : u.hostname,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: { "user-agent": "SeriesZeroBot/1.0 (title and description only)", accept: "text/html", "accept-encoding": "identity" },
        lookup: (_h, _o, cb) => cb(null, address, family),
        timeout: opts.timeoutMs,
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            req.destroy();
            reject(new UrlMetaError("too_large", "The page is larger than the read limit."));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | undefined>, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new UrlMetaError("timeout", "The page took longer than 3 seconds."));
    });
    req.on("error", (e) => reject(e instanceof UrlMetaError ? e : new UrlMetaError("http", e.message)));
    req.end();
  });

export class SafeUrlMetaProvider implements UrlMetaProvider {
  readonly name = "https-safe";
  constructor(
    private opts: { timeoutMs: number; maxBytes: number; maxRedirects: number },
    private lookup: Lookup = defaultLookup,
    private requester: Requester = defaultRequester,
  ) {}

  async fetchMeta(raw: string): Promise<UrlMeta> {
    const deadline = Date.now() + this.opts.timeoutMs;
    let u = checkUrl(raw);
    for (let hop = 0; hop <= this.opts.maxRedirects; hop++) {
      const host = u.hostname.replace(/^\[|\]$/g, "");
      let addrs: Array<{ address: string; family: number }>;
      if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
      else {
        try {
          addrs = await withTimeout(this.lookup(host), deadline);
        } catch (e) {
          if (e instanceof UrlMetaError) throw e;
          throw new UrlMetaError("dns", "That host does not resolve.");
        }
      }
      if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) throw new UrlMetaError("blocked_address", "That host resolves to a private or reserved address.");
      const a = addrs[0];
      const res = await withTimeout(this.requester(u, a.address, a.family, { timeoutMs: Math.max(1, deadline - Date.now()), maxBytes: this.opts.maxBytes }), deadline);
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        if (hop === this.opts.maxRedirects) throw new UrlMetaError("redirects", "Too many redirects.");
        u = checkUrl(new URL(res.headers.location, u).toString());
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new UrlMetaError("http", `The page answered ${res.status}.`);
      const ct = res.headers["content-type"] ?? "";
      if (ct && !/text\/html|application\/xhtml/i.test(ct)) throw new UrlMetaError("not_html", "That is not a web page.");
      if (Buffer.byteLength(res.body) > this.opts.maxBytes) throw new UrlMetaError("too_large", "The page is larger than the read limit.");
      return { url: u.toString(), ...parseMeta(res.body) };
    }
    throw new UrlMetaError("redirects", "Too many redirects.");
  }
}

function withTimeout<T>(p: Promise<T>, deadline: number): Promise<T> {
  const ms = Math.max(0, deadline - Date.now());
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new UrlMetaError("timeout", "The page took longer than 3 seconds.")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Offline provider for tests and e2e: deterministic fake metadata, still runs the URL policy. */
export class MockUrlMetaProvider implements UrlMetaProvider {
  readonly name = "mock";
  async fetchMeta(raw: string): Promise<UrlMeta> {
    const u = checkUrl(raw);
    return { url: u.toString(), title: `${u.hostname.split(".")[0]} home`, description: "A small company with a big idea." };
  }
}

let current: UrlMetaProvider | null = null;
export function getUrlMetaProvider(cfg: { hook: { timeoutMs: number; maxBytes: number; maxRedirects: number } }): UrlMetaProvider {
  if (current) return current;
  current = process.env.SZ_URLMETA === "mock" ? new MockUrlMetaProvider() : new SafeUrlMetaProvider({ timeoutMs: cfg.hook.timeoutMs, maxBytes: cfg.hook.maxBytes, maxRedirects: cfg.hook.maxRedirects });
  return current;
}
export function setUrlMetaProvider(p: UrlMetaProvider | null): void {
  current = p;
}
