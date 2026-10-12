import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const TeammateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().optional(),
  description: z.string().optional(),
  provider: z.string().optional(),
  boardId: z.string().optional(),
  boardName: z.string().optional(),
  heartbeatCron: z.string().optional(),
  persona: z.string().optional(),
  createdAt: z.string(),
  memoryPath: z.string(),
});
export type Teammate = z.infer<typeof TeammateSchema>;

export const BoardSummarySchema = z.object({ id: z.string().min(1), name: z.string().min(1) });
export type BoardSummary = z.infer<typeof BoardSummarySchema>;

export const teammateListRpc = defineRpc({
  name: "teammate.list",
  input: z.object({}).strict(),
  output: z.object({ teammates: z.array(TeammateSchema) }),
});

export const teammateCreateRpc = defineRpc({
  name: "teammate.create",
  input: z
    .object({
      name: z.string().min(1),
      description: z.string().optional(),
      provider: z.string().optional(),
      boardId: z.string().optional(),
      boardName: z.string().optional(),
      heartbeatCron: z.string().optional(),
      persona: z.string().optional(),
      emoji: z.string().optional(),
    })
    .strict(),
  output: z.object({ teammate: TeammateSchema }),
});

export const teammateRenameRpc = defineRpc({
  name: "teammate.rename",
  input: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      boardId: z.string().optional(),
      boardName: z.string().optional(),
      heartbeatCron: z.string().optional(),
      persona: z.string().optional(),
      emoji: z.string().optional(),
    })
    .strict(),
  output: z.object({ teammate: TeammateSchema }),
});

export const teammateBoardsRpc = defineRpc({
  name: "teammate.boards",
  input: z.object({}).strict(),
  output: z.object({ boards: z.array(BoardSummarySchema) }),
});

export const teammateDeleteRpc = defineRpc({
  name: "teammate.delete",
  input: z.object({ id: z.string().min(1) }).strict(),
  output: z.object({ ok: z.boolean() }),
});

export const teammateStartRpc = defineRpc({
  name: "teammate.start",
  input: z.object({ id: z.string().min(1), workspaceId: z.string().optional() }).strict(),
  output: z.object({ agentId: z.string() }),
});
