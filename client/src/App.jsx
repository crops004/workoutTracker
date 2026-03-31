import { useEffect, useState } from "react";
import WeeklyPlanner from "./WeeklyPlanner";
import RunView from "./RunView";
import ManageView from "./ManageView";
import { useApiReady } from "./useApiReady";
import { useManageData } from "./useManageData";
import { useWorkoutCatalog } from "./useWorkoutCatalog";
import { useRunner } from "./useRunner";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [view, setView] = useState("run"); // "run" | "manage" | "planner"

  const { apiReady, apiWaking, apiWakeError } = useApiReady(API);
  const workoutCatalog = useWorkoutCatalog(API);
  const runner = useRunner(API);
  const manage = useManageData(API, { view, workoutCatalog });

  // Close quit modal on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setShowQuitModal(false);
    }
    if (showQuitModal) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showQuitModal]);
  const isWorkoutInProgress = view === "run" && Boolean(runner.sessionId);

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
    if (repsValue == null) return "-";

    const isTime = exercise?.tracking_type === "time";
    if (!isTime) return String(repsValue);

    const unit = exercise?.time_unit || "seconds";

    if (unit === "minutes") {
      const mins = Math.round(Number(repsValue) / 60);
      return `${mins} min`;
    }

    return `${repsValue} sec`;
  }

  async function quitWorkoutConfirmed() {
    await runner.quitAndDeleteSession();
    setShowQuitModal(false);
  }

  return (
    <div className="container">
      {!isWorkoutInProgress && <h1>Workout Tracker</h1>}

      {/* ---------- API warmup gate ---------- */}
      {!apiReady ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
            {apiWaking ? "Waking up server..." : "Server not ready"}
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
          plans={workoutCatalog.plans}
          planDisplayName={workoutCatalog.planDisplayName}
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
          workouts={workoutCatalog.workouts}
          selectedWorkoutId={workoutCatalog.selectedWorkoutId}
          setSelectedWorkoutId={workoutCatalog.setSelectedWorkoutId}
          selectedWorkout={workoutCatalog.selectedWorkout}
          resetRunnerState={runner.resetRunnerState}
          plansForSelectedWorkout={workoutCatalog.plansForSelectedWorkout}
          selectedWorkoutName={workoutCatalog.selectedWorkoutName}
          planLabel={workoutCatalog.planLabel}
          startSession={runner.startSession}
          startSessionFromPlan={runner.startSessionFromPlan}
          sessionId={runner.sessionId}
          currentExercise={runner.currentExercise}
          sessionWarmups={runner.sessionWarmups}
          toggleWarmupCompleted={runner.toggleWarmupCompleted}
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
          manageTab={manage.manageTab}
          setManageTab={manage.setManageTab}
          exercises={manage.exercises}
          newExName={manage.newExName}
          setNewExName={manage.setNewExName}
          newExTrackingType={manage.newExTrackingType}
          setNewExTrackingType={manage.setNewExTrackingType}
          newExTimeUnit={manage.newExTimeUnit}
          setNewExTimeUnit={manage.setNewExTimeUnit}
          newExUrl={manage.newExUrl}
          setNewExUrl={manage.setNewExUrl}
          newExNotes={manage.newExNotes}
          setNewExNotes={manage.setNewExNotes}
          newExWarmup={manage.newExWarmup}
          setNewExWarmup={manage.setNewExWarmup}
          editingExercise={manage.editingExercise}
          exEditName={manage.exEditName}
          setExEditName={manage.setExEditName}
          exEditTrackingType={manage.exEditTrackingType}
          setExEditTrackingType={manage.setExEditTrackingType}
          exEditTimeUnit={manage.exEditTimeUnit}
          setExEditTimeUnit={manage.setExEditTimeUnit}
          exEditUrl={manage.exEditUrl}
          setExEditUrl={manage.setExEditUrl}
          exEditNotes={manage.exEditNotes}
          setExEditNotes={manage.setExEditNotes}
          exEditWarmup={manage.exEditWarmup}
          setExEditWarmup={manage.setExEditWarmup}
          exerciseEditStatus={manage.exerciseEditStatus}
          createExercise={manage.createExercise}
          deleteExercise={manage.deleteExercise}
          openExerciseEditor={manage.openExerciseEditor}
          closeExerciseEditor={manage.closeExerciseEditor}
          saveExerciseEdits={manage.saveExerciseEdits}
          workoutTemplates={manage.workoutTemplates}
          newWorkoutName={manage.newWorkoutName}
          setNewWorkoutName={manage.setNewWorkoutName}
          createWorkout={manage.createWorkout}
          deleteWorkout={manage.deleteWorkout}
          editingWorkout={manage.editingWorkout}
          setEditingWorkout={manage.setEditingWorkout}
          openWorkoutEditor={manage.openWorkoutEditor}
          isRenamingWorkout={manage.isRenamingWorkout}
          beginRenameWorkout={manage.beginRenameWorkout}
          cancelRenameWorkout={manage.cancelRenameWorkout}
          workoutNameDraft={manage.workoutNameDraft}
          setWorkoutNameDraft={manage.setWorkoutNameDraft}
          renameWorkoutStatus={manage.renameWorkoutStatus}
          saveRenameWorkout={manage.saveRenameWorkout}
          addExerciseId={manage.addExerciseId}
          setAddExerciseId={manage.setAddExerciseId}
          addExerciseToWorkout={manage.addExerciseToWorkout}
          removeExerciseFromWorkout={manage.removeExerciseFromWorkout}
          moveExercise={manage.moveExercise}
          manageSaveMsg={manage.manageSaveMsg}
          historyMode={manage.historyMode}
          setHistoryMode={manage.setHistoryMode}
          historyError={manage.historyError}
          historyLoading={manage.historyLoading}
          sessions={manage.sessions}
          selectedSession={manage.selectedSession}
          setSelectedSession={manage.setSelectedSession}
          formatLocalDateTime={formatLocalDateTime}
          openSession={manage.openSession}
          deleteSessionFromHistory={manage.deleteSessionFromHistory}
          plansMode={manage.plansMode}
          setPlansMode={manage.setPlansMode}
          apiBase={API}
          workouts={workoutCatalog.workouts}
          plans={workoutCatalog.plans}
          loadPlans={workoutCatalog.loadPlans}
          newPlanTemplateId={manage.newPlanTemplateId}
          setNewPlanTemplateId={manage.setNewPlanTemplateId}
          newPlanName={manage.newPlanName}
          setNewPlanName={manage.setNewPlanName}
          createPlan={manage.createPlan}
          editingPlan={manage.editingPlan}
          setEditingPlan={manage.setEditingPlan}
          planDisplayName={workoutCatalog.planDisplayName}
          planNameDraft={manage.planNameDraft}
          setPlanNameDraft={manage.setPlanNameDraft}
          renamePlan={manage.renamePlan}
          deletePlan={manage.deletePlan}
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
