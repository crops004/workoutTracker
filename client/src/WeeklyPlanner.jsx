import { useEffect, useMemo, useState } from "react";

function parseISODateOnly(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDateOnly(dUtc) {
  return dUtc.toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const d = parseISODateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateOnly(d);
}

function fmtDowShort(iso) {
  const d = parseISODateOnly(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
}

function fmtMD(iso) {
  const d = parseISODateOnly(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

function localTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchJson(url, options) {
  const resp = await fetch(url, { cache: "no-store", ...(options || {}) });
  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json() : await resp.text();
  if (!resp.ok) throw new Error((data && data.error) || data || `${resp.status} ${resp.statusText}`);
  return data;
}

export default function WeeklyPlanner({
  apiBase,
  plans,
  planDisplayName,
  activeSessionId,
  activeSessionLabel,
  onResumeActive,
  onStartPlan,
}) {
  // use "today" as an anchor; backend normalizes to Monday and returns week_start
  const [weekStart, setWeekStart] = useState(() => localTodayISO());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Add modal state
  const [addForDate, setAddForDate] = useState(null);
  const [planSearch, setPlanSearch] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [labelOverride, setLabelOverride] = useState("");

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)),
    [weekStart]
  );

  const plansFiltered = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    if (!q) return plans || [];
    return (plans || []).filter((p) => String(planDisplayName(p) || "").toLowerCase().includes(q));
  }, [plans, planSearch, planDisplayName]);

  const itemsByDay = useMemo(() => {
    const m = new Map();
    for (const d of days) m.set(d, []);
    for (const it of items) {
      const key = String(it.planned_on).slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(it);
    }
    return m;
  }, [items, days]);

  async function loadWeek(ws) {
    setLoading(true);
    setErr("");
    try {
      const data = await fetchJson(`${apiBase}/api/calendar?week_start=${ws}`);
      setWeekStart(data.week_start); // canonical Monday from server
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWeek(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function goPrev() {
    await loadWeek(addDaysISO(weekStart, -7));
  }
  async function goNext() {
    await loadWeek(addDaysISO(weekStart, 7));
  }
  async function goToday() {
    await loadWeek(localTodayISO());
  }

  function openAdd(dateIso) {
    setAddForDate(dateIso);
    setPlanSearch("");
    setSelectedPlanId(null);
    setLabelOverride("");
  }

  async function saveAdd() {
    if (!addForDate || !selectedPlanId) return;

    await fetchJson(`${apiBase}/api/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planned_on: addForDate,
        workout_plan_id: Number(selectedPlanId),
        label: labelOverride.trim() ? labelOverride.trim() : null,
      }),
    });

    setAddForDate(null);
    await loadWeek(weekStart);
  }

  async function removeItem(id) {
    await fetchJson(`${apiBase}/api/calendar/${id}`, { method: "DELETE" });
    await loadWeek(weekStart);
  }

  function displayForItem(it) {
    // label override still wins
    if (it.label) return it.label;

    // new: show actual workout name if provided by API
    if (it.workout_name) return it.workout_name;

    // fallback (old behavior)
    const p = (plans || []).find((x) => Number(x.id) === Number(it.workout_plan_id));
    return p ? planDisplayName(p) : `Plan #${it.workout_plan_id}`;
  }

  return (
    <div className="card card-wide" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 900, fontSize: 20 }}>Weekly Planner</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Week of <b>{fmtMD(weekStart)}</b> (Mon–Sun)
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={goPrev}>◀</button>
          <button className="btn" onClick={goToday}>Today</button>
          <button className="btn" onClick={goNext}>▶</button>
        </div>
      </div>

      {activeSessionId && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Active workout</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            {activeSessionLabel ? `${activeSessionLabel} • ` : ""}Session #{activeSessionId}
          </div>
          <button className="btn btn-primary" onClick={onResumeActive}>
            Resume
          </button>
        </div>
      )}

      {err && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
          <div className="muted">{err}</div>
        </div>
      )}

      <div style={{ marginTop: 14 }} className="muted">
        {loading ? "Loading…" : ""}
      </div>

      {/* Compact day list for mobile */}
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {days.map((d) => {
          const list = itemsByDay.get(d) || [];
          const hasPlans = list.length > 0;
          return (
            <div key={d} className="card" style={{ padding: "9px 10px" }}>
              <div style={{ display: "grid", gap: 6 }}>
                {!hasPlans ? (
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="row" style={{ gap: 8, minWidth: 0 }}>
                      <div
                        className="muted"
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          letterSpacing: 0.3,
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                        }}
                      >
                        {fmtDowShort(d)} {fmtMD(d)}
                      </div>
                      <div className="muted" style={{ fontSize: 14 }}>No plan</div>
                    </div>
                    <button className="btn" onClick={() => openAdd(d)} style={{ padding: "6px 10px", fontSize: 13 }}>
                      + Add
                    </button>
                  </div>
                ) : (
                  list.map((it, idx) => (
                    <div key={it.id} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 8,
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                      >
                        {idx === 0 ? (
                          <div
                            className="muted"
                            style={{
                              fontWeight: 700,
                              fontSize: 12,
                              letterSpacing: 0.3,
                              whiteSpace: "nowrap",
                              textTransform: "uppercase",
                              flexShrink: 0,
                            }}
                          >
                            {fmtDowShort(d)} {fmtMD(d)}
                          </div>
                        ) : (
                          <div style={{ width: 86, flexShrink: 0 }} />
                        )}
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 16,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {displayForItem(it)}
                        </div>
                      </div>

                      <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                        <button
                          className="btn btn-primary"
                          title="Start planned workout"
                          aria-label="Start planned workout"
                          onClick={() => onStartPlan(Number(it.workout_plan_id), Number(it.id))}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            padding: 0,
                            fontSize: 13,
                            lineHeight: 1,
                          }}
                        >
                          ▶
                        </button>
                        <button
                          className="btn"
                          title="Remove from planner"
                          aria-label="Remove from planner"
                          onClick={() => removeItem(it.id)}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            padding: 0,
                            fontSize: 13,
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add modal (uses your existing modal styles) */}
      {addForDate && (
        <div className="modal-overlay" onClick={() => setAddForDate(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>
              Add plan for {fmtMD(addForDate)}
            </div>

            <div className="muted tiny" style={{ marginBottom: 6 }}>Search</div>
            <input
              className="input"
              value={planSearch}
              onChange={(e) => setPlanSearch(e.target.value)}
              placeholder="Type to filter plans…"
            />

            <div className="muted tiny" style={{ marginTop: 12, marginBottom: 6 }}>Pick a plan</div>
            <div className="row wrap" style={{ gap: 8, maxHeight: 220, overflow: "auto" }}>
              {plansFiltered.map((p) => (
                <button
                  key={p.id}
                  className={`btn btn-pill ${Number(selectedPlanId) === Number(p.id) ? "btn-primary" : ""}`}
                  onClick={() => setSelectedPlanId(p.id)}
                >
                  {planDisplayName(p)}
                </button>
              ))}
            </div>

            <div className="muted tiny" style={{ marginTop: 12, marginBottom: 6 }}>
              Optional label override
            </div>
            <input
              className="input"
              value={labelOverride}
              onChange={(e) => setLabelOverride(e.target.value)}
              placeholder='e.g. "Lift A — Week 3"'
            />

            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={() => setAddForDate(null)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveAdd}
                disabled={!selectedPlanId}
                style={{ flex: 1 }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
