import { useEffect, useLayoutEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Fingerprint, Loader2 } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { BrandLockup, BrandMark, MadeBy, hideBootSplash } from "../components/Brand";
import { NotionImport } from "../components/NotionImport";

function PasskeyMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.6 18.2c0-2.6 2-4.7 4.4-4.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16.2" cy="14.2" r="2.35" stroke="currentColor" strokeWidth="1.7" />
      <path d="M17.9 15.9 21.4 19.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M19.7 17.7h1.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required = true,
  end,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  end?: ReactNode;
}) {
  const input = (
    <input
      type={type}
      value={value}
      autoComplete={autoComplete}
      placeholder={placeholder}
      minLength={minLength}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  return (
    <label className="field">
      <span>{label}</span>
      {end ? (
        <span className="field-wrap">
          {input}
          {end}
        </span>
      ) : (
        input
      )}
    </label>
  );
}

function AuthLayout({
  title,
  kicker,
  step,
  steps = 3,
  wide,
  children,
}: {
  title: string;
  kicker?: string;
  step?: number;
  steps?: number;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useLayoutEffect(() => {
    hideBootSplash();
  }, []);
  return (
    <div className="auth-split">
      <aside className="auth-hero">
        <div className="auth-hero-aurora" aria-hidden />
        <div className="auth-hero-grid" aria-hidden />
        <div className="auth-hero-ghost" aria-hidden>
          <BrandMark className="w-full" animate />
        </div>
        <div className="auth-hero-copy">
          <BrandLockup className="h-10 w-auto max-w-full" />
          <MadeBy className="auth-made" />
        </div>
      </aside>
      <main className="auth-main">
        <div className={`auth-card ${wide ? "is-wide" : ""}`}>
          {step != null && (
            <div className="setup-dots" aria-hidden>
              {Array.from({ length: steps }, (_, i) => (
                <span key={i} className={i + 1 === step ? "is-on" : ""} />
              ))}
            </div>
          )}
          <h1 className="auth-title">{title}</h1>
          {kicker && <p className="auth-kicker">{kicker}</p>}
          <div className="auth-body">{children}</div>
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [environment, setEnvironment] = useState("");
  const [busy, setBusy] = useState<"passkey" | "email" | null>(null);

  useEffect(() => {
    api<{ needsSetup: boolean; inviteOnly?: boolean; workspaceName?: string | null; environment?: string }>(
      "/api/bootstrap",
    )
      .then((d) => {
        setNeedsSetup(d.needsSetup);
        setInviteOnly(Boolean(d.inviteOnly));
        setWorkspaceName(d.workspaceName ?? "");
        setEnvironment(d.environment ?? "");
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
    setBusy("email");
    const { error: err } = await authClient.signIn.email({ email, password });
    setBusy(null);
    if (err) {
      setError(err.message || "メールまたはパスワードが違います");
      return;
    }
    nav("/");
  }

  async function onPasskey() {
    setError("");
    setBusy("passkey");
    const err = await signInWithPasskey();
    setBusy(null);
    if (err) {
      setError(err.message || "パスキーで入れませんでした");
      return;
    }
    nav("/");
  }

  if (needsSetup === true) return <Navigate to="/setup" replace />;

  const locked = busy !== null;
  const title = workspaceName ? `${workspaceName} に入る` : "ログイン";

  return (
    <AuthLayout title={title}>
      <button type="button" className="auth-passkey" onClick={onPasskey} disabled={locked}>
        <span className="auth-passkey-mark">
          {busy === "passkey" ? <Loader2 size={16} className="animate-spin" /> : <PasskeyMark />}
        </span>
        {busy === "passkey" ? "確認しています…" : "パスキーでログイン"}
      </button>
      <div className="divider">またはメール</div>
      <form onSubmit={onSubmit}>
        <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="username webauthn" />
        <Field
          label="パスワード"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={setPassword}
          autoComplete="current-password webauthn"
          end={
            <button
              type="button"
              className="field-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-secondary w-full" disabled={locked}>
          {busy === "email" && <Loader2 size={15} className="animate-spin" />}
          {busy === "email" ? "入っています…" : "メールでログイン"}
        </button>
      </form>
      <p className="mt-5 text-[12px] leading-relaxed text-muted">
        忘れた場合は管理者にリセットリンクを依頼するか、パスキーで入ってください。
      </p>
      {!inviteOnly && (
        <p className="mt-8 text-[13px] text-muted">
          アカウントがない場合{" "}
          <Link className="auth-link" to="/signup">
            作成
          </Link>
        </p>
      )}
      {environment && environment !== "production" && (
        <p className="mt-10 text-[11px] tracking-wide text-muted">{environment}</p>
      )}
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
    if (password.length < 8) {
      setError("パスワードは 8 文字以上にしてください");
      return;
    }
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
          <Link className="auth-link" to="/login">
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
        <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || needsSetup === null}>
          参加する
        </button>
        <p className="mt-3 text-[12px] text-muted">あとからパスキーを追加できます。</p>
      </form>
      <p className="mt-8 text-center text-[13px] text-muted">
        アカウントがある場合{" "}
        <Link className="auth-link" to="/login">
          ログイン
        </Link>
      </p>
    </AuthLayout>
  );
}

export function SetupPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<"workspace" | "owner" | "import" | "passkey">("workspace");
  const [ready, setReady] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteOnly, setInviteOnly] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [welcomeId, setWelcomeId] = useState<string | null>(null);
  const [starterIds, setStarterIds] = useState<string[]>([]);
  const [importId, setImportId] = useState<string | null>(null);
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
    nav(importId ? `/page/${importId}` : welcomeId ? `/page/${welcomeId}` : "/", { replace: true });
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
      const d = await api<{ welcomeId?: string; starterIds?: string[] }>("/api/setup", {
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
      setStarterIds(d.starterIds ?? (d.welcomeId ? [d.welcomeId] : []));
      setStep("import");
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
          <Link className="auth-link text-[13px]" to="/login">
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
        steps={4}
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
                [true, "招待リンクがある人だけ"],
                [false, "この URL を知っていれば参加できる"],
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
      <AuthLayout title="オーナーアカウント" kicker={`「${workspaceName}」の管理者になります。`} step={2} steps={4}>
        <form onSubmit={(e) => void createWorkspace(e)}>
          <Field label="あなたの名前" value={name} onChange={setName} autoComplete="name" />
          <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field label="パスワード" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
          <p className="mb-3 -mt-1 text-[12px] text-muted">8 文字以上。あとからパスキーも使えます。</p>
          {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            作成して続ける
          </button>
          <button type="button" className="btn btn-ghost mt-2 w-full text-muted" onClick={() => setStep("workspace")}>
            戻る
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (step === "import") {
    return (
      <AuthLayout
        title="Notion から引き継ぐ"
        kicker="今あるページを持ってこれます。空のまま始めて、あとから設定でもできます。"
        step={3}
        steps={4}
        wide
      >
        <NotionImport
          variant="setup"
          replaceStarters={starterIds}
          onChanged={() => Promise.resolve()}
          onSkip={() => setStep("passkey")}
          onContinue={(rootId) => {
            setImportId(rootId);
            setStep("passkey");
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="パスキーを登録"
      kicker="指紋や顔で入れるようにできます。あとから設定でも構いません。"
      step={4}
      steps={4}
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

export function ResetPasswordPage() {
  const { token } = useParams();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      return;
    }
    api<{ email: string }>(`/api/password-resets/${token}`)
      .then((d) => setEmail(d.email))
      .catch(() => setInvalid(true));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("パスワードは 8 文字以上にしてください");
      return;
    }
    if (password !== confirm) {
      setError("確認用と一致しません");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/password-resets/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      nav("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <AuthLayout title="リンクが無効です" kicker="期限切れか、すでに使われています。管理者に新しいリンクを依頼してください。">
        <p className="text-center text-[13px] text-muted">
          <Link className="auth-link" to="/login">
            ログイン
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="パスワードを設定" kicker={email ? `${email} の新しいパスワードを入力してください。` : "リンクを確認しています。"}>
      <form onSubmit={onSubmit}>
        <Field
          label="新しいパスワード"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
        />
        <Field
          label="確認"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={8}
        />
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !email}>
          設定して入る
        </button>
      </form>
    </AuthLayout>
  );
}
