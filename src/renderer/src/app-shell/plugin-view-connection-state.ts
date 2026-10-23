import { isUnresolvedOwnerHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type { RuntimeEnvironmentStatus } from '../store/slices/runtime-status-types'
import { runtimeHostConnectionStateForEntry } from '../runtime/runtime-host-connection-state'
import type { SshConnectionState } from '../../../shared/ssh-types'

export type PluginViewHostState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'unavailable'
  | 'unknown'

export function pluginViewRuntimeHostState(
  entry: RuntimeEnvironmentStatus | null | undefined
): PluginViewHostState {
  switch (runtimeHostConnectionStateForEntry(entry)) {
    case 'connected':
      return 'connected'
    case 'checking':
    case 'reconnecting':
      return 'connecting'
    case 'runtime-unavailable':
    case 'workspace-window-closed':
      return 'unavailable'
    case 'disconnected':
      return 'disconnected'
  }
}

export function pluginViewSshHostState(
  entry: SshConnectionState | null | undefined
): PluginViewHostState {
  if (!entry) {
    return 'unknown'
  }
  switch (entry.status) {
    case 'connected':
      return 'connected'
    case 'connecting':
    case 'deploying-relay':
    case 'reconnecting':
      return 'connecting'
    case 'disconnected':
    case 'auth-failed':
    case 'reconnection-failed':
    case 'error':
      return 'disconnected'
  }
}

export function pluginViewExecutionHostState(args: {
  executionHostId: string | null | undefined
  runtimeOwnerEnvironmentId?: string | null
  runtimeStatusByEnvironmentId: ReadonlyMap<string, RuntimeEnvironmentStatus>
  sshConnectionStates: ReadonlyMap<string, SshConnectionState>
}): PluginViewHostState {
  if (isUnresolvedOwnerHostId(args.executionHostId)) {
    return 'unknown'
  }
  if (args.runtimeOwnerEnvironmentId) {
    return pluginViewRuntimeHostState(
      args.runtimeStatusByEnvironmentId.get(args.runtimeOwnerEnvironmentId)
    )
  }
  const host = parseExecutionHostId(args.executionHostId)
  if (!host) {
    return 'unknown'
  }
  if (host.kind === 'local') {
    return 'connected'
  }
  if (host.kind === 'runtime') {
    return pluginViewRuntimeHostState(args.runtimeStatusByEnvironmentId.get(host.environmentId))
  }
  return pluginViewSshHostState(args.sshConnectionStates.get(host.targetId))
}
