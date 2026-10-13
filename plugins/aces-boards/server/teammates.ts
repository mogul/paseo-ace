import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BoardTeammate } from "../shared/contracts";

// Read-only coupling to the `aces-teammates` plugin's state via the filesystem
// contract (the same way aces-teammates reads aces-boards' boards.json). We read
// teammates.json for the teammate roster and active.json for the currently
// running set. Treat aces-teammates' file shapes as the contract and never write
// to them from here.

function acesBaseDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "aces");
}

export function readBoardTeammates(): { teammates: BoardTeammate[]; active: string[] } {
  const dir = acesBaseDir();
  const teammates: BoardTeammate[] = [];

  try {
    const teammatesPath = join(dir, "teammates.json");
    if (existsSync(teammatesPath)) {
      const parsed = JSON.parse(readFileSync(teammatesPath, "utf8")) as { teammates?: unknown };
      if (parsed && Array.isArray(parsed.teammates)) {
        for (const raw of parsed.teammates) {
          if (!raw || typeof raw !== "object") continue;
          const t = raw as { id?: unknown; name?: unknown; emoji?: unknown; lastAgentId?: unknown; boardId?: unknown };
          if (typeof t.id === "string" && typeof t.name === "string") {
            teammates.push({
              id: t.id,
              name: t.name,
              emoji: typeof t.emoji === "string" ? t.emoji : undefined,
              lastAgentId: typeof t.lastAgentId === "string" ? t.lastAgentId : undefined,
              boardId: typeof t.boardId === "string" ? t.boardId : undefined,
            });
          }
        }
      }
    }
  } catch {
    // ignore malformed teammates.json
  }

  const active = new Set<string>();
  try {
    const activePath = join(dir, "active.json");
    if (existsSync(activePath)) {
      const parsed = JSON.parse(readFileSync(activePath, "utf8")) as unknown;
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === "string") active.add(id);
      } else if (parsed && typeof parsed === "object") {
        for (const [id, on] of Object.entries(parsed as Record<string, unknown>)) {
          if (on === true) active.add(id);
        }
      }
    }
  } catch {
    // ignore malformed active.json
  }

  return { teammates, active: [...active] };
}

export function readTeammateStart(id: string): { id: string; name: string; homeDir: string; provider?: string; thinkingOptionId?: string; workspaceId?: string } | null {
  try {
    const path = join(acesBaseDir(), "teammates.json");
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { teammates?: unknown };
    if (!parsed || !Array.isArray(parsed.teammates)) return null;
    const raw = (parsed.teammates as unknown[]).find((t) => !!t && typeof t === "object" && (t as { id?: unknown }).id === id);
    if (!raw || typeof raw !== "object") return null;
    const t = raw as { id?: unknown; name?: unknown; provider?: unknown; thinkingOptionId?: unknown; workspaceId?: unknown };
    if (typeof t.id !== "string" || typeof t.name !== "string") return null;
    return {
      id: t.id,
      name: t.name,
      homeDir: join(acesBaseDir(), "teammates", t.id),
      provider: typeof t.provider === "string" ? t.provider : undefined,
      thinkingOptionId: typeof t.thinkingOptionId === "string" ? t.thinkingOptionId : undefined,
      workspaceId: typeof t.workspaceId === "string" ? t.workspaceId : undefined,
    };
  } catch {
    return null;
  }
}

export function setTeammateWorkspaceId(id: string, workspaceId: string): void {
  try {
    const dir = acesBaseDir();
    const path = join(dir, "teammates.json");
    if (!existsSync(path)) return;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { teammates?: unknown };
    if (!parsed || !Array.isArray(parsed.teammates)) return;
    for (const raw of parsed.teammates) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as { id?: unknown };
      if (t.id === id) {
        (raw as { workspaceId?: string }).workspaceId = workspaceId;
        const tmp = path + ".tmp";
        writeFileSync(tmp, JSON.stringify(parsed, null, 2), "utf8");
        renameSync(tmp, path);
        return;
      }
    }
  } catch {
    // ignore
  }
}
