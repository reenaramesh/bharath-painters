import { useEffect, useRef, useState } from "react";

export function authError(error, fallback) {
  const data = error.response?.data;
  if (typeof data === "string") return data;
  return data ? Object.values(data).flat().filter((value) => typeof value === "string").join(" ") || fallback : fallback;
}

export function useOtpCooldown(initialSeconds = 0) {
  const [deadline, setDeadline] = useState(() => Date.now() + Math.max(0, Number(initialSeconds) || 0) * 1000);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (!remaining) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, remaining]);
  function start(seconds = 60) {
    const time = Date.now();
    setNow(time);
    setDeadline(time + Math.max(0, Number(seconds) || 0) * 1000);
  }
  return { remaining, start };
}

export function retryAfter(error) {
  return error.response?.headers?.["retry-after"] ?? error.response?.data?.resend_after_seconds ?? 60;
}

export function useAuthLifecycle() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  return active;
}
