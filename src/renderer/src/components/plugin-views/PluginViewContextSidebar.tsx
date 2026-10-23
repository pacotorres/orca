import { lazy, Suspense, useEffect, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import type { PluginViewSnapshot } from '../../../../shared/plugins/plugin-view-api'
import type { ActiveAgentNotesSendResult } from '@/lib/active-agent-note-send'
import { useAppStore } from '@/store'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import {
  RIGHT_SIDEBAR_MIN_WIDTH,
  clampRightSidebarPanelWidth,
  computeMaxRightSidebarPanelWidth
} from '@/components/right-sidebar/right-sidebar-width'
import { useWindowWidth } from '@/components/right-sidebar/use-window-width'
import type {
  PluginViewChatSession,
  PluginViewWorkerParents
} from '@/app-shell/plugin-view-chat-sessions'
import { activityLabel, observedActivityLabel, statusLabel } from './plugin-view-context-labels'
import {
  hostStateLabel,
  sendResultMessage,
  statusMayBeAged,
  updatedLabel
} from './plugin-view-context-sidebar-utils'

const NativeChatView = lazy(() => import('../native-chat/NativeChatView'))

type Props = {
  title: string
  snapshot: PluginViewSnapshot | null
  selectedAgentId: string | null
  open: boolean
  width: number
  sessions?: PluginViewChatSession[]
  workerParents?: PluginViewWorkerParents
  onSelectAgent: (agentId: string | null) => void
  onRevealAgent: (agentId: string) => boolean
  canSendAgentMessages: boolean
  onSendAgent: ((agentId: string, prompt: string) => Promise<ActiveAgentNotesSendResult>) | null
  onClose: () => void
}

const EMPTY_SESSIONS: PluginViewChatSession[] = []
const EMPTY_WORKER_PARENTS: PluginViewWorkerParents = {}

export function PluginViewContextSidebar({
  title,
  snapshot,
  selectedAgentId,
  open,
  width,
  sessions = EMPTY_SESSIONS,
  workerParents = EMPTY_WORKER_PARENTS,
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
  const setRightSidebarWidth = useAppStore((state) => state.setRightSidebarWidth)
  const windowWidth = useWindowWidth()
  const maxWidth = computeMaxRightSidebarPanelWidth(windowWidth, 0)
  const renderedWidth = clampRightSidebarPanelWidth(width, windowWidth, 0)
  const { containerRef, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: open,
    width: renderedWidth,
    minWidth: RIGHT_SIDEBAR_MIN_WIDTH,
    maxWidth,
    deltaSign: -1,
    setWidth: setRightSidebarWidth
  })

  useEffect(() => {
    if (!open) {
      return
    }
    setClock(Date.now())
    const timer = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [open])

  const selectedAgent = snapshot?.agents.find((agent) => agent.id === selectedAgentId) ?? null
  const selectedSession = sessions.find((session) => session.agentId === selectedAgentId) ?? null
  const parentAgentId = selectedAgent ? workerParents[selectedAgent.id] : undefined
  const parentAgent = parentAgentId
    ? (snapshot?.agents.find((agent) => agent.id === parentAgentId) ?? null)
    : null
  const draft = selectedAgent && draftByAgent?.agentId === selectedAgent.id ? draftByAgent.text : ''
  const canSendSelectedAgent = Boolean(
    canSendAgentMessages &&
    selectedAgent &&
    !selectedAgent.worker &&
    selectedAgent.status === 'working' &&
    !selectedSession
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
  const chooseAgent = (agentId: string | null): void => {
    setRevealError(false)
    onSelectAgent(agentId)
  }

  return (
    <aside
      ref={containerRef}
      aria-label={`Panel contextual de ${title}`}
      data-plugin-context-sidebar="true"
      aria-hidden={!open}
      hidden={!open}
      className="scrollbar-sleek relative flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground"
      style={{ width: open ? `${renderedWidth}px` : '0px' }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-9 min-h-9 items-center justify-between border-b border-border px-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Oficina · Chat de Orca
            </span>
          </div>
          <button
            type="button"
            className="sidebar-toggle ml-2"
            aria-label="Cerrar chat; la sesión seguirá activa"
            title="Cerrar chat (la sesión sigue activa)"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>

        <section className="shrink-0 border-b border-border px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Proyecto</div>
              <h2 className="truncate text-sm font-semibold">
                {snapshot?.project?.name ?? 'Sin proyecto activo'}
              </h2>
            </div>
            <span className="shrink-0 pt-4 text-xs text-muted-foreground">
              {snapshot ? `${snapshot.worktrees.length} worktrees` : 'Sin datos'}
            </span>
          </div>
          {snapshot?.activeHostState ? (
            <p className="mt-1 text-xs text-muted-foreground" role="status">
              Contexto activo · host {hostStateLabel(snapshot.activeHostState)}
            </p>
          ) : null}
        </section>

        {selectedAgent ? (
          <section className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {selectedAgent.name}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedAgent.model ? `Modelo: ${selectedAgent.model} · ` : ''}
                  {worktreeName(selectedAgent.worktreeId)}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground">
                {statusLabel(selectedAgent.status)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Actividad:{' '}
                {observedActivityLabel(selectedAgent.activity) ??
                  activityLabel(selectedAgent.status, selectedAgent.attention)}
              </span>
              {selectedAgent.attention ? (
                <span className="text-status-warning">· Atención</span>
              ) : null}
              {updatedLabel(selectedAgent.statusUpdatedAt, clock) ? (
                <span className="truncate">
                  · {updatedLabel(selectedAgent.statusUpdatedAt, clock)}
                </span>
              ) : null}
            </div>
            {statusMayBeAged(selectedAgent.status, selectedAgent.statusUpdatedAt, clock) ? (
              <p className="text-xs text-status-warning">
                Sin señal de estado reciente; confirma el estado en la sesión.
              </p>
            ) : null}
            {sessions.length > 0 ? (
              <label className="block">
                <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sesiones abiertas del proyecto
                </span>
                <select
                  aria-label="Cambiar sesión de agente"
                  value={selectedSession?.agentId ?? ''}
                  onChange={(event) => chooseAgent(event.target.value || null)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="" disabled>
                    El agente seleccionado no tiene chat nativo
                  </option>
                  {sessions.map((session) => (
                    <option key={session.agentId} value={session.agentId}>
                      {session.sessionLabel} · {session.worktreeName} ·{' '}
                      {statusLabel(session.status)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {selectedSession ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setRevealError(!onRevealAgent(selectedAgent.id))}
              >
                Abrir esta sesión en la vista tradicional
              </button>
            ) : null}
            {revealError ? (
              <p role="status" className="text-xs text-destructive">
                La sesión ya no está disponible en este worktree.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selectedSession ? (
            <Suspense
              fallback={
                <div className="p-3 text-xs text-muted-foreground" role="status">
                  Cargando conversación…
                </div>
              }
            >
              <NativeChatView
                key={selectedSession.agentId}
                terminalTabId={selectedSession.tabId}
                paneKey={selectedSession.paneKey}
                targetPtyId={selectedSession.ptyId}
                launchAgent={selectedSession.agent}
                isVisible={open}
                isFocusedGroup
                ownsTabWideLaunchDraft={false}
                onSwitchToTerminal={() => {
                  onRevealAgent(selectedSession.agentId)
                }}
              />
            </Suspense>
          ) : selectedAgent?.worker ? (
            <div className="m-3 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Este worker no tiene un chat independiente.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Orca lo vincula con la conversación de su agente principal.
              </p>
              {parentAgentId ? (
                <button
                  type="button"
                  className="mt-3 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => chooseAgent(parentAgentId)}
                >
                  Abrir conversación de {parentAgent?.name ?? 'agente principal'}
                </button>
              ) : null}
            </div>
          ) : selectedAgent ? (
            <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-3">
              <button
                type="button"
                className="mb-3 w-full rounded-md border border-border px-2.5 py-2 text-left text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setRevealError(!onRevealAgent(selectedAgent.id))}
              >
                Abrir sesión en Orca
              </button>
              <section aria-label="Enviar instrucción">
                <label htmlFor="plugin-agent-message" className="block text-xs font-medium">
                  Enviar instrucción
                </label>
                {canSendSelectedAgent ? (
                  <>
                    <textarea
                      id="plugin-agent-message"
                      value={draft}
                      onChange={(event) =>
                        setDraftByAgent({ agentId: selectedAgent.id, text: event.target.value })
                      }
                      maxLength={4096}
                      rows={3}
                      disabled={sending}
                      placeholder={`Mensaje para ${selectedAgent.name}`}
                      className="mt-2 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
                          setSendResult({ agentId: selectedAgent.id, prompt: draft.trim(), result })
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
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Este agente no tiene una sesión de chat compatible disponible. Puedes abrir su
                    sesión en la vista tradicional.
                  </p>
                )}
              </section>
            </div>
          ) : (
            <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-3">
              <h2 className="text-sm font-semibold">Equipo del proyecto</h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                Selecciona una persona en la oficina o abre una sesión existente.
              </p>
              {snapshot?.agents.length ? (
                <ul className="space-y-1">
                  {snapshot.agents.map((agent) => (
                    <li key={agent.id}>
                      <button
                        type="button"
                        data-context-agent-id={agent.id}
                        onClick={() => chooseAgent(agent.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{agent.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {worktreeName(agent.worktreeId)} · {agent.worker ? 'worker' : 'agente'}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
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
              <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
                Las sesiones siguen ejecutándose bajo el control de Orca.
              </p>
            </div>
          )}
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Cambiar ancho del panel de chat"
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-ring/20 active:bg-ring/30"
        onMouseDown={onResizeStart}
      />
    </aside>
  )
}
