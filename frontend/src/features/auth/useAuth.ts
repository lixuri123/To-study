import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, authApi, setActiveUser, UNAUTHORIZED_EVENT, type User } from "../../api";

export type AuthState = "checking" | "authenticated" | "anonymous" | "retry";

export function useAuth() {
  const [state, setState] = useState<AuthState>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [workspaceUser, setWorkspaceUser] = useState<User | null>(null);
  const generation = useRef(0);

  const accept = useCallback((next: User) => {
    generation.current++;
    setActiveUser(next.id);
    setUser(next);
    setWorkspaceUser(next);
    setState("authenticated");
  }, []);

  const check = useCallback(() => {
    const started = generation.current;
    setState("checking");
    authApi<User>("/auth/me").then(next => {
      if (generation.current === started) accept(next);
    }).catch(error => {
      if (generation.current === started) setState(error instanceof ApiError && error.status === 401 ? "anonymous" : "retry");
    });
  }, [accept]);

  const logout = useCallback(() => {
    generation.current++;
    setActiveUser(null);
    setUser(null);
    setWorkspaceUser(null);
    setState("anonymous");
  }, []);

  useEffect(() => { sessionStorage.removeItem("token"); check(); }, [check]);
  useEffect(() => {
    const revoked = () => { generation.current++; setActiveUser(null); setUser(null); setState("anonymous"); };
    addEventListener(UNAUTHORIZED_EVENT, revoked);
    return () => removeEventListener(UNAUTHORIZED_EVENT, revoked);
  }, []);
  useEffect(() => {
    if (state !== "authenticated") return;
    const timer = setInterval(() => {
      const started = generation.current;
      authApi<User>("/auth/me").then(next => {
        if (generation.current === started) accept(next);
      }).catch(error => {
        if (generation.current === started && error instanceof ApiError && error.status === 401) {
          window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }
      });
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [state, accept]);

  return { state, user, workspaceUser, accept, check, logout };
}
