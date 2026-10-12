import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import {
  boardAddZoneRpc,
  boardAdoptCardRpc,
  boardCreateCardRpc,
  boardCreateRpc,
  boardDeleteRpc,
  boardDeleteZoneRpc,
  boardMoveRpc,
  boardNewSessionRpc,
  boardProjectsRpc,
  boardRenameRpc,
  boardSetDefaultsRpc,
  boardSetLastVisitedRpc,
  boardStateRpc,
  boardTeammatesRpc,
  boardUpdateZoneRpc,
  boardWorkspacesRpc,
} from "./shared/contracts";
import { BoardStore } from "./server/board";
import { BoardEngine } from "./server/engine";
import { buildAllWorkspaceCards, buildWorkspaceCards } from "./server/state";
import { readBoardTeammates } from "./server/teammates";
import { McpServer } from "./server/mcp";

export default function contribute(server: PluginServerContext) {
  const store = new BoardStore();
  const engine = new BoardEngine(store);
  let paseoApi: PaseoApi | null = null;

  const mcpServer = new McpServer();
  mcpServer.attachHandlers({
    getCurrentBoard: () => store.current(),
    listBoards: () => store.list().map((b) => ({ id: b.id, name: b.name })),
    moveCard: async (workspaceId, zoneId, boardId) => {
      try {
        await engine.move(boardId ?? store.current().id, workspaceId, zoneId);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    buildWorkspaces: async () => {
      if (!paseoApi) throw new Error("Paseo API is not available yet.");
      return buildWorkspaceCards(paseoApi, store.current());
    },
  });
  mcpServer.start();

  const capturePaseo = (paseo: PaseoApi) => {
    paseoApi = paseo;
    engine.attachPaseo(paseo);
  };

  server.before("agent.create", ({ request }, { paseo }) => {
    capturePaseo(paseo);
    return {
      ...request,
      config: {
        ...request.config,
        mcpServers: {
          ...request.config.mcpServers,
          ace: { type: "http", url: mcpServer.url(), alwaysLoad: true },
        },
      },
    };
  });

  server.handle(boardStateRpc, async ({ boardId }, { paseo }) => {
    capturePaseo(paseo);
    const board = boardId ? store.get(boardId) : store.current();
    const workspaces = await buildWorkspaceCards(paseo, board);
    return {
      boardId: board.id,
      board,
      workspaces,
      boards: store.list().map((b) => ({ id: b.id, name: b.name })),
      lastVisitedBoardId: store.lastVisited(),
    };
  });

  server.handle(boardTeammatesRpc, () => {
    const { teammates, active } = readBoardTeammates();
    return { teammates, active };
  });

  server.handle(boardCreateRpc, ({ name }) => {
    const board = store.create(name);
    return { boardId: board.id };
  });

  server.handle(boardRenameRpc, ({ boardId, name }) => {
    store.rename(boardId, name);
    return { ok: true };
  });

  server.handle(boardDeleteRpc, ({ boardId }) => {
    store.delete(boardId);
    return { ok: true };
  });

  server.handle(boardSetLastVisitedRpc, ({ boardId }) => {
    store.setLastVisited(boardId);
    return { ok: true };
  });

  server.handle(boardSetDefaultsRpc, ({ boardId, cardDefaults }) => {
    store.setDefaults(boardId, cardDefaults);
    return { ok: true };
  });

  server.handle(boardProjectsRpc, async (_input, { paseo }) => {
    capturePaseo(paseo);
    const result = await paseo.projects.list();
    return {
      projects: result.projects.map((p) => ({ id: p.projectId, name: p.projectDisplayName, path: p.projectRootPath, isGit: p.projectKind === "git" })),
    };
  });

  server.handle(boardWorkspacesRpc, async (_input, { paseo }) => {
    capturePaseo(paseo);
    return { workspaces: await buildAllWorkspaceCards(paseo) };
  });

  server.handle(boardAddZoneRpc, ({ boardId }) => {
    engine.addZone(boardId);
    return { ok: true };
  });

  server.handle(boardUpdateZoneRpc, ({ boardId, zoneId, title, trigger }) => {
    engine.updateZone(boardId, zoneId, { title, trigger });
    return { ok: true };
  });

  server.handle(boardDeleteZoneRpc, ({ boardId, zoneId }) => {
    engine.deleteZone(boardId, zoneId);
    return { ok: true };
  });

  server.handle(boardMoveRpc, async ({ boardId, workspaceId, zoneId, reuseAgentId }, { paseo }) => {
    capturePaseo(paseo);
    await engine.move(boardId, workspaceId, zoneId, reuseAgentId);
    return { ok: true };
  });

  server.handle(boardNewSessionRpc, async ({ workspaceId }, { paseo }) => {
    capturePaseo(paseo);
    return { agentId: await engine.newSession(workspaceId) };
  });

  server.handle(boardAdoptCardRpc, ({ boardId, zoneId, workspaceId }) => {
    engine.adoptCard(boardId, zoneId, workspaceId);
    return { ok: true };
  });

  server.handle(boardCreateCardRpc, async (input, { paseo }) => {
    capturePaseo(paseo);
    return { workspaceId: await engine.createCard(input) };
  });

  server.on("agent.created", (_event, { paseo }) => capturePaseo(paseo));
  server.on("agent.turn_started", (_event, { paseo }) => capturePaseo(paseo));
  server.on("workspace.created", (_event, { paseo }) => capturePaseo(paseo));

  return () => {
    mcpServer.stop();
  };
}
