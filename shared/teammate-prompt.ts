import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_TEAMMATE_PROVIDER = "opencode/opencode-go/deepseek-v4-flash";

function readFile(homeDir: string, filename: string): string {
  const path = join(homeDir, filename);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readMemory(homeDir: string, days: number): string {
  const memoryDir = join(homeDir, "memory");
  if (!existsSync(memoryDir)) return "";
  const files = readdirSync(memoryDir).filter((f) => f.endsWith(".md")).sort();
  const count = days > 0 ? days : files.length;
  return files.slice(-count).map((f) => readFileSync(join(memoryDir, f), "utf8")).join("\n");
}

function rebaseConflicts(homeDir: string): string[] {
  try {
    const mergePath = execSync("git rev-parse --git-path rebase-merge", { cwd: homeDir, encoding: "utf8" }).trim();
    const applyPath = execSync("git rev-parse --git-path rebase-apply", { cwd: homeDir, encoding: "utf8" }).trim();
    if (!existsSync(mergePath) && !existsSync(applyPath)) return [];
    return execSync("git diff --name-only --diff-filter=U", { cwd: homeDir, encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

export function buildTeammateSystemPrompt(params: { name: string; id: string; homeDir: string }): string {
  const { name, id, homeDir } = params;
  const agents = readFile(homeDir, "AGENTS.md");
  const boot = readFile(homeDir, "BOOT.md");
  const onboarding = readFile(homeDir, "ONBOARDING.md");
  const identity = readFile(homeDir, "IDENTITY.md");
  const soul = readFile(homeDir, "SOUL.md");
  const user = readFile(homeDir, "USER.md");
  const memory = readMemory(homeDir, 7);
  const conflicts = rebaseConflicts(homeDir);
  return (
    `You are the teammate named ${name}.\n\n` +
    `${agents}\n\n` +
    `${identity}\n${soul}\n${user}\n\n` +
    `${boot}\n\n` +
    (onboarding ? `${onboarding}\n\n` : "") +
    `Recent memory:\n${memory}\n\n` +
    `You may append what you learn to your memory using the teammate_memory_append tool with teammate = "${id}". You are "${id}".` +
    (conflicts.length > 0
      ? `\n\nYour branch is mid-rebase with conflicts in: ${conflicts.join(", ")}. Resolve them before other work. For AGENTS.md and BOOT.md, take the incoming (framework) side. For SOUL.md, USER.md, IDENTITY.md, BOARD.md, HEARTBEAT.md, and memory/, keep your own content. When both sides have meaningful content, ask the user. Then run git add and git rebase --continue, or git rebase --abort to back out.`
      : "")
  );
}
