import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    __QINGJIAN_DESKTOP__?: {
      registerCloseGuard: () => Promise<void>;
      confirmClose: () => Promise<void>;
      notify?: (message: {id: string; title: string; body: string}) => Promise<void>;
    };
  }
}

const BEFORE_CLOSE = "qingjian:before-close";

export function useDesktopClose() {
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    const report = () => { if (mounted) setError("窗口关闭失败，请重试。"); };
    const close = () => { void window.__QINGJIAN_DESKTOP__?.confirmClose().catch(report); };
    const register = () => { void window.__QINGJIAN_DESKTOP__?.registerCloseGuard().catch(report); };
    const request = () => {
      setError("");
      const event = new CustomEvent(BEFORE_CLOSE, { cancelable: true, detail: close });
      if (window.dispatchEvent(event)) close();
    };
    window.addEventListener("qingjian:request-close", request);
    window.addEventListener("qingjian:desktop-ready", register);
    register();
    return () => {
      mounted = false;
      window.removeEventListener("qingjian:request-close", request);
      window.removeEventListener("qingjian:desktop-ready", register);
    };
  }, []);
  return error;
}

/** A mounted workspace owns the decision, including pending writes and drafts. */
export function useDesktopCloseGuard(guard: (close: () => void) => void) {
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => {
    const request = (event: Event) => {
      event.preventDefault();
      latest.current((event as CustomEvent<() => void>).detail);
    };
    window.addEventListener(BEFORE_CLOSE, request);
    return () => window.removeEventListener(BEFORE_CLOSE, request);
  }, []);
}
