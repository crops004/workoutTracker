import { useCallback, useEffect, useMemo, useState } from "react";
import { lsDel, lsGet, lsSet } from "./storage";

export function useWorkoutCatalog(apiBase) {
  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkoutIdState, setSelectedWorkoutIdState] = useState(() =>
    lsGet("wt_activeWorkoutId", null)
  );
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [plans, setPlans] = useState([]);
  const selectedWorkoutId = selectedWorkoutIdState;

  const setSelectedWorkoutId = useCallback((nextWorkoutId) => {
    setSelectedWorkout(null);
    setSelectedWorkoutIdState(nextWorkoutId);
  }, []);

  const planDisplayName = useCallback((p) => {
    if (!p) return "";
    const t = p.template_name || p.templateName || p.template;
    const n = p.name || "";
    return t ? `${t} - ${n}` : n;
  }, []);

  const refreshPlans = useCallback(async () => {
    const list = await fetch(`${apiBase}/api/plans`).then((r) => r.json());
    setPlans(Array.isArray(list) ? list : []);
  }, [apiBase]);

  const loadPlans = useCallback(async () => {
    const resp = await fetch(`${apiBase}/api/plans`, { cache: "no-store" });
    const data = await resp.json();
    if (resp.ok) setPlans(data);
  }, [apiBase]);

  const syncRenamedWorkout = useCallback((data) => {
    setWorkouts((prev) =>
      prev.map((w) => (w.id === data.id ? { ...w, name: data.name } : w))
    );

    setSelectedWorkout((prev) =>
      prev?.workout?.id === data.id
        ? { ...prev, workout: { ...prev.workout, name: data.name } }
        : prev
    );
  }, []);

  useEffect(() => {
    let alive = true;

    fetch(`${apiBase}/api/plans`)
      .then((r) => r.json())
      .then((list) => {
        if (!alive) return;
        setPlans(Array.isArray(list) ? list : []);
      })
      .catch((e) => console.error("Failed to load plans", e));

    return () => {
      alive = false;
    };
  }, [apiBase]);

  useEffect(() => {
    fetch(`${apiBase}/api/workouts`).then((r) => r.json()).then(setWorkouts);
  }, [apiBase]);

  useEffect(() => {
    if (!selectedWorkoutId) return;

    let alive = true;
    fetch(`${apiBase}/api/workouts/${selectedWorkoutId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setSelectedWorkout(data);
      });

    return () => {
      alive = false;
    };
  }, [apiBase, selectedWorkoutId]);

  useEffect(() => {
    if (selectedWorkoutId) lsSet("wt_activeWorkoutId", selectedWorkoutId);
    else lsDel("wt_activeWorkoutId");
  }, [selectedWorkoutId]);

  const selectedWorkoutName = useMemo(() => {
    const id = Number(selectedWorkoutId);
    return workouts.find((w) => Number(w.id) === id)?.name ?? "";
  }, [workouts, selectedWorkoutId]);

  const plansForSelectedWorkout = useMemo(() => {
    const id = Number(selectedWorkoutId);
    if (!id) return [];
    return plans.filter((p) => Number(p.base_template_id) === id);
  }, [plans, selectedWorkoutId]);

  const planLabel = useCallback(
    (p) => {
      if (!selectedWorkoutName) return p.name;
      const a = String(p.name || "").toLowerCase();
      const b = String(selectedWorkoutName || "").toLowerCase();
      return a.includes(b) ? p.name : `${selectedWorkoutName} - ${p.name}`;
    },
    [selectedWorkoutName]
  );

  return {
    workouts,
    setWorkouts,
    selectedWorkoutId,
    setSelectedWorkoutId,
    selectedWorkout,
    setSelectedWorkout,
    plans,
    planDisplayName,
    refreshPlans,
    loadPlans,
    syncRenamedWorkout,
    selectedWorkoutName,
    plansForSelectedWorkout,
    planLabel,
  };
}
