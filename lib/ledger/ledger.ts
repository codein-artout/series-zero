/**
 * Double-entry scrip ledger (GAME.md section 11).
 * Invariant: sum(all accounts except MINT and BURN) = totalMinted - totalBurned;
 * every amount is an integer; no account is negative except MINT and BURN (bookkeeping).
 */

export type AccountKind = "WALLET" | "COMPANY" | "FUND" | "TREASURY";
export type AccountId = `${AccountKind}:${string}` | "MINT" | "BURN";

export const MINT_REASONS = ["stipend", "genesis", "revenue", "treasury", "treasury_topup", "angel", "prize"] as const;
export const BURN_REASONS = ["opex", "debt", "pitch_fee", "close_fee", "exit_fee", "wind_down", "fraud_fine", "season_reset", "edit_fee"] as const;
export const TRANSFER_REASONS = ["investment", "exit_payout", "exit_wallet", "acquisition_cash"] as const;
export type MintReason = (typeof MINT_REASONS)[number];
export type BurnReason = (typeof BURN_REASONS)[number];
export type TransferReason = (typeof TRANSFER_REASONS)[number];
export type LedgerReason = MintReason | BurnReason | TransferReason;

export interface LedgerEntry {
  seq: number;
  tick: number;
  from: AccountId;
  to: AccountId;
  amount: number;
  reason: LedgerReason;
  memo?: string;
}

export class LedgerError extends Error {}

export function account(kind: AccountKind, id: string): AccountId {
  return `${kind}:${id}`;
}

export interface LedgerSnapshot {
  balances: Record<string, number>;
  minted: number;
  burned: number;
  seq: number;
}

export class Ledger {
  private balances = new Map<AccountId, number>();
  minted = 0;
  burned = 0;
  seq = 0;
  /** Entries since the last drain (for persistence). */
  pending: LedgerEntry[] = [];
  /** Optional cap on retained history in memory; persistence keeps the full log. */
  keepHistory = false;
  history: LedgerEntry[] = [];

  static fromSnapshot(s: LedgerSnapshot): Ledger {
    const l = new Ledger();
    for (const [k, v] of Object.entries(s.balances)) l.balances.set(k as AccountId, v);
    l.minted = s.minted;
    l.burned = s.burned;
    l.seq = s.seq;
    return l;
  }

  snapshot(): LedgerSnapshot {
    const balances: Record<string, number> = {};
    for (const [k, v] of [...this.balances.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) balances[k] = v;
    return { balances, minted: this.minted, burned: this.burned, seq: this.seq };
  }

  balance(a: AccountId): number {
    return this.balances.get(a) ?? 0;
  }

  open(a: AccountId): void {
    if (!this.balances.has(a)) this.balances.set(a, 0);
  }

  accounts(): AccountId[] {
    return [...this.balances.keys()];
  }

  /** Move `amount` (positive integer) from one account to another. */
  transfer(tick: number, from: AccountId, to: AccountId, amount: number, reason: LedgerReason, memo?: string): LedgerEntry | null {
    if (!Number.isInteger(amount)) throw new LedgerError(`non-integer amount ${amount} (${reason})`);
    if (amount < 0) throw new LedgerError(`negative amount ${amount} (${reason})`);
    if (amount === 0) return null;
    if (from === to) throw new LedgerError("self transfer");
    if (to === "MINT") throw new LedgerError("cannot pay into MINT");
    if (from === "BURN") throw new LedgerError("cannot pay out of BURN");
    if (from !== "MINT") {
      const bal = this.balance(from);
      if (bal < amount) throw new LedgerError(`insufficient funds in ${from}: ${bal} < ${amount} (${reason})`);
      this.balances.set(from, bal - amount);
    } else {
      this.minted += amount;
    }
    if (to === "BURN") this.burned += amount;
    else this.balances.set(to, this.balance(to) + amount);
    const e: LedgerEntry = { seq: ++this.seq, tick, from, to, amount, reason, memo };
    this.pending.push(e);
    if (this.keepHistory) this.history.push(e);
    return e;
  }

  mint(tick: number, to: AccountId, amount: number, reason: MintReason, memo?: string) {
    return this.transfer(tick, "MINT", to, amount, reason, memo);
  }

  burn(tick: number, from: AccountId, amount: number, reason: BurnReason, memo?: string) {
    return this.transfer(tick, from, "BURN", amount, reason, memo);
  }

  /** Pays up to `amount`; returns what was actually paid (never overdraws). */
  burnUpTo(tick: number, from: AccountId, amount: number, reason: BurnReason, memo?: string): number {
    const pay = Math.min(this.balance(from), Math.max(0, Math.round(amount)));
    this.burn(tick, from, pay, reason, memo);
    return pay;
  }

  /** Total supply held by real accounts. */
  supply(): number {
    let s = 0;
    for (const v of this.balances.values()) s += v;
    return s;
  }

  supplyOf(kind: AccountKind): number {
    let s = 0;
    for (const [k, v] of this.balances) if (k.startsWith(kind + ":")) s += v;
    return s;
  }

  drain(): LedgerEntry[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }

  /** Returns a list of violations; empty means the invariant holds. */
  check(): string[] {
    const errs: string[] = [];
    let s = 0;
    for (const [k, v] of this.balances) {
      if (!Number.isInteger(v)) errs.push(`${k} balance not integer: ${v}`);
      if (v < 0) errs.push(`${k} negative: ${v}`);
      s += v;
    }
    if (!Number.isInteger(this.minted) || !Number.isInteger(this.burned)) errs.push("minted/burned not integer");
    if (s !== this.minted - this.burned) errs.push(`conservation broken: supply ${s} != minted ${this.minted} - burned ${this.burned}`);
    return errs;
  }

  /** Throws loudly if the invariant is broken. */
  assertInvariant(context = ""): void {
    const errs = this.check();
    if (errs.length) throw new LedgerError(`Ledger invariant failed${context ? ` (${context})` : ""}: ${errs.join("; ")}`);
  }
}

/** Replays entries from zero and verifies the invariant (used to audit persisted logs). */
export function replay(entries: readonly LedgerEntry[]): Ledger {
  const l = new Ledger();
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) l.transfer(e.tick, e.from, e.to, e.amount, e.reason, e.memo);
  l.assertInvariant("replay");
  return l;
}
