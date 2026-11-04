import { describe, expect, it } from "vitest";
import { Ledger, LedgerError, account, replay } from "@/lib/ledger";

describe("double-entry ledger", () => {
  it("conserves supply across mint, transfer and burn", () => {
    const l = new Ledger();
    const w = account("WALLET", "u1");
    const c = account("COMPANY", "c1");
    const f = account("FUND", "f1");
    l.mint(0, f, 60_000_000, "genesis");
    l.mint(0, w, 10_000, "stipend");
    l.transfer(1, f, c, 1_200_000, "investment");
    l.burn(1, c, 12_000, "close_fee");
    l.burn(2, w, 300, "pitch_fee");
    expect(l.check()).toEqual([]);
    expect(l.supply()).toBe(l.minted - l.burned);
    expect(l.balance(c)).toBe(1_188_000);
  });

  it("rejects non-integer, negative, overdraft and invalid routes", () => {
    const l = new Ledger();
    const a = account("WALLET", "a");
    l.mint(0, a, 100, "stipend");
    expect(() => l.transfer(0, a, account("WALLET", "b"), 1.5, "investment")).toThrow(LedgerError);
    expect(() => l.transfer(0, a, account("WALLET", "b"), -1, "investment")).toThrow(LedgerError);
    expect(() => l.transfer(0, a, account("WALLET", "b"), 101, "investment")).toThrow(LedgerError);
    expect(() => l.transfer(0, a, "MINT", 1, "investment")).toThrow(LedgerError);
    expect(() => l.transfer(0, "BURN", a, 1, "investment")).toThrow(LedgerError);
    expect(l.check()).toEqual([]);
  });

  it("burnUpTo never overdraws", () => {
    const l = new Ledger();
    const c = account("COMPANY", "c");
    l.mint(0, c, 500, "angel");
    expect(l.burnUpTo(1, c, 800, "opex")).toBe(500);
    expect(l.balance(c)).toBe(0);
    l.assertInvariant();
  });

  it("snapshot round-trips and replay audits the log", () => {
    const l = new Ledger();
    l.keepHistory = true;
    const t = account("TREASURY", "npc1");
    const f = account("FUND", "f");
    l.mint(0, t, 500_000_000, "treasury");
    l.mint(0, f, 1000, "genesis");
    l.transfer(3, t, f, 999, "exit_payout");
    const s = Ledger.fromSnapshot(l.snapshot());
    expect(s.check()).toEqual([]);
    expect(s.balance(f)).toBe(1999);
    const r = replay(l.history);
    expect(r.snapshot()).toEqual(l.snapshot());
  });

  it("detects a corrupted balance", () => {
    const l = new Ledger();
    l.mint(0, account("WALLET", "x"), 10, "stipend");
    const snap = l.snapshot();
    snap.balances["WALLET:x"] = 11;
    expect(Ledger.fromSnapshot(snap).check().length).toBeGreaterThan(0);
  });
});
