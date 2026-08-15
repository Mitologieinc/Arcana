import { api } from "./api";
import { toast } from "./toast";

export async function indexPage(
  pageId: string,
  body: { title: string; bodyText: string; bodyJson?: unknown },
) {
  let last = "";
  for (let i = 0; i < 3; i++) {
    try {
      await api(`/api/pages/${pageId}/index`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return;
    } catch (e) {
      last = e instanceof Error ? e.message : "索引を更新できませんでした";
      await new Promise((r) => window.setTimeout(r, 500 * (i + 1)));
    }
  }
  toast(last || "検索用の索引を更新できませんでした");
}
