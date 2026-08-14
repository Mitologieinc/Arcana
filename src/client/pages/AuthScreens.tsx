import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Fingerprint } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { Brand, BrandMark } from "../components/Brand";

function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function AuthLayout({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <aside className="hidden w-[42%] flex-col justify-between bg-ink px-10 py-10 text-white lg:flex">
        <BrandMark size={22} />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cf">No seat licenses</p>
          <h2 className="mt-3 max-w-sm text-[32px] font-semibold leading-tight tracking-tight">
            チームが増えても、Wiki代は増えない。
          </h2>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-white/60">
            Cloudflare の従量課金だけで動くセルフホスト Notion。パスキーでログインし、ページ・DB・同時編集まで一箇所に。
          </p>
        </div>
        <p className="text-[11px] text-white/35">Built for the edge · Workers · D1 · R2</p>
      </aside>
      <main className="flex flex-1 items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          {kicker && <p className="mt-2 text-[13px] leading-relaxed text-muted">{kicker}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

async function signInWithPasskey() {
  const { error } = await authClient.signIn.passkey();
  return error;
}

export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/bootstrap")
      .then((d) => setNeedsSetup(d.needsSetup))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const cred = window.PublicKeyCredential;
    if (!cred?.isConditionalMediationAvailable) return;
    void cred.isConditionalMediationAvailable().then((ok) => {
      if (!ok) return;
      void authClient.signIn.passkey({ autoFill: true }).then(({ error: err, data }) => {
        if (!err && data) nav("/");
      });
    });
  }, [nav]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (err) {
      setError(err.message || "ログインに失敗しました");
      return;
    }
    nav("/");
  }

  async function onPasskey() {
    setError("");
    setBusy(true);
    const err = await signInWithPasskey();
    setBusy(false);
    if (err) {
      setError(err.message || "パスキーでログインできませんでした");
      return;
    }
    nav("/");
  }

  return (
    <AuthLayout title="ログイン" kicker="パスキー、またはメールとパスワード。">
      {needsSetup && (
        <p className="mb-5 border border-line bg-white px-3 py-2.5 text-[13px]">
          ワークスペースはまだありません。{" "}
          <Link className="font-semibold text-cf" to="/setup">
            初期セットアップ
          </Link>
        </p>
      )}
      <button type="button" className="btn btn-primary w-full" onClick={onPasskey} disabled={busy}>
        <Fingerprint size={16} />
        パスキーで続ける
      </button>
      <div className="divider">or</div>
      <form onSubmit={onSubmit}>
        <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="username webauthn" />
        <Field
          label="パスワード"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password webauthn"
        />
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-secondary w-full" disabled={busy}>
          メールでログイン
        </button>
      </form>
    </AuthLayout>
  );
}

export function SetupPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, workspaceName }),
      });
      try {
        await authClient.passkey.addPasskey({ name: "このデバイス" });
      } catch {
        /* パスキーは任意。後から設定できる */
      }
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="ワークスペースを作る" kicker="最初のアカウントがオーナーになります。人数に上限はありません。">
      <form onSubmit={onSubmit}>
        <Field label="あなたの名前" value={name} onChange={setName} autoComplete="name" />
        <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <Field label="ワークスペース名" value={workspaceName} onChange={setWorkspaceName} />
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          作成して始める
        </button>
        <p className="mt-3 text-[12px] text-muted">作成後、このデバイスにパスキーを登録できます。</p>
      </form>
    </AuthLayout>
  );
}

export function InvitePage() {
  const { token } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ email: string; workspaceName: string; role: string } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<{ email: string; workspaceName: string; role: string }>(`/api/invites/${token}`)
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    setBusy(true);
    try {
      await api(`/api/invites/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ name, password, email: info?.email }),
      });
      try {
        await authClient.passkey.addPasskey({ name: "このデバイス" });
      } catch {
        /* optional */
      }
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="招待を受け入れる"
      kicker={
        info
          ? `「${info.workspaceName}」へ ${info.role} として招待されています（${info.email}）。`
          : "招待リンクを確認しています。"
      }
    >
      <form onSubmit={onSubmit}>
        <Field label="表示名" value={name} onChange={setName} autoComplete="name" />
        <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          参加する
        </button>
      </form>
    </AuthLayout>
  );
}
