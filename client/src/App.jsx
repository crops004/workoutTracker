import { useEffect, useMemo, useState, useCallback } from "react";
import WeeklyPlanner from "./WeeklyPlanner";
import RunView from "./RunView";
import ManageView from "./ManageView";
import { useRunner } from "./useRunner";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function pingHealth() {
  const resp = await fetch(`${API}/api/health`, { cache: "no-store" });

  // If Render returns HTML or something weird during warmup, this protects you
  const ct = resp.headers.get("content-type") || "";
  if (!resp.ok) throw new Error(`health not ok (${resp.status})`);
  if (!ct.includes("application/json")) throw new Error("health returned non-json");

  return resp.json();
}

async function waitForApi({ timeoutMs = 45000, intervalMs = 1500 } = {}) {
  const start = Date.now();
  let lastErr = null;

  while (Date.now() - start < timeoutMs) {
    try {
      await pingHealth();
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw lastErr || new Error("API did not wake up in time");
}

function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage errors
  }
}

function lsDel(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export default function App() {
  const [apiReady, setApiReady] = useState(false);
  const [apiWaking, setApiWaking] = useState(true);
  const [apiWakeError, setApiWakeError] = useState("");

  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const [showQuitModal, setShowQuitModal] = useState(false);
  const [view, setView] = useState("run"); // "run" | "manage" | "planner"

  const runner = useRunner(API);

  const [exercises, setExercises] = useState([]);
  const [newExName, setNewExName] = useState("");

  // NEW: create-exercise fields
  const [newExTrackingType, setNewExTrackingType] = useState("weight_reps"); // "weight_reps" | "time"
  const [newExTimeUnit, setNewExTimeUnit] = useState("seconds"); // "seconds" | "minutes"
  const [newExUrl, setNewExUrl] = useState("");
  const [newExNotes, setNewExNotes] = useState("");

  // NEW: edit exercise modal/card state
  const [editingExercise, setEditingExercise] = useState(null); // exercise object
  const [exEditName, setExEditName] = useState("");
  const [exEditTrackingType, setExEditTrackingType] = useState("weight_reps");
  const [exEditTimeUnit, setExEditTimeUnit] = useState("seconds");
  const [exEditUrl, setExEditUrl] = useState("");
  const [exEditNotes, setExEditNotes] = useState("");
  const [exerciseEditStatus, setExerciseEditStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"

  const [workoutTemplates, setWorkoutTemplates] = useState([]);
  const [newWorkoutName, setNewWorkoutName] = useState("");

  const [editingWorkout, setEditingWorkout] = useState(null);
  const [manageSaveMsg, setManageSaveMsg] = useState("");

  const [addExerciseId, setAddExerciseId] = useState("");

  const [manageTab, setManageTab] = useState("workouts"); // "exercises" | "workouts" | "history" | "plans"
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [plans, setPlans] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);

  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanTemplateId, setNewPlanTemplateId] = useState("");

  const [selectedPlanId, setSelectedPlanId] = useState("");

  const [isRenamingWorkout, setIsRenamingWorkout] = useState(false);
  const [workoutNameDraft, setWorkoutNameDraft] = useState("");
  const [renameWorkoutStatus, setRenameWorkoutStatus] = useState("idle"); // idle | saving | error

  const [historyMode, setHistoryMode] = useState("list"); // "list" | "table"
  const [plansMode, setPlansMode] = useState("list"); // "list" | "import"

  // Plan rename draft
  const [planNameDraft, setPlanNameDraft] = useState("");

  function planDisplayName(p) {
    if (!p) return "";
    const t = p.template_name || p.templateName || p.template;
    const n = p.name || "";
    return t ? `${t} — ${n}` : n;
  }

  async function refreshPlans() {
    const list = await fetch(`${API}/api/plans`).then((r) => r.json());
    setPlans(Array.isArray(list) ? list : []);
  }

  // Wake API on load
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setApiWaking(true);
        setApiWakeError("");
        await waitForApi({ timeoutMs: 45000, intervalMs: 1500 });
        if (!alive) return;
        setApiReady(true);
      } catch  { // ignore
        if (!alive) return;
        setApiWakeError("Waking up the server took too long. Tap retry.");
      } finally {
        if (alive) setApiWaking(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  // Load plans
  useEffect(() => {
    refreshPlans().catch((e) => console.error("Failed to load plans", e));
  }, []);

  // Load session history for manage view
  useEffect(() => {
    if (view !== "manage") return;
    if (manageTab !== "history") return;

    setHistoryLoading(true);
    setHistoryError("");

    fetch(`${API}/api/sessions?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(Array.isArray(data) ? data : []);
        setHistoryLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load sessions", e);
        setHistoryError("Failed to load sessions");
        setHistoryLoading(false);
      });
  }, [view, manageTab]);

  // Load exercises for manage view
  useEffect(() => {
    if (view !== "manage") return;
    fetch(`${API}/api/exercises`).then((r) => r.json()).then(setExercises);
    fetch(`${API}/api/workout-templates`).then((r) => r.json()).then(setWorkoutTemplates);
  }, [view]);

  // Close quit modal on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setShowQuitModal(false);
    }
    if (showQuitModal) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showQuitModal]);

  // Restore selected workout from localStorage (runner restores session/exerciseIndex itself)
  useEffect(() => {
    const savedWorkoutId = lsGet("wt_activeWorkoutId", null);
    if (savedWorkoutId) setSelectedWorkoutId(savedWorkoutId);
  }, []);

  // Load workout list
  useEffect(() => {
    fetch(`${API}/api/workouts`).then((r) => r.json()).then(setWorkouts);
  }, []);

  // Load selected workout template
  useEffect(() => {
    setSelectedWorkout(null);
    if (!selectedWorkoutId) return;
    fetch(`${API}/api/workouts/${selectedWorkoutId}`)
      .then((r) => r.json())
      .then((data) => {
        setSelectedWorkout(data);
      });
  }, [selectedWorkoutId]);

  // Switch history view to list mode when a session is selected
  useEffect(() => {
    if (selectedSession) setHistoryMode("list");
  }, [selectedSession]);

  useEffect(() => {
    if (plansMode === "import") setEditingPlan(null);
  }, [plansMode]);

  const selectedWorkoutName = useMemo(() => {
    const id = Number(selectedWorkoutId);
    return workouts.find((w) => Number(w.id) === id)?.name ?? "";
  }, [workouts, selectedWorkoutId]);

  const plansForSelectedWorkout = useMemo(() => {
    const id = Number(selectedWorkoutId);
    if (!id) return [];
    return plans.filter((p) => Number(p.base_template_id) === id);
  }, [plans, selectedWorkoutId]);
  const isWorkoutInProgress = view === "run" && Boolean(runner.sessionId);

  async function loadPlans() {
    const resp = await fetch(`${API}/api/plans`, { cache: "no-store" });
    const data = await resp.json();
    if (resp.ok) setPlans(data);
  }

  function formatLocalDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    }).format(d);
  }

  function formatPrimaryValue(exercise, repsValue) {
    if (repsValue == null) return "—";

    const isTime = exercise?.tracking_type === "time";
    if (!isTime) return String(repsValue);

    const unit = exercise?.time_unit || "seconds";

    if (unit === "minutes") {
      const mins = Math.round(Number(repsValue) / 60);
      return `${mins} min`;
    }

    return `${repsValue} sec`;
  }

  function planLabel(p) {
    // UI-only fix so "Week 1" displays as "Lift B — Week 1" even if stored name is short
    if (!selectedWorkoutName) return p.name;
    const a = String(p.name || "").toLowerCase();
    const b = String(selectedWorkoutName || "").toLowerCase();
    return a.includes(b) ? p.name : `${selectedWorkoutName} — ${p.name}`;
  }

  // Load session details
  async function openSession(sessionId) {
    setHistoryError("");
    try {
      const resp = await fetch(`${API}/api/sessions/${sessionId}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to load session");
      setSelectedSession(data);
    } catch (e) {
      console.error(e);
      setHistoryError(String(e.message || e));
    }
  }

  async function deleteSessionFromHistory(sessionId) {
    const ok = window.confirm("Delete this session from history? This will remove all sets for it.");
    if (!ok) return;

    try {
      const resp = await fetch(`${API}/api/sessions/${sessionId}`, { method: "DELETE" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        alert(data.error || "Delete failed");
        return;
      }

      setSelectedSession(null);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      console.error(e);
      alert("Delete failed");
    }
  }

  async function createPlan() {
    if (!newPlanTemplateId) {
      alert("Pick a workout shell (Lift A/B/C)");
      return;
    }

    const resp = await fetch(`${API}/api/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_template_id: Number(newPlanTemplateId),
        name: newPlanName || undefined,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || "Create plan failed");
      return;
    }

    await refreshPlans();
    setEditingPlan(data);
    setPlanNameDraft(data?.plan?.name ?? "");
    setNewPlanName("");
    setNewPlanTemplateId("");
  }

  async function renamePlan(planId, newName) {
    const nm = String(newName ?? "").trim();
    if (!nm) return;

    const resp = await fetch(`${API}/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nm }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || "Rename failed");
      return;
    }

    setEditingPlan(data);
    setPlanNameDraft(data?.plan?.name ?? nm);
    await refreshPlans();
  }

  async function deletePlan(planId) {
    const ok = window.confirm("Delete this plan? (This does NOT delete any history sessions.)");
    if (!ok) return;

    const resp = await fetch(`${API}/api/plans/${planId}`, { method: "DELETE" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || "Delete plan failed");
      return;
    }

    setEditingPlan(null);
    setPlanNameDraft("");
    if (String(selectedPlanId) === String(planId)) setSelectedPlanId("");
    await refreshPlans();
  }

  async function createExercise() {
    const payload = {
      name: newExName,
      tracking_type: newExTrackingType,
      time_unit: newExTrackingType === "time" ? newExTimeUnit : "seconds",
      info_url: newExUrl.trim() || null,
      notes: newExNotes.trim() || null,
    };

    const resp = await fetch(`${API}/api/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Failed");

    setExercises((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));

    // reset
    setNewExName("");
    setNewExTrackingType("weight_reps");
    setNewExTimeUnit("seconds");
    setNewExUrl("");
    setNewExNotes("");
  }

  async function deleteExercise(id) {
    const resp = await fetch(`${API}/api/exercises/${id}`, { method: "DELETE" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return alert(data.error || "Failed");
    setExercises((p) => p.filter((x) => x.id !== id));
  }

  function openExerciseEditor(ex) {
    setEditingExercise(ex);
    setExEditName(ex.name ?? "");
    setExEditTrackingType(ex.tracking_type ?? "weight_reps");
    setExEditTimeUnit(ex.time_unit ?? "seconds");
    setExEditUrl(ex.info_url ?? "");
    setExEditNotes(ex.notes ?? "");
    setExerciseEditStatus("idle");
  }

  function closeExerciseEditor() {
    setEditingExercise(null);
    setExerciseEditStatus("idle");
  }

  async function saveExerciseEdits() {
    if (!editingExercise) return;

    setExerciseEditStatus("saving");

    const payload = {
      name: exEditName,
      tracking_type: exEditTrackingType,
      time_unit: exEditTrackingType === "time" ? exEditTimeUnit : "seconds",
      info_url: exEditUrl.trim() || null,
      notes: exEditNotes.trim() || null,
    };

    try {
      const resp = await fetch(`${API}/api/exercises/${editingExercise.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const ct = resp.headers.get("content-type") || "";
      const data = ct.includes("application/json")
        ? await resp.json()
        : { error: await resp.text() };
      if (!resp.ok) throw new Error(data.error || "Save failed");

      setExercises((prev) =>
        prev.map((x) => (x.id === data.id ? data : x)).sort((a, b) => a.name.localeCompare(b.name))
      );

      setEditingExercise(data);
      setExerciseEditStatus("saved");
      setTimeout(() => setExerciseEditStatus("idle"), 900);
    } catch (e) {
      console.error(e);
      setExerciseEditStatus("error");
    }
  }

  async function createWorkout() {
    const resp = await fetch(`${API}/api/workout-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newWorkoutName }),
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Failed");
    setWorkoutTemplates((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewWorkoutName("");
  }

  async function deleteWorkout(id) {
    const resp = await fetch(`${API}/api/workout-templates/${id}`, { method: "DELETE" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return alert(data.error || "Failed");
    setWorkoutTemplates((p) => p.filter((x) => x.id !== id));
    if (editingWorkout?.id === id) setEditingWorkout(null);
  }

  async function openWorkoutEditor(workoutId) {
    const resp = await fetch(`${API}/api/workout-templates/${workoutId}`);
    const data = await resp.json();
    setEditingWorkout(data);
    setIsRenamingWorkout(false);
    setWorkoutNameDraft(data?.name ?? "");
    setRenameWorkoutStatus("idle");
    setAddExerciseId("");
    setManageSaveMsg("");
  }

  async function addExerciseToWorkout() {
    if (!editingWorkout || !addExerciseId) return;

    const resp = await fetch(`${API}/api/workout-templates/${editingWorkout.id}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercise_id: Number(addExerciseId),
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || `Add failed (${resp.status})`);
      return;
    }

    setEditingWorkout(data);
    setAddExerciseId("");
  }

  async function removeExerciseFromWorkout(exerciseId) {
    if (!editingWorkout) return;

    const resp = await fetch(
      `${API}/api/workout-templates/${editingWorkout.id}/exercises/${exerciseId}`,
      { method: "DELETE" }
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || `Remove failed (${resp.status})`);
      return;
    }

    setEditingWorkout(data);
  }

  async function moveExercise(exerciseId, direction) {
    if (!editingWorkout) return;

    const resp = await fetch(
      `${API}/api/workout-templates/${editingWorkout.id}/exercises/${exerciseId}/move`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      }
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || `Move failed (${resp.status})`);
      return;
    }

    setEditingWorkout(data);
  }

  function beginRenameWorkout() {
    if (!editingWorkout) return;
    setWorkoutNameDraft(editingWorkout.name || "");
    setIsRenamingWorkout(true);
    setRenameWorkoutStatus("idle");
  }

  function cancelRenameWorkout() {
    if (!editingWorkout) return;
    setWorkoutNameDraft(editingWorkout.name || "");
    setIsRenamingWorkout(false);
    setRenameWorkoutStatus("idle");
  }

  async function saveRenameWorkout() {
    if (!editingWorkout) return;

    const nextName = String(workoutNameDraft || "").trim();
    if (!nextName) {
      alert("Name cannot be empty");
      return;
    }

    // no-op
    if (nextName === editingWorkout.name) {
      setIsRenamingWorkout(false);
      return;
    }

    setRenameWorkoutStatus("saving");
    try {
      const resp = await fetch(`${API}/api/workout-templates/${editingWorkout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Rename failed");

      // update the open editor
      setEditingWorkout((prev) => (prev ? { ...prev, name: data.name } : prev));
      setIsRenamingWorkout(false);
      setRenameWorkoutStatus("idle");

      // update Manage list (workoutTemplates)
      setWorkoutTemplates((prev) =>
        prev.map((w) => (w.id === data.id ? { ...w, name: data.name } : w))
      );

      // update Run dropdown list (workouts)
      setWorkouts((prev) =>
        prev.map((w) => (w.id === data.id ? { ...w, name: data.name } : w))
      );

      // if this workout is currently selected in Run view, keep it consistent
      setSelectedWorkout((prev) =>
        prev?.workout?.id === data.id
          ? { ...prev, workout: { ...prev.workout, name: data.name } }
          : prev
      );
    } catch (e) {
      console.error(e);
      setRenameWorkoutStatus("error");
    }
  }

  async function quitWorkoutConfirmed() {
    await runner.quitAndDeleteSession();
    setShowQuitModal(false);
  }

  useEffect(() => {
    if (selectedWorkoutId) lsSet("wt_activeWorkoutId", selectedWorkoutId);
    else lsDel("wt_activeWorkoutId");
  }, [selectedWorkoutId]);

  return (
    <div className="container">
      {!isWorkoutInProgress && <h1>Workout Tracker</h1>}

      {/* ---------- API warmup gate ---------- */}
      {!apiReady ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
            {apiWaking ? "Waking up server…" : "Server not ready"}
          </div>

          <div className="muted" style={{ marginBottom: 12 }}>
            {apiWaking
              ? "This happens after the app has been idle for a while."
              : apiWakeError || "Tap retry."}
          </div>

          {!apiWaking && (
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          )}
        </div>
      ) : (
        <>
          {!isWorkoutInProgress && (
            <div className="row" style={{ marginBottom: 12 }}>
              <button
                className={`btn ${view === "run" ? "btn-primary" : ""}`}
                onClick={() => setView("run")}
              >
                Run
              </button>
              <button
                className={`btn ${view === "planner" ? "btn-primary" : ""}`}
                onClick={() => setView("planner")}
              >
                Planner
              </button>
              <button
                className={`btn ${view === "manage" ? "btn-primary" : ""}`}
                onClick={() => setView("manage")}
              >
                Manage
              </button>
            </div>
          )}

      {/* ---------------- PLANNER ---------------- */}
      {view === "planner" && (
        <WeeklyPlanner
          apiBase={API}
          plans={plans}
          planDisplayName={planDisplayName}
          activeSessionId={runner.sessionId}
          activeSessionLabel={runner.runnerWorkoutName}
          onResumeActive={() => setView("run")}
          onStartPlan={async (planId, workoutCalendarId) => {
            await runner.startSessionFromPlan(planId, workoutCalendarId);
            setView("run");
          }}
        />
      )}

      {/* ---------------- RUN ---------------- */}
      {view === "run" && (
        <RunView
          workouts={workouts}
          selectedWorkoutId={selectedWorkoutId}
          setSelectedWorkoutId={setSelectedWorkoutId}
          selectedWorkout={selectedWorkout}
          resetRunnerState={runner.resetRunnerState}
          plansForSelectedWorkout={plansForSelectedWorkout}
          selectedWorkoutName={selectedWorkoutName}
          planLabel={planLabel}
          startSession={runner.startSession}
          startSessionFromPlan={runner.startSessionFromPlan}
          sessionId={runner.sessionId}
          currentExercise={runner.currentExercise}
          runnerExercises={runner.runnerExercises}
          runnerWorkoutName={runner.runnerWorkoutName}
          exerciseIndex={runner.exerciseIndex}
          setsByExercise={runner.setsByExercise}
          updateSetField={runner.updateSetField}
          addSetRow={runner.addSetRow}
          removeSetRow={runner.removeSetRow}
          lastTimeByExercise={runner.lastTimeByExercise}
          saveExerciseInfoUrl={runner.saveExerciseInfoUrl}
          formatDateShort={formatLocalDateTime}
          formatPrimaryValue={formatPrimaryValue}
          saveStatusByExercise={runner.saveStatusByExercise}
          prevExercise={runner.prevExercise}
          nextExercise={runner.nextExercise}
          finishWorkout={runner.finishWorkout}
          onQuitWorkout={() => setShowQuitModal(true)}
        />
      )}

      {/* ---------------- MANAGE ---------------- */}
      {view === "manage" && (
        <ManageView
          manageTab={manageTab}
          setManageTab={setManageTab}
          exercises={exercises}
          newExName={newExName}
          setNewExName={setNewExName}
          newExTrackingType={newExTrackingType}
          setNewExTrackingType={setNewExTrackingType}
          newExTimeUnit={newExTimeUnit}
          setNewExTimeUnit={setNewExTimeUnit}
          newExUrl={newExUrl}
          setNewExUrl={setNewExUrl}
          newExNotes={newExNotes}
          setNewExNotes={setNewExNotes}
          editingExercise={editingExercise}
          exEditName={exEditName}
          setExEditName={setExEditName}
          exEditTrackingType={exEditTrackingType}
          setExEditTrackingType={setExEditTrackingType}
          exEditTimeUnit={exEditTimeUnit}
          setExEditTimeUnit={setExEditTimeUnit}
          exEditUrl={exEditUrl}
          setExEditUrl={setExEditUrl}
          exEditNotes={exEditNotes}
          setExEditNotes={setExEditNotes}
          exerciseEditStatus={exerciseEditStatus}
          createExercise={createExercise}
          deleteExercise={deleteExercise}
          openExerciseEditor={openExerciseEditor}
          closeExerciseEditor={closeExerciseEditor}
          saveExerciseEdits={saveExerciseEdits}
          workoutTemplates={workoutTemplates}
          newWorkoutName={newWorkoutName}
          setNewWorkoutName={setNewWorkoutName}
          createWorkout={createWorkout}
          deleteWorkout={deleteWorkout}
          editingWorkout={editingWorkout}
          setEditingWorkout={setEditingWorkout}
          openWorkoutEditor={openWorkoutEditor}
          isRenamingWorkout={isRenamingWorkout}
          beginRenameWorkout={beginRenameWorkout}
          cancelRenameWorkout={cancelRenameWorkout}
          workoutNameDraft={workoutNameDraft}
          setWorkoutNameDraft={setWorkoutNameDraft}
          renameWorkoutStatus={renameWorkoutStatus}
          saveRenameWorkout={saveRenameWorkout}
          addExerciseId={addExerciseId}
          setAddExerciseId={setAddExerciseId}
          addExerciseToWorkout={addExerciseToWorkout}
          removeExerciseFromWorkout={removeExerciseFromWorkout}
          moveExercise={moveExercise}
          manageSaveMsg={manageSaveMsg}
          historyMode={historyMode}
          setHistoryMode={setHistoryMode}
          historyError={historyError}
          historyLoading={historyLoading}
          sessions={sessions}
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          formatLocalDateTime={formatLocalDateTime}
          openSession={openSession}
          deleteSessionFromHistory={deleteSessionFromHistory}
          plansMode={plansMode}
          setPlansMode={setPlansMode}
          apiBase={API}
          workouts={workouts}
          plans={plans}
          loadPlans={loadPlans}
          newPlanTemplateId={newPlanTemplateId}
          setNewPlanTemplateId={setNewPlanTemplateId}
          newPlanName={newPlanName}
          setNewPlanName={setNewPlanName}
          createPlan={createPlan}
          editingPlan={editingPlan}
          setEditingPlan={setEditingPlan}
          planDisplayName={planDisplayName}
          planNameDraft={planNameDraft}
          setPlanNameDraft={setPlanNameDraft}
          renamePlan={renamePlan}
          deletePlan={deletePlan}
        />
      )}

      {/* Quit modal */}
      {showQuitModal && (
        <div className="modal-overlay" onClick={() => setShowQuitModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Quit workout?</div>

            <div className="muted" style={{ marginBottom: 14 }}>
              This will delete the entire session (and all sets) from the database.
            </div>

            <div className="row" style={{ gap: 10 }}>
              <button className="btn" onClick={() => setShowQuitModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={quitWorkoutConfirmed} style={{ flex: 1 }}>
                Yes, quit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )}
</div>
  );
}
