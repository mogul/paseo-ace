import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BoardSummary, Teammate } from "../shared/contracts";
import { getPersona } from "../shared/personas";
import { addTeammateWorktree, frameworkBaseBranch } from "./framework";

interface TeammateRecord {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  thinkingOptionId?: string;
  lastAgentId?: string;
  boardId?: string;
  boardName?: string;
  heartbeatCron?: string;
  persona?: string;
  emoji?: string;
  frameworkVersion?: string;
  createdAt: string;
}

export const DEFAULT_PROVIDER = "opencode/opencode-go/deepseek-v4-flash";

// The current framework/template version. Stamped on every teammate at creation;
// bumped when the plugin's seeded template files change meaning. See
// migrateFramework() for how upgrades are applied.
export const FRAMEWORK_VERSION = "3";

interface TeammatesData {
  teammates: TeammateRecord[];
}

export const SOUL_SEED = "# Soul\n\n(personality, communication style, principles)";
export const USER_SEED = "# About the user\n\n(preferences, patterns — the teammate fills this in as it learns)";
export const BOARD_SEED = "# Board\n\nDescribe what each zone on this board means and how work moves between zones.";
export const HEARTBEAT_SEED =
  "# Heartbeat\n\nOptional periodic tasks: review board state, triage new work, summarize to memory.";

export const AGENTS_SEED = `# Agents

You are an AI teammate living in a Paseo home directory. Your home holds your identity, memory, and operating notes; it is not a code checkout.

## Priorities
1. Understand the outcome the user is after before acting.
2. Get close to the real work — read the actual files, run the actual commands.
3. Record durable memory so the next session starts warm.
4. Stay safe: never take destructive or irreversible actions without confirmation.

## Working model
- Home files: your SOUL.md, IDENTITY.md, and USER.md define who you are; read them and keep them current.
- Memory: append what you learn with the teammate_memory_append tool (teammate = your id) and recall it with teammate_memory_read.
- Board: use board_list and board_move_card to read and move cards on your board.
- Code work: use board_create_card to spawn a workspace card in a zone (a git branch/workspace) rather than editing in place.

## Reference files
| File | Purpose |
| --- | --- |
| BOOT.md | Startup checklist for a fresh session |
| ONBOARDING.md | First-run guide and progress record |
| SOUL.md | Personality, communication style, principles |
| IDENTITY.md | Name and purpose |
| USER.md | What you know about the user |
| BOARD.md | Meaning of each board zone |
| HEARTBEAT.md | Periodic tasks |

On a fresh session, read and follow BOOT.md.`;
export const BOOT_SEED =
  "# Boot\n\nAt the start of a fresh session, quietly rebuild context before replying: 1. You are already provided your SOUL.md, IDENTITY.md, and USER.md. 2. In a user-facing session, if ONBOARDING.md is present, follow it and use its current state as context; address the user's request first. 3. Search recent memory for relevant context; read BOARD.md only when the work needs it. Do not narrate this process.";
export const ONBOARDING_SEED = `# Onboarding

This file guides your first run and tracks progress. Keep it current; it is a live record, not just instructions.

## How to start
- Start with the user's work and the outcome they want.
- Offer a brief orientation to Paseo if it helps.
- Get close to the work: explore workspaces, the board, and memory.
- Move toward a concrete result the user can see.

## Current state
- Last updated: (date)
- Primary outcome: (write it here)
- Current focus: (write it here)
- Next useful step: (write it here)

| Step | Status |
| --- | --- |
| Initial goal and working context | not explored |
| Paseo orientation | not explored |
| First useful result | not explored |
| Board and workflow | not explored |
| Recurring value | not explored |

## Complete onboarding
Onboarding is complete once a useful working relationship exists. Before deleting this file, move durable facts to USER.md, IDENTITY.md, and SOUL.md, and record them in memory.`;

// ---------------------------------------------------------------------------
// Template versioning — FRAMEWORK vs LEARNED files
//
// A teammate's home dir holds two classes of files:
//   - FRAMEWORK files are "owned by the template": they carry plugin semantics
//     (resident-board zone meaning, heartbeat tasks, operating manual, startup
//     checklist) rather than personal data, so they are safe to overwrite when
//     FRAMEWORK_VERSION bumps.
//   - LEARNED files are owned by the teammate/user and must NEVER be overwritten:
//     SOUL.md, USER.md, IDENTITY.md, and the memory/ directory hold the
//     teammate's accumulated identity and memory. ONBOARDING.md is seeded once at
//     first-run and then owned by the teammate, so it is bridged into a new
//     teammate via create()/migrateFramework() but never re-seeded.
//
// FRAMEWORK_FILES maps the template-owned filenames to their current seed. The
// LEARNED set is documented here for clarity only; migrateFramework never
// touches it.
// ---------------------------------------------------------------------------
const FRAMEWORK_FILES: Record<string, string> = {
  "AGENTS.md": AGENTS_SEED,
  "BOOT.md": BOOT_SEED,
  "BOARD.md": BOARD_SEED,
  "HEARTBEAT.md": HEARTBEAT_SEED,
};

// Compares dotted numeric versions ("1", "1.2", "10"). Returns <0, 0, or >0.
function compareFrameworkVersions(a: string, b: string): number {
  const as = a.split(".").map((n) => Number(n) || 0);
  const bs = b.split(".").map((n) => Number(n) || 0);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function isFrameworkOutdated(version: string | undefined): boolean {
  if (!version) return true;
  return compareFrameworkVersions(version, FRAMEWORK_VERSION) < 0;
}

export function identitySeed(name: string): string {
  return `# Identity\n\nName: ${name}\n\n(purpose)`;
}

// File seeds for a new teammate. When a persona id is given, SOUL/IDENTITY/USER
// come from that persona's content (the blank persona is the default). To keep
// the blank starter's original generic shape, only the blank identity is
// templated with the teammate name.
function seedFiles(personaId: string | undefined, name: string): { soul: string; identity: string; user: string } {
  const persona = getPersona(personaId);
  if (persona.id === "blank") {
    return { soul: SOUL_SEED, identity: identitySeed(name), user: USER_SEED };
  }
  return { soul: persona.soul, identity: persona.identity, user: persona.user };
}

export function baseDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "aces");
}

function previousBaseDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "ace");
}

function legacyBaseDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "plugins", "ace-teammates");
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = join(src, entry);
    const to = join(dest, entry);
    if (statSync(from).isDirectory()) {
      copyDirRecursive(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

// One-time migration chain: prefer the new ~/.paseo/aces directory; if its
// teammates.json / teammates/ are missing, copy them over from the previous
// ~/.paseo/ace location, then from the pre-consolidation
// ~/.paseo/plugins/ace-teammates location. Legacy files are copied, never
// deleted.
function migrate(): void {
  const dir = baseDir();
  const indexPath = join(dir, "teammates.json");
  const teammatesDir = join(dir, "teammates");

  for (const source of [previousBaseDir(), legacyBaseDir()]) {
    const sourceIndex = join(source, "teammates.json");
    if (!existsSync(indexPath) && existsSync(sourceIndex)) {
      mkdirSync(dir, { recursive: true });
      copyFileSync(sourceIndex, indexPath);
    }
    const sourceTeammatesDir = join(source, "teammates");
    if (!existsSync(teammatesDir) && existsSync(sourceTeammatesDir)) {
      copyDirRecursive(sourceTeammatesDir, teammatesDir);
    }
  }
}

// Read-only coupling to the `aces-boards` plugin's board store for listing. The
// `createBoard` write below is the only place aces-teammates writes board state:
// it appends a dedicated board (matching aces-boards' BoardsData shape) when a
// teammate is created without an explicit board picker choice.
export function readBoards(): BoardSummary[] {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const path = join(base, "aces", "boards.json");
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { boards?: unknown };
    if (!parsed || !Array.isArray(parsed.boards)) return [];
    return parsed.boards
      .filter(
        (b): b is { id: string; name: string } =>
          !!b &&
          typeof b === "object" &&
          typeof (b as { id?: unknown }).id === "string" &&
          typeof (b as { name?: unknown }).name === "string",
      )
      .map((b) => ({ id: b.id, name: b.name }));
  } catch {
    return [];
  }
}

export function createBoard(name: string): { id: string; name: string } {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const dir = join(base, "aces");
  const path = join(dir, "boards.json");
  const id = "board-" + randomUUID().slice(0, 8);
  const board = {
    id,
    name,
    groups: [{ id: "col-" + randomUUID().slice(0, 8), title: "New zone", zones: [{ id: "zone-" + randomUUID().slice(0, 8), title: "New zone" }] }],
    placement: {},
    cardDefaults: { isolation: "worktree" },
  };

  let boards: unknown[] = [];
  let lastVisitedBoardId: string | undefined;
  try {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { boards?: unknown; lastVisitedBoardId?: unknown };
      if (Array.isArray(parsed.boards)) boards = parsed.boards as unknown[];
      if (typeof parsed.lastVisitedBoardId === "string") lastVisitedBoardId = parsed.lastVisitedBoardId;
    }
  } catch {
    boards = [];
  }
  boards.push(board);
  mkdirSync(dir, { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify({ boards, lastVisitedBoardId: lastVisitedBoardId ?? id }, null, 2), "utf8");
  renameSync(tmp, path);
  return { id, name };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export class TeammateStore {
  readonly dir: string;
  readonly teammatesDir: string;
  private readonly indexPath: string;
  private data: TeammatesData;

  constructor() {
    migrate();
    this.dir = baseDir();
    this.teammatesDir = join(this.dir, "teammates");
    this.indexPath = join(this.dir, "teammates.json");
    mkdirSync(this.teammatesDir, { recursive: true });
    this.data = this.load();
    this.migrateFramework();
  }

  // Runs once at plugin load. For each teammate whose frameworkVersion is
  // missing or older than FRAMEWORK_VERSION, overwrite the FRAMEWORK files from
  // the current templates and bump frameworkVersion. LEARNED files (SOUL.md,
  // USER.md, IDENTITY.md, memory/) are never touched. At v1 every teammate is
  // created with FRAMEWORK_VERSION, so this is a no-op; the classification and
  // mechanism are in place for future bumps.
  private migrateFramework(): void {
    let changed = false;
    for (const record of this.data.teammates) {
      if (!isFrameworkOutdated(record.frameworkVersion)) continue;
      const dir = this.memoryPath(record.id);
      mkdirSync(dir, { recursive: true });
      for (const [filename, seed] of Object.entries(FRAMEWORK_FILES)) {
        writeFileSync(join(dir, filename), seed, "utf8");
      }
      if (!existsSync(join(dir, "ONBOARDING.md"))) {
        writeFileSync(join(dir, "ONBOARDING.md"), ONBOARDING_SEED, "utf8");
      }
      if (existsSync(join(dir, ".git"))) {
        try {
          execSync("git add -A", { cwd: dir });
          execSync(`git commit -m "framework update v${FRAMEWORK_VERSION}"`, { cwd: dir });
        } catch {
          // not a git worktree or nothing to commit — ignore
        }
      }
      record.frameworkVersion = FRAMEWORK_VERSION;
      changed = true;
    }
    if (changed) this.persist();
  }

  private load(): TeammatesData {
    try {
      if (!existsSync(this.indexPath)) return { teammates: [] };
      const parsed = JSON.parse(readFileSync(this.indexPath, "utf8")) as Partial<TeammatesData>;
      return Array.isArray(parsed.teammates) ? { teammates: parsed.teammates } : { teammates: [] };
    } catch {
      return { teammates: [] };
    }
  }

  private persist(): void {
    const tmp = this.indexPath + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(tmp, this.indexPath);
  }

  list(): Teammate[] {
    return this.data.teammates.map((record) => this.toTeammate(record));
  }

  get(id: string): Teammate {
    return this.toTeammate(this.record(id));
  }

  memoryPath(id: string): string {
    return join(this.teammatesDir, id);
  }

  create(name: string, description?: string, provider?: string, thinkingOptionId?: string, boardId?: string, boardName?: string, heartbeatCron?: string, persona?: string, emoji?: string): Teammate {
    const base = slugify(name);
    if (!base) throw new Error("Name must include at least one letter or number.");
    const id = this.uniqueSlug(base);
    const record: TeammateRecord = {
      id,
      name,
      description: description?.trim() || undefined,
      provider: provider?.trim() || undefined,
      thinkingOptionId: thinkingOptionId?.trim() || undefined,
      boardId: boardId?.trim() || undefined,
      boardName: boardName?.trim() || undefined,
      heartbeatCron: heartbeatCron?.trim() || undefined,
      persona: persona?.trim() || undefined,
      emoji: emoji?.trim() || undefined,
      frameworkVersion: FRAMEWORK_VERSION,
      createdAt: new Date().toISOString(),
    };

    const seed = seedFiles(persona, name);
    try {
      const base = persona ? `template/${persona}` : frameworkBaseBranch();
      addTeammateWorktree(id, base);
      writeFileSync(join(this.memoryPath(id), "IDENTITY.md"), seed.identity, "utf8");
      writeFileSync(join(this.memoryPath(id), "ONBOARDING.md"), ONBOARDING_SEED, "utf8");
      execSync("git add -A", { cwd: this.memoryPath(id) });
      execSync(`git commit -m "create teammate ${id}"`, { cwd: this.memoryPath(id) });
    } catch {
      writeFileSync(join(this.memoryPath(id), "SOUL.md"), seed.soul, "utf8");
      writeFileSync(join(this.memoryPath(id), "USER.md"), seed.user, "utf8");
      writeFileSync(join(this.memoryPath(id), "IDENTITY.md"), seed.identity, "utf8");
      writeFileSync(join(this.memoryPath(id), "AGENTS.md"), AGENTS_SEED, "utf8");
      writeFileSync(join(this.memoryPath(id), "BOOT.md"), BOOT_SEED, "utf8");
      writeFileSync(join(this.memoryPath(id), "ONBOARDING.md"), ONBOARDING_SEED, "utf8");
      writeFileSync(join(this.memoryPath(id), "BOARD.md"), BOARD_SEED, "utf8");
      writeFileSync(join(this.memoryPath(id), "HEARTBEAT.md"), HEARTBEAT_SEED, "utf8");
    }
    mkdirSync(join(this.memoryPath(id), "memory"), { recursive: true });

    this.data.teammates.push(record);
    this.persist();
    return this.toTeammate(record);
  }

  rename(id: string, name: string, boardId?: string, boardName?: string, heartbeatCron?: string, persona?: string, emoji?: string): Teammate {
    const record = this.record(id);
    record.name = name;
    record.boardId = boardId?.trim() || undefined;
    record.boardName = boardName?.trim() || undefined;
    record.heartbeatCron = heartbeatCron?.trim() || undefined;
    if (persona !== undefined) record.persona = persona.trim() || undefined;
    record.emoji = emoji?.trim() || undefined;
    this.persist();
    return this.toTeammate(record);
  }

  setLastAgentId(id: string, agentId: string): void {
    const record = this.record(id);
    record.lastAgentId = agentId;
    this.persist();
  }

  delete(id: string): void {
    const index = this.data.teammates.findIndex((t) => t.id === id);
    if (index === -1) throw new Error(`Teammate not found: ${id}`);
    this.data.teammates.splice(index, 1);
    this.persist();
    rmSync(this.memoryPath(id), { recursive: true, force: true });
  }

  readText(id: string, filename: string): string {
    const path = join(this.memoryPath(id), filename);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  }

  appendMemory(id: string, text: string): void {
    this.record(id);
    const now = new Date();
    const memoryDir = join(this.memoryPath(id), "memory");
    mkdirSync(memoryDir, { recursive: true });
    const file = join(memoryDir, localDate(now) + ".md");
    appendFileSync(file, `\n\n## ${now.toISOString()}\n${text}`, "utf8");
  }

  readMemory(id: string, days?: number): string {
    this.record(id);
    const memoryDir = join(this.memoryPath(id), "memory");
    if (!existsSync(memoryDir)) return "";
    const files = readdirSync(memoryDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    const count = typeof days === "number" && days > 0 ? days : files.length;
    return files
      .slice(-count)
      .map((f) => readFileSync(join(memoryDir, f), "utf8"))
      .join("\n");
  }

  private record(id: string): TeammateRecord {
    const record = this.data.teammates.find((t) => t.id === id);
    if (!record) throw new Error(`Teammate not found: ${id}`);
    return record;
  }

  private toTeammate(record: TeammateRecord): Teammate {
    return { ...record, memoryPath: this.memoryPath(record.id) };
  }

  private uniqueSlug(base: string): string {
    const existing = new Set(this.data.teammates.map((t) => t.id));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }
}

// Shared prompt assembly used by both teammate.start and the heartbeat scheduler.
export function buildSystemPrompt(store: TeammateStore, id: string): { name: string; systemPrompt: string; provider: string; thinkingOptionId?: string } {
  const teammate = store.get(id);
  const agents = store.readText(id, "AGENTS.md");
  const boot = store.readText(id, "BOOT.md");
  const onboarding = store.readText(id, "ONBOARDING.md");
  const identity = store.readText(id, "IDENTITY.md");
  const soul = store.readText(id, "SOUL.md");
  const user = store.readText(id, "USER.md");
  const memory = store.readMemory(id, 7);
  const systemPrompt =
    `You are the teammate named ${teammate.name}.\n\n` +
    `${agents}\n\n` +
    `${identity}\n${soul}\n${user}\n\n` +
    `${boot}\n\n` +
    (onboarding ? `${onboarding}\n\n` : "") +
    `Recent memory:\n${memory}\n\n` +
    `You may append what you learn to your memory using the teammate_memory_append tool with teammate = "${teammate.id}". You are "${teammate.id}".`;
  return { name: teammate.name, systemPrompt, provider: teammate.provider || DEFAULT_PROVIDER, thinkingOptionId: teammate.thinkingOptionId };
}
