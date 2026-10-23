import { z } from 'zod'

/** Read-only host-to-view snapshot protocol. Never carries paths, prompts,
 * transcripts, terminal handles, or provider credentials. */
export const PLUGIN_VIEW_SNAPSHOT_TYPE = 'orca-project-snapshot'
export const PLUGIN_VIEW_AGENT_SELECTION_TYPE = 'orca-plugin-agent-selection'
export const PLUGIN_VIEW_QUERY_REQUEST_TYPE = 'orca-plugin-query'
export const PLUGIN_VIEW_QUERY_RESULT_TYPE = 'orca-plugin-query-result'
export const PLUGIN_VIEW_EVENT_TYPE = 'orca-plugin-view-event'

export const pluginViewActivitySchema = z.enum(['reading', 'editing', 'running', 'other'])

export const pluginViewWorktreeSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().max(512),
    active: z.boolean(),
    hostState: z
      .enum(['connected', 'connecting', 'disconnected', 'unavailable', 'unknown'])
      .optional()
  })
  .strict()

export const pluginViewAgentSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(512),
    status: z.enum(['working', 'blocked', 'waiting', 'done', 'idle']),
    worktreeId: z.string().min(1).max(128),
    activeWorktree: z.boolean(),
    worker: z.boolean(),
    parentAgentId: z.string().min(1).max(128).optional(),
    attention: z.boolean(),
    statusUpdatedAt: z.number().finite().nonnegative().nullable(),
    model: z.string().min(1).max(120).optional(),
    activity: pluginViewActivitySchema.optional()
  })
  .strict()

export const pluginViewProjectSchema = z
  .object({ id: z.literal('project:active'), name: z.string().min(1).max(512) })
  .strict()

export const pluginViewQueryRequestSchema = z.union([
  z
    .object({
      type: z.literal(PLUGIN_VIEW_QUERY_REQUEST_TYPE),
      requestId: z.string().min(1).max(128),
      query: z.literal('projects.getActive')
    })
    .strict(),
  z
    .object({
      type: z.literal(PLUGIN_VIEW_QUERY_REQUEST_TYPE),
      requestId: z.string().min(1).max(128),
      query: z.enum(['worktrees.list', 'agents.snapshot']),
      projectId: z.literal('project:active')
    })
    .strict()
])

export const pluginViewQueryResultSchema = z.union([
  z
    .object({
      type: z.literal(PLUGIN_VIEW_QUERY_RESULT_TYPE),
      requestId: z.string().min(1).max(128),
      query: z.literal('projects.getActive'),
      ok: z.literal(true),
      data: pluginViewProjectSchema.nullable()
    })
    .strict(),
  z
    .object({
      type: z.literal(PLUGIN_VIEW_QUERY_RESULT_TYPE),
      requestId: z.string().min(1).max(128),
      query: z.literal('worktrees.list'),
      ok: z.literal(true),
      data: z.array(pluginViewWorktreeSchema).max(1000)
    })
    .strict(),
  z
    .object({
      type: z.literal(PLUGIN_VIEW_QUERY_RESULT_TYPE),
      requestId: z.string().min(1).max(128),
      query: z.literal('agents.snapshot'),
      ok: z.literal(true),
      data: z.array(pluginViewAgentSchema).max(5000)
    })
    .strict(),
  z
    .object({
      type: z.literal(PLUGIN_VIEW_QUERY_RESULT_TYPE),
      requestId: z.string().min(1).max(128),
      query: z.enum(['projects.getActive', 'worktrees.list', 'agents.snapshot']),
      ok: z.literal(false),
      error: z.enum(['permission-denied', 'project-unavailable', 'rate-limited'])
    })
    .strict()
])

export const pluginViewSnapshotSchema = z
  .object({
    revision: z.number().finite().nonnegative(),
    selectedAgentId: z.string().min(1).max(128).nullable(),
    project: z
      .object({ id: z.literal('project:active'), name: z.string().min(1).max(512) })
      .strict()
      .nullable(),
    activeWorktreeId: z.string().max(128).nullable(),
    activeHostState: z
      .enum(['connected', 'connecting', 'disconnected', 'unavailable', 'unknown'])
      .optional(),
    worktrees: z.array(pluginViewWorktreeSchema).max(1000),
    agents: z.array(pluginViewAgentSchema).max(5000)
  })
  .strict()

/** Full replacement event: consumers can reconcile without depending on a
 *  replayable event log or receiving a partial view after reconnect. */
export const pluginViewEventSchema = z
  .object({
    type: z.literal(PLUGIN_VIEW_EVENT_TYPE),
    event: z.literal('snapshot.updated'),
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    revision: z.number().finite().nonnegative(),
    snapshot: pluginViewSnapshotSchema
  })
  .strict()
  .refine((event) => event.revision === event.snapshot.revision, {
    message: 'Event revision must match its complete snapshot'
  })

/** View-to-host request to select or clear one agent in the contextual host UI. */
export const pluginViewAgentSelectionSchema = z
  .object({
    type: z.literal(PLUGIN_VIEW_AGENT_SELECTION_TYPE),
    agentId: z.string().min(1).max(128).nullable()
  })
  .strict()

export type PluginViewAgentSelection = z.infer<typeof pluginViewAgentSelectionSchema>

export type PluginViewSnapshot = z.infer<typeof pluginViewSnapshotSchema>
export type PluginViewAgent = z.infer<typeof pluginViewAgentSchema>
export type PluginViewEvent = z.infer<typeof pluginViewEventSchema>
export type PluginViewQueryRequest = z.infer<typeof pluginViewQueryRequestSchema>
export type PluginViewQueryResult = z.infer<typeof pluginViewQueryResultSchema>
