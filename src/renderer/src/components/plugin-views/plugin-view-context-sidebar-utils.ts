import type { PluginViewSnapshot } from '../../../../shared/plugins/plugin-view-api'
import type { ActiveAgentNotesSendResult } from '@/lib/active-agent-note-send'

export function hostStateLabel(state: PluginViewSnapshot['activeHostState']): string | null {
  switch (state) {
    case 'connected':
      return 'Conectado'
    case 'connecting':
      return 'Conectando'
    case 'disconnected':
      return 'Desconectado'
    case 'unavailable':
      return 'Orca no disponible'
    case 'unknown':
      return 'Sin verificar'
    default:
      return null
  }
}

export function updatedLabel(timestamp: number | null, now: number): string | null {
  if (!timestamp || now === 0) {
    return null
  }
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (minutes < 1) {
    return 'Actualizado hace menos de un minuto'
  }
  if (minutes < 60) {
    return `Actualizado hace ${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `Actualizado hace ${hours} h`
  }
  return `Actualizado hace ${Math.floor(hours / 24)} d`
}

export function statusMayBeAged(status: string, timestamp: number | null, now: number): boolean {
  return Boolean(
    timestamp &&
    ['working', 'blocked', 'waiting'].includes(status.toLowerCase()) &&
    now - timestamp > 5 * 60_000
  )
}

export function sendResultMessage(status: ActiveAgentNotesSendResult['status']): string {
  switch (status) {
    case 'sent':
      return 'Orca confirmó el envío.'
    case 'unconfirmed':
      return 'No se pudo confirmar si llegó. Revisa la sesión; Orca bloquea el reenvío del mismo texto.'
    case 'partial-submit-failed':
      return 'El texto pudo quedar pegado en la sesión. Revísala; Orca bloquea el reenvío del mismo texto.'
    case 'status-unavailable':
      return 'No se pudo verificar la sesión. Revísala; Orca bloquea el reenvío del mismo texto.'
    case 'no-active-terminal':
      return 'La sesión ya no está disponible en este worktree.'
    case 'permission':
      return 'Orca bloqueó el envío por permisos o porque el agente requiere atención.'
    case 'not-ready':
      return 'La sesión ya no está lista para recibir instrucciones.'
    case 'not-writable':
      return 'Esta sesión no admite mensajes en este momento.'
    case 'empty':
    case 'no-agent':
      return 'Orca no encontró una sesión de agente que corresponda a este destino.'
  }
}
