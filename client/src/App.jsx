import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
    // ignore
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
  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const [sessionId, setSessionId] = useState(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);

  // stores logged sets in memory for UI:
  // { [exerciseId]: [{ set_number, weight, reps, rpe }, ...] }
  const [setsByExercise, setSetsByExercise] = useState({});

  const [saveStatusByExercise, setSaveStatusByExercise] = useState({});
  // values: "idle" | "saving" | "saved" | "error"

  const [lastTimeByExercise, setLastTimeByExercise] = useState({});
  // { [exerciseId]: { found, performed_on, sets: [...] } }

  // Modal state for quitting a workout
  const [showQuitModal, setShowQuitModal] = useState(false);

  // Manage workouts view
  const [view, setView] = useState("run"); // "run" | "manage"

  const [manageTab, setManageTab] = useState("exercises");

  
  const [exercises, setExercises] = useState([]);
  const [newExName, setNewExName] = useState("");

  const [workoutTemplates, setWorkoutTemplates] = useState([]);
  const [newWorkoutName, setNewWorkoutName] = useState("");

  const [editingWorkout, setEditingWorkout] = useState(null);
  const [manageSaveMsg, setManageSaveMsg] = useState("");

  const [addExerciseId, setAddExerciseId] = useState("");
  const [addTargetSets, setAddTargetSets] = useState("3");
  const [addTargetReps, setAddTargetReps] = useState("8");

  const [manageSaveStatusByExerciseId, setManageSaveStatusByExerciseId] = useState({});
  // values: "idle" | "saving" | "saved" | "error"

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
    fetch(`${API}/api/workouts`)
      .then((r) => r.json())
      .then(setWorkouts);
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

  const currentExercise = useMemo(() => {
    if (!selectedWorkout) return null;
    return selectedWorkout.exercises[exerciseIndex] || null;
  }, [selectedWorkout, exerciseIndex]);

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
      rows.push({
        set_number: rows.length + 1,
        weight: "",
        reps: "",
        rpe: "",
      });
    }

    // normalize set_number to 1..N
    return rows.map((r, idx) => ({ ...r, set_number: idx + 1 }));
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
    setAddExerciseId("");
    setManageSaveMsg("");
  }

  // Add exercise to a workout
  async function addExerciseToWorkout() {
    if (!editingWorkout || !addExerciseId) return;

    const resp = await fetch(`${API}/api/workout-templates/${editingWorkout.id}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercise_id: Number(addExerciseId),
        target_sets: Number(addTargetSets || 3),
        target_reps: String(addTargetReps || "8"),
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
    setSessionId(data.session_id);
    setExerciseIndex(0);

    lsSet("wt_activeSessionId", data.session_id);
    lsSet("wt_activeWorkoutId", selectedWorkout.workout.id);
    lsSet("wt_activeExerciseIndex", 0);

    const first = selectedWorkout.exercises[0];
    if (first) {
      setSetsByExercise({ [first.id]: makeEmptySets(first.target_sets || 3) });
    } else {
      setSetsByExercise({});
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
      const nextNum = rows.length + 1;
      rows.push({ set_number: nextNum, weight: "", reps: "", rpe: "" });
      return { ...prev, [exerciseId]: rows };
    });
  }

  function removeSetRow(exerciseId) {
    setSetsByExercise((prev) => {
      const rows = prev[exerciseId] ? [...prev[exerciseId]] : [];
      if (rows.length <= 1) return prev; // don’t go below 1 row
      rows.pop();
      return { ...prev, [exerciseId]: rows };
    });
  }

  function resetRunnerState() {
    setSessionId(null);
    setExerciseIndex(0);
    setSetsByExercise({});
    setSaveStatusByExercise({});
    lsDel("wt_activeSessionId");
    lsDel("wt_activeWorkoutId");
    lsDel("wt_activeExerciseIndex");
  }

  async function saveExercise(exercise) {
    if (!sessionId) return false;

    const rows = setsByExercise[exercise.id] || [];

    const cleaned = rows
      .map((r) => ({
        set_number: r.set_number,
        weight: r.weight === "" ? null : Number(r.weight),
        reps: r.reps === "" ? null : Number(r.reps),
        rpe: r.rpe === "" ? null : Number(r.rpe),
      }))
      .filter((r) => r.weight !== null || r.reps !== null || r.rpe !== null);

    // If nothing entered, treat as "nothing to save" and allow navigation
    if (cleaned.length === 0) {
      setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "idle" }));
      return true;
    }

    setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "saving" }));

    try {
      const resp = await fetch(`${API}/api/sets/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          exercise_id: exercise.id,
          sets: cleaned,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Save failed");

      // Keep it simple: saving -> idle (no need for saved ✓ now)
      setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "idle" }));
      return true;
    } catch (e) {
      console.error(e);
      setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "error" }));
      return false;
    }
  }

  async function prevExercise() {
    if (!selectedWorkout || !currentExercise) return;

    const ok = await saveExercise(currentExercise);
    if (!ok) return;

    setExerciseIndex((i) => Math.max(i - 1, 0));
  }

  async function nextExercise() {
    if (!selectedWorkout || !currentExercise) return;

    const ok = await saveExercise(currentExercise);
    if (!ok) return;

    const lastIdx = selectedWorkout.exercises.length - 1;
    setExerciseIndex((i) => Math.min(i + 1, lastIdx));
  }

  async function finishWorkout() {
    if (!selectedWorkout || !currentExercise) return;

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

  async function updateTemplateExercise(exerciseId, patch) {
    if (!editingWorkout) return;

    setManageSaveStatusByExerciseId((p) => ({ ...p, [exerciseId]: "saving" }));

    try {
      const resp = await fetch(
        `${API}/api/workout-templates/${editingWorkout.id}/exercises/${exerciseId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Update failed (${resp.status})`);

      setEditingWorkout(data);

      setManageSaveStatusByExerciseId((p) => ({ ...p, [exerciseId]: "saved" }));
      setTimeout(() => {
        setManageSaveStatusByExerciseId((p) => ({ ...p, [exerciseId]: "idle" }));
      }, 800);
    } catch (e) {
      console.error(e);
      setManageSaveStatusByExerciseId((p) => ({ ...p, [exerciseId]: "error" }));
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
    if (!sessionId || !selectedWorkout) return;

    fetch(`${API}/api/sessions/${sessionId}/sets`)
      .then((r) => r.json())
      .then((rows) => {
        // rows: [{ exercise_id, set_number, weight, reps, rpe, ... }, ...]

        // Group by exercise_id
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

        // Build a full map for all exercises in this workout template
        const finalMap = {};
        for (const ex of selectedWorkout.exercises) {
          const existing = (grouped[ex.id] || []).sort(
            (a, b) => a.set_number - b.set_number
          );
          finalMap[ex.id] = padToTargetSets(existing, ex.target_sets || 3);
        }

        setSetsByExercise(finalMap);
      })
      .catch((e) => console.error("Failed to load sets", e));
  }, [sessionId, selectedWorkout]);

  // When an exercise becomes current, make sure it has 3 set rows ready
  useEffect(() => {
    if (!currentExercise) return;
    ensureSetRows(currentExercise.id, currentExercise.target_sets || 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIndex, sessionId]);
  
    // Load last performed data for current exercise
    useEffect(() => {
      if (!selectedWorkout) return;

      const ex = selectedWorkout.exercises[exerciseIndex];
      if (!ex) return;

      const exId = ex.id;

      const url = new URL(`${API}/api/exercises/${exId}/last`);
      if (sessionId) url.searchParams.set("exclude_session_id", sessionId);

      fetch(url.toString())
        .then((r) => r.json())
        .then((data) => {
          setLastTimeByExercise((prev) => ({ ...prev, [exId]: data }));
        })
        .catch((e) => console.error("Failed to load last time", e));
    }, [selectedWorkout, exerciseIndex, sessionId]);

  // Button label state for the current exercise
  const status =
    currentExercise ? (saveStatusByExercise[currentExercise.id] || "idle") : "idle";
  
  const isSaving = status === "saving";
  const isError = status === "error";
  const isLast = selectedWorkout
    ? exerciseIndex === selectedWorkout.exercises.length - 1
    : false;

  // Manage view
  return (
    <div className="container">
      <h1>Workout Tracker</h1>

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

          <div className="row wrap">
            {workouts.map((w) => (
              <button
                key={w.id}
                className="btn btn-pill"
                onClick={() => {
                  // switching workouts ends current session state
                  setSelectedWorkoutId(w.id);
                  resetRunnerState(); // <- use your helper if you added it
                }}
              >
                {w.name}
              </button>
            ))}
          </div>

          {!selectedWorkout && (
            <p style={{ opacity: 0.8 }}>Pick Lift A/B/C to begin.</p>
          )}

          {selectedWorkout && !sessionId && (
            <div style={{ marginTop: 16 }}>
              <h2>{selectedWorkout.workout.name}</h2>
              <p style={{ opacity: 0.8 }}>
                Exercises: {selectedWorkout.exercises.length}
              </p>
              <button className="btn btn-primary" onClick={startSession} style={{ marginTop: 8 }}>
                Start {selectedWorkout.workout.name}
              </button>
            </div>
          )}

          {selectedWorkout && sessionId && currentExercise && (
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ opacity: 0.8, marginBottom: 6 }}>
                Session #{sessionId} • Exercise {exerciseIndex + 1} / {selectedWorkout.exercises.length}
              </div>

              <h2 style={{ margin: 0 }}>{currentExercise.name}</h2>
              <div style={{ opacity: 0.8, marginBottom: 12 }}>
                Target: {currentExercise.target_sets} × {currentExercise.target_reps}
              </div>

              {(() => {
                const last = lastTimeByExercise[currentExercise.id];
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
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      Last time ({last.performed_on})
                    </div>

                    <div className="muted" style={{ display: "grid", gap: 6 }}>
                      {last.sets.map((s) => (
                        <div key={s.set_number}>
                          Set {s.set_number}: {s.weight ?? "—"} × {s.reps ?? "—"}
                          {s.rpe != null ? ` (RPE ${s.rpe})` : ""}
                        </div>
                      ))}
                    </div>

                    <button
                      className="btn"
                      onClick={() => {
                        const exId = currentExercise.id;
                        const target = currentExercise.target_sets || 3;
                        const rows = padToTargetSets(
                          (last.sets || []).map((s) => ({
                            set_number: s.set_number,
                            weight: s.weight == null ? "" : String(s.weight),
                            reps: s.reps == null ? "" : String(s.reps),
                            rpe: "",
                          })),
                          target
                        );
                        setSetsByExercise((prev) => ({ ...prev, [exId]: rows }));
                      }}
                    >
                      Use last time
                    </button>
                  </div>
                );
              })()}

              {/* Set logger */}
              <div style={{ display: "grid", gap: 10 }}>
                {(setsByExercise[currentExercise.id] || []).map((row, idx) => (
                  <div className="set-row" key={row.set_number}>
                    <div className="set-label" style={{ fontWeight: 700 }}>
                      Set {row.set_number}
                    </div>

                    <input
                      className="set-weight"
                      inputMode="decimal"
                      placeholder="Weight"
                      value={row.weight}
                      onChange={(e) =>
                        updateSetField(currentExercise.id, idx, "weight", e.target.value)
                      }
                    />
                    <input
                      className="set-reps"
                      inputMode="numeric"
                      placeholder="Reps"
                      value={row.reps}
                      onChange={(e) =>
                        updateSetField(currentExercise.id, idx, "reps", e.target.value)
                      }
                    />
                    <input
                      className="set-rpe"
                      inputMode="decimal"
                      placeholder="RPE"
                      value={row.rpe}
                      onChange={(e) =>
                        updateSetField(currentExercise.id, idx, "rpe", e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>

              {/* Add/Remove */}
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => removeSetRow(currentExercise.id)}>-</button>
                <button className="btn" onClick={() => addSetRow(currentExercise.id)}>+</button>

                <div style={{ flex: 1 }} />

                <div className="muted" style={{ fontSize: 14 }}>
                  {status === "saving" ? "Saving…" :
                  status === "error" ? "Error — tap Next/Prev to retry" :
                  ""}
                </div>
              </div>

              {/* Navigation */}
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

          {/* local tabs */}
          <div className="row" style={{ marginBottom: 12 }}>
            <button
              className={`btn ${manageTab === "exercises" ? "btn-primary" : ""}`}
              onClick={() => setManageTab("exercises")}
            >
              Exercises
            </button>
            <button
              className={`btn ${manageTab === "workouts" ? "btn-primary" : ""}`}
              onClick={() => setManageTab("workouts")}
            >
              Workouts
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

              {/* Create workout */}
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

              {/* Workout list */}
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

              {/* Workout editor */}
              {editingWorkout && (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{editingWorkout.name}</div>
                      <div className="muted" style={{ fontSize: 14 }}>
                        Edit exercises, sets/reps, order
                      </div>
                    </div>
                    <button className="btn" onClick={() => setEditingWorkout(null)}>
                      Close
                    </button>
                  </div>

                  {/* Add exercise to workout */}
                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    <div className="muted" style={{ fontSize: 14 }}>Add exercise</div>

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

                      <input
                        className="input"
                        inputMode="numeric"
                        placeholder="Sets"
                        value={addTargetSets}
                        onChange={(e) => setAddTargetSets(e.target.value)}
                      />

                      <input
                        className="input"
                        placeholder="Reps"
                        value={addTargetReps}
                        onChange={(e) => setAddTargetReps(e.target.value)}
                      />

                      <button className="btn btn-primary" onClick={addExerciseToWorkout}>
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Current workout exercise list */}
                  <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10 }}>
                    {editingWorkout.exercises.length === 0 ? (
                      <div className="muted">No exercises in this workout yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {editingWorkout.exercises.map((ex, idx) => {
                          const rowStatus = manageSaveStatusByExerciseId[ex.exercise_id] || "idle";
                          const isRowSaving = rowStatus === "saving";
                          const isRowError = rowStatus === "error";

                          return (
                            <div key={ex.exercise_id} className="manage-ex-row">
                              <div className="manage-ex-title">{ex.name}</div>

                              <div className="manage-ex-fields">
                                <div>
                                  <div className="muted tiny">Sets</div>
                                  <input
                                    className="input"
                                    value={ex.target_sets ?? ""}
                                    inputMode="numeric"
                                    disabled={isRowSaving}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setEditingWorkout((prev) => ({
                                        ...prev,
                                        exercises: prev.exercises.map((x) =>
                                          x.exercise_id === ex.exercise_id ? { ...x, target_sets: v } : x
                                        ),
                                      }));
                                    }}
                                    onBlur={() =>
                                      updateTemplateExercise(ex.exercise_id, { target_sets: ex.target_sets })
                                    }
                                  />
                                </div>

                                <div>
                                  <div className="muted tiny">Reps</div>
                                  <input
                                    className="input"
                                    value={ex.target_reps ?? ""}
                                    disabled={isRowSaving}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setEditingWorkout((prev) => ({
                                        ...prev,
                                        exercises: prev.exercises.map((x) =>
                                          x.exercise_id === ex.exercise_id ? { ...x, target_reps: v } : x
                                        ),
                                      }));
                                    }}
                                    onBlur={() =>
                                      updateTemplateExercise(ex.exercise_id, { target_reps: ex.target_reps })
                                    }
                                  />
                                </div>

                                <div className="manage-ex-actions">
                                  <button className="btn" disabled={idx === 0 || isRowSaving} onClick={() => moveExercise(ex.exercise_id, "up")}>
                                    ↑
                                  </button>
                                  <button className="btn" disabled={idx === editingWorkout.exercises.length - 1 || isRowSaving} onClick={() => moveExercise(ex.exercise_id, "down")}>
                                    ↓
                                  </button>
                                  <button
                                    className="btn" onClick={() => removeExerciseFromWorkout(ex.exercise_id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>

                              <div className="muted" style={{ fontSize: 12, minHeight: 16, marginTop: 6 }}>
                                {rowStatus === "saving" ? "Saving…" :
                                rowStatus === "saved" ? "Saved ✓" :
                                rowStatus === "error" ? "Error — tap out again" :
                                ""}
                              </div>

                              {isRowError && (
                                <div className="muted" style={{ fontSize: 12 }}>
                                  (If it keeps failing, refresh and try again.)
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {manageSaveMsg && (
                    <div className="muted" style={{ marginTop: 10 }}>
                      {manageSaveMsg}
                    </div>
                  )}
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
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
              Quit workout?
            </div>

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
    </div>
  );
}
