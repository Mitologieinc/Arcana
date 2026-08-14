import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-accent">CF Bible</p>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">席課金なし。Cloudflare 上にセルフホストするチームWiki。</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

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
    <label className="mb-3 block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
      />
    </label>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/bootstrap")
      .then((d) => setNeedsSetup(d.needsSetup))
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setError(err.message || "ログインに失敗しました");
      return;
    }
    nav("/");
  }

  return (
    <AuthShell title="ログイン">
      {needsSetup && (
        <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm">
          まだワークスペースがありません。{" "}
          <Link className="text-accent underline" to="/setup">
            初期セットアップ
          </Link>
        </p>
      )}
      <form onSubmit={onSubmit}>
        <Field label="メール" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="パスワード"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-ink py-2 text-white hover:opacity-90">
          ログイン
        </button>
      </form>
    </AuthShell>
  );
}

export function SetupPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, workspaceName }),
      });
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "失敗しました");
    }
  }

  return (
    <AuthShell title="ワークスペースを作る">
      <form onSubmit={onSubmit}>
        <Field label="あなたの名前" value={name} onChange={setName} />
        <Field label="メール" type="email" value={email} onChange={setEmail} />
        <Field label="パスワード" type="password" value={password} onChange={setPassword} />
        <Field label="ワークスペース名" value={workspaceName} onChange={setWorkspaceName} />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-ink py-2 text-white hover:opacity-90">
          作成する
        </button>
      </form>
    </AuthShell>
  );
}

export function InvitePage() {
  const { token } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ email: string; workspaceName: string; role: string } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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
    try {
      await api(`/api/invites/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ name, password, email: info?.email }),
      });
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "失敗しました");
    }
  }

  return (
    <AuthShell title="招待を受け入れる">
      {info && (
        <p className="mb-4 text-sm text-muted">
          「{info.workspaceName}」へ {info.role} として招待されています（{info.email}）。人数制限はありません。
        </p>
      )}
      <form onSubmit={onSubmit}>
        <Field label="表示名" value={name} onChange={setName} />
        <Field label="パスワード" type="password" value={password} onChange={setPassword} />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-ink py-2 text-white hover:opacity-90">
          参加する
        </button>
      </form>
    </AuthShell>
  );
}
