import { useEffect, useState } from "react";

async function pingHealth(apiBase) {
  const resp = await fetch(`${apiBase}/api/health`, { cache: "no-store" });
  const ct = resp.headers.get("content-type") || "";

  if (!resp.ok) throw new Error(`health not ok (${resp.status})`);
  if (!ct.includes("application/json")) throw new Error("health returned non-json");

  return resp.json();
}

async function waitForApi(apiBase, { timeoutMs = 45000, intervalMs = 1500 } = {}) {
  const start = Date.now();
  let lastErr = null;

  while (Date.now() - start < timeoutMs) {
    try {
      await pingHealth(apiBase);
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw lastErr || new Error("API did not wake up in time");
}

export function useApiReady(apiBase) {
  const [apiReady, setApiReady] = useState(false);
  const [apiWaking, setApiWaking] = useState(true);
  const [apiWakeError, setApiWakeError] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setApiWaking(true);
        setApiWakeError("");
        await waitForApi(apiBase, { timeoutMs: 45000, intervalMs: 1500 });
        if (!alive) return;
        setApiReady(true);
      } catch {
        if (!alive) return;
        setApiWakeError("Waking up the server took too long. Tap retry.");
      } finally {
        if (alive) setApiWaking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [apiBase]);

  return {
    apiReady,
    apiWaking,
    apiWakeError,
  };
}
