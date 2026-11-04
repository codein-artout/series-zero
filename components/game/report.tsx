/** Report button: a small disclosure with a reason select and a note (<= 280 chars). Works without JS. */
export function ReportButton({ targetType, targetId, back }: { targetType: string; targetId: string; back: string }) {
  const id = `rep-${targetType}-${targetId}`.replace(/[^a-z0-9-]/gi, "");
  return (
    <details className="report">
      <summary className="btn ghost sm" style={{ listStyle: "none" }}>
        Report
      </summary>
      <form method="post" action="/api/reports" className="card" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, padding: 14, minWidth: 260 }}>
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value={back} />
        <label className="lbl" htmlFor={`${id}-r`}>
          Reason
        </label>
        <select id={`${id}-r`} name="reason" className="field" defaultValue="other">
          <option value="harassment">Harassment</option>
          <option value="real_person">Real person</option>
          <option value="real_company">Real company</option>
          <option value="spam">Spam</option>
          <option value="injection">Prompt injection</option>
          <option value="other">Other</option>
        </select>
        <label className="lbl" htmlFor={`${id}-n`}>
          Note (optional)
        </label>
        <textarea id={`${id}-n`} name="note" className="field" rows={2} maxLength={280} />
        <button type="submit" className="btn red sm">
          Send report
        </button>
      </form>
    </details>
  );
}
