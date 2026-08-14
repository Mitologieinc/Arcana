export function normalizeMailFrom(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const angle = v.match(/<([^>]+)>/);
  const email = (angle?.[1] ?? (v.includes("@") ? v : `noreply@${v}`)).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("送信元メールの形式が正しくありません");
  }
  const domain = email.split("@")[1] ?? "";
  if (domain === "workers.dev" || domain.endsWith(".workers.dev")) {
    throw new Error("workers.dev からは送れません。Resend か、独自ドメインの送信元を使ってください。");
  }
  return email;
}

function hasResend(env: Env) {
  return Boolean(env.RESEND_API_KEY?.trim());
}

export function resolveMailFrom(env: Env, mailFrom?: string | null) {
  try {
    const fromWs = mailFrom?.trim() ? normalizeMailFrom(mailFrom) : "";
    if (fromWs) return fromWs;
  } catch {
    /* ワークスペースの値が壊れていても env 側を見る */
  }
  const fromEnv = env.MAIL_FROM?.trim();
  if (fromEnv) return normalizeMailFrom(fromEnv);
  return "";
}

export function mailReady(env: Env, mailFrom?: string | null): boolean {
  const from = (() => {
    try {
      return resolveMailFrom(env, mailFrom);
    } catch {
      return "";
    }
  })();
  if (!from) return false;
  return hasResend(env) || typeof env.EMAIL?.send === "function";
}

function formatFrom(email: string, name?: string) {
  if (email.includes("<")) return email;
  return name ? `${name} <${email}>` : email;
}

async function sendViaResend(
  env: Env,
  input: { from: string; to: string; subject: string; text: string; html: string; fromName?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY がありません。" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: formatFrom(input.from, input.fromName),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: body.message || `Resend が ${res.status} を返しました。送信元ドメインを Resend で認証してください。`,
    };
  }
  return { ok: true };
}

async function sendViaCloudflare(
  env: Env,
  input: { from: string; to: string; subject: string; text: string; html: string; fromName?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof env.EMAIL?.send !== "function") {
    return { ok: false, error: "メール送信がこの環境に設定されていません。" };
  }
  try {
    await env.EMAIL.send({
      to: input.to,
      from: { email: input.from, name: input.fromName ?? "Arcana" },
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: "Cloudflare Email Sending から送れませんでした。" + (message ? ` (${message})` : ""),
    };
  }
}

export async function sendMail(
  env: Env,
  input: { from: string; to: string; subject: string; text: string; html: string; fromName?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (hasResend(env)) {
    const sent = await sendViaResend(env, input);
    if (sent.ok) return sent;
    if (typeof env.EMAIL?.send !== "function") return sent;
  }
  return sendViaCloudflare(env, input);
}

export async function sendVerificationMail(
  env: Env,
  input: { from: string; to: string; code: string; workspaceName?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.workspaceName?.trim() || "Arcana";
  const text = [
    `${name} の登録確認コードです。`,
    "",
    input.code,
    "",
    "15 分以内に入力してください。心当たりがない場合はこのメールを無視してください。",
  ].join("\n");
  const html = `<p>${escapeHtml(name)} の登録確認コードです。</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:600">${escapeHtml(input.code)}</p>
<p>15 分以内に入力してください。心当たりがない場合はこのメールを無視してください。</p>`;
  return sendMail(env, {
    from: input.from,
    to: input.to,
    fromName: name,
    subject: `${name} の確認コード: ${input.code}`,
    text,
    html,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[ch] ?? ch;
  });
}
