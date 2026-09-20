import { useState, type FormEvent } from "react";
import { ArrowUpRight, Leaf, LoaderCircle } from "lucide-react";
import { ApiError, authApi, type FieldErrors, type User } from "../../api";
import { Button, Input } from "../../components/ui";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "发生错误，请重试。";

export function AuthScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanUsername = username.trim();
    const nextFields: FieldErrors = {};
    if (!cleanUsername) nextFields.username = "请输入用户名。";
    if (!password) nextFields.password = "请输入密码。";
    if (register && password !== confirm) {
      nextFields.confirm = "两次输入的密码不一致。";
    }
    setFields(nextFields);
    if (Object.keys(nextFields).length) return;

    setBusy(true);
    setError("");
    try {
      const user = await authApi<User>(
        `/auth/${register ? "register" : "login"}`,
        "POST",
        { username: cleanUsername, password },
      );
      onAuth(user);
    } catch (error) {
      if (error instanceof ApiError) setFields(error.fields);
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setRegister((value) => !value);
    setError("");
    setFields({});
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand"><Leaf />青笺<span>QINGJIAN</span></div>
        <div className="story-copy">
          <span className="eyebrow">A LITTLE SPACE FOR YOUR MIND</span>
          <h1>把思绪写下来，<br />让日子慢一点。</h1>
          <p>收好一闪而过的灵感，<br />也照顾每一件想完成的小事。</p>
          <div className="paper-art" aria-hidden="true">
            <span>给今天的一页</span><i /><i /><i /><Leaf size={60} />
          </div>
        </div>
        <footer>一页笔记，一点进步。</footer>
      </section>
      <section className="auth-form-area">
        <form onSubmit={submit} className="auth-form">
          <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
          <h2>{register ? "初次见面，欢迎。" : "回来就好。"}</h2>
          <p>{register ? "创建账号，开启你的记录习惯。" : "登录青笺，接着写下你的故事。"}</p>
          <label htmlFor="username">用户名</label>
          <Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required disabled={busy} placeholder="你的名字" />
          {fields.username && <small className="field-error">{fields.username}</small>}
          <label htmlFor="password">密码</label>
          <Input id="password" type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} placeholder="输入密码" />
          {fields.password && <small className="field-error">{fields.password}</small>}
          {register && <>
            <label htmlFor="confirm-password">确认密码</label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required disabled={busy} placeholder="再次输入密码" />
            {fields.confirm && <small className="field-error">{fields.confirm}</small>}
          </>}
          {error && <p role="alert" className="error">{error}</p>}
          <Button className="auth-submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : null}
            {register ? "创建账号" : "登录工作台"}<ArrowUpRight size={18} />
          </Button>
          <div className="auth-switch">
            {register ? "已经有账号？" : "还没有账号？"}
            <Button type="button" variant="ghost" disabled={busy} onClick={switchMode}>
              {register ? "去登录" : "注册账号"}
            </Button>
          </div>
        </form>
        <p className="auth-foot">让想法有处安放。</p>
      </section>
    </main>
  );
}
