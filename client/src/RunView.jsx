export default function RunView({
  workouts,
  selectedWorkoutId,
  setSelectedWorkoutId,
  selectedWorkout,
  resetRunnerState,
  plansForSelectedWorkout,
  selectedWorkoutName,
  planLabel,
  startSession,
  startSessionFromPlan,
  sessionId,
  currentExercise,
  runnerExercises,
  runnerWorkoutName,
  exerciseIndex,
  setsByExercise,
  updateSetField,
  addSetRow,
  removeSetRow,
  lastTimeByExercise,
  formatPrimaryValue,
  saveStatusByExercise,
  prevExercise,
  nextExercise,
  finishWorkout,
  onQuitWorkout,
}) {
  const status = currentExercise
    ? saveStatusByExercise[currentExercise.exercise_id] || "idle"
    : "idle";
  const isSaving = status === "saving";
  const isError = status === "error";
  const isLast = runnerExercises.length
    ? exerciseIndex === runnerExercises.length - 1
    : false;

  return (
    <>
      <h2>Choose workout</h2>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <select
          className="input"
          value={selectedWorkoutId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            resetRunnerState(); // switching shells ends current session state
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
          <button
            className="btn"
            onClick={startSession}
            style={{ marginTop: 8 }}
          >
            Start {selectedWorkoutName}
          </button>
        </>
      )}

      {!selectedWorkout && (
        <p style={{ opacity: 0.8 }}>Pick Lift A/B/C to begin.</p>
      )}

      {sessionId && currentExercise && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ opacity: 0.8, marginBottom: 6 }}>
            {runnerWorkoutName ? `${runnerWorkoutName} • ` : ""}
            Session #{sessionId} • Exercise {exerciseIndex + 1} /{" "}
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
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Last time ({last.performed_on})
                </div>

                <div className="muted" style={{ display: "grid", gap: 6 }}>
                  {last.sets.map((s) => (
                    <div key={s.set_number}>
                      Set {s.set_number}: {s.weight ?? "—"} ×{" "}
                      {formatPrimaryValue(currentExercise, s.reps)}
                      {s.rpe != null ? ` (RPE ${s.rpe})` : ""}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{ display: "grid", gap: 10 }}>
            {(setsByExercise[currentExercise.exercise_id] || []).map(
              (row, idx) => (
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
                      updateSetField(
                        currentExercise.exercise_id,
                        idx,
                        "weight",
                        e.target.value
                      )
                    }
                  />
                  <input
                    className="set-reps"
                    inputMode="numeric"
                    placeholder={
                      currentExercise.tracking_type === "time"
                        ? currentExercise.time_unit === "minutes"
                          ? "Minutes"
                          : "Seconds"
                        : "Reps"
                    }
                    value={row.reps}
                    onChange={(e) =>
                      updateSetField(
                        currentExercise.exercise_id,
                        idx,
                        "reps",
                        e.target.value
                      )
                    }
                  />
                  <input
                    className="set-rpe"
                    inputMode="decimal"
                    placeholder="RPE"
                    value={row.rpe}
                    onChange={(e) =>
                      updateSetField(
                        currentExercise.exercise_id,
                        idx,
                        "rpe",
                        e.target.value
                      )
                    }
                  />
                </div>
              )
            )}
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn"
              onClick={() => removeSetRow(currentExercise.exercise_id)}
            >
              -
            </button>
            <button
              className="btn"
              onClick={() => addSetRow(currentExercise.exercise_id)}
            >
              +
            </button>

            <div style={{ flex: 1 }} />

            <div className="muted" style={{ fontSize: 14 }}>
              {status === "saving"
                ? "Saving…"
                : status === "error"
                ? "Error — tap Next/Prev to retry"
                : ""}
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn"
              onClick={prevExercise}
              disabled={exerciseIndex === 0 || isSaving}
            >
              {isSaving ? "Saving…" : isError ? "Retry save" : "Prev"}
            </button>

            {isLast ? (
              <button
                className="btn btn-primary"
                onClick={finishWorkout}
                disabled={isSaving}
              >
                {isSaving ? "Saving…" : isError ? "Retry save" : "Finish workout"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={nextExercise}
                disabled={isSaving}
              >
                {isSaving ? "Saving…" : isError ? "Retry save" : "Next"}
              </button>
            )}

            <button
              className="btn"
              onClick={onQuitWorkout}
              disabled={isSaving}
            >
              Quit workout
            </button>
          </div>
        </div>
      )}
    </>
  );
}

