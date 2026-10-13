import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { BoardsDataSchema, type Board, type BoardsData, type CardDefaults } from "../shared/contracts";

const DEFAULT_BOARDS: BoardsData = {
  boards: [
    {
      id: "main",
      name: "Main",
      groups: [
        { id: "backlog", zones: [{ id: "backlog-1", title: "Backlog" }] },
        {
          id: "review",
          zones: [
            {
              id: "review-1",
              title: "Review",
              trigger: {
                session: { mode: "new" },
                action: "prompt",
                provider: "opencode/opencode-go/deepseek-v4-flash",
                prompt: "Review the working tree in {{workspace.directory}} and summarize what changed.",
              },
            },
          ],
        },
        { id: "human", zones: [{ id: "human-1", title: "Human review" }] },
      ],
      placement: {},
      cardDefaults: {
        isolation: "worktree",
        provider: "opencode/opencode-go/deepseek-v4-flash",
        baseBranch: "origin/main",
      },
    },
  ],
  lastVisitedBoardId: "main",
};

function dataDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "aces");
}

function previousDataDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "ace");
}

function legacyDataDir(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "plugins", "ace");
}

// One-time migration chain: prefer the new ~/.paseo/aces directory; if its
// boards.json is missing, copy it over from the previous ~/.paseo/ace location,
// then from the pre-consolidation ~/.paseo/plugins/ace location. Files are
// copied, never deleted.
function migrate(): void {
  const dir = dataDir();
  const path = join(dir, "boards.json");
  if (existsSync(path)) return;
  const sources = [join(previousDataDir(), "boards.json"), join(legacyDataDir(), "boards.json")];
  for (const source of sources) {
    if (!existsSync(source)) continue;
    mkdirSync(dir, { recursive: true });
    copyFileSync(source, path);
    return;
  }
}

export class BoardStore {
  readonly dir: string;
  private readonly path: string;
  private data: BoardsData;

  constructor() {
    migrate();
    this.dir = dataDir();
    this.path = join(this.dir, "boards.json");
    mkdirSync(this.dir, { recursive: true });
    this.data = this.load();
  }

  private load(): BoardsData {
    const fallback = (): BoardsData => structuredClone(DEFAULT_BOARDS);
    try {
      if (!existsSync(this.path)) return fallback();
      const parsed = JSON.parse(readFileSync(this.path, "utf8"));
      const result = BoardsDataSchema.safeParse(parsed);
      return result.success ? result.data : fallback();
    } catch {
      return fallback();
    }
  }

  private persist(): void {
    const tmp = this.path + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  list(): Board[] {
    return this.data.boards;
  }

  get(boardId: string): Board {
    const board = this.data.boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    return board;
  }

  current(): Board {
    const last = this.data.lastVisitedBoardId;
    const board = last ? this.data.boards.find((b) => b.id === last) : undefined;
    return board ?? this.data.boards[0];
  }

  lastVisited(): string | null {
    return this.data.lastVisitedBoardId ?? null;
  }

  create(name: string): Board {
    const board: Board = {
      id: "board-" + randomUUID().slice(0, 8),
      name,
      groups: [
        {
          id: "col-" + randomUUID().slice(0, 8),
          zones: [{ id: "zone-" + randomUUID().slice(0, 8), title: "New zone" }],
        },
      ],
      placement: {},
      cardDefaults: structuredClone(DEFAULT_BOARDS.boards[0].cardDefaults),
    };
    this.data.boards.push(board);
    this.data.lastVisitedBoardId = board.id;
    this.persist();
    return board;
  }

  rename(id: string, name: string): void {
    this.get(id).name = name;
    this.persist();
  }

  delete(id: string): void {
    const index = this.data.boards.findIndex((b) => b.id === id);
    if (index === -1) throw new Error(`Board not found: ${id}`);
    this.data.boards.splice(index, 1);
    if (this.data.boards.length === 0) {
      const seed = structuredClone(DEFAULT_BOARDS.boards[0]);
      this.data.boards.push(seed);
      this.data.lastVisitedBoardId = seed.id;
    } else if (this.data.lastVisitedBoardId === id) {
      this.data.lastVisitedBoardId = this.data.boards[0].id;
    }
    this.persist();
  }

  setLastVisited(id: string): void {
    this.get(id);
    this.data.lastVisitedBoardId = id;
    this.persist();
  }

  setDefaults(id: string, cardDefaults: CardDefaults): void {
    this.get(id).cardDefaults = cardDefaults;
    this.persist();
  }

  update(boardId: string, fn: (board: Board) => void): Board {
    const board = this.get(boardId);
    fn(board);
    this.persist();
    return board;
  }
}
