import { describe, expect, it } from "vitest";
import { gameConfig as cfg } from "@/config/game";
import { checkUrl, isBlockedAddress, parseMeta, SafeUrlMetaProvider, UrlMetaError, type Lookup, type Requester } from "@/lib/providers/urlmeta";

const opts = { timeoutMs: cfg.hook.timeoutMs, maxBytes: cfg.hook.maxBytes, maxRedirects: cfg.hook.maxRedirects };
const publicLookup: Lookup = async () => [{ address: "93.184.216.34", family: 4 }];
const okHtml = '<html><head><title>Furrow &amp; Co</title><meta name="description" content="Soil sensors for farms."></head></html>';
const okReq: Requester = async () => ({ status: 200, headers: { "content-type": "text/html" }, body: okHtml });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof UrlMetaError ? e.code : `other:${(e as Error).message}`;
  }
}

describe("address policy", () => {
  it.each([
    "127.0.0.1", "127.255.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "64:ff9b::7f00:1", "2002:7f00:1::1", "ff02::1", "fd00:ec2::254", "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it.each(["93.184.216.34", "1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "172.32.0.1", "192.169.0.1"])("allows public %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("URL policy", () => {
  it.each([
    ["http://example.com", "scheme"],
    ["ftp://example.com", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["https://localhost/", "blocked_address"],
    ["https://127.0.0.1/", "blocked_address"],
    ["https://[::1]/", "blocked_address"],
    ["https://169.254.169.254/latest/meta-data", "blocked_address"],
    ["https://metadata.google.internal/", "blocked_address"],
    ["https://2130706433/", "blocked_address"],
    ["https://0x7f000001/", "blocked_address"],
    ["https://user:pass@example.com/", "invalid"],
    ["https://example.com:8443/", "invalid"],
    ["not a url", "invalid"],
  ])("rejects %s (%s)", (url, c) => {
    let got = "ok";
    try {
      checkUrl(url);
    } catch (e) {
      got = (e as UrlMetaError).code;
    }
    expect(got).toBe(c);
  });
});

describe("SafeUrlMetaProvider (mocked network)", () => {
  it("reads only title and description", async () => {
    const p = new SafeUrlMetaProvider(opts, publicLookup, okReq);
    expect(await p.fetchMeta("https://example.com/")).toEqual({ url: "https://example.com/", title: "Furrow & Co", description: "Soil sensors for farms." });
  });
  it("blocks hostnames that resolve to private addresses (any record)", async () => {
    const p = new SafeUrlMetaProvider(opts, async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }], okReq);
    expect(await code(p.fetchMeta("https://evil.example/"))).toBe("blocked_address");
  });
  it("pins the connection to the vetted address", async () => {
    let used = "";
    const p = new SafeUrlMetaProvider(opts, publicLookup, async (_u, addr) => {
      used = addr;
      return { status: 200, headers: { "content-type": "text/html" }, body: okHtml };
    });
    await p.fetchMeta("https://example.com/");
    expect(used).toBe("93.184.216.34");
  });
  it("re-checks redirects and refuses redirects to blocked hosts", async () => {
    const p = new SafeUrlMetaProvider(opts, publicLookup, async (u) =>
      u.hostname === "example.com" ? { status: 302, headers: { location: "https://169.254.169.254/latest" }, body: "" } : { status: 200, headers: {}, body: okHtml },
    );
    expect(await code(p.fetchMeta("https://example.com/"))).toBe("blocked_address");
    const toHttp = new SafeUrlMetaProvider(opts, publicLookup, async () => ({ status: 301, headers: { location: "http://example.org/" }, body: "" }));
    expect(await code(toHttp.fetchMeta("https://example.com/"))).toBe("scheme");
    const lookupToPrivate: Lookup = async (h) => (h === "rebind.example" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);
    const rebind = new SafeUrlMetaProvider(opts, lookupToPrivate, async () => ({ status: 302, headers: { location: "https://rebind.example/" }, body: "" }));
    expect(await code(rebind.fetchMeta("https://example.com/"))).toBe("blocked_address");
  });
  it("stops after maxRedirects", async () => {
    let n = 0;
    const p = new SafeUrlMetaProvider(opts, publicLookup, async () => ({ status: 302, headers: { location: `https://example.com/${++n}` }, body: "" }));
    expect(await code(p.fetchMeta("https://example.com/"))).toBe("redirects");
    expect(n).toBe(cfg.hook.maxRedirects + 1);
  });
  it("times out at 3 seconds", async () => {
    const p = new SafeUrlMetaProvider({ ...opts, timeoutMs: 50 }, publicLookup, () => new Promise(() => undefined));
    expect(await code(p.fetchMeta("https://example.com/"))).toBe("timeout");
  });
  it("caps the body at 256KB and requires HTML", async () => {
    const big = new SafeUrlMetaProvider(opts, publicLookup, async () => ({ status: 200, headers: { "content-type": "text/html" }, body: "x".repeat(cfg.hook.maxBytes + 1) }));
    expect(await code(big.fetchMeta("https://example.com/"))).toBe("too_large");
    const pdf = new SafeUrlMetaProvider(opts, publicLookup, async () => ({ status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF" }));
    expect(await code(pdf.fetchMeta("https://example.com/"))).toBe("not_html");
  });
  it("DNS failure and HTTP errors fail cleanly", async () => {
    const nodns = new SafeUrlMetaProvider(opts, async () => {
      throw new Error("ENOTFOUND");
    }, okReq);
    expect(await code(nodns.fetchMeta("https://nope.example/"))).toBe("dns");
    const e500 = new SafeUrlMetaProvider(opts, publicLookup, async () => ({ status: 500, headers: {}, body: "" }));
    expect(await code(e500.fetchMeta("https://example.com/"))).toBe("http");
  });
  it("parses OG fields and entities", () => {
    expect(parseMeta('<meta property="og:title" content="A &quot;B&quot;"><meta property="og:description" content="C">')).toEqual({ title: 'A "B"', description: "C" });
  });
});
