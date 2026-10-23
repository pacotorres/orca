import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PluginViewSnapshot } from '../../../../shared/plugins/plugin-view-api'
import type { ActiveAgentNotesSendResult } from '@/lib/active-agent-note-send'
import { activityLabel, observedActivityLabel, statusLabel } from './plugin-view-context-labels'

type Props = {
  title: string
  snapshot: PluginViewSnapshot | null
  selectedAgentId: string | null
  open: boolean
  width: number
  onSelectAgent: (agentId: string | null) => void
  onRevealAgent: (agentId: string) => boolean
  canSendAgentMessages: boolean
  onSendAgent: ((agentId: string, prompt: string) => Promise<ActiveAgentNotesSendResult>) | null
  onClose: () => void
}

function hostStateLabel(state: PluginViewSnapshot['activeHostState']): string | null {
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

function updatedLabel(timestamp: number | null, now: number): string | null {
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

function statusMayBeAged(status: string, timestamp: number | null, now: number): boolean {
  return Boolean(
    timestamp &&
    ['working', 'blocked', 'waiting'].includes(status.toLowerCase()) &&
    now - timestamp > 5 * 60_000
  )
}

function sendResultMessage(status: ActiveAgentNotesSendResult['status']): string {
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

export function PluginViewContextSidebar({
  title,
  snapshot,
  selectedAgentId,
  open,
  width,
  onSelectAgent,
  onRevealAgent,
  canSendAgentMessages,
  onSendAgent,
  onClose
}: Props): React.JSX.Element | null {
  const [revealError, setRevealError] = useState(false)
  const [draftByAgent, setDraftByAgent] = useState<{ agentId: string; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [clock, setClock] = useState(0)
  const [sendResult, setSendResult] = useState<{
    agentId: string
    prompt: string
    result: ActiveAgentNotesSendResult
  } | null>(null)
  // Keep relative timestamps and the "no recent signal" hint current while open.
  useEffect(() => {
    if (!open) {
      return
    }
    setClock(Date.now())
    const timer = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [open])
  if (!open) {
    return null
  }
  const selectedAgent = snapshot?.agents.find((agent) => agent.id === selectedAgentId) ?? null
  const draft = selectedAgent && draftByAgent?.agentId === selectedAgent.id ? draftByAgent.text : ''
  const canSendSelectedAgent = Boolean(
    canSendAgentMessages &&
    selectedAgent &&
    !selectedAgent.worker &&
    selectedAgent.status === 'working'
  )
  const uncertainRepeat = Boolean(
    selectedAgent &&
    sendResult?.agentId === selectedAgent.id &&
    sendResult.prompt === draft.trim() &&
    ['unconfirmed', 'partial-submit-failed', 'status-unavailable'].includes(
      sendResult.result.status
    )
  )
  const worktreeName = (id: string): string =>
    snapshot?.worktrees.find((worktree) => worktree.id === id)?.name ?? 'Worktree no disponible'

  return (
    <aside
      aria-label={`Panel contextual de ${title}`}
      data-plugin-context-sidebar="true"
      className="scrollbar-sleek flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground"
      style={{ width: `min(${Math.max(280, width)}px, calc(100vw - 320px))` }}
    >
      <header className="flex h-9 min-h-9 items-center justify-between border-b border-border px-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Contexto de vista
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle ml-2"
          aria-label="Cerrar panel contextual"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-3">
        <section className="mb-5">
          <div className="mb-1 text-xs text-muted-foreground">Proyecto</div>
          <h2 className="truncate text-base font-semibold">
            {snapshot?.project?.name ?? 'Sin proyecto activo'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {snapshot
              ? `${snapshot.worktrees.length} worktrees · ${snapshot.agents.length} agentes y workers`
              : 'Los datos del plugin no están disponibles.'}
          </p>
          {snapshot?.activeHostState ? (
            <p className="mt-2 text-xs" role="status">
              Worktree activo · host {hostStateLabel(snapshot.activeHostState)}
            </p>
          ) : null}
        </section>

        {selectedAgent ? (
          <section
            className="mb-5 rounded-md border border-border bg-background/50 p-3"
            data-selected-agent-id={selectedAgent.id}
          >
            <div className="text-xs text-muted-foreground">Persona seleccionada</div>
            <h3 className="mt-1 truncate text-sm font-semibold">{selectedAgent.name}</h3>
            {selectedAgent.model ? (
              <div className="mt-1 truncate text-xs text-muted-foreground">
                Modelo: {selectedAgent.model}
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span>{selectedAgent.worker ? 'Worker' : 'Agente'}</span>
              <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                {statusLabel(selectedAgent.status)}
              </span>
            </div>
            <div className="mt-3 rounded-md bg-muted/40 px-2.5 py-2 text-xs">
              <div className="font-medium">
                Actividad:{' '}
                {observedActivityLabel(selectedAgent.activity) ??
                  activityLabel(selectedAgent.status, selectedAgent.attention)}
              </div>
              {selectedAgent.attention ? (
                <div className="mt-1 text-status-warning">
                  Orca indica que este agente espera atención.
                </div>
              ) : null}
              {updatedLabel(selectedAgent.statusUpdatedAt, clock) ? (
                <div className="mt-1 text-muted-foreground">
                  {updatedLabel(selectedAgent.statusUpdatedAt, clock)}
                </div>
              ) : null}
              {statusMayBeAged(selectedAgent.status, selectedAgent.statusUpdatedAt, clock) ? (
                <div className="mt-1 text-status-warning">
                  Sin señal de estado reciente; confirma la sesión antes de confiar en este estado.
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-md border border-border px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setRevealError(!onRevealAgent(selectedAgent.id))}
            >
              Abrir sesión en Orca
            </button>
            <section className="mt-4 border-t border-border pt-3" aria-label="Enviar instrucción">
              <label htmlFor="plugin-agent-message" className="block text-xs font-medium">
                Enviar instrucción
              </label>
              {canSendSelectedAgent ? (
                <>
                  <textarea
                    id="plugin-agent-message"
                    value={draft}
                    onChange={(event) =>
                      selectedAgent &&
                      setDraftByAgent({ agentId: selectedAgent.id, text: event.target.value })
                    }
                    maxLength={4096}
                    rows={3}
                    disabled={sending}
                    placeholder={`Mensaje para ${selectedAgent.name}`}
                    className="mt-2 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={sending || !draft.trim() || !onSendAgent || uncertainRepeat}
                    className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      if (!selectedAgent || !onSendAgent || sending || !draft.trim()) {
                        return
                      }
                      setSending(true)
                      setSendResult(null)
                      try {
                        const result = await onSendAgent(selectedAgent.id, draft)
                        setSendResult({
                          agentId: selectedAgent.id,
                          prompt: draft.trim(),
                          result
                        })
                        if (result.status === 'sent') {
                          setDraftByAgent(null)
                        }
                      } catch {
                        setSendResult({
                          agentId: selectedAgent.id,
                          prompt: draft.trim(),
                          result: { status: 'status-unavailable', code: 'runtime-unverifiable' }
                        })
                      } finally {
                        setSending(false)
                      }
                    }}
                  >
                    {sending ? 'Enviando…' : `Enviar a ${selectedAgent.name}`}
                  </button>
                  {sendResult?.agentId === selectedAgent.id ? (
                    <p
                      className={`mt-2 text-xs ${sendResult.result.status === 'sent' ? 'text-status-success' : 'text-destructive'}`}
                      role="status"
                    >
                      {sendResultMessage(sendResult.result.status)}
                    </p>
                  ) : null}
                </>
              ) : !canSendAgentMessages ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  El envío está desactivado. Concede el permiso «Enviar mensajes a agentes» en
                  Ajustes → Plugins.
                </p>
              ) : selectedAgent.worker ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Este worker no tiene una sesión independiente direccionable en Orca.
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Solo se puede enviar a agentes que estén trabajando; el estado actual no permite
                  confirmar un destino seguro.
                </p>
              )}
            </section>
            {revealError ? (
              <p role="status" className="mt-2 text-xs text-destructive">
                La sesión ya no está disponible en este worktree.
              </p>
            ) : null}
            <button
              type="button"
              className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => onSelectAgent(null)}
            >
              Limpiar selección
            </button>
            <dl className="mt-3 space-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Worktree</dt>
                <dd className="mt-0.5 truncate">{worktreeName(selectedAgent.worktreeId)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Contexto</dt>
                <dd className="mt-0.5">
                  {selectedAgent.activeWorktree ? 'Worktree activo' : 'Otro worktree del proyecto'}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Agentes del proyecto</h3>
            <span className="text-[11px] text-muted-foreground">
              {snapshot?.agents.length ?? 0}
            </span>
          </div>
          {snapshot?.agents.length ? (
            <ul className="space-y-1">
              {snapshot.agents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    data-context-agent-id={agent.id}
                    aria-pressed={selectedAgentId === agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent/60 ${selectedAgentId === agent.id ? 'border-ring bg-accent/40' : 'border-transparent'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{agent.name}</span>
                      <span className="mt-0.5 block truncate text-muted-foreground">
                        {worktreeName(agent.worktreeId)} · {agent.worker ? 'worker' : 'agente'}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {agent.attention ? 'Atención' : statusLabel(agent.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              {snapshot?.project
                ? 'Orca todavía no reporta agentes para este proyecto.'
                : 'Abre un worktree para cargar el proyecto.'}
            </p>
          )}
        </section>

        <p className="mt-5 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Solo lectura · Las sesiones y los agentes siguen bajo el control de Orca.
        </p>
      </div>
    </aside>
  )
}
