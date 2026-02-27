import { useEffect, useRef, useState } from "react";

function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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
  saveExerciseInfoUrl,
  formatDateShort,
  formatPrimaryValue,
  saveStatusByExercise,
  prevExercise,
  nextExercise,
  finishWorkout,
  onQuitWorkout,
}) {
  const hasActiveSession = Boolean(sessionId);
  const [showInfoUrlEditor, setShowInfoUrlEditor] = useState(false);
  const [infoUrlDraft, setInfoUrlDraft] = useState("");
  const [infoUrlSaveStatus, setInfoUrlSaveStatus] = useState("idle");
  const [infoUrlSaveError, setInfoUrlSaveError] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const notesPopoverRef = useRef(null);
  const status = currentExercise
    ? saveStatusByExercise[currentExercise.exercise_id] || "idle"
    : "idle";
  const isSaving = status === "saving";
  const isError = status === "error";
  const isLast = runnerExercises.length
    ? exerciseIndex === runnerExercises.length - 1
    : false;
  const nextExerciseName = !isLast ? runnerExercises[exerciseIndex + 1]?.name || "" : "";
  const hasInfoUrl = Boolean(currentExercise?.info_url);
  const notesText = String(currentExercise?.notes || "").trim();
  const hasNotes = Boolean(notesText);
  const canSaveInfoUrl = isValidHttpUrl(infoUrlDraft);

  useEffect(() => {
    setShowInfoUrlEditor(false);
    setShowNotes(false);
    setInfoUrlDraft("");
    setInfoUrlSaveStatus("idle");
    setInfoUrlSaveError("");
  }, [currentExercise?.exercise_id]);

  useEffect(() => {
    if (!showNotes) return;

    function onDocPointerDown(e) {
      if (!notesPopoverRef.current) return;
      if (!notesPopoverRef.current.contains(e.target)) {
        setShowNotes(false);
      }
    }

    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, [showNotes]);

  async function saveInfoUrl() {
    if (!currentExercise || !canSaveInfoUrl || infoUrlSaveStatus === "saving") return;
    setInfoUrlSaveStatus("saving");
    setInfoUrlSaveError("");
    try {
      await saveExerciseInfoUrl(currentExercise.exercise_id, infoUrlDraft.trim());
      setInfoUrlSaveStatus("saved");
      setShowInfoUrlEditor(false);
      setInfoUrlDraft("");
    } catch (e) {
      setInfoUrlSaveStatus("error");
      setInfoUrlSaveError(e.message || "Failed to save URL");
    }
  }

  return (
    <>
      {!hasActiveSession && (
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
              <option value="">Select workout...</option>
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
                  No plans for {selectedWorkoutName}. Create one in Manage - Plans.
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
            onClick={() => startSession(selectedWorkout)}
            disabled={!selectedWorkout}
            style={{ marginTop: 8 }}
          >
            Start {selectedWorkoutName}
          </button>
        </>
      )}

      {!selectedWorkout && (
        <p style={{ opacity: 0.8 }}>Pick Lift A/B/C to begin.</p>
      )}
        </>
      )}

      {hasActiveSession && !currentExercise && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="muted">Loading active workout...</div>
        </div>
      )}

      {sessionId && currentExercise && (
        <div className="card" style={{ marginTop: 16 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}
          >
            <div style={{ opacity: 0.8, minWidth: 0 }}>
              {runnerWorkoutName ? `${runnerWorkoutName} - ` : ""}
              Exercise {exerciseIndex + 1} / {runnerExercises.length}
            </div>

            <div className="row" style={{ gap: 8, flexShrink: 0 }}>
              {isLast ? (
                <button
                  className="btn btn-primary"
                  onClick={finishWorkout}
                  disabled={isSaving}
                  style={{ padding: "8px 12px", fontSize: 14, borderRadius: 10 }}
                >
                  {isSaving ? "Saving..." : isError ? "Retry save" : "Save"}
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={onQuitWorkout}
                  disabled={isSaving}
                  style={{ padding: "8px 12px", fontSize: 14, borderRadius: 10 }}
                >
                  Quit
                </button>
              )}
            </div>
          </div>

          <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{currentExercise.name}</h2>

            {hasInfoUrl ? (
              <a
                href={currentExercise.info_url}
                target="_blank"
                rel="noreferrer"
                title="Open exercise info"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid #3a3a3a",
                  background: "#1f1f1f",
                  color: "#fff",
                  textDecoration: "none",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 14,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                link
              </a>
            ) : (
              <button
                className="btn"
                title="Add exercise info URL"
                onClick={() => {
                  setShowInfoUrlEditor((v) => !v);
                  setInfoUrlSaveStatus("idle");
                  setInfoUrlSaveError("");
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  padding: 0,
                  fontSize: 18,
                  lineHeight: 1,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                +
              </button>
            )}

            {hasNotes && (
              <div ref={notesPopoverRef} style={{ position: "relative", flexShrink: 0 }}>
                <button
                  className="btn"
                  title="Show exercise notes"
                  onClick={() => setShowNotes((v) => !v)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    padding: 0,
                    fontSize: 16,
                    lineHeight: 1,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  i
                </button>

                {showNotes && (
                  <div
                    className="card"
                    style={{
                      position: "absolute",
                      top: 36,
                      right: 0,
                      width: 240,
                      maxWidth: "80vw",
                      zIndex: 20,
                      padding: 10,
                    }}
                  >
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      Notes
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{notesText}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!hasInfoUrl && showInfoUrlEditor && (
            <div style={{ marginTop: 10, marginBottom: 12, display: "grid", gap: 8 }}>
              <input
                className="input"
                inputMode="url"
                placeholder="https://example.com/exercise"
                value={infoUrlDraft}
                onChange={(e) => setInfoUrlDraft(e.target.value)}
              />

              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={saveInfoUrl}
                  disabled={!canSaveInfoUrl || infoUrlSaveStatus === "saving"}
                >
                  {infoUrlSaveStatus === "saving" ? "Saving..." : "Save URL"}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setShowInfoUrlEditor(false);
                    setInfoUrlDraft("");
                    setInfoUrlSaveStatus("idle");
                    setInfoUrlSaveError("");
                  }}
                  disabled={infoUrlSaveStatus === "saving"}
                >
                  Cancel
                </button>
              </div>

              {infoUrlSaveStatus === "error" && (
                <div className="muted" style={{ fontSize: 13 }}>
                  {infoUrlSaveError}
                </div>
              )}
              {infoUrlDraft && !canSaveInfoUrl && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Enter a valid URL starting with http:// or https://
                </div>
              )}
            </div>
          )}

          {(() => {
            const last = lastTimeByExercise[currentExercise.exercise_id];
            if (!last) return null;

            if (!last.found) {
              return (
                <div
                  className="muted"
                  style={{ marginBottom: 18, fontSize: 13, opacity: 0.65 }}
                >
                  Last time: -
                </div>
              );
            }

            return (
              <div style={{ marginBottom: 18 }}>
                <div className="muted" style={{ fontWeight: 600, fontSize: 14, opacity: 0.8, marginBottom: 6 }}>
                  Last time ({formatDateShort(last.performed_on)})
                </div>

                <div
                  className="muted"
                  style={{ display: "grid", gap: 4, fontSize: 14, opacity: 0.68, marginBottom: 8 }}
                >
                  {last.sets.map((s) => (
                    <div key={s.set_number}>
                      Set {s.set_number}: {s.weight ?? "-"} x{" "}
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
                ? "Saving..."
                : status === "error"
                ? "Error - tap Next/Prev to retry"
                : ""}
            </div>
          </div>

          <div className="row" style={{ marginTop: 24, justifyContent: "space-between", alignItems: "center" }}>
            <button
              className="btn"
              onClick={prevExercise}
              disabled={exerciseIndex === 0 || isSaving}
            >
              {isSaving ? "Saving..." : isError ? "Retry save" : "Prev"}
            </button>

            <div className="row" style={{ gap: 8, marginLeft: 10 }}>
              {nextExerciseName && (
                <div
                  className="muted"
                  style={{
                    fontSize: 13,
                    opacity: 0.6,
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Next: {nextExerciseName}
                </div>
              )}
              {!isLast && (
                <button
                  className="btn btn-primary"
                  onClick={nextExercise}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : isError ? "Retry save" : "Next"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
