import { useEffect, useRef, useState } from "react";
import type { Confirmation } from "../components/ui";
export function useWorkspaceActions() {
  const [busy, setBusy]=useState(false);
  const [error, setError]=useState("");
  const [notice, setNotice]=useState("");
  const [confirm, setConfirm]=useState<Confirmation|null>(null);
  const running=useRef(false);
  const mounted=useRef(true);
  useEffect(() => {
    mounted.current=true;
    return () => { mounted.current=false; };
  }, []);
  async function run(action: () => Promise<void>): Promise<boolean> {
    if(running.current)
      return false;
    running.current=true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      return true;
    }
    catch(error) {
      if(mounted.current)
        setError(error instanceof Error? error.message:"发生错误，请重试。");
      return false;
    }
    finally {
      running.current=false;
      if(mounted.current)
        setBusy(false);
    }
  }
  return { busy, error, notice, confirm, setError, setNotice, setConfirm, run };
}
export type WorkspaceActions=ReturnType<typeof useWorkspaceActions>;
