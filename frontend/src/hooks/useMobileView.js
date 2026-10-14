import { useEffect, useState } from "react";

export default function useMobileView() {
  const [mobile, setMobile] = useState(() => Boolean(globalThis.window?.matchMedia?.("(max-width: 767px)").matches));
  useEffect(() => {
    if (!globalThis.window?.matchMedia) return;
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}
