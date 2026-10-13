import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import {
  boardAddZoneRpc,
  boardAdoptCardRpc,
  boardCreateCardRpc,
  boardCreateRpc,
  boardDeleteRpc,
  boardDeleteZoneRpc,
  boardMoveGroupRpc,
  boardMoveRpc,
  boardMoveZoneRpc,
  boardNewSessionRpc,
  boardProjectsRpc,
  boardRenameRpc,
  boardSetDefaultsRpc,
  boardSetLastVisitedRpc,
  boardStartTeammateRpc,
  boardStateRpc,
  boardTeammateSessionsRpc,
  boardTeammatesRpc,
  boardUpdateZoneRpc,
  boardWorkspacesRpc,
} from "./shared/contracts";
import { BoardStore } from "./server/board";
import { BoardEngine } from "./server/engine";
import { buildAllWorkspaceCards, buildWorkspaceCards } from "./server/state";
import { DEFAULT_TEAMMATE_PROVIDER, TEAMMATE_HEARTBEAT_LABEL, TEAMMATE_ID_LABEL, buildTeammateSystemPrompt } from "./server/teammate-prompt";
import { readBoardTeammates, readTeammateStart } from "./server/teammates";
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
    createCard: async (input) => {
      if (!paseoApi) return { ok: false, error: "Paseo API is not available yet." };
      try {
        const boardId = input.boardId ?? store.current().id;
        const workspaceId = await engine.createCard({ boardId, zoneId: input.zoneId, name: input.name, projectCwd: input.projectCwd, isolation: "worktree", prompt: input.prompt });
        return { ok: true, workspaceId };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    addZone: (groupId, title, boardId) => {
      try {
        engine.addZone(boardId ?? store.current().id, groupId, title);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    renameZone: (zoneId, title, boardId) => {
      try {
        engine.updateZone(boardId ?? store.current().id, zoneId, { title });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    deleteZone: (zoneId, boardId) => {
      try {
        engine.deleteZone(boardId ?? store.current().id, zoneId);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    moveZone: (zoneId, groupId, index, boardId) => {
      try {
        engine.moveZone(boardId ?? store.current().id, zoneId, groupId, index);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    moveGroup: (groupId, index, boardId) => {
      try {
        engine.moveGroup(boardId ?? store.current().id, groupId, index);
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
          "aces-boards": { type: "http", url: mcpServer.url(), alwaysLoad: true },
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

  server.handle(boardStartTeammateRpc, async ({ teammateId }, { paseo }) => {
    capturePaseo(paseo);
    const teammate = readTeammateStart(teammateId);
    if (!teammate) throw new Error(`Teammate not found: ${teammateId}`);
    const systemPrompt = buildTeammateSystemPrompt({ name: teammate.name, id: teammate.id, homeDir: teammate.homeDir });
    const agent = await paseo.agents.create({
      config: { provider: teammate.provider || DEFAULT_TEAMMATE_PROVIDER, thinkingOptionId: teammate.thinkingOptionId, systemPrompt },
      cwd: teammate.homeDir,
      title: teammate.name,
      labels: { [TEAMMATE_ID_LABEL]: teammate.id },
    });
    return { agentId: agent.id };
  });

  server.handle(boardTeammateSessionsRpc, async ({ teammateId }, { paseo }) => {
    capturePaseo(paseo);
    const result = await paseo.agents.list();
    const sessions = result.entries
      .map((entry) => entry.agent)
      .filter((agent) => !agent.archivedAt)
      .filter((agent) => agent.labels?.[TEAMMATE_ID_LABEL] === teammateId)
      .filter((agent) => !agent.labels?.[TEAMMATE_HEARTBEAT_LABEL])
      .map((agent) => ({ id: agent.id, title: agent.title ?? "(untitled)" }));
    return { sessions };
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

  server.handle(boardAddZoneRpc, ({ boardId, groupId, title }) => {
    engine.addZone(boardId, groupId, title);
    return { ok: true };
  });

  server.handle(boardMoveGroupRpc, ({ boardId, groupId, index }) => {
    engine.moveGroup(boardId, groupId, index);
    return { ok: true };
  });

  server.handle(boardMoveZoneRpc, ({ boardId, zoneId, groupId, index }) => {
    engine.moveZone(boardId, zoneId, groupId, index);
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
