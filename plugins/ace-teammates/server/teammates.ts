import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BoardSummary, Teammate } from "../shared/contracts";

interface TeammateRecord {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  boardId?: string;
  boardName?: string;
  heartbeatCron?: string;
  createdAt: string;
}

export const DEFAULT_PROVIDER = "opencode/opencode-go/deepseek-v4-flash";

interface TeammatesData {
  teammates: TeammateRecord[];
}

const SOUL_SEED = "# Soul\n\n(personality, communication style, principles)";
const USER_SEED = "# About the user\n\n(preferences, patterns — the teammate fills this in as it learns)";
const BOARD_SEED = "# Board\n\nDescribe what each zone on this board means and how work moves between zones.";
const HEARTBEAT_SEED =
  "# Heartbeat\n\nOptional periodic tasks: review board state, triage new work, summarize to memory.";

function identitySeed(name: string): string {
  return `# Identity\n\nName: ${name}\n\n(purpose)`;
}

function baseDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "plugins", "ace-teammates");
}

// Read-only coupling to the `ace` plugin's board store. This is the only touch
// point between the two plugins; treat ace's BoardsData schema as the contract
// and never write to it from here.
export function readAceBoards(): BoardSummary[] {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const path = join(base, "plugins", "ace", "boards.json");
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
    this.dir = baseDir();
    this.teammatesDir = join(this.dir, "teammates");
    this.indexPath = join(this.dir, "teammates.json");
    mkdirSync(this.teammatesDir, { recursive: true });
    this.data = this.load();
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

  create(name: string, description?: string, provider?: string, boardId?: string, boardName?: string, heartbeatCron?: string): Teammate {
    const base = slugify(name);
    if (!base) throw new Error("Name must include at least one letter or number.");
    const id = this.uniqueSlug(base);
    const record: TeammateRecord = {
      id,
      name,
      description: description?.trim() || undefined,
      provider: provider?.trim() || undefined,
      boardId: boardId?.trim() || undefined,
      boardName: boardName?.trim() || undefined,
      heartbeatCron: heartbeatCron?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const dir = this.memoryPath(id);
    mkdirSync(join(dir, "memory"), { recursive: true });
    writeFileSync(join(dir, "SOUL.md"), SOUL_SEED, "utf8");
    writeFileSync(join(dir, "USER.md"), USER_SEED, "utf8");
    writeFileSync(join(dir, "IDENTITY.md"), identitySeed(name), "utf8");
    writeFileSync(join(dir, "BOARD.md"), BOARD_SEED, "utf8");
    writeFileSync(join(dir, "HEARTBEAT.md"), HEARTBEAT_SEED, "utf8");

    this.data.teammates.push(record);
    this.persist();
    return this.toTeammate(record);
  }

  rename(id: string, name: string, boardId?: string, boardName?: string, heartbeatCron?: string): Teammate {
    const record = this.record(id);
    record.name = name;
    record.boardId = boardId?.trim() || undefined;
    record.boardName = boardName?.trim() || undefined;
    record.heartbeatCron = heartbeatCron?.trim() || undefined;
    this.persist();
    return this.toTeammate(record);
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
export function buildSystemPrompt(store: TeammateStore, id: string): { name: string; systemPrompt: string; provider: string } {
  const teammate = store.get(id);
  const identity = store.readText(id, "IDENTITY.md");
  const soul = store.readText(id, "SOUL.md");
  const user = store.readText(id, "USER.md");
  const memory = store.readMemory(id, 7);
  const systemPrompt =
    `You are the ACE teammate named ${teammate.name}.\n\n` +
    `${identity}\n${soul}\n${user}\n\n` +
    `Recent memory:\n${memory}\n\n` +
    `You may append what you learn to your memory using the teammate_memory_append tool with teammate = "${teammate.id}". You are "${teammate.id}".`;
  return { name: teammate.name, systemPrompt, provider: teammate.provider || DEFAULT_PROVIDER };
}
