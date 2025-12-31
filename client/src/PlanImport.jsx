import { useMemo, useState } from "react";

async function fetchJson(url, options) {
  const resp = await fetch(url, { cache: "no-store", ...(options || {}) });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json() : await resp.text();
  if (!resp.ok) throw new Error((data && data.error) || data || `${resp.status} ${resp.statusText}`);
  return data;
}

export default function PlanImport({ apiBase, onImported }) {
  const [tsv, setTsv] = useState("");
  const [mode, setMode] = useState("create"); // create | replace
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const hasText = tsv.trim().length > 0;

  const sample = useMemo(() => {
    return [
      "plan_name\tbase_template_name\texercise_name\tsort_order\ttarget_sets\ttarget_reps\ttarget_weight\tnotes",
      "Week 4 (Auto)\tLower + Upper Mix\tRomanian Deadlift\t1\t3\t8\t50\tAdd 5 lb vs last week",
      "Week 4 (Auto)\tLower + Upper Mix\tCable Pull Through\t2\t3\t12\t120\tKeep reps strict",
    ].join("\n");
  }, []);

  async function runImport() {
    setBusy(true);
    setErr("");
    setResult("");
    try {
      const data = await fetchJson(`${apiBase}/api/import/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tsv, dry_run: dryRun, mode }),
      });
      setResult(JSON.stringify(data, null, 2));

      if (data?.ok && data?.dry_run === false) {
        await onImported?.();
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(file) {
    const text = await file.text();
    setTsv(text);
  }

  return (
    <div className="card card-wide" style={{ padding: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Import Plan TSV</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Paste TSV or upload a .tsv file. Use <b>Dry run</b> first.
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="muted" style={{ fontSize: 13 }}>
            Mode{" "}
            <select
              className="input"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ width: 140, marginLeft: 8 }}
            >
              <option value="create">create</option>
              <option value="replace">replace</option>
            </select>
          </label>

          <label className="muted" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Dry run (no DB writes)
          </label>

          <input
            type="file"
            accept=".tsv,text/tab-separated-values,text/plain"
            onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
          />

          <button className="btn btn-primary" disabled={!hasText || busy} onClick={runImport}>
            {busy ? "Running..." : "Import"}
          </button>

          <button className="btn" onClick={() => setTsv(sample)}>
            Load sample
          </button>
        </div>

        <textarea
          className="input"
          value={tsv}
          onChange={(e) => setTsv(e.target.value)}
          placeholder="Paste TSV here..."
          style={{ minHeight: 220, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />

        {err ? (
          <div className="card" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
            <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{err}</div>
          </div>
        ) : null}

        {result ? (
          <div className="card" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Result</div>
            <pre className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{result}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
