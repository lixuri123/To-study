import { Leaf } from "lucide-react";
import { Button } from "./components/ui";
import { AuthScreen } from "./features/auth/AuthScreen";
import { useAuth } from "./features/auth/useAuth";
import { Workspace } from "./layouts/Workspace";
import { useDesktopClose } from "./desktop/useDesktopClose";

export default function App() {
  const desktopError = useDesktopClose();
  const auth = useAuth();
  if (auth.state === "checking") {
    return <div className="boot" role="status"><Leaf /><p>正在打开你的青笺…</p></div>;
  }
  if (auth.state === "retry") {
    return <div className="boot"><p>无法确认登录状态，请检查网络后重试。</p><Button onClick={auth.check}>重试</Button></div>;
  }
  return <>
    {desktopError && <div className="error banner" role="alert">{desktopError}</div>}
    {auth.workspaceUser && <div hidden={auth.state !== "authenticated"}>
      <Workspace key={auth.workspaceUser.id} user={auth.user ?? auth.workspaceUser} active={auth.state === "authenticated"} onLogout={auth.logout} />
    </div>}
    {auth.state === "anonymous" && <AuthScreen onAuth={auth.accept} />}
  </>;
}
