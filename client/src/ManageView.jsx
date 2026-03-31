import { useState } from "react";
import HistoryTable from "./HistoryTable";
import PlanImport from "./PlanImport";

export default function ManageView({
  manageTab,
  setManageTab,

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

  historyMode,
  setHistoryMode,
  historyError,
  historyLoading,
  sessions,
  selectedSession,
  setSelectedSession,
  formatLocalDateTime,
  openSession,
  deleteSessionFromHistory,

  plansMode,
  setPlansMode,
  apiBase,
  workouts,
  plans,
  loadPlans,
  newPlanTemplateId,
  setNewPlanTemplateId,
  newPlanName,
  setNewPlanName,
  createPlan,
  editingPlan,
  setEditingPlan,
  planDisplayName,
  planNameDraft,
  setPlanNameDraft,
  renamePlan,
  deletePlan,
}) {
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [showAddWorkoutModal, setShowAddWorkoutModal] = useState(false);

  async function deleteEditingExercise() {
    if (!editingExercise) return;
    await deleteExercise(editingExercise.id);
    closeExerciseEditor();
  }

  async function handleCreateWorkout() {
    if (!newWorkoutName.trim()) return;
    await createWorkout();
    setShowAddWorkoutModal(false);
  }

  return (
    <div className="card card-wide" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Manage</h2>

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
        <button
          className={`btn ${manageTab === "history" ? "btn-primary" : ""}`}
          onClick={() => setManageTab("history")}
        >
          History
        </button>
        <button
          className={`btn ${manageTab === "plans" ? "btn-primary" : ""}`}
          onClick={() => setManageTab("plans")}
        >
          Plans
        </button>
      </div>

      {manageTab === "exercises" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Exercise library</h3>
            <button className="btn btn-primary" onClick={() => setShowAddExerciseModal(true)}>
              Add exercise
            </button>
          </div>

          <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10 }}>
            {exercises.length === 0 ? (
              <div className="muted">No exercises yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {exercises.map((ex) => (
                  <button
                    key={ex.id}
                    className="btn"
                    onClick={() => openExerciseEditor(ex)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      fontWeight: 800,
                      justifyContent: "flex-start",
                    }}
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showAddExerciseModal && (
            <div className="modal-overlay" onClick={() => setShowAddExerciseModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Add exercise</div>
                  <input
                    className="input"
                    placeholder="Exercise name (e.g., Dead Hang)"
                    value={newExName}
                    onChange={(e) => setNewExName(e.target.value)}
                  />
                  <div className="row wrap" style={{ gap: 10 }}>
                    <select
                      className="input"
                      value={newExTrackingType}
                      onChange={(e) => setNewExTrackingType(e.target.value)}
                      style={{ minWidth: 220 }}
                    >
                      <option value="weight_reps">Weight + reps</option>
                      <option value="time">Time</option>
                    </select>
                    {newExTrackingType === "time" && (
                      <select
                        className="input"
                        value={newExTimeUnit}
                        onChange={(e) => setNewExTimeUnit(e.target.value)}
                        style={{ minWidth: 180 }}
                      >
                        <option value="seconds">Seconds</option>
                        <option value="minutes">Minutes</option>
                      </select>
                    )}
                  </div>
                  <input
                    className="input"
                    placeholder="Info URL (optional)"
                    value={newExUrl}
                    onChange={(e) => setNewExUrl(e.target.value)}
                  />
                  <textarea
                    className="input"
                    placeholder="Notes (optional)"
                    value={newExNotes}
                    onChange={(e) => setNewExNotes(e.target.value)}
                    rows={3}
                  />
                  <label className="row" style={{ gap: 8, cursor: "pointer", width: "fit-content" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(newExWarmup)}
                      onChange={(e) => setNewExWarmup(e.target.checked)}
                      style={{ width: 16, height: 16, margin: 0, accentColor: "#8aa0ff" }}
                    />
                    Warm-up exercise
                  </label>
                  <div className="row" style={{ gap: 10 }}>
                    <button className="btn" onClick={() => setShowAddExerciseModal(false)} style={{ flex: 1 }}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={createExercise}
                      disabled={!newExName.trim()}
                      style={{ flex: 1 }}
                    >
                      Add exercise
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {editingExercise && (
            <div className="modal-overlay" onClick={closeExerciseEditor}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 900 }}>Edit exercise</div>
                    <button
                      className="btn"
                      onClick={closeExerciseEditor}
                      disabled={exerciseEditStatus === "saving"}
                    >
                      Close
                    </button>
                  </div>
                  <input
                    className="input"
                    value={exEditName}
                    onChange={(e) => setExEditName(e.target.value)}
                  />
                  <select
                    className="input"
                    value={exEditTrackingType}
                    onChange={(e) => setExEditTrackingType(e.target.value)}
                  >
                    <option value="weight_reps">Weight + reps</option>
                    <option value="time">Time</option>
                  </select>
                  {exEditTrackingType === "time" && (
                    <select
                      className="input"
                      value={exEditTimeUnit}
                      onChange={(e) => setExEditTimeUnit(e.target.value)}
                    >
                      <option value="seconds">Seconds</option>
                      <option value="minutes">Minutes</option>
                    </select>
                  )}
                  <input
                    className="input"
                    placeholder="Info URL (optional)"
                    value={exEditUrl}
                    onChange={(e) => setExEditUrl(e.target.value)}
                  />
                  <textarea
                    className="input"
                    placeholder="Notes (optional)"
                    value={exEditNotes}
                    onChange={(e) => setExEditNotes(e.target.value)}
                    rows={3}
                  />
                  <label className="row" style={{ gap: 8, cursor: "pointer", width: "fit-content" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(exEditWarmup)}
                      onChange={(e) => setExEditWarmup(e.target.checked)}
                      style={{ width: 16, height: 16, margin: 0, accentColor: "#8aa0ff" }}
                    />
                    Warm-up exercise
                  </label>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <button
                      className="btn"
                      onClick={deleteEditingExercise}
                      disabled={exerciseEditStatus === "saving"}
                      style={{ flex: 1 }}
                    >
                      Delete
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={saveExerciseEdits}
                      disabled={exerciseEditStatus === "saving"}
                      style={{ flex: 1 }}
                    >
                      {exerciseEditStatus === "saving" ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                  <div className="muted" style={{ fontSize: 13, minHeight: 18 }}>
                    {exerciseEditStatus === "saved"
                      ? "Saved"
                      : exerciseEditStatus === "error"
                      ? "Error - try again"
                      : ""}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {manageTab === "workouts" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Workouts</h3>
            {!editingWorkout && (
              <button className="btn btn-primary" onClick={() => setShowAddWorkoutModal(true)}>
                Add
              </button>
            )}
          </div>

          {!editingWorkout && (
            <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10 }}>
              {workoutTemplates.length === 0 ? (
                <div className="muted">No workouts yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {workoutTemplates.map((w) => (
                    <div key={w.id} className="row" style={{ justifyContent: "space-between" }}>
                      <button
                        className="btn btn-pill"
                        onClick={() => openWorkoutEditor(w.id)}
                      >
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
          )}

          {showAddWorkoutModal && (
            <div className="modal-overlay" onClick={() => setShowAddWorkoutModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Add workout</div>
                  <input
                    className="input"
                    placeholder="Workout name (e.g., Lift D)"
                    value={newWorkoutName}
                    onChange={(e) => setNewWorkoutName(e.target.value)}
                    autoFocus
                  />
                  <div className="row" style={{ gap: 10 }}>
                    <button className="btn" onClick={() => setShowAddWorkoutModal(false)} style={{ flex: 1 }}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleCreateWorkout}
                      disabled={!newWorkoutName.trim()}
                      style={{ flex: 1 }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {editingWorkout && (
            <div className="card">
              <div
                className="row"
                style={{ justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}
              >
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
                          Rename failed - try again.
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
                      <button
                        className="btn"
                        onClick={cancelRenameWorkout}
                        disabled={renameWorkoutStatus === "saving"}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={saveRenameWorkout}
                        disabled={renameWorkoutStatus === "saving"}
                      >
                        {renameWorkoutStatus === "saving" ? "Saving..." : "Save"}
                      </button>
                    </>
                  )}
                  <button
                    className="btn"
                    onClick={() => setEditingWorkout(null)}
                    disabled={renameWorkoutStatus === "saving"}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 14 }}>Add exercise</div>
                <div className="manage-add-row">
                  <select
                    className="input"
                    value={addExerciseId}
                    onChange={(e) => setAddExerciseId(e.target.value)}
                  >
                    <option value="">Select exercise...</option>
                    {exercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={addExerciseToWorkout}
                    disabled={!addExerciseId}
                  >
                    Add
                  </button>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10 }}>
                {editingWorkout.exercises.length === 0 ? (
                  <div className="muted">No exercises in this workout yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {editingWorkout.exercises.map((ex, idx) => (
                      <div key={ex.exercise_id} className="manage-ex-row">
                        <div className="manage-ex-title">{ex.name}</div>
                        <div className="manage-ex-fields">
                          <div className="manage-ex-actions">
                            <button
                              className="btn"
                              disabled={idx === 0}
                              onClick={() => moveExercise(ex.exercise_id, "up")}
                            >
                              ^
                            </button>
                            <button
                              className="btn"
                              disabled={idx === editingWorkout.exercises.length - 1}
                              onClick={() => moveExercise(ex.exercise_id, "down")}
                            >
                              v
                            </button>
                            <button
                              className="btn"
                              onClick={() => removeExerciseFromWorkout(ex.exercise_id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {manageSaveMsg && (
                <div className="muted" style={{ marginTop: 10 }}>{manageSaveMsg}</div>
              )}
            </div>
          )}
        </div>
      )}

      {manageTab === "history" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 20 }}>History</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {historyMode === "list" ? "Last 50 sessions" : "All sets (table)"}
              </div>
            </div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              {!selectedSession && (
                <>
                  <button
                    className={`btn ${historyMode === "list" ? "btn-primary" : ""}`}
                    onClick={() => setHistoryMode("list")}
                  >
                    List
                  </button>
                  <button
                    className={`btn ${historyMode === "table" ? "btn-primary" : ""}`}
                    onClick={() => setHistoryMode("table")}
                  >
                    Table
                  </button>
                </>
              )}
              {selectedSession && (
                <>
                  <button
                    className="btn"
                    onClick={() => deleteSessionFromHistory(selectedSession.id)}
                  >
                    Delete session
                  </button>
                  <button className="btn" onClick={() => setSelectedSession(null)}>
                    Back
                  </button>
                </>
              )}
            </div>
          </div>
          {historyError && (
            <div className="card" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
              <div className="muted">{historyError}</div>
            </div>
          )}
          {!selectedSession && historyMode === "table" && (
            <HistoryTable apiBase={apiBase} />
          )}
          {!selectedSession && historyMode === "list" && (
            <div className="card card-wide">
              {historyLoading ? (
                <div className="muted">Loading...</div>
              ) : sessions.length === 0 ? (
                <div className="muted">No sessions yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      className="btn"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: 14,
                        textAlign: "left",
                      }}
                      onClick={() => openSession(s.id)}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontWeight: 800 }}>{s.workout_name}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {formatLocalDateTime(s.created_at)}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 14 }}>{">"}</div>
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
                  {formatLocalDateTime(selectedSession.created_at)} - Session #{selectedSession.id}
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
                          <div
                            key={set.set_number}
                            className="muted"
                            style={{ display: "flex", justifyContent: "space-between" }}
                          >
                            <div>Set {set.set_number}</div>
                            <div>
                              {set.weight ?? "-"} x {set.reps ?? "-"}
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

      {manageTab === "plans" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Plans</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn ${plansMode === "list" ? "btn-primary" : ""}`}
              onClick={() => setPlansMode("list")}
            >
              Plans
            </button>
            <button
              className={`btn ${plansMode === "import" ? "btn-primary" : ""}`}
              onClick={() => {
                setPlansMode("import");
                setEditingPlan(null);
              }}
            >
              Import TSV
            </button>
          </div>
          {plansMode === "import" ? (
            <PlanImport
              apiBase={apiBase}
              onImported={async () => {
                await loadPlans();
                setPlansMode("list");
              }}
            />
          ) : (
            <>
              <div className="card" style={{ display: "grid", gap: 10 }}>
                <div className="muted">Create a planned workout from a workout shell</div>
                <select
                  className="input"
                  value={newPlanTemplateId}
                  onChange={(e) => {
                    setNewPlanTemplateId(e.target.value);
                    setEditingPlan(null);
                  }}
                >
                  <option value="">Select workout...</option>
                  {workouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder='Plan name (e.g., "Week 1", "Deload")'
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                />
                <button className="btn btn-primary" onClick={createPlan}>
                  Create plan
                </button>
              </div>

              {(() => {
                const selectedTemplateId = newPlanTemplateId ? Number(newPlanTemplateId) : null;
                const selectedWorkoutName = selectedTemplateId
                  ? workouts.find((w) => Number(w.id) === selectedTemplateId)?.name
                  : null;
                const visiblePlans = selectedTemplateId
                  ? (plans || [])
                      .filter((p) => Number(p.base_template_id) === selectedTemplateId)
                      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                  : [];
                return (
                  <div className="card" style={{ display: "grid", gap: 8 }}>
                    <div className="muted">
                      {selectedTemplateId
                        ? `Plans for: ${selectedWorkoutName || "Selected workout"}`
                        : "Select a workout above to see its plans"}
                    </div>
                    {!selectedTemplateId ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        Pick a workout in the dropdown to filter the list.
                      </div>
                    ) : visiblePlans.length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        No plans yet for this workout.
                      </div>
                    ) : (
                      <div className="row wrap">
                        {visiblePlans.map((p) => (
                          <button
                            key={p.id}
                            className="btn btn-pill"
                            onClick={async () => {
                              const data = await fetch(`${apiBase}/api/plans/${p.id}`).then((r) => r.json());
                              setEditingPlan(data);
                              setPlanNameDraft(data?.plan?.name ?? "");
                            }}
                          >
                            {planDisplayName(p)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

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
                      Display will be:{" "}
                      <b>
                        {editingPlan.plan.template_name} - {planNameDraft || editingPlan.plan.name}
                      </b>
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
                                  exercises: prev.exercises.map((x) =>
                                    x.id === ex.id ? { ...x, target_sets: v } : x
                                  ),
                                }));
                              }}
                              onBlur={async () => {
                                const resp = await fetch(
                                  `${apiBase}/api/plans/${editingPlan.plan.id}/exercises/${ex.id}`,
                                  {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ target_sets: ex.target_sets }),
                                  }
                                );
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
                                  exercises: prev.exercises.map((x) =>
                                    x.id === ex.id ? { ...x, target_reps: v } : x
                                  ),
                                }));
                              }}
                              onBlur={async () => {
                                const resp = await fetch(
                                  `${apiBase}/api/plans/${editingPlan.plan.id}/exercises/${ex.id}`,
                                  {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ target_reps: ex.target_reps }),
                                  }
                                );
                                const data = await resp.json();
                                if (resp.ok) setEditingPlan(data);
                                else alert(data.error || "Save failed");
                              }}
                            />
                          </div>
                          <div>
                            <div className="muted tiny">Planned weight</div>
                            <input
                              className="input"
                              inputMode="decimal"
                              placeholder="..."
                              value={ex.target_weight ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditingPlan((prev) => ({
                                  ...prev,
                                  exercises: prev.exercises.map((x) =>
                                    x.id === ex.id ? { ...x, target_weight: v } : x
                                  ),
                                }));
                              }}
                              onBlur={async () => {
                                const resp = await fetch(
                                  `${apiBase}/api/plans/${editingPlan.plan.id}/exercises/${ex.id}`,
                                  {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ target_weight: ex.target_weight }),
                                  }
                                );
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
            </>
          )}
        </div>
      )}
    </div>
  );
}



