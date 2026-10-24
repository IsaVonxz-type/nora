import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, loginRequest, logoutRequest } from "../services/authService";
import { demoUser, endDemoSession, isDemoActive } from "../services/demoSession";
import {
  advanceSessionGeneration,
  clearStoredUser,
  getStoredUser,
  setStoredUser,
  USER_KEY,
} from "../services/session";

const handledStorageEvents = new WeakMap();

export function useAuth() {
  const queryClient = useQueryClient();
  const demoActive = isDemoActive();
  const profileQuery = useQuery({
    queryKey: demoActive ? ["profile", "demo"] : ["profile"],
    queryFn: demoActive ? async () => demoUser : getProfile,
    initialData: demoActive ? demoUser : undefined,
    retry: false,
    staleTime: 30_000,
  });

  // Before the first server response, trust localStorage to avoid a flash-to-login.
  // On network/5xx errors keep the stored session — only clear on an explicit 401
  // (getProfile returns null on 401, so profileQuery.data === null means "not authed").
  const user = useMemo(() => {
    if (demoActive) return profileQuery.data ?? demoUser;
    if (!profileQuery.isFetched) return getStoredUser();
    if (profileQuery.isError) return getStoredUser();
    return profileQuery.data ?? null;
  }, [demoActive, profileQuery.isFetched, profileQuery.isError, profileQuery.data]);

  useEffect(() => {
    if (demoActive) return;
    if (profileQuery.data) {
      setStoredUser(profileQuery.data);
      return;
    }
    // Only wipe storage when the server explicitly said "not authenticated" (401 → null).
    // isError === true means a network or 5xx failure — keep the session alive.
    if (profileQuery.isFetched && !profileQuery.isError && profileQuery.data === null) {
      clearStoredUser();
      queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== "profile" });
      queryClient.getMutationCache().clear();
    }
  }, [demoActive, profileQuery.data, profileQuery.isFetched, profileQuery.isError, queryClient]);

  useEffect(() => {
    const expire = () => {
      advanceSessionGeneration();
      queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== "profile" });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(["profile"], null);
    };
    window.addEventListener("app:session-expired", expire);
    const endDemo = () => {
      advanceSessionGeneration();
      void queryClient.cancelQueries();
      queryClient.clear();
    };
    window.addEventListener("app:demo-ended", endDemo);
    return () => {
      window.removeEventListener("app:session-expired", expire);
      window.removeEventListener("app:demo-ended", endDemo);
    };
  }, [queryClient]);

  useEffect(() => {
    const syncSession = (event) => {
      if (event.key !== USER_KEY || handledStorageEvents.get(queryClient) === event) return;
      handledStorageEvents.set(queryClient, event);
      advanceSessionGeneration();
      void queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== "profile" });
      queryClient.getMutationCache().clear();
      let storedUser = null;
      try { storedUser = getStoredUser(); } catch { storedUser = null; }
      queryClient.setQueryData(["profile"], storedUser);
      void queryClient.invalidateQueries({ queryKey: ["profile"], exact: true });
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [queryClient]);

  const login = async ({ email, password }) => {
    const data = await loginRequest({ email, password });
    const activeDemo = isDemoActive();
    const profileKey = activeDemo ? ["profile", "demo"] : ["profile"];
    advanceSessionGeneration();
    await queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== "profile" });
    queryClient.getMutationCache().clear();
    if (data?.user && !activeDemo) {
      setStoredUser(data.user);
    }
    queryClient.setQueryData(profileKey, data?.user ?? null);
    return data;
  };

  const logout = async () => {
    if (isDemoActive()) {
      endDemoSession();
      advanceSessionGeneration();
      await queryClient.cancelQueries();
      queryClient.clear();
      return;
    }
    try {
      await logoutRequest();
    } finally {
      advanceSessionGeneration();
      await queryClient.cancelQueries();
      clearStoredUser();
      queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== "profile" });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(["profile"], null);
    }
  };

  return {
    user,
    role: user?.rol ? String(user.rol).trim().toLowerCase() : "",
    isAuthenticated: Boolean(user),
    isLoading: profileQuery.isLoading,
    login,
    logout,
  };
}
