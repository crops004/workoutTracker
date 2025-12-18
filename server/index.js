import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const app = express();
app.use(express.json());

// In dev you’ll run client on http://localhost:5173
app.use(cors({
  origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
  credentials: false,
}));

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon requires SSL/TLS; sslmode=require in the URL is typical. :contentReference[oaicite:4]{index=4}
});

async function getWorkoutTemplate(pool, workoutId) {
  const w = await pool.query(
    `select id, name
     from workout_templates
     where id = $1`,
    [workoutId]
  );

  if (!w.rows[0]) return null;

  const ex = await pool.query(
    `select
       wte.exercise_id,
       e.name,
       wte.target_sets,
       wte.target_reps,
       wte.sort_order
     from workout_template_exercises wte
     join exercises e on e.id = wte.exercise_id
     where wte.workout_template_id = $1
     order by wte.sort_order asc`,
    [workoutId]
  );

  return {
    id: w.rows[0].id,
    name: w.rows[0].name,
    exercises: ex.rows,
  };
}

app.get("/api/health", async (req, res) => {
  const { rows } = await pool.query("select now() as now");
  res.json({ ok: true, now: rows[0].now });
});

// --- MVP endpoints (very minimal) ---

// List workout templates (Lift A/B/C)
app.get("/api/workouts", async (req, res) => {
  const { rows } = await pool.query(`
    select id, name
    from workout_templates
    order by name asc
  `);
  res.json(rows);
});

// Get a workout template + its exercises
app.get("/api/workouts/:id", async (req, res) => {
  const workoutId = Number(req.params.id);

  const workout = await pool.query(
    `select id, name from workout_templates where id = $1`,
    [workoutId]
  );

  if (workout.rows.length === 0) {
    return res.status(404).json({ error: "Workout not found" });
  }

  const exercises = await pool.query(
    `select
       wte.exercise_id as id,
       e.name,
       wte.sort_order,
       wte.target_sets,
       wte.target_reps,
       wte.notes
     from workout_template_exercises wte
     join exercises e on e.id = wte.exercise_id
     where wte.workout_template_id = $1
     order by wte.sort_order asc`,
    [workoutId]
  );

  res.json({
    workout: workout.rows[0],
    exercises: exercises.rows,
  });
});


// Start a session
app.post("/api/sessions", async (req, res) => {
  const { workout_template_id, performed_on } = req.body;
  const { rows } = await pool.query(
    `insert into workout_sessions (workout_template_id, performed_on)
     values ($1, $2)
     returning id`,
    [workout_template_id, performed_on ?? new Date().toISOString().slice(0,10)]
  );
  res.json({ session_id: rows[0].id });
});

// Log one set
app.post("/api/sets", async (req, res) => {
  const { session_id, exercise_id, set_number, weight, reps, rpe } = req.body;
  await pool.query(
    `insert into exercise_sets (session_id, exercise_id, set_number, weight, reps, rpe)
     values ($1,$2,$3,$4,$5,$6)`,
    [session_id, exercise_id, set_number, weight, reps, rpe]
  );
  res.json({ ok: true });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on ${port}`));

// Get all logged sets for a session
app.get("/api/sessions/:id/sets", async (req, res) => {
  const sessionId = Number(req.params.id);

  const { rows } = await pool.query(
    `select
       id,
       exercise_id,
       set_number,
       weight,
       reps,
       rpe,
       created_at
     from exercise_sets
     where session_id = $1
     order by exercise_id asc, set_number asc`,
    [sessionId]
  );

  res.json(rows);
});

// Save multiple sets at once (REPLACE mode: delete existing then insert)
app.post("/api/sets/bulk", async (req, res) => {
  const { session_id, exercise_id, sets } = req.body;

  if (!session_id || !exercise_id || !Array.isArray(sets)) {
    return res.status(400).json({ error: "session_id, exercise_id, sets[] required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) delete existing sets for this exercise in this session
    await client.query(
      `delete from exercise_sets
       where session_id = $1 and exercise_id = $2`,
      [session_id, exercise_id]
    );

    // 2) insert the new sets
    for (const s of sets) {
      await client.query(
        `insert into exercise_sets (session_id, exercise_id, set_number, weight, reps, rpe)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          session_id,
          exercise_id,
          Number(s.set_number),
          s.weight === null ? null : Number(s.weight),
          s.reps === null ? null : Number(s.reps),
          s.rpe === null ? null : Number(s.rpe),
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, replaced: true, inserted: sets.length });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    client.release();
  }
});

// Last time you did an exercise (excluding current session)
app.get("/api/exercises/:id/last", async (req, res) => {
  const exerciseId = Number(req.params.id);
  const excludeSessionId = req.query.exclude_session_id
    ? Number(req.query.exclude_session_id)
    : null;

  // 1) Find the most recent session (performed_on) where this exercise has sets
  const session = await pool.query(
    `
    select ws.id, ws.performed_on
    from workout_sessions ws
    join exercise_sets es on es.session_id = ws.id
    where es.exercise_id = $1
      and ($2::int is null or ws.id <> $2)
    order by ws.performed_on desc, ws.id desc
    limit 1
    `,
    [exerciseId, excludeSessionId]
  );

  if (session.rows.length === 0) {
    return res.json({ found: false });
  }

  const lastSessionId = session.rows[0].id;

  // 2) Fetch the sets for that session+exercise
  const sets = await pool.query(
    `
    select set_number, weight, reps, rpe
    from exercise_sets
    where session_id = $1 and exercise_id = $2
    order by set_number asc
    `,
    [lastSessionId, exerciseId]
  );

  res.json({
    found: true,
    performed_on: session.rows[0].performed_on.toISOString().slice(0,10),
    session_id: lastSessionId,
    sets: sets.rows,
  });
});

// Delete a session and all its sets
app.delete("/api/sessions/:id", async (req, res) => {
  const sessionId = Number(req.params.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from exercise_sets where session_id = $1`, [sessionId]);
    await client.query(`delete from workout_sessions where id = $1`, [sessionId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    client.release();
  }
});

// --- Exercises (library) ---

// List exercises
app.get("/api/exercises", async (req, res) => {
  const { rows } = await pool.query(
    `select id, name
     from exercises
     order by name asc`
  );
  res.json(rows);
});

// Create exercise
app.post("/api/exercises", async (req, res) => {
  const { name } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const { rows } = await pool.query(
    `insert into exercises (name)
     values ($1)
     returning id, name`,
    [String(name).trim()]
  );

  res.json(rows[0]);
});

// Delete exercise (protect if used)
app.delete("/api/exercises/:id", async (req, res) => {
  const id = Number(req.params.id);

  const used = await pool.query(
    `select 1
     from workout_template_exercises
     where exercise_id = $1
     limit 1`,
    [id]
  );

  if (used.rows.length > 0) {
    return res.status(409).json({
      error: "Exercise is used in a workout. Remove it from workouts first.",
    });
  }

  await pool.query(`delete from exercises where id = $1`, [id]);
  res.json({ ok: true });
});

// List workout templates (Lift A/B/C etc.)
app.get("/api/workout-templates", async (req, res) => {
  const { rows } = await pool.query(
    `select id, name
     from workout_templates
     order by name asc`
  );
  res.json(rows);
});

// Create workout template
app.post("/api/workout-templates", async (req, res) => {
  const { name } = req.body;

  const { rows } = await pool.query(
    `insert into workout_templates (name)
     values ($1)
     returning id, name`,
    [name]
  );

  res.json(rows[0]);
});

// Get a workout template + its exercises
app.get("/api/workout-templates/:id", async (req, res) => {
  const workoutId = Number(req.params.id);
  const data = await getWorkoutTemplate(pool, workoutId);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

// Add an exercise to a workout template
app.post("/api/workout-templates/:id/exercises", async (req, res) => {
  try {
    const workoutId = Number(req.params.id);
    const { exercise_id, target_sets, target_reps } = req.body;

    if (!exercise_id) return res.status(400).json({ error: "exercise_id required" });

    // prevent duplicates (optional but nice)
    const exists = await pool.query(
        `select 1 from workout_template_exercises
        where workout_template_id = $1 and exercise_id = $2
        limit 1`,
        [workoutId, exercise_id]
    );
    if (exists.rows.length) {
        return res.status(409).json({ error: "Exercise already in this workout" });
    }

    const maxOrder = await pool.query(
        `select coalesce(max(sort_order), 0) as max
        from workout_template_exercises
        where workout_template_id = $1`,
        [workoutId]
    );

    await pool.query(
        `insert into workout_template_exercises
        (workout_template_id, exercise_id, sort_order, target_sets, target_reps)
        values ($1, $2, $3, $4, $5)`,
        [
        workoutId,
        Number(exercise_id),
        Number(maxOrder.rows[0].max) + 1,
        Number(target_sets ?? 3),
        String(target_reps ?? "8"),
        ]
    );

    const data = await getWorkoutTemplate(pool, workoutId);
    res.json(data);
  } catch (err) {
    console.error("ADD EXERCISE ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Delete an exercise from a workout template
app.delete("/api/workout-templates/:id/exercises/:exerciseId", async (req, res) => {
  const workoutId = Number(req.params.id);
  const exerciseId = Number(req.params.exerciseId);

  await pool.query(
    `delete from workout_template_exercises
     where workout_template_id = $1 and exercise_id = $2`,
    [workoutId, exerciseId]
  );

  // optional: re-sequence sort_order so it stays 1..N
  const rows = await pool.query(
    `select id
     from workout_template_exercises
     where workout_template_id = $1
     order by sort_order asc`,
    [workoutId]
  );

  for (let i = 0; i < rows.rows.length; i++) {
    await pool.query(
      `update workout_template_exercises
       set sort_order = $1
       where id = $2`,
      [i + 1, rows.rows[i].id]
    );
  }

  const data = await getWorkoutTemplate(pool, workoutId);
  res.json(data);
});

// Reorder an exercise inside a workout template by swapping sort_order with neighbor
app.post("/api/workout-templates/:id/exercises/:exerciseId/move", async (req, res) => {
  try {
    const workoutId = Number(req.params.id);
    const exerciseId = Number(req.params.exerciseId);
    const { direction } = req.body; // "up" or "down"

    if (!["up", "down"].includes(direction)) {
      return res.status(400).json({ error: "direction must be 'up' or 'down'" });
    }

    // Find current row
    const cur = await pool.query(
      `select id, sort_order
       from workout_template_exercises
       where workout_template_id = $1 and exercise_id = $2`,
      [workoutId, exerciseId]
    );

    if (!cur.rows.length) return res.status(404).json({ error: "Not found" });

    const curId = cur.rows[0].id;
    const curOrder = Number(cur.rows[0].sort_order);

    // Find neighbor row to swap with
    const neighbor = await pool.query(
      direction === "up"
        ? `select id, sort_order
           from workout_template_exercises
           where workout_template_id = $1 and sort_order < $2
           order by sort_order desc
           limit 1`
        : `select id, sort_order
           from workout_template_exercises
           where workout_template_id = $1 and sort_order > $2
           order by sort_order asc
           limit 1`,
      [workoutId, curOrder]
    );

    // If already at top/bottom, no-op
    if (!neighbor.rows.length) {
      const data = await getWorkoutTemplate(pool, workoutId);
      return res.json(data);
    }

    const nbId = neighbor.rows[0].id;
    const nbOrder = Number(neighbor.rows[0].sort_order);

    // Swap in a transaction (so we don't end up with duplicates)
    await pool.query("begin");
    try {
      await pool.query(
        `update workout_template_exercises set sort_order = $1 where id = $2`,
        [nbOrder, curId]
      );
      await pool.query(
        `update workout_template_exercises set sort_order = $1 where id = $2`,
        [curOrder, nbId]
      );
      await pool.query("commit");
    } catch (e) {
      await pool.query("rollback");
      throw e;
    }

    const data = await getWorkoutTemplate(pool, workoutId);
    res.json(data);
  } catch (err) {
    console.error("MOVE EXERCISE ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Update target sets/reps (and optional notes) for an exercise in a workout template
app.patch("/api/workout-templates/:id/exercises/:exerciseId", async (req, res) => {
  try {
    const workoutId = Number(req.params.id);
    const exerciseId = Number(req.params.exerciseId);

    const { target_sets, target_reps, notes } = req.body;

    // Basic validation (keep it light for MVP)
    if (target_sets != null && (!Number.isFinite(Number(target_sets)) || Number(target_sets) < 1)) {
      return res.status(400).json({ error: "target_sets must be a number >= 1" });
    }
    if (target_reps != null && String(target_reps).trim() === "") {
      return res.status(400).json({ error: "target_reps cannot be empty" });
    }

    await pool.query(
      `update workout_template_exercises
       set
         target_sets = coalesce($1, target_sets),
         target_reps = coalesce($2, target_reps),
         notes = coalesce($3, notes)
       where workout_template_id = $4 and exercise_id = $5`,
      [
        target_sets == null ? null : Number(target_sets),
        target_reps == null ? null : String(target_reps),
        notes == null ? null : String(notes),
        workoutId,
        exerciseId,
      ]
    );

    const data = await getWorkoutTemplate(pool, workoutId);
    res.json(data);
  } catch (err) {
    console.error("UPDATE TEMPLATE EXERCISE ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

