import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  teammateBoardsRpc,
  teammateCreateRpc,
  teammateDeleteRpc,
  teammateListRpc,
  teammateRenameRpc,
  teammateStartRpc,
} from "./shared/contracts";
import { McpServer } from "./server/mcp";
import { HeartbeatScheduler } from "./server/scheduler";
import { buildSystemPrompt, readAceBoards, TeammateStore } from "./server/teammates";

export default function contribute(server: PluginServerContext) {
  const store = new TeammateStore();
  let paseoApi: PaseoApi | null = null;

  const mcpServer = new McpServer();
  mcpServer.attachHandlers({
    listTeammates: () => store.list().map((t) => ({ id: t.id, name: t.name })),
    appendMemory: (teammate, text) => store.appendMemory(teammate, text),
    readMemory: (teammate, days) => store.readMemory(teammate, days),
  });
  mcpServer.start();

  const capturePaseo = (paseo: PaseoApi) => {
    paseoApi = paseo;
  };

  const scheduler = new HeartbeatScheduler(store, () => paseoApi);
  scheduler.start();

  server.before("agent.create", ({ request }, { paseo }) => {
    capturePaseo(paseo);
    return {
      ...request,
      config: {
        ...request.config,
        mcpServers: {
          ...request.config.mcpServers,
          "ace-teammates": { type: "http", url: mcpServer.url(), alwaysLoad: true },
        },
      },
    };
  });

  server.handle(teammateListRpc, () => ({ teammates: store.list() }));

  server.handle(teammateBoardsRpc, () => ({ boards: readAceBoards() }));

  server.handle(teammateCreateRpc, ({ name, description, provider, boardId, boardName, heartbeatCron, persona, emoji }) => ({
    teammate: store.create(name, description, provider, boardId, boardName, heartbeatCron, persona, emoji),
  }));

  server.handle(teammateRenameRpc, ({ id, name, boardId, boardName, heartbeatCron, persona, emoji }) => ({
    teammate: store.rename(id, name, boardId, boardName, heartbeatCron, persona, emoji),
  }));

  server.handle(teammateDeleteRpc, ({ id }) => {
    store.delete(id);
    return { ok: true };
  });

  server.handle(teammateStartRpc, async ({ id, workspaceId }, { paseo }) => {
    capturePaseo(paseo);
    if (!paseoApi) throw new Error("Paseo API is not available yet.");
    const { name, systemPrompt, provider } = buildSystemPrompt(store, id);
    if (workspaceId) {
      const agent = await paseo.workspaces.ref(workspaceId).agents.create({
        config: { provider, systemPrompt },
        title: name,
      });
      return { agentId: agent.id };
    }
    const agent = await paseo.agents.create({
      config: { provider, systemPrompt },
      cwd: store.memoryPath(id),
    });
    return { agentId: agent.id };
  });

  server.on("agent.created", (_event, { paseo }) => capturePaseo(paseo));
  server.on("agent.turn_started", (_event, { paseo }) => capturePaseo(paseo));
  server.on("agent.turn_ended", (event) => scheduler.onTurnEnded(event.agent.id));

  return () => {
    scheduler.stop();
    mcpServer.stop();
  };
}
