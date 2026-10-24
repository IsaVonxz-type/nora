import { useCallback, useEffect, useState } from "react";
import { AppRouter } from "../app/AppRouter";
import { resolveHostOrganization } from "./resolveOrganization";

export function OrganizationHostBootstrap() {
  const [hostResolution, setHostResolution] = useState({ status: "pending", organization: null });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setHostResolution({ status: "pending", organization: null });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    resolveHostOrganization({ signal: controller.signal }).then((resolution) => {
      if (active) setHostResolution(resolution);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  return <AppRouter hostResolution={hostResolution} onRetryHostResolution={retry} />;
}
