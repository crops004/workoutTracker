import { useEffect, useMemo, useState } from "react";

async function fetchJson(url) {
  const resp = await fetch(url, { cache: "no-store" });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json() : await resp.text();
  if (!resp.ok) throw new Error((data && data.error) || data || `${resp.status} ${resp.statusText}`);
  return data;
}

function toTSV(rows, columns) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    // TSV is forgiving; just replace tabs/newlines
    return s.replaceAll("\t", " ").replaceAll("\n", " ");
  };
  const header = columns.map((c) => c.label).join("\t");
  const body = rows
    .map((r) => columns.map((c) => esc(r[c.key])).join("\t"))
    .join("\n");
  return `${header}\n${body}`;
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HistoryTable({ apiBase }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const columns = useMemo(
    () => [
      { key: "performed_on", label: "date" },
      { key: "workout_name", label: "workout" },
      { key: "plan_name", label: "plan" },
      { key: "template_name", label: "template" },
      { key: "exercise_name", label: "exercise" },
      { key: "set_number", label: "set" },
      { key: "weight", label: "weight" },
      { key: "reps", label: "reps" },
      { key: "rpe", label: "rpe" },
      { key: "target_sets", label: "t_sets" },
      { key: "target_reps", label: "t_reps" },
      { key: "target_weight", label: "t_weight" },
      { key: "session_id", label: "session_id" },
    ],
    []
  );

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      params.set("limit", "20000");
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const data = await fetchJson(`${apiBase}/api/history/sets?${params.toString()}`);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = [
        r.workout_name,
        r.plan_name,
        r.template_name,
        r.exercise_name,
        r.performed_on,
      ]
        .filter(Boolean)
        .join(" | ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  async function copyTSV() {
    const tsv = toTSV(filtered, columns);
    await navigator.clipboard.writeText(tsv);
    alert(`Copied ${filtered.length} rows as TSV`);
  }

  function downloadCSV() {
    // quick TSV->CSV-ish: wrap commas/quotes properly
    const escCsv = (v) => {
      if (v == null) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };
    const header = columns.map((c) => escCsv(c.label)).join(",");
    const body = filtered
      .map((r) => columns.map((c) => escCsv(r[c.key])).join(","))
      .join("\n");
    downloadText("history.csv", `${header}\n${body}`, "text/csv");
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 16,
        width: "100%",
        maxWidth: 1200,   // desktop-friendly
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20 }}>History Table</div>
          <div className="muted" style={{ fontSize: 13 }}>
            One row per set • {filtered.length} rows
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={copyTSV} disabled={!filtered.length}>Copy TSV</button>
          <button className="btn" onClick={downloadCSV} disabled={!filtered.length}>Download CSV</button>
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {err && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
          <div className="muted">{err}</div>
        </div>
      )}

      <div className="row wrap" style={{ gap: 10, marginTop: 12, alignItems: "end" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div className="muted tiny">From</div>
          <input
            className="input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />

        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div className="muted tiny">To</div>
          <input
            className="input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={load}>Apply date filter</button>

        <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 220 }}>
          <div className="muted tiny">Search</div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. squat, week 3, bench…" />
        </div>
      </div>

      <div style={{ marginTop: 12 }} className="muted">
        {loading ? "Loading…" : ""}
      </div>

      <div
        style={{
            marginTop: 12,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            overflow: "hidden",
        }}
      >
        <div
          style={{
            overflowX: "auto",
            overflowY: "auto",
            maxHeight: "60vh",  // keeps it usable on desktop
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1100,   // prevents column smash
            }}
          >
          <thead style={{ position: "sticky", top: 0, background: "rgba(15,15,15,0.98)", zIndex: 1 }}>
            <tr>
                {columns.map((c) => (
                <th
                    key={c.key}
                    style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: 12,
                    borderBottom: "1px solid rgba(255,255,255,0.10)",
                    whiteSpace: "nowrap",
                    }}
                >
                    {c.label}
                </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => (
                <tr
                key={`${r.session_id}-${r.exercise_id}-${r.set_number}-${idx}`}
                style={{
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    background: idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                }}
                >
                {columns.map((c) => (
                    <td
                    key={c.key}
                    style={{
                        padding: "10px 12px",
                        fontSize: 13,
                        whiteSpace: "nowrap",
                    }}
                    >
                    {r[c.key] ?? ""}
                    </td>
                ))}
                </tr>
            ))}
            {!filtered.length && !loading ? (
                <tr>
                <td colSpan={columns.length} style={{ padding: 16 }} className="muted">
                    No rows
                </td>
                </tr>
            ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
