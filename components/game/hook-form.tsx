"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProgressStrip } from "@/components/ui/game";

const STEPS = ["Reading your idea", "Writing the founder's DNA", "Booking the panel"];

export function HookForm({ maxChars }: { maxChars: number }) {
  const router = useRouter();
  const [sentence, setSentence] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!sentence.trim()) return setError("Describe your startup in one sentence.");
    if (sentence.length > maxChars) return setError(`Your sentence is ${sentence.length} characters. The limit is ${maxChars}.`);
    setBusy(true);
    setDone(0);
    timers.current = [setTimeout(() => setDone(1), 900), setTimeout(() => setDone(2), 2200)];
    try {
      const res = await fetch("/api/hook", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ sentence, url, ambition: "moonshot" }) });
      const data = (await res.json()) as { ok: boolean; error?: string; pitchId?: string; urlNote?: string };
      timers.current.forEach(clearTimeout);
      if (!data.ok || !data.pitchId) {
        setBusy(false);
        setDone(0);
        setError(data.error ?? "Something broke. Try again.");
        return;
      }
      setDone(3);
      if (data.urlNote) setNote(data.urlNote);
      router.push(`/pitch/${data.pitchId}?new=1`);
    } catch {
      setBusy(false);
      setDone(0);
      setError("The floor did not answer. Try again.");
    }
  }

  return (
    <form className="card" style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }} onSubmit={submit} aria-busy={busy}>
      <label className="lbl" htmlFor="idea">
        Your startup, one sentence
      </label>
      <textarea id="idea" name="sentence" className="field" rows={3} value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder="Soil-sensing drones that tell smallholder farms when to irrigate, sold as a per-acre subscription." maxLength={maxChars * 2} disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? "hook-err" : "idea-count"} />
      <span id="idea-count" className="legal">
        {sentence.length} / {maxChars}
      </span>
      <label className="lbl" htmlFor="url">
        Optional: a URL (we read the title and description only)
      </label>
      <input id="url" name="url" className="field" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" disabled={busy} />
      {error ? (
        <p id="hook-err" className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? <ProgressStrip steps={STEPS} done={done} active /> : null}
      {note ? <p className="legal">{note}</p> : null}
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <button type="submit" className="btn" disabled={busy} aria-busy={busy || undefined}>
          {busy ? "Spawning" : "Spawn my founder"}
        </button>
        <a className="btn ghost" href="/floor">
          Watch the floor first
        </a>
      </div>
      <p className="legal">Your founder is fictional and so are the funds. Simulation, not investment advice. No signup needed; sign in later to keep the founder.</p>
    </form>
  );
}
