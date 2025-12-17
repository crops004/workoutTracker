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
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon requires SSL/TLS; sslmode=require in the URL is typical. :contentReference[oaicite:4]{index=4}
});

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
