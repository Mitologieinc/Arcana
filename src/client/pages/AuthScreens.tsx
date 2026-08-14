import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
          この環境はまだ空です。最初のオーナーとして{" "}
          <Link className="font-semibold text-cf" to="/signup">
            アカウントを作成
          </Link>
          してください。
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
      <p className="mt-6 text-center text-[13px] text-muted">
        アカウントをお持ちでない場合{" "}
        <Link className="font-semibold text-cf" to="/signup">
          アカウントを作成
        </Link>
      </p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const inviteFromUrl = params.get("invite") ?? "";
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; workspaceName: string; role: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteToken, setInviteToken] = useState(inviteFromUrl);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/bootstrap")
      .then((d) => setNeedsSetup(d.needsSetup))
      .catch((e) => setError(e instanceof Error ? e.message : "初期化に失敗しました"));
  }, []);

  useEffect(() => {
    if (needsSetup) return;
    if (!inviteToken.trim() || inviteToken.trim().length < 16) {
      setInviteInfo(null);
      return;
    }
    api<{ email: string; workspaceName: string; role: string }>(`/api/invites/${inviteToken.trim()}`)
      .then((info) => {
        setInviteInfo(info);
        if (info.email) setEmail(info.email);
        setError("");
      })
      .catch((e) => {
        setInviteInfo(null);
        setError(e instanceof Error ? e.message : "招待が無効です");
      });
  }, [inviteToken, needsSetup]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          workspaceName: needsSetup ? workspaceName : undefined,
          inviteToken: needsSetup ? undefined : inviteToken.trim(),
        }),
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

  const kicker =
    needsSetup === null
      ? "環境を確認しています。"
      : needsSetup
        ? "この Cloudflare 環境の最初のアカウントがオーナーになります。人数に上限はありません。"
        : inviteInfo
          ? `「${inviteInfo.workspaceName}」へ ${inviteInfo.role} として招待されています。`
          : "既存の環境へ参加するには、招待コードが必要です。";

  return (
    <AuthLayout title="アカウントを作成" kicker={kicker}>
      <form onSubmit={onSubmit}>
        <Field label="あなたの名前" value={name} onChange={setName} autoComplete="name" />
        <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        {needsSetup ? (
          <Field label="ワークスペース名" value={workspaceName} onChange={setWorkspaceName} />
        ) : (
          <Field label="招待コード" value={inviteToken} onChange={setInviteToken} />
        )}
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || needsSetup === null}>
          {needsSetup ? "作成して始める" : "参加する"}
        </button>
        <p className="mt-3 text-[12px] text-muted">作成後、このデバイスにパスキーを登録できます。</p>
      </form>
      <p className="mt-6 text-center text-[13px] text-muted">
        すでにアカウントがある場合{" "}
        <Link className="font-semibold text-cf" to="/login">
          ログイン
        </Link>
      </p>
    </AuthLayout>
  );
}

export function SetupPage() {
  return <Navigate to="/signup" replace />;
}

export function InvitePage() {
  const { token } = useParams();
  return <Navigate to={token ? `/signup?invite=${token}` : "/signup"} replace />;
}
