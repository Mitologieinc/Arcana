export function normalizeMailFrom(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "";
  const email = v.includes("@") ? v : `noreply@${v}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("送信元メールの形式が正しくありません");
  }
  const domain = email.split("@")[1] ?? "";
  if (domain === "workers.dev" || domain.endsWith(".workers.dev")) {
    throw new Error("workers.dev からは送れません。独自ドメインを Cloudflare Email Sending に登録してください。");
  }
  return email;
}

export function mailReady(env: Env, mailFrom: string | null | undefined): boolean {
  return Boolean(mailFrom?.trim()) && typeof env.EMAIL?.send === "function";
}

export async function sendMail(
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
      error:
        "確認メールを送れませんでした。送信元ドメインを Cloudflare Email Sending に登録してください。" +
        (message ? ` (${message})` : ""),
    };
  }
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
