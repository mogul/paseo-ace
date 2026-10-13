import { existsSync, readFileSync } from "node:fs";
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
