import { Hono } from "hono";
import { createDb } from "../db/client";
import { getMembership, getSessionUser } from "../auth";
import { allowAttempt } from "../lib/rate-limit";
import { BUILD_INFO, UPSTREAM_REPO, shortSha } from "../../shared/build-info";
import type { AppEnv } from "../types";

export const appRoutes = new Hono<AppEnv>();

type GhCommit = {
  sha: string;
  html_url?: string;
  commit?: { message?: string; committer?: { date?: string } };
};

type GhCompare = {
  status?: string;
  ahead_by?: number;
  behind_by?: number;
  commits?: GhCommit[];
};

type Latest = { sha: string; short: string; message: string; date: string; url: string };

type Cache = {
  at: number;
  latest: Latest;
};

let cache: Cache | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function github<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Arcana",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function commitInfo(c: GhCommit) {
  const message = (c.commit?.message ?? "").split("\n")[0]?.trim() || "更新";
  const date = c.commit?.committer?.date ?? "";
  return {
    sha: c.sha,
    short: shortSha(c.sha),
    message,
    date,
    url: c.html_url || `https://github.com/${UPSTREAM_REPO}/commit/${c.sha}`,
  };
}

async function latestMain() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.latest;
  const raw = await github<GhCommit>(`/repos/${UPSTREAM_REPO}/commits/main`);
  if (!raw?.sha) return null;
  const latest = commitInfo(raw);
  cache = { at: Date.now(), latest };
  return latest;
}

appRoutes.get("/api/app/update", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "管理者だけが確認できます" }, 403);
  }
  if (!allowAttempt(`app-update:${user.id}`, 12, 10 * 60 * 1000)) {
    return c.json({ error: "少し待ってからやり直してください" }, 429);
  }

  const current = {
    version: BUILD_INFO.version,
    commit: BUILD_INFO.commit,
    short: BUILD_INFO.commit ? shortSha(BUILD_INFO.commit) : "",
    builtAt: BUILD_INFO.builtAt,
  };
  const latest = await latestMain();
  if (!latest) {
    return c.json({
      repo: UPSTREAM_REPO,
      current,
      latest: null,
      status: "unknown" as const,
      compareUrl: `https://github.com/${UPSTREAM_REPO}`,
      commits: [],
    });
  }

  let status: "current" | "behind" | "ahead" | "unknown" = "unknown";
  let behindBy = 0;
  let aheadBy = 0;
  let commits: ReturnType<typeof commitInfo>[] = [];

  if (current.commit && current.commit === latest.sha) {
    status = "current";
  } else if (current.commit) {
    const cmp = await github<GhCompare>(`/repos/${UPSTREAM_REPO}/compare/${current.commit}...${latest.sha}`);
    if (cmp) {
      behindBy = cmp.ahead_by ?? 0;
      aheadBy = cmp.behind_by ?? 0;
      if (behindBy > 0) status = "behind";
      else if (aheadBy > 0) status = "ahead";
      else status = "current";
      commits = (cmp.commits ?? []).slice(-8).reverse().map(commitInfo);
    } else {
      status = "behind";
    }
  } else {
    status = "unknown";
  }

  if (!commits.length && status === "behind") {
    const list = await github<GhCommit[]>(`/repos/${UPSTREAM_REPO}/commits?sha=main&per_page=8`);
    commits = (list ?? []).map(commitInfo);
  }

  return c.json({
    repo: UPSTREAM_REPO,
    current,
    latest,
    status,
    behindBy,
    aheadBy,
    commits,
    compareUrl: current.commit
      ? `https://github.com/${UPSTREAM_REPO}/compare/${current.short || current.commit}...${latest.short}`
      : `https://github.com/${UPSTREAM_REPO}/commits/main`,
  });
});
