import { useEffect, useState } from "react";
import { SERVICES } from "../data/services";

/** Lightweight hook used by future list pages; homepage currently maps SERVICES directly. */
export function useServices() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return { services: SERVICES, ready };
}
