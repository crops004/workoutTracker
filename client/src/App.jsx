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

  async function saveExerciseSets(exercise) {
    if (!sessionId) return;

    const rows = setsByExercise[exercise.id] || [];

    const cleaned = rows
      .map((r) => ({
        set_number: r.set_number,
        weight: r.weight === "" ? null : Number(r.weight),
        reps: r.reps === "" ? null : Number(r.reps),
        rpe: r.rpe === "" ? null : Number(r.rpe),
      }))
      .filter((r) => r.weight !== null || r.reps !== null || r.rpe !== null);

    if (cleaned.length === 0) {
      setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "error" }));
      return;
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

      setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "saved" }));
      setTimeout(() => {
        setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "idle" }));
      }, 900);
    } catch (e) {
      console.error(e);
      setSaveStatusByExercise((p) => ({ ...p, [exercise.id]: "error" }));
    }
  }

  function nextExercise() {
    if (!selectedWorkout) return;
    setExerciseIndex((i) => Math.min(i + 1, selectedWorkout.exercises.length - 1));
  }

  function prevExercise() {
    setExerciseIndex((i) => Math.max(i - 1, 0));
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
  
  // Button label state for the current exercise
  const status =
    currentExercise ? (saveStatusByExercise[currentExercise.id] || "idle") : "idle";

  return (
    <div className="container">
      <h1>Workout Tracker</h1>

      {/* Workout picker */}
      <h2>Choose workout</h2>
      <div className="row wrap">
        {workouts.map((w) => (
          <button
            key={w.id}
            onClick={() => {
              // Switching workouts manually should end the current session
              setSelectedWorkoutId(w.id);
              setSessionId(null);
              setExerciseIndex(0);
              setSetsByExercise({});
              setSaveStatusByExercise({});
              lsDel("wt_activeSessionId");
              lsDel("wt_activeWorkoutId");
              lsDel("wt_activeExerciseIndex");
            }}
            className="btn btn-pill"
          >
            {w.name}
          </button>
        ))}
      </div>

      {!selectedWorkout && <p style={{ opacity: 0.8 }}>Pick Lift A/B/C to begin.</p>}

      {selectedWorkout && !sessionId && (
        <div style={{ marginTop: 16 }}>
          <h2>{selectedWorkout.workout.name}</h2>
          <p style={{ opacity: 0.8 }}>
            Exercises: {selectedWorkout.exercises.length}
          </p>
          <button
            className="btn btn-primary"
            onClick={startSession}
            style={{ marginTop: 8 }}
          >
            Start {selectedWorkout.workout.name}
          </button>
        </div>
      )}

      <div className="card">
      {/* Runner */}
      {selectedWorkout && sessionId && currentExercise && (
        <div style={{ marginTop: 20 }}>
          <div style={{ opacity: 0.8, marginBottom: 6 }}>
            Session #{sessionId} • Exercise {exerciseIndex + 1} / {selectedWorkout.exercises.length}
          </div>

          <h2 style={{ margin: 0 }}>{currentExercise.name}</h2>
          <div style={{ opacity: 0.8, marginBottom: 12 }}>
            Target: {currentExercise.target_sets} × {currentExercise.target_reps}
          </div>

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
                  onChange={(e) => updateSetField(currentExercise.id, idx, "weight", e.target.value)}
                />
                <input
                  className="set-reps"
                  inputMode="numeric"
                  placeholder="Reps"
                  value={row.reps}
                  onChange={(e) => updateSetField(currentExercise.id, idx, "reps", e.target.value)}
                />
                <input
                  className="set-rpe"
                  inputMode="decimal"
                  placeholder="RPE"
                  value={row.rpe}
                  onChange={(e) => updateSetField(currentExercise.id, idx, "rpe", e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Add/Remove + Save */}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => removeSetRow(currentExercise.id)}>-</button>
            <button className="btn" onClick={() => addSetRow(currentExercise.id)}>+</button>

            <div style={{ flex: 1 }} />

            <button className="btn btn-primary" onClick={() => saveExerciseSets(currentExercise)}>
              {status === "saving" ? "Saving…" :
              status === "saved"  ? "Saved ✓" :
              status === "error"  ? "Error — retry" :
              "Save Exercise"}
            </button>
          </div>

          {/* Navigation */}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={prevExercise} disabled={exerciseIndex === 0}>Prev</button>
            <button className="btn btn-primary" onClick={nextExercise}
              disabled={exerciseIndex === selectedWorkout.exercises.length - 1}
            >
              Next
            </button>
            <button className="btn"
              onClick={() => {
                setSessionId(null);
                setExerciseIndex(0);
                setSetsByExercise({});
                setSaveStatusByExercise({});
                lsDel("wt_activeSessionId");
                lsDel("wt_activeWorkoutId");
                lsDel("wt_activeExerciseIndex");
                setSelectedWorkoutId(null);
                setSelectedWorkout(null);
              }}
            >
              End Session
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
