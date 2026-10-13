import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Board, BoardSummary, WorkspaceCard } from "../shared/contracts";

export interface McpHandlers {
  getCurrentBoard: () => Board;
  listBoards: () => BoardSummary[];
  moveCard: (workspaceId: string, zoneId: string, boardId?: string) => Promise<{ ok: boolean; error?: string }>;
  createCard: (input: { zoneId: string; name: string; projectCwd: string; boardId?: string; prompt?: string }) => Promise<{ ok: boolean; workspaceId?: string; error?: string }>;
  addZone: (groupId: string | undefined, title: string | undefined, boardId: string | undefined) => { ok: boolean; error?: string };
  renameZone: (zoneId: string, title: string, boardId: string | undefined) => { ok: boolean; error?: string };
  deleteZone: (zoneId: string, boardId: string | undefined) => { ok: boolean; error?: string };
  moveZone: (zoneId: string, groupId: string, index: number, boardId: string | undefined) => { ok: boolean; error?: string };
  moveGroup: (groupId: string, index: number, boardId: string | undefined) => { ok: boolean; error?: string };
  buildWorkspaces: () => Promise<WorkspaceCard[]>;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

const TOOLS = [
  {
    name: "board_list",
    description: "List the board groups, zones, and workspace cards.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "board_move_card",
    description: "Move a workspace card into a zone.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string" }, zoneId: { type: "string" }, boardId: { type: "string" } },
      required: ["workspaceId", "zoneId"],
    },
  },
  {
    name: "board_create_card",
    description: "Create a workspace card in a zone (spawns a git branch/workspace and optionally an initial agent).",
    inputSchema: {
      type: "object",
      properties: {
        zoneId: { type: "string" },
        name: { type: "string" },
        projectCwd: { type: "string" },
        boardId: { type: "string" },
        prompt: { type: "string" },
      },
      required: ["zoneId", "name", "projectCwd"],
    },
  },
  {
    name: "board_add_zone",
    description: "Add a zone. If groupId is given the zone is appended to that group; otherwise a new group containing the zone is created.",
    inputSchema: {
      type: "object",
      properties: { boardId: { type: "string" }, groupId: { type: "string" }, title: { type: "string" } },
    },
  },
  {
    name: "board_rename_zone",
    description: "Rename a zone.",
    inputSchema: {
      type: "object",
      properties: { boardId: { type: "string" }, zoneId: { type: "string" }, title: { type: "string" } },
      required: ["zoneId", "title"],
    },
  },
  {
    name: "board_delete_zone",
    description: "Delete a zone.",
    inputSchema: {
      type: "object",
      properties: { boardId: { type: "string" }, zoneId: { type: "string" } },
      required: ["zoneId"],
    },
  },
  {
    name: "board_move_zone",
    description: "Move a zone into a group at a 0-based position.",
    inputSchema: {
      type: "object",
      properties: { boardId: { type: "string" }, zoneId: { type: "string" }, groupId: { type: "string" }, index: { type: "number" } },
      required: ["zoneId", "groupId", "index"],
    },
  },
  {
    name: "board_move_group",
    description: "Reorder a group (column) to a 0-based position.",
    inputSchema: {
      type: "object",
      properties: { boardId: { type: "string" }, groupId: { type: "string" }, index: { type: "number" } },
      required: ["groupId", "index"],
    },
  },
];

function mcpPortFile(): string {
  const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(base, "aces", "boards-mcp-port.json");
}

function readPersistedPort(): number {
  try {
    if (existsSync(mcpPortFile())) {
      const value = JSON.parse(readFileSync(mcpPortFile(), "utf8")) as unknown;
      return typeof value === "number" && value > 0 ? value : 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

function persistPort(port: number): void {
  try {
    const base = process.env.PASEO_HOME || join(homedir(), ".paseo");
    mkdirSync(join(base, "aces"), { recursive: true });
    writeFileSync(mcpPortFile(), JSON.stringify(port), "utf8");
  } catch {
    // ignore
  }
}

export class McpServer {
  private server: Server | null = null;
  private port = 0;
  private handlers: McpHandlers | null = null;

  attachHandlers(handlers: McpHandlers): void {
    this.handlers = handlers;
  }

  start(): void {
    if (this.server) return;
    this.listenOn(readPersistedPort() || 0);
  }

  private listenOn(port: number): void {
    const server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.server = server;
    const onError = (err: Error) => {
      if (port !== 0 && (err as { code?: string }).code === "EADDRINUSE") {
        this.server = null;
        this.listenOn(0);
      } else {
        console.error("[aces-boards] MCP server failed to listen:", err);
      }
    };
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onError);
      const address = server.address();
      if (address && typeof address === "object") {
        this.port = address.port;
        persistPort(this.port);
      }
      console.log(`[aces-boards] MCP server listening at ${this.url()}`);
    });
  }

  url(): string {
    return "http://127.0.0.1:" + this.port + "/mcp";
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = 0;
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "Not found" } }));
      return;
    }

    let message: JsonRpcRequest;
    try {
      message = JSON.parse(await readBody(req)) as JsonRpcRequest;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      return;
    }

    if (message.id === undefined || message.id === null) {
      res.writeHead(202);
      res.end();
      return;
    }

    const id = message.id;
    const method = message.method ?? "";
    const params = message.params ?? {};

    switch (method) {
      case "initialize":
        this.respond(res, id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "aces-boards", version: "0.1.0" },
        });
        return;
      case "tools/list":
        this.respond(res, id, { tools: TOOLS });
        return;
      case "tools/call":
        await this.handleToolCall(res, id, params);
        return;
      default:
        this.respondError(res, id, -32601, "Method not found: " + method);
        return;
    }
  }

  private async handleToolCall(res: ServerResponse, id: string | number, params: JsonRpcRequest["params"]): Promise<void> {
    const handlers = this.handlers;
    if (!handlers) {
      this.toolError(res, id, new Error("MCP handlers are not attached."));
      return;
    }

    const name = params?.name;
    const args = params?.arguments ?? {};

    if (name === "board_list") {
      try {
        const board = handlers.getCurrentBoard();
        const boards = handlers.listBoards();
        const workspaces = await handlers.buildWorkspaces();
        this.toolResult(res, id, { board, boards, workspaces });
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    if (name === "board_move_card") {
      const workspaceId = args.workspaceId;
      const zoneId = args.zoneId;
      const boardId = typeof args.boardId === "string" ? args.boardId : undefined;
      if (typeof workspaceId !== "string" || typeof zoneId !== "string") {
        this.toolError(res, id, new Error("workspaceId and zoneId are required string arguments."));
        return;
      }
      try {
        const result = await handlers.moveCard(workspaceId, zoneId, boardId);
        this.toolResult(res, id, result);
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    if (name === "board_create_card") {
      const zoneId = args.zoneId;
      const name = args.name;
      const projectCwd = args.projectCwd;
      const boardId = typeof args.boardId === "string" ? args.boardId : undefined;
      const prompt = typeof args.prompt === "string" ? args.prompt : undefined;
      if (typeof zoneId !== "string" || typeof name !== "string" || typeof projectCwd !== "string") {
        this.toolError(res, id, new Error("zoneId, name, and projectCwd are required string arguments."));
        return;
      }
      try {
        const result = await handlers.createCard({ zoneId, name, projectCwd, boardId, prompt });
        this.toolResult(res, id, result);
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    if (name === "board_add_zone") {
      const groupId = typeof args.groupId === "string" ? args.groupId : undefined;
      const title = typeof args.title === "string" ? args.title : undefined;
      const boardId = typeof args.boardId === "string" ? args.boardId : undefined;
      try {
        this.toolResult(res, id, handlers.addZone(groupId, title, boardId));
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    if (name === "board_rename_zone") {
      const zoneId = args.zoneId;
      const title = args.title;
      const boardId = typeof args.boardId === "string" ? args.boardId : undefined;
      if (typeof zoneId !== "string" || typeof title !== "string") {
        this.toolError(res, id, new Error("zoneId and title are required string arguments."));
        return;
      }
      try {
        this.toolResult(res, id, handlers.renameZone(zoneId, title, boardId));
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    if (name === "board_delete_zone") {
      const zoneId = args.zoneId;
      const boardId = typeof args.boardId === "string" ? args.boardId : undefined;
      if (typeof zoneId !== "string") {
        this.toolError(res, id, new Error("zoneId is a required string argument."));
        return;
      }
      try {
        this.toolResult(res, id, handlers.deleteZone(zoneId, boardId));
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    if (name === "board_move_zone") {
      const zoneId = args.zoneId;
      const groupId = args.groupId;
      const index = args.index;
      const boardId = typeof args.boardId === "string" ? args.boardId : undefined;
      if (typeof zoneId !== "string" || typeof groupId !== "string" || typeof index !== "number") {
        this.toolError(res, id, new Error("zoneId (string), groupId (string), and index (number) are required."));
        return;
      }
      try {
        this.toolResult(res, id, handlers.moveZone(zoneId, groupId, index, boardId));
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    if (name === "board_move_group") {
      const groupId = args.groupId;
      const index = args.index;
      const boardId = typeof args.boardId === "string" ? args.boardId : undefined;
      if (typeof groupId !== "string" || typeof index !== "number") {
        this.toolError(res, id, new Error("groupId (string) and index (number) are required."));
        return;
      }
      try {
        this.toolResult(res, id, handlers.moveGroup(groupId, index, boardId));
      } catch (error) {
        this.toolError(res, id, error);
      }
      return;
    }

    this.toolError(res, id, new Error("Unknown tool: " + String(name)));
  }

  private respond(res: ServerResponse, id: string | number, result: unknown): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  private respondError(res: ServerResponse, id: string | number | null, code: number, message: string): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
  }

  private toolResult(res: ServerResponse, id: string | number, data: unknown): void {
    this.respond(res, id, {
      content: [{ type: "text", text: JSON.stringify(data) }],
      isError: false,
    });
  }

  private toolError(res: ServerResponse, id: string | number, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.respond(res, id, {
      content: [{ type: "text", text: message }],
      isError: true,
    });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
