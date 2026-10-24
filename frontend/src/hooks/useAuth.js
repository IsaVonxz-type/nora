import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, loginRequest, logoutRequest } from "../services/authService";
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
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: false,
    staleTime: 30_000,
  });

  // Before the first server response, trust localStorage to avoid a flash-to-login.
  // On network/5xx errors keep the stored session — only clear on an explicit 401
  // (getProfile returns null on 401, so profileQuery.data === null means "not authed").
  const user = useMemo(() => {
    if (!profileQuery.isFetched) return getStoredUser();
    if (profileQuery.isError) return getStoredUser();
    return profileQuery.data ?? null;
  }, [profileQuery.isFetched, profileQuery.isError, profileQuery.data]);

  useEffect(() => {
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
  }, [profileQuery.data, profileQuery.isFetched, profileQuery.isError, queryClient]);

  useEffect(() => {
    const expire = () => {
      advanceSessionGeneration();
      queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== "profile" });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(["profile"], null);
    };
    window.addEventListener("app:session-expired", expire);
    return () => window.removeEventListener("app:session-expired", expire);
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

  const login = async ({ email, password, tenant_slug }) => {
    const data = await loginRequest({ email, password, ...(tenant_slug ? { tenant_slug } : {}) });
    advanceSessionGeneration();
    await queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== "profile" });
    queryClient.getMutationCache().clear();
    if (data?.user) {
      setStoredUser(data.user);
    }
    queryClient.setQueryData(["profile"], data?.user ?? null);
    return data;
  };

  const logout = async () => {
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
