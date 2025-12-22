import { useEffect, useMemo, useState, useCallback } from "react";

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

  const [sessionId, setSessionId] = useState(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);

  const [setsByExercise, setSetsByExercise] = useState({});
  const [saveStatusByExercise, setSaveStatusByExercise] = useState({});
  const [lastTimeByExercise, setLastTimeByExercise] = useState({});

  const [showQuitModal, setShowQuitModal] = useState(false);
  const [view, setView] = useState("run"); // "run" | "manage"

  const [exercises, setExercises] = useState([]);
  const [newExName, setNewExName] = useState("");

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

  const [runnerWorkoutName, setRunnerWorkoutName] = useState("");
  const [runnerExercises, setRunnerExercises] = useState([]);

  const [isRenamingWorkout, setIsRenamingWorkout] = useState(false);
  const [workoutNameDraft, setWorkoutNameDraft] = useState("");
  const [renameWorkoutStatus, setRenameWorkoutStatus] = useState("idle"); // idle | saving | error

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

  // Persist selected workout/session/exercise index
  useEffect(() => {
    const savedSessionId = lsGet("wt_activeSessionId", null);
    const savedWorkoutId = lsGet("wt_activeWorkoutId", null);
    const savedExerciseIndex = lsGet("wt_activeExerciseIndex", 0);

    if (savedWorkoutId) setSelectedWorkoutId(savedWorkoutId);
    if (savedSessionId) setSessionId(savedSessionId);
    if (typeof savedExerciseIndex === "number") setExerciseIndex(savedExerciseIndex);
  }, []);

  // Load workout list
  useEffect(() => {
    fetch(`${API}/api/workouts`).then((r) => r.json()).then(setWorkouts);
  }, []);

  // Load selected workout template
  useEffect(() => {
    if (!selectedWorkoutId) return;
    fetch(`${API}/api/workouts/${selectedWorkoutId}`)
      .then((r) => r.json())
      .then((data) => {
        setSelectedWorkout(data);
      });
  }, [selectedWorkoutId]);

  // Load runner data when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    loadRunner(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const currentExercise = useMemo(() => {
    if (!runnerExercises?.length) return null;
    return runnerExercises[exerciseIndex] || null;
  }, [runnerExercises, exerciseIndex]);

  const selectedWorkoutName = useMemo(() => {
    const id = Number(selectedWorkoutId);
    return workouts.find((w) => Number(w.id) === id)?.name ?? "";
  }, [workouts, selectedWorkoutId]);

  const plansForSelectedWorkout = useMemo(() => {
    const id = Number(selectedWorkoutId);
    if (!id) return [];
    return plans.filter((p) => Number(p.base_template_id) === id);
  }, [plans, selectedWorkoutId]);

  function formatLocalDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);

    // Example output: 12/22/25, 6:09 PM (depends on locale)
    const s = new Intl.DateTimeFormat(undefined, {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);

    // Match your example: "12/22/25 - 6:09" (strip AM/PM)
    return s.replace(",", " -").replace(/\s?(AM|PM)$/i, "");
  }

  function planLabel(p) {
    // UI-only fix so "Week 1" displays as "Lift B — Week 1" even if stored name is short
    if (!selectedWorkoutName) return p.name;
    const a = String(p.name || "").toLowerCase();
    const b = String(selectedWorkoutName || "").toLowerCase();
    return a.includes(b) ? p.name : `${selectedWorkoutName} — ${p.name}`;
  }

  function repsSeedFromTarget(targetReps) {
    // supports "8", "8-10", "10+" -> uses first number
    const m = String(targetReps ?? "").match(/\d+/);
    return m ? m[0] : "";
  }

  const makePlannedSetsForExercise = useCallback((ex) => {
    const n = Number(ex.target_sets || 3);
    const w = ex.target_weight == null ? "" : String(ex.target_weight);
    const reps = repsSeedFromTarget(ex.target_reps);

    return Array.from({ length: n }, (_, i) => ({
      set_number: i + 1,
      weight: w,
      reps,
      rpe: "",
    }));
  }, []);

  function makeEmptySets(count = 3) {
    return Array.from({ length: count }, (_, i) => ({
      set_number: i + 1,
      weight: "",
      reps: "",
      rpe: "",
    }));
  }

  function padToTargetSets(existingRows, targetSets) {
    const rows = [...existingRows];
    while (rows.length < targetSets) {
      rows.push({ set_number: rows.length + 1, weight: "", reps: "", rpe: "" });
    }
    return rows.map((r, idx) => ({ ...r, set_number: idx + 1 }));
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
    const resp = await fetch(`${API}/api/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newExName }),
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Failed");
    setExercises((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewExName("");
  }

  async function deleteExercise(id) {
    const resp = await fetch(`${API}/api/exercises/${id}`, { method: "DELETE" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return alert(data.error || "Failed");
    setExercises((p) => p.filter((x) => x.id !== id));
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

  async function startSession() {
    if (!selectedWorkout) return;

    const resp = await fetch(`${API}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workout_template_id: selectedWorkout.workout.id,
        performed_on: new Date().toISOString().slice(0, 10),
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || "Failed to start session");
      return;
    }

    setSessionId(data.session_id);
    setExerciseIndex(0);

    lsSet("wt_activeSessionId", data.session_id);
    lsSet("wt_activeWorkoutId", selectedWorkout.workout.id);
    lsSet("wt_activeExerciseIndex", 0);

    await loadRunner(data.session_id);
  }

  async function startSessionFromPlan(planId) {
    const resp = await fetch(`${API}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: Number(planId),
        performed_on: new Date().toISOString().slice(0, 10),
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || "Failed to start plan session");
      return;
    }

    setSessionId(data.session_id);
    setExerciseIndex(0);

    lsSet("wt_activeSessionId", data.session_id);
    lsSet("wt_activeExerciseIndex", 0);

    await loadRunner(data.session_id);
  }

  async function loadRunner(sessId) {
    try {
      const resp = await fetch(`${API}/api/sessions/${sessId}/runner`);
      const data = await resp.json();

      if (!resp.ok) {
        alert(data.error || "Failed to load runner");
        return;
      }

      setRunnerWorkoutName(data.workout_name || "");
      setRunnerExercises(Array.isArray(data.exercises) ? data.exercises : []);

      // Ensure first exercise has rows (seed with planned weight/reps)
      const first = (data.exercises || [])[0];
      if (first) {
        setSetsByExercise((prev) => {
          if (prev[first.exercise_id]?.length) return prev;
          return { ...prev, [first.exercise_id]: makePlannedSetsForExercise(first) };
        });
      }
    } catch (e) {
      console.error("Failed to load runner", e);
      alert("Failed to load runner");
    }
  }

  function ensureSetRows(exerciseId, count = 3) {
    setSetsByExercise((prev) => {
      if (prev[exerciseId]?.length) return prev;
      return { ...prev, [exerciseId]: makeEmptySets(count) };
    });
  }

  function updateSetField(exerciseId, setIdx, field, value) {
    setSetsByExercise((prev) => {
      const copy = { ...prev };
      const rows = copy[exerciseId] ? [...copy[exerciseId]] : [];
      rows[setIdx] = { ...rows[setIdx], [field]: value };
      copy[exerciseId] = rows;
      return copy;
    });
  }

  function addSetRow(exerciseId) {
    setSetsByExercise((prev) => {
      const rows = prev[exerciseId] ? [...prev[exerciseId]] : [];
      rows.push({ set_number: rows.length + 1, weight: "", reps: "", rpe: "" });
      return { ...prev, [exerciseId]: rows };
    });
  }

  function removeSetRow(exerciseId) {
    setSetsByExercise((prev) => {
      const rows = prev[exerciseId] ? [...prev[exerciseId]] : [];
      if (rows.length <= 1) return prev;
      rows.pop();
      return { ...prev, [exerciseId]: rows };
    });
  }

  function resetRunnerState() {
    setSessionId(null);
    setExerciseIndex(0);
    setSetsByExercise({});
    setSaveStatusByExercise({});
    setLastTimeByExercise({});
    setRunnerWorkoutName("");
    setRunnerExercises([]);
    lsDel("wt_activeSessionId");
    lsDel("wt_activeWorkoutId");
    lsDel("wt_activeExerciseIndex");
  }

  async function saveExercise(exercise) {
    if (!sessionId) return false;

    const exId = exercise.exercise_id;
    const rows = setsByExercise[exId] || [];

    const cleaned = rows
      .map((r) => ({
        set_number: r.set_number,
        weight: r.weight === "" ? null : Number(r.weight),
        reps: r.reps === "" ? null : Number(r.reps),
        rpe: r.rpe === "" ? null : Number(r.rpe),
      }))
      .filter((r) => r.weight !== null || r.reps !== null || r.rpe !== null);

    if (cleaned.length === 0) {
      setSaveStatusByExercise((p) => ({ ...p, [exId]: "idle" }));
      return true;
    }

    setSaveStatusByExercise((p) => ({ ...p, [exId]: "saving" }));

    try {
      const resp = await fetch(`${API}/api/sets/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          exercise_id: exId,
          sets: cleaned,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Save failed");

      setSaveStatusByExercise((p) => ({ ...p, [exId]: "idle" }));
      return true;
    } catch (e) {
      console.error(e);
      setSaveStatusByExercise((p) => ({ ...p, [exId]: "error" }));
      return false;
    }
  }

  async function prevExercise() {
    if (!currentExercise) return;
    const ok = await saveExercise(currentExercise);
    if (!ok) return;
    setExerciseIndex((i) => Math.max(i - 1, 0));
  }

  async function nextExercise() {
    if (!currentExercise) return;
    const ok = await saveExercise(currentExercise);
    if (!ok) return;
    const lastIdx = runnerExercises.length - 1;
    setExerciseIndex((i) => Math.min(i + 1, lastIdx));
  }

  async function finishWorkout() {
    if (!currentExercise) return;
    const ok = await saveExercise(currentExercise);
    if (!ok) return;
    resetRunnerState();
  }

  async function quitWorkoutConfirmed() {
    if (!sessionId) {
      resetRunnerState();
      return;
    }

    try {
      await fetch(`${API}/api/sessions/${sessionId}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete session", e);
    } finally {
      setShowQuitModal(false);
      resetRunnerState();
    }
  }

  useEffect(() => {
    if (sessionId) lsSet("wt_activeSessionId", sessionId);
    else lsDel("wt_activeSessionId");
  }, [sessionId]);

  useEffect(() => {
    if (selectedWorkoutId) lsSet("wt_activeWorkoutId", selectedWorkoutId);
    else lsDel("wt_activeWorkoutId");
  }, [selectedWorkoutId]);

  useEffect(() => {
    lsSet("wt_activeExerciseIndex", exerciseIndex);
  }, [exerciseIndex]);

  useEffect(() => {
    if (!sessionId) return;
    if (!runnerExercises?.length) return;

    fetch(`${API}/api/sessions/${sessionId}/sets`)
      .then((r) => r.json())
      .then((rows) => {
        const grouped = {};
        for (const row of rows) {
          const exId = row.exercise_id;
          if (!grouped[exId]) grouped[exId] = [];
          grouped[exId].push({
            set_number: row.set_number,
            weight: row.weight == null ? "" : String(row.weight),
            reps: row.reps == null ? "" : String(row.reps),
            rpe: row.rpe == null ? "" : String(row.rpe),
          });
        }

        const finalMap = {};
        for (const ex of runnerExercises) {
          const exId = ex.exercise_id;
          const existing = (grouped[exId] || []).sort((a, b) => a.set_number - b.set_number);

          // If nothing logged yet, seed from the plan/template targets
          finalMap[exId] =
            existing.length === 0
              ? makePlannedSetsForExercise(ex)
              : padToTargetSets(existing, ex.target_sets || 3);
        }

        setSetsByExercise(finalMap);
      })
      .catch((e) => console.error("Failed to load sets", e));
  }, [sessionId, runnerExercises, makePlannedSetsForExercise]);

  useEffect(() => {
    if (!currentExercise) return;
    ensureSetRows(currentExercise.exercise_id, currentExercise.target_sets || 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIndex, sessionId]);

  useEffect(() => {
    if (!currentExercise) return;

    const exId = currentExercise.exercise_id;
    const url = new URL(`${API}/api/exercises/${exId}/last`);
    if (sessionId) url.searchParams.set("exclude_session_id", sessionId);

    fetch(url.toString())
      .then((r) => r.json())
      .then((data) => {
        setLastTimeByExercise((prev) => ({ ...prev, [exId]: data }));
      })
      .catch((e) => console.error("Failed to load last time", e));
  }, [currentExercise, sessionId]);

  const status = currentExercise ? saveStatusByExercise[currentExercise.exercise_id] || "idle" : "idle";
  const isSaving = status === "saving";
  const isError = status === "error";
  const isLast = runnerExercises.length ? exerciseIndex === runnerExercises.length - 1 : false;

  return (
    <div className="container">
      <h1>Workout Tracker</h1>

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
          <div className="row" style={{ marginBottom: 12 }}>
            <button
              className={`btn ${view === "run" ? "btn-primary" : ""}`}
              onClick={() => setView("run")}
            >
              Run
            </button>
            <button
              className={`btn ${view === "manage" ? "btn-primary" : ""}`}
              onClick={() => setView("manage")}
            >
              Manage
            </button>
          </div>

      {/* ---------------- RUN ---------------- */}
      {view === "run" && (
        <>
          <h2>Choose workout</h2>
            <div className="row wrap" style={{ marginBottom: 12 }}>
              <select
                className="input"
                value={selectedWorkoutId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  resetRunnerState();          // switching shells ends current session state
                  setSelectedWorkoutId(v ? Number(v) : null);
                }}
                style={{ flex: 1, minWidth: 220 }}
              >
                <option value="">Select workout…</option>
                {workouts.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedWorkoutId && (
              <>
                <h2>Choose plan</h2>

                {plansForSelectedWorkout.length === 0 ? (
                  <p className="muted" style={{ opacity: 0.8 }}>
                    No plans for {selectedWorkoutName}. Create one in Manage → Plans.
                  </p>
                ) : (
                  <div className="row wrap" style={{ marginBottom: 12, gap: 10 }}>
                    {plansForSelectedWorkout.map((p) => (
                      <button
                        key={p.id}
                        className="btn btn-pill"
                        onClick={() => startSessionFromPlan(p.id)}
                      >
                        {planLabel(p)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Optional: still allow starting without plan */}
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Or start without a plan:
                </div>
                <button className="btn" onClick={startSession} style={{ marginTop: 8 }}>
                  Start {selectedWorkoutName}
                </button>
              </>
            )}

          {!selectedWorkout && <p style={{ opacity: 0.8 }}>Pick Lift A/B/C to begin.</p>}

          {sessionId && currentExercise && (
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ opacity: 0.8, marginBottom: 6 }}>
                {runnerWorkoutName ? `${runnerWorkoutName} • ` : ""}Session #{sessionId} • Exercise {exerciseIndex + 1} /{" "}
                {runnerExercises.length}
              </div>

              <h2 style={{ margin: 0 }}>{currentExercise.name}</h2>
              <div style={{ opacity: 0.8, marginBottom: 12 }}>
                Target: {currentExercise.target_sets} × {currentExercise.target_reps}
              </div>

              {(() => {
                const last = lastTimeByExercise[currentExercise.exercise_id];
                if (!last) return null;

                if (!last.found) {
                  return (
                    <div className="muted" style={{ marginBottom: 12 }}>
                      Last time: —
                    </div>
                  );
                }

                return (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Last time ({last.performed_on})</div>

                    <div className="muted" style={{ display: "grid", gap: 6 }}>
                      {last.sets.map((s) => (
                        <div key={s.set_number}>
                          Set {s.set_number}: {s.weight ?? "—"} × {s.reps ?? "—"}
                          {s.rpe != null ? ` (RPE ${s.rpe})` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: "grid", gap: 10 }}>
                {(setsByExercise[currentExercise.exercise_id] || []).map((row, idx) => (
                  <div className="set-row" key={row.set_number}>
                    <div className="set-label" style={{ fontWeight: 700 }}>
                      Set {row.set_number}
                    </div>

                    <input
                      className="set-weight"
                      inputMode="decimal"
                      placeholder="Weight"
                      value={row.weight}
                      onChange={(e) => updateSetField(currentExercise.exercise_id, idx, "weight", e.target.value)}
                    />
                    <input
                      className="set-reps"
                      inputMode="numeric"
                      placeholder="Reps"
                      value={row.reps}
                      onChange={(e) => updateSetField(currentExercise.exercise_id, idx, "reps", e.target.value)}
                    />
                    <input
                      className="set-rpe"
                      inputMode="decimal"
                      placeholder="RPE"
                      value={row.rpe}
                      onChange={(e) => updateSetField(currentExercise.exercise_id, idx, "rpe", e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => removeSetRow(currentExercise.exercise_id)}>
                  -
                </button>
                <button className="btn" onClick={() => addSetRow(currentExercise.exercise_id)}>
                  +
                </button>

                <div style={{ flex: 1 }} />

                <div className="muted" style={{ fontSize: 14 }}>
                  {status === "saving" ? "Saving…" : status === "error" ? "Error — tap Next/Prev to retry" : ""}
                </div>
              </div>

              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" onClick={prevExercise} disabled={exerciseIndex === 0 || isSaving}>
                  {isSaving ? "Saving…" : isError ? "Retry save" : "Prev"}
                </button>

                {isLast ? (
                  <button className="btn btn-primary" onClick={finishWorkout} disabled={isSaving}>
                    {isSaving ? "Saving…" : isError ? "Retry save" : "Finish workout"}
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={nextExercise} disabled={isSaving}>
                    {isSaving ? "Saving…" : isError ? "Retry save" : "Next"}
                  </button>
                )}

                <button className="btn" onClick={() => setShowQuitModal(true)} disabled={isSaving}>
                  Quit workout
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- MANAGE ---------------- */}
      {view === "manage" && (
        <div className="card card-wide" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Manage</h2>

          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`btn ${manageTab === "exercises" ? "btn-primary" : ""}`} onClick={() => setManageTab("exercises")}>
              Exercises
            </button>
            <button className={`btn ${manageTab === "workouts" ? "btn-primary" : ""}`} onClick={() => setManageTab("workouts")}>
              Workouts
            </button>
            <button className={`btn ${manageTab === "history" ? "btn-primary" : ""}`} onClick={() => setManageTab("history")}>
              History
            </button>
            <button className={`btn ${manageTab === "plans" ? "btn-primary" : ""}`} onClick={() => setManageTab("plans")}>
              Plans
            </button>
          </div>

          {/* ---------------- EXERCISES ---------------- */}
          {manageTab === "exercises" && (
            <div style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Exercise library</h3>

              <div className="row">
                <input
                  placeholder="Exercise name (e.g., Leg Press)"
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={createExercise}>
                  Add
                </button>
              </div>

              <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10 }}>
                {exercises.length === 0 ? (
                  <div className="muted">No exercises yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {exercises.map((ex) => (
                      <div key={ex.id} className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 700 }}>{ex.name}</div>
                        <button className="btn" onClick={() => deleteExercise(ex.id)}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------- WORKOUTS ---------------- */}
          {manageTab === "workouts" && (
            <div style={{ display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Workouts</h3>

              <div className="row">
                <input
                  placeholder="Workout name (e.g., Lift D)"
                  value={newWorkoutName}
                  onChange={(e) => setNewWorkoutName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={createWorkout}>
                  Add
                </button>
              </div>

              <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10 }}>
                {workoutTemplates.length === 0 ? (
                  <div className="muted">No workouts yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {workoutTemplates.map((w) => (
                      <div key={w.id} className="row" style={{ justifyContent: "space-between" }}>
                        <button className="btn btn-pill" onClick={() => openWorkoutEditor(w.id)}>
                          {w.name}
                        </button>

                        <button className="btn" onClick={() => deleteWorkout(w.id)}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editingWorkout && (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {!isRenamingWorkout ? (
                        <>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>{editingWorkout.name}</div>
                          <div className="muted" style={{ fontSize: 14 }}>
                            Edit exercises + order (targets live on Plans)
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="muted tiny" style={{ marginBottom: 6 }}>Workout name</div>
                          <input
                            className="input"
                            value={workoutNameDraft}
                            autoFocus
                            onChange={(e) => setWorkoutNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRenameWorkout();
                              if (e.key === "Escape") cancelRenameWorkout();
                            }}
                          />
                          {renameWorkoutStatus === "error" && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                              Rename failed — try again.
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="row" style={{ gap: 8 }}>
                      {!isRenamingWorkout ? (
                        <button className="btn" onClick={beginRenameWorkout}>
                          Rename
                        </button>
                      ) : (
                        <>
                          <button className="btn" onClick={cancelRenameWorkout} disabled={renameWorkoutStatus === "saving"}>
                            Cancel
                          </button>
                          <button className="btn btn-primary" onClick={saveRenameWorkout} disabled={renameWorkoutStatus === "saving"}>
                            {renameWorkoutStatus === "saving" ? "Saving…" : "Save"}
                          </button>
                        </>
                      )}

                      <button className="btn" onClick={() => setEditingWorkout(null)} disabled={renameWorkoutStatus === "saving"}>
                        Close
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    <div className="muted" style={{ fontSize: 14 }}>
                      Add exercise
                    </div>

                    <div className="manage-add-row">
                      <select
                        className="input"
                        value={addExerciseId}
                        onChange={(e) => setAddExerciseId(e.target.value)}
                      >
                        <option value="">Select exercise…</option>
                        {exercises.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.name}
                          </option>
                        ))}
                      </select>

                      <button className="btn btn-primary" onClick={addExerciseToWorkout} disabled={!addExerciseId}>
                        Add
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10 }}>
                    {editingWorkout.exercises.length === 0 ? (
                      <div className="muted">No exercises in this workout yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {editingWorkout.exercises.map((ex, idx) => {

                          return (
                            <div key={ex.exercise_id} className="manage-ex-row">
                              <div className="manage-ex-title">{ex.name}</div>

                              <div className="manage-ex-fields">
                                <div className="manage-ex-actions">
                                  <button
                                    className="btn"
                                    disabled={idx === 0}
                                    onClick={() => moveExercise(ex.exercise_id, "up")}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    className="btn"
                                    disabled={idx === editingWorkout.exercises.length - 1}
                                    onClick={() => moveExercise(ex.exercise_id, "down")}
                                  >
                                    ↓
                                  </button>
                                  <button className="btn" onClick={() => removeExerciseFromWorkout(ex.exercise_id)}>
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {manageSaveMsg && <div className="muted" style={{ marginTop: 10 }}>{manageSaveMsg}</div>}
                </div>
              )}
            </div>
          )}

          {/* ---------------- History ---------------- */}
          {manageTab === "history" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 20 }}>History</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Last 50 sessions
                  </div>
                </div>

                {selectedSession && (
                  <div className="row" style={{ gap: 10 }}>
                    <button className="btn" onClick={() => deleteSessionFromHistory(selectedSession.id)}>
                      Delete session
                    </button>
                    <button className="btn" onClick={() => setSelectedSession(null)}>
                      Back
                    </button>
                  </div>
                )}
              </div>

              {historyError && (
                <div className="card" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
                  <div className="muted">{historyError}</div>
                </div>
              )}

              {!selectedSession && (
                <div className="card card-wide">
                  {historyLoading ? (
                    <div className="muted">Loading…</div>
                  ) : sessions.length === 0 ? (
                    <div className="muted">No sessions yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {sessions.map((s) => (
                        <button
                          key={s.id}
                          className="btn"
                          style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 14, textAlign: "left" }}
                          onClick={() => openSession(s.id)}
                        >
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontWeight: 800 }}>{s.workout_name}</div>
                            <div className="muted" style={{ fontSize: 13 }}>
                              {formatLocalDateTime(s.created_at)}
                            </div>
                          </div>

                          <div className="muted" style={{ fontSize: 14 }}>
                            ›
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedSession && (
                <div className="card card-wide">
                  <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{selectedSession.workout_name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {formatLocalDateTime(selectedSession.created_at)} • Session #{selectedSession.id}
                    </div>
                  </div>

                  {!selectedSession.exercises || selectedSession.exercises.length === 0 ? (
                    <div className="muted">No sets logged.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {selectedSession.exercises.map((ex) => (
                        <div key={ex.exercise_id} className="card" style={{ padding: 12 }}>
                          <div style={{ fontWeight: 900, marginBottom: 8 }}>{ex.name}</div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {ex.sets.map((set) => (
                              <div key={set.set_number} className="muted" style={{ display: "flex", justifyContent: "space-between" }}>
                                <div>Set {set.set_number}</div>
                                <div>
                                  {set.weight ?? "—"} × {set.reps ?? "—"}
                                  {set.rpe != null ? ` (RPE ${set.rpe})` : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---------------- Plans ---------------- */}
          {manageTab === "plans" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Plans</div>

              <div className="card" style={{ display: "grid", gap: 10 }}>
                <div className="muted">Create a planned workout from a workout shell</div>

                <select className="input" value={newPlanTemplateId} onChange={(e) => setNewPlanTemplateId(e.target.value)}>
                  <option value="">Select workout…</option>
                  {workouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>

                <input
                  className="input"
                  placeholder='Plan name (e.g., "Week 1", "Heavy", "Light", "Deload")'
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                />

                <button className="btn btn-primary" onClick={createPlan}>
                  Create plan
                </button>
              </div>

              <div className="card" style={{ display: "grid", gap: 8 }}>
                <div className="muted">Your plans</div>

                <div className="row wrap">
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      className="btn btn-pill"
                      onClick={async () => {
                        const data = await fetch(`${API}/api/plans/${p.id}`).then((r) => r.json());
                        setEditingPlan(data);
                        setPlanNameDraft(data?.plan?.name ?? "");
                      }}
                    >
                      {planDisplayName(p)}
                    </button>
                  ))}
                </div>
              </div>

              {editingPlan && (
                <div className="card" style={{ display: "grid", gap: 10 }}>
                  <div className="row" style={{ alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>
                      {planDisplayName(editingPlan.plan)}
                    </div>
                    <div style={{ flex: 1 }} />
                    <button className="btn" onClick={() => deletePlan(editingPlan.plan.id)}>
                      Delete plan
                    </button>
                    <button className="btn" onClick={() => setEditingPlan(null)}>
                      Close
                    </button>
                  </div>

                  <div className="card" style={{ display: "grid", gap: 8 }}>
                    <div className="muted tiny">Rename plan</div>
                    <input
                      className="input"
                      value={planNameDraft}
                      onChange={(e) => setPlanNameDraft(e.target.value)}
                      onBlur={() => renamePlan(editingPlan.plan.id, planNameDraft)}
                      placeholder="Plan name"
                    />
                    <div className="muted" style={{ fontSize: 12 }}>
                      Display will be: <b>{editingPlan.plan.template_name} — {planNameDraft || editingPlan.plan.name}</b>
                    </div>
                  </div>

                  <div className="muted">Set plan targets (sets/reps/weight)</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {editingPlan.exercises.map((ex) => (
                      <div key={ex.id} className="manage-ex-row">
                        <div className="manage-ex-title">{ex.name}</div>

                        <div className="manage-ex-fields">
                          <div>
                            <div className="muted tiny">Sets</div>
                            <input
                              className="input"
                              inputMode="numeric"
                              value={ex.target_sets ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditingPlan((prev) => ({
                                  ...prev,
                                  exercises: prev.exercises.map((x) => (x.id === ex.id ? { ...x, target_sets: v } : x)),
                                }));
                              }}
                              onBlur={async () => {
                                const resp = await fetch(`${API}/api/plans/${editingPlan.plan.id}/exercises/${ex.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ target_sets: ex.target_sets }),
                                });
                                const data = await resp.json();
                                if (resp.ok) setEditingPlan(data);
                                else alert(data.error || "Save failed");
                              }}
                            />
                          </div>

                          <div>
                            <div className="muted tiny">Reps</div>
                            <input
                              className="input"
                              value={ex.target_reps ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditingPlan((prev) => ({
                                  ...prev,
                                  exercises: prev.exercises.map((x) => (x.id === ex.id ? { ...x, target_reps: v } : x)),
                                }));
                              }}
                              onBlur={async () => {
                                const resp = await fetch(`${API}/api/plans/${editingPlan.plan.id}/exercises/${ex.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ target_reps: ex.target_reps }),
                                });
                                const data = await resp.json();
                                if (resp.ok) setEditingPlan(data);
                                else alert(data.error || "Save failed");
                              }}
                            />
                          </div>

                          <div>
                            <div className="muted tiny">Planned wt</div>
                            <input
                              className="input"
                              inputMode="decimal"
                              placeholder="e.g. 45"
                              value={ex.target_weight ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditingPlan((prev) => ({
                                  ...prev,
                                  exercises: prev.exercises.map((x) => (x.id === ex.id ? { ...x, target_weight: v } : x)),
                                }));
                              }}
                              onBlur={async () => {
                                const resp = await fetch(`${API}/api/plans/${editingPlan.plan.id}/exercises/${ex.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ target_weight: ex.target_weight }),
                                });
                                const data = await resp.json();
                                if (resp.ok) setEditingPlan(data);
                                else alert(data.error || "Save failed");
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
