import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Fingerprint } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { BrandLockup } from "../components/Brand";

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
    <div className="flex min-h-full items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <BrandLockup className="h-[52px] w-auto max-w-full rounded-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.18)]" />
        </div>
        <div className="rounded-[14px] border border-line bg-white px-6 py-7 shadow-[0_10px_40px_rgba(15,15,15,0.04)]">
          <h1 className="text-center text-[20px] font-semibold tracking-tight">{title}</h1>
          {kicker && <p className="mt-2 text-center text-[13px] leading-relaxed text-muted">{kicker}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
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
        <p className="mb-5 rounded-[8px] bg-canvas px-3 py-2.5 text-[13px] leading-relaxed">
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
      <div className="divider">または</div>
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
      <p className="mt-5 text-center text-[13px] text-muted">
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
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{ email: string; workspaceName: string; role: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean; workspaceName: string | null }>("/api/bootstrap")
      .then((d) => {
        setNeedsSetup(d.needsSetup);
        if (d.workspaceName) setWorkspaceName(d.workspaceName);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "初期化に失敗しました"));
  }, []);

  useEffect(() => {
    if (!inviteFromUrl) return;
    api<{ email: string; workspaceName: string; role: string }>(`/api/invites/${inviteFromUrl}`)
      .then((info) => {
        setInviteInfo(info);
        if (info.email) setEmail(info.email);
        if (info.workspaceName) setWorkspaceName(info.workspaceName);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "招待が無効です"));
  }, [inviteFromUrl]);

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
          inviteToken: inviteFromUrl || undefined,
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
        ? "最初のアカウントがオーナーになります。"
        : inviteInfo
          ? `「${inviteInfo.workspaceName}」へ ${inviteInfo.role} として招待されています。`
          : workspaceName
            ? `「${workspaceName}」に参加します。`
            : "この環境のワークスペースに参加します。";

  return (
    <AuthLayout title="アカウントを作成" kicker={kicker}>
      <form onSubmit={onSubmit}>
        <Field label="あなたの名前" value={name} onChange={setName} autoComplete="name" />
        <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        {needsSetup && <Field label="ワークスペース名" value={workspaceName} onChange={setWorkspaceName} />}
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || needsSetup === null}>
          {needsSetup ? "作成して始める" : "参加する"}
        </button>
        <p className="mt-3 text-[12px] text-muted">作成後、このデバイスにパスキーを登録できます。</p>
      </form>
      <p className="mt-5 text-center text-[13px] text-muted">
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
