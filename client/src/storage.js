export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage errors
  }
}

export function lsDel(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
