import { useCallback, useEffect, useMemo, useState } from "react";

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

function repsSeedFromTarget(targetReps) {
  const m = String(targetReps ?? "").match(/\d+/);
  return m ? m[0] : "";
}

export function useRunner(apiBase) {
  const [sessionId, setSessionId] = useState(() => lsGet("wt_activeSessionId", null));
  const [exerciseIndex, setExerciseIndex] = useState(() => {
    const saved = lsGet("wt_activeExerciseIndex", 0);
    return typeof saved === "number" ? saved : 0;
  });
  const [setsByExercise, setSetsByExercise] = useState({});
  const [saveStatusByExercise, setSaveStatusByExercise] = useState({});
  const [lastTimeByExercise, setLastTimeByExercise] = useState({});
  const [runnerWorkoutName, setRunnerWorkoutName] = useState("");
  const [runnerExercises, setRunnerExercises] = useState([]);
  const [sessionWarmups, setSessionWarmups] = useState([]);

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

  const loadRunner = useCallback(
    async (sessId) => {
      try {
        const resp = await fetch(`${apiBase}/api/sessions/${sessId}/runner`);
        const data = await resp.json();
        if (!resp.ok) {
          alert(data.error || "Failed to load runner");
          return;
        }

        const baseExercises = Array.isArray(data.exercises) ? data.exercises : [];
        const warmups = Array.isArray(data.warmups) ? data.warmups : [];

        setRunnerWorkoutName(data.workout_name || "");
        setRunnerExercises(baseExercises);
        setSessionWarmups(warmups);

        setExerciseIndex((prev) => {
          const hasWarmups = warmups.length > 0;
          if (baseExercises.length === 0) return hasWarmups ? -1 : 0;

          if (hasWarmups) {
            if (typeof prev !== "number") return -1;
            if (prev < -1) return -1;
            return Math.min(prev, baseExercises.length - 1);
          }

          if (typeof prev !== "number") return 0;
          return Math.min(Math.max(prev, 0), baseExercises.length - 1);
        });
      } catch (e) {
        console.error("Failed to load runner", e);
        alert("Failed to load runner");
      }
    },
    [apiBase]
  );

  useEffect(() => {
    if (!sessionId) return;
    loadRunner(sessionId);
  }, [sessionId, loadRunner]);

  useEffect(() => {
    if (sessionId) lsSet("wt_activeSessionId", sessionId);
    else lsDel("wt_activeSessionId");
  }, [sessionId]);

  useEffect(() => {
    lsSet("wt_activeExerciseIndex", exerciseIndex);
  }, [exerciseIndex]);

  const currentExercise = useMemo(() => {
    if (!runnerExercises?.length) return null;
    if (exerciseIndex < 0) return null;
    return runnerExercises[exerciseIndex] || null;
  }, [runnerExercises, exerciseIndex]);

  const isWarmupStep = useMemo(() => {
    return Boolean(sessionId) && sessionWarmups.length > 0 && exerciseIndex < 0;
  }, [sessionId, sessionWarmups, exerciseIndex]);

  const ensureSetRows = useCallback((exerciseId, count = 3) => {
    setSetsByExercise((prev) => {
      if (prev[exerciseId]?.length) return prev;
      return { ...prev, [exerciseId]: makeEmptySets(count) };
    });
  }, []);

  useEffect(() => {
    if (!currentExercise) return;
    ensureSetRows(currentExercise.exercise_id, currentExercise.target_sets || 3);
  }, [exerciseIndex, sessionId, currentExercise, ensureSetRows]);

  const updateSetField = useCallback((exerciseId, setIdx, field, value) => {
    setSetsByExercise((prev) => {
      const copy = { ...prev };
      const rows = copy[exerciseId] ? [...copy[exerciseId]] : [];
      const base = rows[setIdx] || { set_number: setIdx + 1, weight: "", reps: "", rpe: "" };
      rows[setIdx] = { ...base, [field]: value };
      copy[exerciseId] = rows;
      return copy;
    });
  }, []);

  const addSetRow = useCallback((exerciseId) => {
    setSetsByExercise((prev) => {
      const rows = prev[exerciseId] ? [...prev[exerciseId]] : [];
      rows.push({ set_number: rows.length + 1, weight: "", reps: "", rpe: "" });
      return { ...prev, [exerciseId]: rows };
    });
  }, []);

  const removeSetRow = useCallback((exerciseId) => {
    setSetsByExercise((prev) => {
      const rows = prev[exerciseId] ? [...prev[exerciseId]] : [];
      if (rows.length <= 1) return prev;
      rows.pop();
      return { ...prev, [exerciseId]: rows };
    });
  }, []);

  const resetRunnerState = useCallback(() => {
    setSessionId(null);
    setExerciseIndex(0);
    setSetsByExercise({});
    setSaveStatusByExercise({});
    setLastTimeByExercise({});
    setRunnerWorkoutName("");
    setRunnerExercises([]);
    setSessionWarmups([]);
    lsDel("wt_activeSessionId");
    lsDel("wt_activeWorkoutId");
    lsDel("wt_activeExerciseIndex");
  }, []);

  const saveExercise = useCallback(
    async (exercise) => {
      if (!sessionId) return false;
      const exId = exercise.exercise_id;
      const rows = setsByExercise[exId] || [];
      const isTime = exercise?.tracking_type === "time";
      const unit = exercise?.time_unit || "seconds";
      const cleaned = rows
        .map((r) => {
          const weight = r.weight === "" ? null : Number(r.weight);
          const repsRaw = r.reps === "" ? null : Number(r.reps);
          const rpe = r.rpe === "" ? null : Number(r.rpe);
          const reps =
            repsRaw == null
              ? null
              : isTime
                ? (unit === "minutes" ? Math.round(repsRaw * 60) : repsRaw)
                : repsRaw;
          return {
            set_number: Number(r.set_number),
            weight: weight == null || Number.isNaN(weight) ? null : weight,
            reps: reps == null || Number.isNaN(reps) ? null : reps,
            rpe: rpe == null || Number.isNaN(rpe) ? null : rpe,
          };
        })
        .filter((r) => r.weight !== null || r.reps !== null || r.rpe !== null);

      if (cleaned.length === 0) {
        setSaveStatusByExercise((p) => ({ ...p, [exId]: "idle" }));
        return true;
      }
      setSaveStatusByExercise((p) => ({ ...p, [exId]: "saving" }));
      try {
        const resp = await fetch(`${apiBase}/api/sets/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, exercise_id: exId, sets: cleaned }),
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
    },
    [apiBase, sessionId, setsByExercise]
  );

  const prevExercise = useCallback(async () => {
    if (isWarmupStep) return;
    if (!currentExercise) return;
    const ok = await saveExercise(currentExercise);
    if (!ok) return;
    setExerciseIndex((i) => Math.max(i - 1, sessionWarmups.length > 0 ? -1 : 0));
  }, [isWarmupStep, currentExercise, saveExercise, sessionWarmups.length]);

  const nextExercise = useCallback(async () => {
    if (isWarmupStep) {
      if (runnerExercises.length > 0) setExerciseIndex(0);
      return;
    }
    if (!currentExercise) return;
    const ok = await saveExercise(currentExercise);
    if (!ok) return;
    const lastIdx = runnerExercises.length - 1;
    setExerciseIndex((i) => Math.min(i + 1, lastIdx));
  }, [isWarmupStep, currentExercise, runnerExercises.length, saveExercise]);

  const finishWorkout = useCallback(async () => {
    if (!currentExercise) return;
    const ok = await saveExercise(currentExercise);
    if (!ok) return;
    resetRunnerState();
  }, [currentExercise, saveExercise, resetRunnerState]);

  const startSession = useCallback(
    async (selectedWorkoutOrId) => {
      const workoutTemplateId =
        typeof selectedWorkoutOrId === "number"
          ? selectedWorkoutOrId
          : Number(selectedWorkoutOrId?.workout?.id);
      if (!workoutTemplateId) return;

      const resp = await fetch(`${apiBase}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workout_template_id: workoutTemplateId,
          performed_on: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || "Failed to start session");
        return;
      }
      setSessionId(data.session_id);
      setExerciseIndex(-1);
      lsSet("wt_activeSessionId", data.session_id);
      lsSet("wt_activeWorkoutId", workoutTemplateId);
      lsSet("wt_activeExerciseIndex", -1);
      await loadRunner(data.session_id);
    },
    [apiBase, loadRunner]
  );

  const startSessionFromPlan = useCallback(
    async (planId, workoutCalendarId) => {
      const resp = await fetch(`${apiBase}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: Number(planId),
          workout_calendar_id: workoutCalendarId ?? null,
          performed_on: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || "Failed to start plan session");
        return;
      }
      setSessionId(data.session_id);
      setExerciseIndex(-1);
      lsSet("wt_activeSessionId", data.session_id);
      lsSet("wt_activeWorkoutCalendarId", data.workout_calendar_id ?? null);
      lsSet("wt_activeExerciseIndex", -1);
      await loadRunner(data.session_id);
    },
    [apiBase, loadRunner]
  );

  const quitAndDeleteSession = useCallback(async () => {
    if (!sessionId) {
      resetRunnerState();
      return;
    }
    try {
      await fetch(`${apiBase}/api/sessions/${sessionId}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete session", e);
    } finally {
      resetRunnerState();
    }
  }, [apiBase, sessionId, resetRunnerState]);

  const saveExerciseInfoUrl = useCallback(
    async (exerciseId, infoUrl) => {
      const resp = await fetch(`${apiBase}/api/exercises/${exerciseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ info_url: infoUrl }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "Failed to save info URL");
      }

      setRunnerExercises((prev) =>
        prev.map((ex) =>
          Number(ex.exercise_id) === Number(exerciseId)
            ? { ...ex, info_url: data.info_url ?? null }
            : ex
        )
      );
      return data;
    },
    [apiBase]
  );

  const toggleWarmupCompleted = useCallback(
    async (exerciseId, completed) => {
      if (!sessionId) return false;

      const resp = await fetch(`${apiBase}/api/sessions/${sessionId}/warmups/${exerciseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "Failed to update warmup status");
      }

      setSessionWarmups((prev) =>
        prev.map((w) =>
          Number(w.exercise_id) === Number(exerciseId)
            ? {
                ...w,
                completed: Boolean(data.completed),
                completed_at: data.completed_at ?? null,
              }
            : w
        )
      );
      return true;
    },
    [apiBase, sessionId]
  );

  useEffect(() => {
    if (!sessionId || !runnerExercises?.length) return;
    fetch(`${apiBase}/api/sessions/${sessionId}/sets`)
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
          finalMap[exId] =
            existing.length === 0
              ? makePlannedSetsForExercise(ex)
              : padToTargetSets(existing, ex.target_sets || 3);
        }
        setSetsByExercise(finalMap);
      })
      .catch((e) => console.error("Failed to load sets", e));
  }, [sessionId, runnerExercises, apiBase, makePlannedSetsForExercise]);

  useEffect(() => {
    if (!currentExercise) return;
    const exId = currentExercise.exercise_id;
    const url = new URL(`${apiBase}/api/exercises/${exId}/last`);
    if (sessionId) url.searchParams.set("exclude_session_id", sessionId);
    fetch(url.toString())
      .then((r) => r.json())
      .then((data) => {
        setLastTimeByExercise((prev) => ({ ...prev, [exId]: data }));
      })
      .catch((e) => console.error("Failed to load last time", e));
  }, [currentExercise, sessionId, apiBase]);

  return {
    sessionId,
    exerciseIndex,
    setsByExercise,
    saveStatusByExercise,
    lastTimeByExercise,
    runnerWorkoutName,
    runnerExercises,
    sessionWarmups,
    currentExercise,
    isWarmupStep,
    loadRunner,
    resetRunnerState,
    startSession,
    startSessionFromPlan,
    quitAndDeleteSession,
    saveExerciseInfoUrl,
    toggleWarmupCompleted,
    updateSetField,
    addSetRow,
    removeSetRow,
    saveExercise,
    prevExercise,
    nextExercise,
    finishWorkout,
  };
}
