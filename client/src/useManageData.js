import { useEffect, useState } from "react";

export function useManageData(apiBase, { view, workoutCatalog }) {
  const [exercises, setExercises] = useState([]);
  const [newExName, setNewExName] = useState("");
  const [newExTrackingType, setNewExTrackingType] = useState("weight_reps");
  const [newExTimeUnit, setNewExTimeUnit] = useState("seconds");
  const [newExUrl, setNewExUrl] = useState("");
  const [newExNotes, setNewExNotes] = useState("");
  const [newExWarmup, setNewExWarmup] = useState(false);

  const [editingExercise, setEditingExercise] = useState(null);
  const [exEditName, setExEditName] = useState("");
  const [exEditTrackingType, setExEditTrackingType] = useState("weight_reps");
  const [exEditTimeUnit, setExEditTimeUnit] = useState("seconds");
  const [exEditUrl, setExEditUrl] = useState("");
  const [exEditNotes, setExEditNotes] = useState("");
  const [exEditWarmup, setExEditWarmup] = useState(false);
  const [exerciseEditStatus, setExerciseEditStatus] = useState("idle");

  const [workoutTemplates, setWorkoutTemplates] = useState([]);
  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [manageSaveMsg, setManageSaveMsg] = useState("");
  const [addExerciseId, setAddExerciseId] = useState("");

  const [manageTab, setManageTab] = useState("workouts");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [editingPlan, setEditingPlan] = useState(null);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanTemplateId, setNewPlanTemplateId] = useState("");
  const [isRenamingWorkout, setIsRenamingWorkout] = useState(false);
  const [workoutNameDraft, setWorkoutNameDraft] = useState("");
  const [renameWorkoutStatus, setRenameWorkoutStatus] = useState("idle");
  const [historyMode, setHistoryMode] = useState("list");
  const [plansMode, setPlansMode] = useState("list");
  const [planNameDraft, setPlanNameDraft] = useState("");

  useEffect(() => {
    if (view !== "manage") return;
    if (manageTab !== "history") return;

    setHistoryLoading(true);
    setHistoryError("");

    fetch(`${apiBase}/api/sessions?limit=50`)
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
  }, [apiBase, manageTab, view]);

  useEffect(() => {
    fetch(`${apiBase}/api/exercises`).then((r) => r.json()).then(setExercises);
  }, [apiBase]);

  useEffect(() => {
    if (view !== "manage") return;
    fetch(`${apiBase}/api/exercises`).then((r) => r.json()).then(setExercises);
    fetch(`${apiBase}/api/workout-templates`).then((r) => r.json()).then(setWorkoutTemplates);
  }, [apiBase, view]);

  useEffect(() => {
    if (selectedSession) setHistoryMode("list");
  }, [selectedSession]);

  useEffect(() => {
    if (plansMode === "import") setEditingPlan(null);
  }, [plansMode]);

  async function openSession(sessionId) {
    setHistoryError("");
    try {
      const resp = await fetch(`${apiBase}/api/sessions/${sessionId}`);
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
      const resp = await fetch(`${apiBase}/api/sessions/${sessionId}`, { method: "DELETE" });
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

    const resp = await fetch(`${apiBase}/api/plans`, {
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

    await workoutCatalog.refreshPlans();
    setEditingPlan(data);
    setPlanNameDraft(data?.plan?.name ?? "");
    setNewPlanName("");
    setNewPlanTemplateId("");
  }

  async function renamePlan(planId, newName) {
    const nm = String(newName ?? "").trim();
    if (!nm) return;

    const resp = await fetch(`${apiBase}/api/plans/${planId}`, {
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
    await workoutCatalog.refreshPlans();
  }

  async function deletePlan(planId) {
    const ok = window.confirm("Delete this plan? (This does NOT delete any history sessions.)");
    if (!ok) return;

    const resp = await fetch(`${apiBase}/api/plans/${planId}`, { method: "DELETE" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || "Delete plan failed");
      return;
    }

    setEditingPlan(null);
    setPlanNameDraft("");
    await workoutCatalog.refreshPlans();
  }

  async function createExercise() {
    const payload = {
      name: newExName,
      tracking_type: newExTrackingType,
      time_unit: newExTrackingType === "time" ? newExTimeUnit : "seconds",
      info_url: newExUrl.trim() || null,
      notes: newExNotes.trim() || null,
      warmup: Boolean(newExWarmup),
    };

    const resp = await fetch(`${apiBase}/api/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Failed");

    setExercises((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewExName("");
    setNewExTrackingType("weight_reps");
    setNewExTimeUnit("seconds");
    setNewExUrl("");
    setNewExNotes("");
    setNewExWarmup(false);
  }

  async function deleteExercise(id) {
    const resp = await fetch(`${apiBase}/api/exercises/${id}`, { method: "DELETE" });
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
    setExEditWarmup(Boolean(ex.warmup));
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
      warmup: Boolean(exEditWarmup),
    };

    try {
      const resp = await fetch(`${apiBase}/api/exercises/${editingExercise.id}`, {
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
      setExEditWarmup(Boolean(data.warmup));
      setExerciseEditStatus("saved");
      setTimeout(() => setExerciseEditStatus("idle"), 900);
    } catch (e) {
      console.error(e);
      setExerciseEditStatus("error");
    }
  }

  async function createWorkout() {
    const resp = await fetch(`${apiBase}/api/workout-templates`, {
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
    const resp = await fetch(`${apiBase}/api/workout-templates/${id}`, { method: "DELETE" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return alert(data.error || "Failed");
    setWorkoutTemplates((p) => p.filter((x) => x.id !== id));
    if (editingWorkout?.id === id) setEditingWorkout(null);
  }

  async function openWorkoutEditor(workoutId) {
    const resp = await fetch(`${apiBase}/api/workout-templates/${workoutId}`);
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

    const resp = await fetch(`${apiBase}/api/workout-templates/${editingWorkout.id}/exercises`, {
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
      `${apiBase}/api/workout-templates/${editingWorkout.id}/exercises/${exerciseId}`,
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
      `${apiBase}/api/workout-templates/${editingWorkout.id}/exercises/${exerciseId}/move`,
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

    if (nextName === editingWorkout.name) {
      setIsRenamingWorkout(false);
      return;
    }

    setRenameWorkoutStatus("saving");
    try {
      const resp = await fetch(`${apiBase}/api/workout-templates/${editingWorkout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Rename failed");

      setEditingWorkout((prev) => (prev ? { ...prev, name: data.name } : prev));
      setIsRenamingWorkout(false);
      setRenameWorkoutStatus("idle");

      setWorkoutTemplates((prev) =>
        prev.map((w) => (w.id === data.id ? { ...w, name: data.name } : w))
      );

      workoutCatalog.syncRenamedWorkout(data);
    } catch (e) {
      console.error(e);
      setRenameWorkoutStatus("error");
    }
  }

  return {
    exercises,
    newExName,
    setNewExName,
    newExTrackingType,
    setNewExTrackingType,
    newExTimeUnit,
    setNewExTimeUnit,
    newExUrl,
    setNewExUrl,
    newExNotes,
    setNewExNotes,
    newExWarmup,
    setNewExWarmup,
    editingExercise,
    exEditName,
    setExEditName,
    exEditTrackingType,
    setExEditTrackingType,
    exEditTimeUnit,
    setExEditTimeUnit,
    exEditUrl,
    setExEditUrl,
    exEditNotes,
    setExEditNotes,
    exEditWarmup,
    setExEditWarmup,
    exerciseEditStatus,
    createExercise,
    deleteExercise,
    openExerciseEditor,
    closeExerciseEditor,
    saveExerciseEdits,
    workoutTemplates,
    newWorkoutName,
    setNewWorkoutName,
    createWorkout,
    deleteWorkout,
    editingWorkout,
    setEditingWorkout,
    openWorkoutEditor,
    isRenamingWorkout,
    beginRenameWorkout,
    cancelRenameWorkout,
    workoutNameDraft,
    setWorkoutNameDraft,
    renameWorkoutStatus,
    saveRenameWorkout,
    addExerciseId,
    setAddExerciseId,
    addExerciseToWorkout,
    removeExerciseFromWorkout,
    moveExercise,
    manageSaveMsg,
    manageTab,
    setManageTab,
    sessions,
    selectedSession,
    setSelectedSession,
    historyLoading,
    historyError,
    historyMode,
    setHistoryMode,
    openSession,
    deleteSessionFromHistory,
    plansMode,
    setPlansMode,
    editingPlan,
    setEditingPlan,
    newPlanTemplateId,
    setNewPlanTemplateId,
    newPlanName,
    setNewPlanName,
    createPlan,
    planNameDraft,
    setPlanNameDraft,
    renamePlan,
    deletePlan,
  };
}
