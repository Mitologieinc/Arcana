import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Fingerprint } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { BrandLockup, hideBootSplash } from "../components/Brand";

function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required = true,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function AuthLayout({
  title,
  kicker,
  step,
  steps = 3,
  children,
}: {
  title: string;
  kicker?: string;
  step?: number;
  steps?: number;
  children: React.ReactNode;
}) {
  useLayoutEffect(() => {
    hideBootSplash();
  }, []);
  return (
    <div className="flex min-h-full items-center justify-center bg-white px-6">
      <div className="w-full max-w-[320px] py-24">
        <div className="mb-12">
          <BrandLockup className="h-12 w-auto max-w-full" />
        </div>
        {step != null && (
          <div className="setup-dots" aria-hidden>
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className={i + 1 === step ? "is-on" : ""} />
            ))}
          </div>
        )}
        <h1 className="text-[15px] font-medium tracking-tight">{title}</h1>
        {kicker && <p className="mt-1 text-[13px] leading-relaxed text-muted">{kicker}</p>}
        <div className="mt-8">{children}</div>
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
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean; inviteOnly?: boolean }>("/api/bootstrap")
      .then((d) => {
        setNeedsSetup(d.needsSetup);
        setInviteOnly(Boolean(d.inviteOnly));
      })
      .catch(() => setNeedsSetup(false));
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

  if (needsSetup === true) return <Navigate to="/setup" replace />;
  if (needsSetup === null) return null;

  return (
    <AuthLayout title="ログイン">
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
      <p className="mt-8 text-center text-[13px] text-muted">
        {inviteOnly ? (
          "参加は招待リンクから行います。"
        ) : (
          <>
            アカウントがない場合{" "}
            <Link className="underline underline-offset-2" to="/signup">
              作成
            </Link>
          </>
        )}
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
  const [inviteOnly, setInviteOnly] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{ email: string; workspaceName: string; role: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{
      needsSetup: boolean;
      workspaceName: string | null;
      inviteOnly?: boolean;
      allowedDomains?: string;
    }>("/api/bootstrap")
      .then((d) => {
        setNeedsSetup(d.needsSetup);
        if (d.workspaceName) setWorkspaceName(d.workspaceName);
        setInviteOnly(Boolean(d.inviteOnly));
        setAllowedDomains(d.allowedDomains ?? "");
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

  if (needsSetup === null) return null;
  if (needsSetup && !inviteFromUrl) return <Navigate to="/setup" replace />;
  if (!needsSetup && inviteOnly && !inviteFromUrl) {
    return (
      <AuthLayout title="招待が必要です" kicker="このワークスペースは招待リンクがある人だけ参加できます。">
        <p className="text-[13px] text-muted">届いたリンクを開くか、すでにアカウントがある場合はログインしてください。</p>
        <p className="mt-8 text-center text-[13px] text-muted">
          <Link className="underline underline-offset-2" to="/login">
            ログイン
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const kicker =
    needsSetup === null
      ? "環境を確認しています。"
      : inviteInfo
        ? `「${inviteInfo.workspaceName}」へ ${inviteInfo.role} として招待されています。`
        : allowedDomains
          ? `「${workspaceName}」に参加します。使えるメールは ${allowedDomains} です。`
          : workspaceName
            ? `「${workspaceName}」に参加します。`
            : "この環境のワークスペースに参加します。";

  return (
    <AuthLayout title="アカウントを作成" kicker={kicker}>
      <form onSubmit={onSubmit}>
        <Field label="あなたの名前" value={name} onChange={setName} autoComplete="name" />
        <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || needsSetup === null}>
          参加する
        </button>
        <p className="mt-3 text-[12px] text-muted">あとからパスキーを追加できます。</p>
      </form>
      <p className="mt-8 text-center text-[13px] text-muted">
        アカウントがある場合{" "}
        <Link className="underline underline-offset-2" to="/login">
          ログイン
        </Link>
      </p>
    </AuthLayout>
  );
}

export function SetupPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<"workspace" | "owner" | "passkey">("workspace");
  const [ready, setReady] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteOnly, setInviteOnly] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [welcomeId, setWelcomeId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/bootstrap")
      .then((d) => {
        if (!d.needsSetup) {
          nav("/login", { replace: true });
          return;
        }
        setReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "初期化に失敗しました"));
  }, [nav]);

  function goHome() {
    nav(welcomeId ? `/page/${welcomeId}` : "/", { replace: true });
  }

  async function createWorkspace(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("パスワードは 8 文字以上にしてください");
      return;
    }
    setBusy(true);
    try {
      const d = await api<{ welcomeId?: string }>("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          workspaceName,
          inviteOnly,
          allowedDomains,
        }),
      });
      setWelcomeId(d.welcomeId ?? null);
      setStep("passkey");
    } catch (err) {
      setError(err instanceof Error ? err.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function addPasskey() {
    setError("");
    setBusy(true);
    const { error: err } = await authClient.passkey.addPasskey({ name: "このデバイス" });
    setBusy(false);
    if (err) {
      setError(err.message || "パスキーを登録できませんでした");
      return;
    }
    goHome();
  }

  if (!ready) {
    if (error) {
      return (
        <AuthLayout title="セットアップできません" kicker={error}>
          <Link className="underline underline-offset-2 text-[13px]" to="/login">
            ログインへ
          </Link>
        </AuthLayout>
      );
    }
    return null;
  }

  if (step === "workspace") {
    return (
      <AuthLayout
        title="この環境をセットアップ"
        kicker="1 URL につき 1 ワークスペースです。最初の人がオーナーになります。"
        step={1}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!workspaceName.trim()) {
              setError("ワークスペース名を入力してください");
              return;
            }
            setError("");
            setStep("owner");
          }}
        >
          <Field
            label="ワークスペース名"
            value={workspaceName}
            onChange={setWorkspaceName}
            autoComplete="organization"
            placeholder="例: 社名"
          />
          <p className="mb-2 mt-1 text-[12px] font-medium text-muted">参加の仕方</p>
          <div className="mb-3 grid gap-2">
            {(
              [
                [false, "この URL を知っていれば参加できる"],
                [true, "招待リンクがある人だけ"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                className={`btn btn-secondary h-auto min-h-9 w-full justify-start py-2 text-left text-[13px] ${
                  inviteOnly === value ? "ring-1 ring-ink" : ""
                }`}
                onClick={() => setInviteOnly(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <Field
            label="許可するメールドメイン（任意）"
            value={allowedDomains}
            onChange={setAllowedDomains}
            placeholder="example.com"
            required={false}
          />
          <p className="mb-3 -mt-1 text-[12px] text-muted">カンマ区切り。空ならドメインは制限しません。ゲスト招待は対象外です。</p>
          {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
          <button type="submit" className="btn btn-primary w-full">
            続ける
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (step === "owner") {
    return (
      <AuthLayout title="オーナーアカウント" kicker={`「${workspaceName}」の管理者になります。`} step={2}>
        <form onSubmit={(e) => void createWorkspace(e)}>
          <Field label="あなたの名前" value={name} onChange={setName} autoComplete="name" />
          <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
          <p className="mb-3 -mt-1 text-[12px] text-muted">8 文字以上。あとからパスキーも使えます。</p>
          {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            作成して始める
          </button>
          <button type="button" className="btn btn-ghost mt-2 w-full text-muted" onClick={() => setStep("workspace")}>
            戻る
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="パスキーを登録"
      kicker="指紋や顔で入れるようにできます。あとから設定でも構いません。"
      step={3}
    >
      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
      <button type="button" className="btn btn-primary w-full" onClick={() => void addPasskey()} disabled={busy}>
        <Fingerprint size={16} />
        このデバイスに追加
      </button>
      <button type="button" className="btn btn-ghost mt-2 w-full text-muted" onClick={goHome} disabled={busy}>
        あとで
      </button>
    </AuthLayout>
  );
}

export function InvitePage() {
  const { token } = useParams();
  return <Navigate to={token ? `/signup?invite=${token}` : "/signup"} replace />;
}
