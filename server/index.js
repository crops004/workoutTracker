import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const app = express();
app.use(express.json());

// In dev you’ll run client on http://localhost:5173
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
    credentials: false,
  })
);

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function asInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseISODateOnly(s) {
  // "YYYY-MM-DD" -> Date at UTC midnight
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDateOnly(dateUtc) {
  return dateUtc.toISOString().slice(0, 10);
}

function startOfWeekMonday(dateUtc) {
  // 0=Sun, 1=Mon, ... 6=Sat
  const dow = dateUtc.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  const monday = new Date(dateUtc);
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday;
}

async function getWorkoutTemplate(pool, workoutId) {
  const w = await pool.query(
    `select id, name
     from workout_templates
     where id = $1::int`,
    [workoutId]
  );

  if (!w.rows[0]) return null;

  const ex = await pool.query(
    `select
       wte.exercise_id,
       e.name,
       wte.sort_order
     from workout_template_exercises wte
     join exercises e on e.id = wte.exercise_id
     where wte.workout_template_id = $1::int
     order by wte.sort_order asc`,
    [workoutId]
  );

  return {
    id: w.rows[0].id,
    name: w.rows[0].name,
    exercises: ex.rows,
  };
}

// Get a workout plan by ID, including its exercises
async function getWorkoutPlan(pool, planId) {
  const plan = await pool.query(
    `select
       p.id,
       p.name,
       p.base_template_id,
       wt.name as template_name
     from workout_plans p
     join workout_templates wt on wt.id = p.base_template_id
     where p.id = $1::int`,
    [planId]
  );
  if (!plan.rows.length) return null;

  const ex = await pool.query(
    `select
       wpe.id,
       wpe.plan_id,
       wpe.exercise_id,
       e.name,
       wpe.sort_order,
       wpe.target_sets,
       wpe.target_reps,
       wpe.target_weight,
       wpe.notes
     from workout_plan_exercises wpe
     join exercises e on e.id = wpe.exercise_id
     where wpe.plan_id = $1::int
     order by wpe.sort_order asc`,
    [planId]
  );

  return { plan: plan.rows[0], exercises: ex.rows };
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
  const workoutId = asInt(req.params.id);
  if (!workoutId) return res.status(400).json({ error: "Invalid workout id" });

  const workout = await pool.query(
    `select id, name from workout_templates where id = $1::int`,
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
     where wte.workout_template_id = $1::int
     order by wte.sort_order asc`,
    [workoutId]
  );

  res.json({
    workout: workout.rows[0],
    exercises: exercises.rows,
  });
});

// Start a session (from a template OR a plan)
app.post("/api/sessions", async (req, res) => {
  try {
    const tmplIn = asInt(req.body.workout_template_id);
    const planIn = asInt(req.body.plan_id);

    if (!tmplIn && !planIn) {
      return res.status(400).json({ error: "workout_template_id or plan_id required" });
    }
    if (tmplIn && planIn) {
      return res.status(400).json({ error: "Send only one of workout_template_id or plan_id" });
    }

    const date = req.body.performed_on ?? new Date().toISOString().slice(0, 10);

    let templateId = tmplIn ?? null;
    let planId = planIn ?? null;

    if (planId) {
      const plan = await pool.query(
        `select id, base_template_id
         from workout_plans
         where id = $1::int`,
        [planId]
      );

      if (!plan.rows.length) {
        return res.status(404).json({ error: "Plan not found" });
      }

      templateId = asInt(plan.rows[0].base_template_id);
      if (!templateId) return res.status(500).json({ error: "Plan has invalid base_template_id" });
    }

    const { rows } = await pool.query(
      `insert into workout_sessions (workout_template_id, plan_id, performed_on)
       values ($1::int, $2::int, $3)
       returning id`,
      [templateId, planId, date]
    );

    res.json({
      session_id: rows[0].id,
      workout_template_id: templateId,
      plan_id: planId,
    });
  } catch (err) {
    console.error("START SESSION ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Log one set
app.post("/api/sets", async (req, res) => {
  const { session_id, exercise_id, set_number, weight, reps, rpe } = req.body;
  await pool.query(
    `insert into exercise_sets (session_id, exercise_id, set_number, weight, reps, rpe)
     values ($1::int,$2::int,$3::int,$4,$5,$6)`,
    [session_id, exercise_id, set_number, weight, reps, rpe]
  );
  res.json({ ok: true });
});

// Get all logged sets for a session
app.get("/api/sessions/:id/sets", async (req, res) => {
  const sessionId = asInt(req.params.id);
  if (!sessionId) return res.status(400).json({ error: "Invalid session id" });

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
     where session_id = $1::int
     order by exercise_id asc, set_number asc`,
    [sessionId]
  );

  res.json(rows);
});

// Get runner payload for a session (uses plan targets if session has plan_id)
app.get("/api/sessions/:id/runner", async (req, res) => {
  try {
    const sessionId = asInt(req.params.id);
    if (!sessionId) return res.status(400).json({ error: "Invalid session id" });

    const s = await pool.query(
      `select id, performed_on, workout_template_id, plan_id
       from workout_sessions
       where id = $1::int`,
      [sessionId]
    );

    if (!s.rows.length) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = s.rows[0];

    if (session.plan_id) {
      const plan = await pool.query(
        `select id, name
         from workout_plans
         where id = $1::int`,
        [session.plan_id]
      );

      // If plan got deleted later, still allow runner fallback to template
      if (plan.rows.length) {
        const ex = await pool.query(
          `select
             wpe.id as plan_exercise_id,
             wpe.exercise_id,
             e.name,
             e.tracking_type,
             e.time_unit,
             e.info_url,
             e.notes,
             wpe.sort_order,
             wpe.target_sets,
             wpe.target_reps,
             wpe.target_weight
           from workout_plan_exercises wpe
           join exercises e on e.id = wpe.exercise_id
           where wpe.plan_id = $1::int
           order by wpe.sort_order asc`,
          [session.plan_id]
        );

        return res.json({
          session,
          workout_name: plan.rows[0].name,
          exercises: ex.rows,
        });
      }
    }

    if (!session.workout_template_id) {
      return res.status(400).json({ error: "Session missing workout_template_id and plan_id" });
    }

    const tmpl = await pool.query(
      `select id, name
       from workout_templates
       where id = $1::int`,
      [session.workout_template_id]
    );

    const ex = await pool.query(
      `select
         wte.id as template_exercise_id,
         wte.exercise_id,
         e.name,
         e.tracking_type,
         e.time_unit,
         e.info_url,
         e.notes,
         wte.sort_order,
         wte.target_sets,
         wte.target_reps
       from workout_template_exercises wte
       join exercises e on e.id = wte.exercise_id
       where wte.workout_template_id = $1::int
       order by wte.sort_order asc`,
      [session.workout_template_id]
    );

    res.json({
      session,
      workout_name: tmpl.rows[0]?.name ?? "Workout",
      exercises: ex.rows,
    });
  } catch (err) {
    console.error("RUNNER LOAD ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
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

    await client.query(
      `delete from exercise_sets
       where session_id = $1::int and exercise_id = $2::int`,
      [session_id, exercise_id]
    );

    for (const s of sets) {
      await client.query(
        `insert into exercise_sets (session_id, exercise_id, set_number, weight, reps, rpe)
         values ($1::int,$2::int,$3::int,$4,$5,$6)`,
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
    res.status(500).json({ ok: false, error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// Last time you did an exercise (excluding current session)
app.get("/api/exercises/:id/last", async (req, res) => {
  const exerciseId = asInt(req.params.id);
  const excludeSessionId = asInt(req.query.exclude_session_id);

  const session = await pool.query(
    `
    select ws.id, ws.performed_on
    from workout_sessions ws
    join exercise_sets es on es.session_id = ws.id
    where es.exercise_id = $1::int
      and ($2::int is null or ws.id <> $2::int)
    order by ws.performed_on desc, ws.id desc
    limit 1
    `,
    [exerciseId, excludeSessionId]
  );

  if (!session.rows.length) {
    return res.json({ found: false });
  }

  const lastSessionId = session.rows[0].id;

  const sets = await pool.query(
    `
    select set_number, weight, reps, rpe
    from exercise_sets
    where session_id = $1::int and exercise_id = $2::int
    order by set_number asc
    `,
    [lastSessionId, exerciseId]
  );

  res.json({
    found: true,
    performed_on: session.rows[0].performed_on.toISOString().slice(0, 10),
    session_id: lastSessionId,
    sets: sets.rows,
  });
});

// Update an exercise
app.patch("/api/exercises/:id", async (req, res) => {
  try {
    const id = asInt(req.params.id);

    const name =
      req.body.name == null ? null : String(req.body.name).trim();

    const tracking_type =
      req.body.tracking_type == null ? null : String(req.body.tracking_type);

    const time_unit =
      req.body.time_unit == null ? null : String(req.body.time_unit);

    const info_url =
      req.body.info_url == null || String(req.body.info_url).trim() === ""
        ? null
        : String(req.body.info_url).trim();

    const notes =
      req.body.notes == null || String(req.body.notes).trim() === ""
        ? null
        : String(req.body.notes).trim();

    if (tracking_type != null && !["weight_reps", "time"].includes(tracking_type)) {
      return res.status(400).json({ error: "tracking_type must be 'weight_reps' or 'time'" });
    }
    if (time_unit != null && !["seconds", "minutes"].includes(time_unit)) {
      return res.status(400).json({ error: "time_unit must be 'seconds' or 'minutes'" });
    }

    const { rows } = await pool.query(
      `update exercises
       set
         name = coalesce($1, name),
         tracking_type = coalesce($2, tracking_type),
         time_unit = coalesce($3, time_unit),
         info_url = $4,
         notes = $5
       where id = $6::int
       returning id, name, tracking_type, time_unit, info_url, notes`,
      [
        name && name !== "" ? name : null,
        tracking_type,
        time_unit,
        info_url,
        notes,
        id,
      ]
    );

    if (!rows.length) return res.status(404).json({ error: "Exercise not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("PATCH EXERCISE ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Delete a session and all its sets
app.delete("/api/sessions/:id", async (req, res) => {
  const sessionId = asInt(req.params.id);
  if (!sessionId) return res.status(400).json({ error: "Invalid session id" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from exercise_sets where session_id = $1::int`, [sessionId]);
    await client.query(`delete from workout_sessions where id = $1::int`, [sessionId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// --- Exercises (library) ---

app.get("/api/exercises", async (req, res) => {
  const { rows } = await pool.query(
    `select id, name, tracking_type, time_unit, info_url, notes
     from exercises
     order by name asc`
  );
  res.json(rows);
});

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

app.delete("/api/exercises/:id", async (req, res) => {
  const id = asInt(req.params.id);

  const used = await pool.query(
    `select 1
     from workout_template_exercises
     where exercise_id = $1::int
     limit 1`,
    [id]
  );

  if (used.rows.length > 0) {
    return res.status(409).json({
      error: "Exercise is used in a workout. Remove it from workouts first.",
    });
  }

  await pool.query(`delete from exercises where id = $1::int`, [id]);
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
  const workoutId = asInt(req.params.id);
  const data = await getWorkoutTemplate(pool, workoutId);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

// Rename a workout template
app.patch("/api/workout-templates/:id", async (req, res) => {
  try {
    const id = asInt(req.params.id);
    const name = String(req.body.name ?? "").trim();

    if (!name) return res.status(400).json({ error: "name is required" });

    const { rows } = await pool.query(
      `update workout_templates
       set name = $1
       where id = $2::int
       returning id, name`,
      [name, id]
    );

    if (!rows.length) return res.status(404).json({ error: "Not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("RENAME WORKOUT ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Add an exercise to a workout template
app.post("/api/workout-templates/:id/exercises", async (req, res) => {
  try {
    const workoutId = asInt(req.params.id);
    const exerciseId = asInt(req.body.exercise_id);

    if (!exerciseId) return res.status(400).json({ error: "exercise_id required" });

    const exists = await pool.query(
      `select 1
       from workout_template_exercises
       where workout_template_id = $1::int and exercise_id = $2::int
       limit 1`,
      [workoutId, exerciseId]
    );
    if (exists.rows.length) {
      return res.status(409).json({ error: "Exercise already in this workout" });
    }

    const maxOrder = await pool.query(
      `select coalesce(max(sort_order), 0) as max
       from workout_template_exercises
       where workout_template_id = $1::int`,
      [workoutId]
    );

    await pool.query(
      `insert into workout_template_exercises
       (workout_template_id, exercise_id, sort_order)
       values ($1::int, $2::int, $3::int)`,
      [workoutId, exerciseId, Number(maxOrder.rows[0].max) + 1]
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
  const workoutId = asInt(req.params.id);
  const exerciseId = asInt(req.params.exerciseId);

  await pool.query(
    `delete from workout_template_exercises
     where workout_template_id = $1::int and exercise_id = $2::int`,
    [workoutId, exerciseId]
  );

  const rows = await pool.query(
    `select id
     from workout_template_exercises
     where workout_template_id = $1::int
     order by sort_order asc`,
    [workoutId]
  );

  for (let i = 0; i < rows.rows.length; i++) {
    await pool.query(
      `update workout_template_exercises
       set sort_order = $1::int
       where id = $2::int`,
      [i + 1, rows.rows[i].id]
    );
  }

  const data = await getWorkoutTemplate(pool, workoutId);
  res.json(data);
});

// Reorder an exercise inside a workout template by swapping sort_order with neighbor
app.post("/api/workout-templates/:id/exercises/:exerciseId/move", async (req, res) => {
  try {
    const workoutId = asInt(req.params.id);
    const exerciseId = asInt(req.params.exerciseId);
    const { direction } = req.body;

    if (!["up", "down"].includes(direction)) {
      return res.status(400).json({ error: "direction must be 'up' or 'down'" });
    }

    const cur = await pool.query(
      `select id, sort_order
       from workout_template_exercises
       where workout_template_id = $1::int and exercise_id = $2::int`,
      [workoutId, exerciseId]
    );

    if (!cur.rows.length) return res.status(404).json({ error: "Not found" });

    const curId = cur.rows[0].id;
    const curOrder = Number(cur.rows[0].sort_order);

    const neighbor = await pool.query(
      direction === "up"
        ? `select id, sort_order
           from workout_template_exercises
           where workout_template_id = $1::int and sort_order < $2::int
           order by sort_order desc
           limit 1`
        : `select id, sort_order
           from workout_template_exercises
           where workout_template_id = $1::int and sort_order > $2::int
           order by sort_order asc
           limit 1`,
      [workoutId, curOrder]
    );

    if (!neighbor.rows.length) {
      const data = await getWorkoutTemplate(pool, workoutId);
      return res.json(data);
    }

    const nbId = neighbor.rows[0].id;
    const nbOrder = Number(neighbor.rows[0].sort_order);

    await pool.query("begin");
    try {
      await pool.query(
        `update workout_template_exercises set sort_order = $1::int where id = $2::int`,
        [nbOrder, curId]
      );
      await pool.query(
        `update workout_template_exercises set sort_order = $1::int where id = $2::int`,
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
    const workoutId = asInt(req.params.id);
    const exerciseId = asInt(req.params.exerciseId);

    const { target_sets, target_reps, notes } = req.body;

    await pool.query(
      `update workout_template_exercises
       set
         target_sets = coalesce($1::int, target_sets),
         target_reps = coalesce($2, target_reps),
         notes = coalesce($3, notes)
       where workout_template_id = $4::int and exercise_id = $5::int`,
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

// List recent workout sessions
app.get("/api/sessions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const { rows } = await pool.query(
        `select
            ws.id,
            ws.performed_on,
            ws.created_at,
            coalesce(p.name, wt.name, 'Workout') as workout_name
        from workout_sessions ws
        left join workout_plans p on p.id = ws.plan_id
        left join workout_templates wt on wt.id = ws.workout_template_id
        order by ws.created_at desc, ws.id desc
        limit $1::int`,
        [limit]
    );

    res.json(rows);
  } catch (err) {
    console.error("LIST SESSIONS ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Get details for a workout session, including logged sets
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const sessionId = asInt(req.params.id);

    const header = await pool.query(
        `select
            ws.id,
            ws.performed_on,
            ws.created_at,
            coalesce(p.name, wt.name, 'Workout') as workout_name
        from workout_sessions ws
        left join workout_plans p on p.id = ws.plan_id
        left join workout_templates wt on wt.id = ws.workout_template_id
        where ws.id = $1::int`,
        [sessionId]
    );

    if (!header.rows.length) return res.status(404).json({ error: "Session not found" });

    const sets = await pool.query(
      `select
         es.exercise_id,
         e.name as exercise_name,
         es.set_number,
         es.weight,
         es.reps,
         es.rpe
       from exercise_sets es
       join exercises e on e.id = es.exercise_id
       where es.session_id = $1::int
       order by e.name asc, es.set_number asc`,
      [sessionId]
    );

    const grouped = {};
    for (const r of sets.rows) {
      if (!grouped[r.exercise_id]) {
        grouped[r.exercise_id] = { exercise_id: r.exercise_id, name: r.exercise_name, sets: [] };
      }
      grouped[r.exercise_id].sets.push({
        set_number: r.set_number,
        weight: r.weight,
        reps: r.reps,
        rpe: r.rpe,
      });
    }

    res.json({
      ...header.rows[0],
      exercises: Object.values(grouped),
    });
  } catch (err) {
    console.error("SESSION DETAIL ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// --- Plans ---

// List workout plans
app.get("/api/plans", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select p.id, p.name, p.base_template_id, wt.name as template_name
       from workout_plans p
       join workout_templates wt on wt.id = p.base_template_id
       order by p.id desc`
    );
    res.json(rows);
  } catch (err) {
    console.error("LIST PLANS ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Create a workout plan from a template
app.post("/api/plans", async (req, res) => {
  try {
    const base_template_id = asInt(req.body.base_template_id);
    const name = req.body.name;

    if (!base_template_id) return res.status(400).json({ error: "base_template_id required" });

    const created = await pool.query(
      `insert into workout_plans (name, base_template_id)
       values ($1, $2::int)
       returning id`,
      [name || `Plan`, base_template_id]
    );

    const planId = created.rows[0].id;

    const templateExercises = await pool.query(
        `select exercise_id, sort_order
        from workout_template_exercises
        where workout_template_id = $1::int
        order by sort_order asc`,
        [base_template_id]
        );

    for (const row of templateExercises.rows) {
        await pool.query(
            `insert into workout_plan_exercises
            (plan_id, exercise_id, sort_order, target_sets, target_reps, target_weight)
            values ($1::int,$2::int,$3::int,$4::int,$5,$6)`,
            [
            planId,
            row.exercise_id,
            row.sort_order,
            3,        // default sets
            "8",      // default reps
            null      // planned weight starts blank
            ]
        );
    }

    const data = await getWorkoutPlan(pool, planId);
    res.json(data);
  } catch (err) {
    console.error("CREATE PLAN ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Get a workout plan by ID
app.get("/api/plans/:id", async (req, res) => {
  try {
    const planId = asInt(req.params.id);
    const data = await getWorkoutPlan(pool, planId);
    if (!data) return res.status(404).json({ error: "Plan not found" });
    res.json(data);
  } catch (err) {
    console.error("GET PLAN ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Rename a plan
app.patch("/api/plans/:id", async (req, res) => {
  try {
    const planId = asInt(req.params.id);
    const name = req.body?.name;

    if (!planId) return res.status(400).json({ error: "Invalid plan id" });
    if (name == null || String(name).trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }

    await pool.query(
      `update workout_plans
       set name = $1
       where id = $2::int`,
      [String(name).trim(), planId]
    );

    const data = await getWorkoutPlan(pool, planId);
    res.json(data);
  } catch (err) {
    console.error("RENAME PLAN ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Delete a plan (and null out plan_id on any sessions that referenced it)
app.delete("/api/plans/:id", async (req, res) => {
  const planId = asInt(req.params.id);
  if (!planId) return res.status(400).json({ error: "Invalid plan id" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // keep history/session runner from breaking later
    await client.query(
      `update workout_sessions
       set plan_id = null
       where plan_id = $1::int`,
      [planId]
    );

    await client.query(`delete from workout_plan_exercises where plan_id = $1::int`, [planId]);
    await client.query(`delete from workout_plans where id = $1::int`, [planId]);

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("DELETE PLAN ERROR:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// Update target sets/reps/weight/notes for an exercise in a workout plan
app.patch("/api/plans/:planId/exercises/:planExerciseId", async (req, res) => {
  try {
    const planId = asInt(req.params.planId);
    const planExerciseId = asInt(req.params.planExerciseId);
    const { target_sets, target_reps, target_weight, notes } = req.body;

    await pool.query(
      `update workout_plan_exercises
       set target_sets = coalesce($1::int, target_sets),
           target_reps = coalesce($2, target_reps),
           target_weight = coalesce($3, target_weight),
           notes = coalesce($4, notes)
       where id = $5::int and plan_id = $6::int`,
      [
        target_sets === undefined ? null : Number(target_sets),
        target_reps === undefined ? null : String(target_reps),
        target_weight === undefined ? null : Number(target_weight),
        notes === undefined ? null : String(notes),
        planExerciseId,
        planId,
      ]
    );

    const data = await getWorkoutPlan(pool, planId);
    res.json(data);
  } catch (err) {
    console.error("UPDATE PLAN EXERCISE ERROR:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// --- Workout calendar ---
app.get("/api/calendar", async (req, res) => {
  // You can pass ANY date; server normalizes to that week's Monday.
  const weekStartParam = req.query.week_start;
  const d = parseISODateOnly(weekStartParam);
  if (!d) return res.status(400).json({ error: "week_start must be YYYY-MM-DD" });

  const mondayUtc = startOfWeekMonday(d);
  const weekStart = isoDateOnly(mondayUtc); // canonical Monday

  const { rows } = await pool.query(
    `
    select
      wc.id,
      wc.planned_on::text as planned_on,
      wc.workout_plan_id,
      coalesce(wc.label, wp.name) as label,
      wc.notes,
      ws.id as session_id
    from workout_calendar wc
    join workout_plans wp on wp.id = wc.workout_plan_id
    left join workout_sessions ws on ws.workout_calendar_id = wc.id
    where wc.planned_on >= $1::date
      and wc.planned_on < ($1::date + interval '7 days')
    order by wc.planned_on asc, wc.id asc
    `,
    [weekStart]
  );

  res.json({ week_start: weekStart, items: rows });
});

// Add a calendar entry
app.post("/api/calendar", async (req, res) => {
  const { planned_on, workout_plan_id, label = null, notes = null } = req.body;

  const d = parseISODateOnly(planned_on);
  if (!d) return res.status(400).json({ error: "planned_on must be YYYY-MM-DD" });

  const planId = asInt(workout_plan_id);
  if (!planId) return res.status(400).json({ error: "workout_plan_id must be an int" });

  const { rows } = await pool.query(
    `
    insert into workout_calendar (planned_on, workout_plan_id, label, notes)
    values ($1::date, $2::int, $3::text, $4::text)
    returning id, planned_on::text as planned_on, workout_plan_id, label, notes
    `,
    [planned_on, planId, label, notes]
  );

  res.status(201).json(rows[0]);
});

// Delete a calendar entry  
app.delete("/api/calendar/:id", async (req, res) => {
  const id = asInt(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be int" });

  // Optional: prevent deleting if already started
  const started = await pool.query(
    `select 1 from workout_sessions where workout_calendar_id = $1::int limit 1`,
    [id]
  );
  if (started.rows.length) return res.status(409).json({ error: "Already started" });

  await pool.query(`delete from workout_calendar where id = $1::int`, [id]);
  res.json({ ok: true });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on ${port}`));
