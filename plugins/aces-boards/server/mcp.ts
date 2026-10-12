import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Board, BoardSummary, WorkspaceCard } from "../shared/contracts";

export interface McpHandlers {
  getCurrentBoard: () => Board;
  listBoards: () => BoardSummary[];
  moveCard: (workspaceId: string, zoneId: string, boardId?: string) => Promise<{ ok: boolean; error?: string }>;
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
    description: "List the board columns, zones, and workspace cards.",
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
];

export class McpServer {
  private server: Server | null = null;
  private port = 0;
  private handlers: McpHandlers | null = null;

  attachHandlers(handlers: McpHandlers): void {
    this.handlers = handlers;
  }

  start(): void {
    if (this.server) return;
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.server.listen(0, "127.0.0.1", () => {
      const address = this.server?.address();
      if (address && typeof address === "object") {
        this.port = address.port;
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
