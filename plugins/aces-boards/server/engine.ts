import { randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import { UNASSIGNED_CARD_ID, type Board, type BoardGroup, type Zone, type ZoneTrigger } from "../shared/contracts";
import { renderTemplate, type TemplateContext } from "../shared/template";
import { BoardStore } from "./board";

const DEFAULT_PROVIDER = "opencode/opencode-go/deepseek-v4-flash";

export interface CreateCardInput {
  boardId: string;
  zoneId: string;
  name: string;
  isolation: "worktree" | "directory";
  projectCwd: string;
  baseBranch?: string;
  provider?: string;
  modeId?: string;
  thinkingOptionId?: string;
  prompt?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveProvider(provider?: string): string {
  const value = provider?.trim();
  if (!value) return DEFAULT_PROVIDER;
  if (!value.includes("/")) {
    throw new Error(`Invalid provider "${value}": expected a "provider/model" string.`);
  }
  return value;
}

export class BoardEngine {
  private readonly store: BoardStore;
  private paseo: PaseoApi | null = null;

  constructor(store: BoardStore) {
    this.store = store;
  }

  attachPaseo(paseo: PaseoApi): void {
    this.paseo = paseo;
  }

  addZone(boardId: string, groupId?: string): void {
    const id = "zone-" + randomUUID().slice(0, 8);
    if (groupId) {
      const board = this.store.get(boardId);
      if (!board.groups.some((c) => c.id === groupId)) throw new Error(`Group not found: ${groupId}`);
      this.store.update(boardId, (b) => {
        const group = b.groups.find((c) => c.id === groupId);
        if (group) group.zones.push({ id, title: "New zone" });
      });
      return;
    }
    const newGroupId = "col-" + randomUUID().slice(0, 8);
    this.store.update(boardId, (board) => {
      board.groups.push({ id: newGroupId, title: "New zone", zones: [{ id, title: "New zone" }] });
    });
  }

  moveGroup(boardId: string, groupId: string, index: number): void {
    const board = this.store.get(boardId);
    const from = board.groups.findIndex((c) => c.id === groupId);
    if (from === -1) throw new Error(`Group not found: ${groupId}`);
    this.store.update(boardId, (b) => {
      const [group] = b.groups.splice(from, 1);
      const clamped = Math.max(0, Math.min(index, b.groups.length));
      b.groups.splice(clamped, 0, group);
    });
  }

  moveZone(boardId: string, zoneId: string, groupId: string, index: number): void {
    const board = this.store.get(boardId);
    const zone = this.findZone(board, zoneId);
    if (!zone) throw new Error(`Zone not found: ${zoneId}`);
    if (!board.groups.some((c) => c.id === groupId)) throw new Error(`Group not found: ${groupId}`);
    this.store.update(boardId, (b) => {
      let sourceGroup: BoardGroup | undefined;
      for (const group of b.groups) {
        const i = group.zones.findIndex((z) => z.id === zoneId);
        if (i === -1) continue;
        group.zones.splice(i, 1);
        sourceGroup = group;
        break;
      }
      const target = b.groups.find((c) => c.id === groupId);
      if (target) {
        const clamped = Math.max(0, Math.min(index, target.zones.length));
        target.zones.splice(clamped, 0, zone);
      }
      if (sourceGroup && sourceGroup.zones.length === 0) {
        b.groups = b.groups.filter((c) => c.id !== sourceGroup!.id);
      }
    });
  }

  updateZone(boardId: string, zoneId: string, patch: { title?: string; trigger?: ZoneTrigger | null }): void {
    if (!this.findZone(this.store.get(boardId), zoneId)) throw new Error(`Zone not found: ${zoneId}`);
    this.store.update(boardId, (board) => {
      for (const group of board.groups) {
        for (const zone of group.zones) {
          if (zone.id !== zoneId) continue;
          if (patch.title !== undefined) zone.title = patch.title;
          if (patch.trigger !== undefined) zone.trigger = patch.trigger ?? undefined;
        }
      }
    });
  }

  deleteZone(boardId: string, zoneId: string): void {
    const board = this.store.get(boardId);
    if (!this.findZone(board, zoneId)) throw new Error(`Zone not found: ${zoneId}`);
    this.store.update(boardId, (b) => {
      for (const group of b.groups) {
        const index = group.zones.findIndex((z) => z.id === zoneId);
        if (index === -1) continue;
        group.zones.splice(index, 1);
        if (group.zones.length === 0) {
          b.groups = b.groups.filter((c) => c.id !== group.id);
        }
        break;
      }
      if (b.placement) {
        for (const key of Object.keys(b.placement)) {
          if (b.placement[key] === zoneId) delete b.placement[key];
        }
      }
    });
  }

  async move(boardId: string, workspaceId: string, zoneId: string, reuseAgentId?: string): Promise<void> {
    const paseo = this.paseo;
    if (!paseo) throw new Error("Paseo API is not available yet; open the board from the Paseo app.");

    const board = this.store.get(boardId);
    const zone = this.findZone(board, zoneId);
    if (!zone) throw new Error(`Zone not found: ${zoneId}`);

    if (zone.trigger) {
      const workspaceList = await paseo.workspaces.list();
      const workspace = workspaceList.entries.find((w) => w.id === workspaceId);
      if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
      await this.fireTrigger(paseo, workspace, zone, zone.trigger, reuseAgentId);
    }

    this.store.update(boardId, (b) => {
      b.placement = { ...(b.placement ?? {}), [workspaceId]: zoneId };
    });
  }

  adoptCard(boardId: string, zoneId: string, workspaceId: string): void {
    this.store.update(boardId, (board) => {
      board.placement = { ...(board.placement ?? {}), [workspaceId]: zoneId };
    });
    for (const other of this.store.list()) {
      if (other.id === boardId) continue;
      if (other.placement && other.placement[workspaceId]) {
        this.store.update(other.id, (b) => {
          if (b.placement) delete b.placement[workspaceId];
        });
      }
    }
  }

  async createCard(input: CreateCardInput): Promise<string> {
    const paseo = this.paseo;
    if (!paseo) throw new Error("Paseo API is not available yet; open the board from the Paseo app.");

    const board = this.store.get(input.boardId);
    if (!this.findZone(board, input.zoneId)) throw new Error(`Zone not found: ${input.zoneId}`);

    const branchName = slugify(input.name);
    if (!branchName) {
      throw new Error("Workspace name must include at least one letter or number to form a branch name.");
    }

    const agent =
      input.provider || input.prompt
        ? {
            config: {
              provider: resolveProvider(input.provider),
              modeId: input.modeId,
              thinkingOptionId: input.thinkingOptionId,
            },
            cwd: input.projectCwd,
            prompt: input.prompt || undefined,
          }
        : undefined;

    const workspace =
      input.isolation === "worktree"
        ? await paseo.workspaces.create({
            source: { kind: "worktree", cwd: input.projectCwd, action: "branch-off", baseBranch: input.baseBranch, branchName },
            title: input.name,
            agent,
          })
        : await paseo.workspaces.create({
            source: { kind: "directory", path: input.projectCwd },
            title: input.name,
            agent,
          });

    this.store.update(input.boardId, (b) => {
      b.placement = { ...(b.placement ?? {}), [workspace.id]: input.zoneId };
    });

    return workspace.id;
  }

  async newSession(workspaceId: string): Promise<string> {
    if (workspaceId === UNASSIGNED_CARD_ID) throw new Error("Cannot start a session in the 'No workspace' card.");
    const paseo = this.paseo;
    if (!paseo) throw new Error("Paseo API is not available yet.");

    const agent = await paseo.workspaces.ref(workspaceId).agents.create({ config: { provider: DEFAULT_PROVIDER } });
    return agent.id;
  }

  private findZone(board: Board, zoneId: string): Zone | null {
    for (const group of board.groups) {
      for (const zone of group.zones) {
        if (zone.id === zoneId) return zone;
      }
    }
    return null;
  }

  private async fireTrigger(
    paseo: PaseoApi,
    workspace: { id: string; name: string; workspaceDirectory?: string; projectRootPath: string; workspaceKind: string; gitRuntime?: { currentBranch?: string | null } | null; githubRuntime?: { pullRequest?: { number?: number; url: string; title: string; state: string } | null } | null },
    zone: Zone,
    trigger: ZoneTrigger,
    reuseAgentId?: string,
  ): Promise<void> {
    const directory = workspace.workspaceDirectory ?? workspace.projectRootPath;
    const pr = workspace.githubRuntime?.pullRequest ?? null;

    const context: TemplateContext = {
      workspace: { id: workspace.id, name: workspace.name, directory, kind: workspace.workspaceKind },
      branch: { name: workspace.gitRuntime?.currentBranch ?? null },
      pr: pr ? { number: pr.number ?? null, url: pr.url, title: pr.title, state: pr.state } : null,
      zone: { id: zone.id, title: zone.title },
    };

    const prompt = renderTemplate(trigger.prompt, context);
    const provider = trigger.provider || DEFAULT_PROVIDER;

    const workspaceHandle = paseo.workspaces.ref(workspace.id);

    if (trigger.session.mode === "reuse") {
      if (!reuseAgentId) throw new Error("This zone reuses a session; choose one at drop time.");
      if (trigger.action === "spawn") {
        await workspaceHandle.agents.create({ config: { provider }, parent: reuseAgentId, prompt });
      } else {
        await paseo.agents.ref(reuseAgentId).send(prompt);
      }
      return;
    }

    await workspaceHandle.agents.create({ config: { provider }, prompt });
  }
}
