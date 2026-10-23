import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivePluginView } from '@/store/plugin-panels'
import {
  PLUGIN_VIEW_SNAPSHOT_TYPE,
  pluginViewAgentSelectionSchema,
  pluginViewEventSchema,
  pluginViewQueryRequestSchema,
  pluginViewQueryResultSchema,
  type PluginViewSnapshot,
  type PluginViewQueryRequest,
  type PluginViewQueryResult
} from '../../../../shared/plugins/plugin-view-api'
import {
  PANEL_SHELL_COLOR_SCHEME_PLACEHOLDER,
  PANEL_SHELL_TOKENS_PLACEHOLDER
} from '../../../../shared/plugins/plugin-panel-shell'
import {
  buildPanelDesignTokenCss,
  currentPanelColorScheme
} from '../right-sidebar/plugin-panel-design-token-css'
import { usePluginPanelThemeRevision } from '../right-sidebar/use-plugin-panel-theme-revision'

type Props = {
  view: ActivePluginView
  snapshot: PluginViewSnapshot
  allowed: boolean
  onAgentSelection: (agentId: string | null) => void
  onQuery: (request: PluginViewQueryRequest) => PluginViewQueryResult
}

function fillShell(html: string): string {
  return html
    .replace(PANEL_SHELL_COLOR_SCHEME_PLACEHOLDER, currentPanelColorScheme())
    .replace(PANEL_SHELL_TOKENS_PLACEHOLDER, buildPanelDesignTokenCss())
}

export function PluginMainAreaView({
  view,
  snapshot,
  allowed,
  onAgentSelection,
  onQuery
}: Props): React.JSX.Element {
  const [entryState, setEntryState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [html, setHtml] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadedDocument, setLoadedDocument] = useState<string | null>(null)
  const [frameLoadGeneration, setFrameLoadGeneration] = useState(0)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const lastSnapshotRef = useRef<PluginViewSnapshot | null>(null)
  const eventSequenceRef = useRef(0)
  const queryTimesRef = useRef<number[]>([])
  const queryIdsRef = useRef(new Set<string>())
  const themeRevision = usePluginPanelThemeRevision()
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>): void => {
      const frame = frameRef.current
      if (!frame?.contentWindow || event.source !== frame.contentWindow) {
        return
      }
      const message = pluginViewAgentSelectionSchema.safeParse(event.data)
      if (message.success) {
        const agentId = message.data.agentId
        if (agentId !== null && !snapshot.agents.some((agent) => agent.id === agentId)) {
          return
        }
        onAgentSelection(agentId)
        return
      }
      const query = pluginViewQueryRequestSchema.safeParse(event.data)
      if (!query.success) {
        return
      }
      const now = Date.now()
      queryTimesRef.current = queryTimesRef.current.filter((timestamp) => now - timestamp < 60_000)
      const overLimit =
        queryTimesRef.current.length >= 60 || queryIdsRef.current.has(query.data.requestId)
      const result: PluginViewQueryResult = pluginViewQueryResultSchema.parse(
        overLimit
          ? {
              type: 'orca-plugin-query-result',
              requestId: query.data.requestId,
              query: query.data.query,
              ok: false,
              error: 'rate-limited'
            }
          : onQuery(query.data)
      )
      if (!queryIdsRef.current.has(query.data.requestId)) {
        if (queryIdsRef.current.size >= 256) {
          const oldestRequestId = queryIdsRef.current.values().next().value
          if (oldestRequestId) {
            queryIdsRef.current.delete(oldestRequestId)
          }
        }
        queryIdsRef.current.add(query.data.requestId)
      }
      queryTimesRef.current.push(now)
      frame.contentWindow.postMessage(result, '*')
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [onAgentSelection, onQuery, snapshot.agents])
  useEffect(() => {
    let current = true
    setHtml(null)
    setLoaded(false)
    setLoadedDocument(null)
    setEntryState('loading')
    if (!allowed || !window.api?.plugins?.readViewEntry) {
      setEntryState('error')
      return
    }
    void window.api.plugins
      .readViewEntry({ pluginKey: view.pluginKey, viewId: view.id })
      .then((entry) => {
        if (current) {
          setHtml(entry?.html ?? null)
          setEntryState(entry ? 'ready' : 'error')
        }
      })
      .catch(() => {
        if (current) {
          setHtml(null)
          setEntryState('error')
        }
      })
    return () => {
      current = false
    }
  }, [allowed, view.id, view.pluginKey])

  const document = useMemo(() => (html ? fillShell(html) : null), [html, themeRevision])
  useEffect(() => {
    if (!loaded || !document || loadedDocument !== document) {
      return
    }
    const frameWindow = frameRef.current?.contentWindow
    if (!frameWindow) {
      return
    }
    if (!lastSnapshotRef.current) {
      lastSnapshotRef.current = snapshot
      eventSequenceRef.current = 0
      frameWindow.postMessage({ type: PLUGIN_VIEW_SNAPSHOT_TYPE, snapshot }, '*')
      return
    }
    if (lastSnapshotRef.current === snapshot) {
      return
    }
    const sequence = eventSequenceRef.current + 1
    const event = pluginViewEventSchema.parse({
      type: 'orca-plugin-view-event',
      event: 'snapshot.updated',
      sequence,
      revision: snapshot.revision,
      snapshot
    })
    frameWindow.postMessage(event, '*')
    eventSequenceRef.current = sequence
    lastSnapshotRef.current = snapshot
  }, [document, frameLoadGeneration, loaded, loadedDocument, snapshot])

  // Keep plugin views informed that Orca's host-to-view bridge is alive even
  // when the project snapshot itself has not changed. This is a transport
  // heartbeat only; it makes no claim about an agent's activity freshness.
  useEffect(() => {
    if (!loaded || !document || loadedDocument !== document) {
      return
    }
    const heartbeat = (): void => {
      frameRef.current?.contentWindow?.postMessage(
        { type: 'orca-plugin-view-heartbeat', sentAt: Date.now() },
        '*'
      )
    }
    heartbeat()
    const interval = window.setInterval(heartbeat, 10_000)
    return () => window.clearInterval(interval)
  }, [document, loaded, loadedDocument])

  if (!allowed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        This view needs read-only project, worktree, and agent permissions in plugin consent.
      </div>
    )
  }
  if (!document) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {entryState === 'error' ? `${view.title} could not be loaded.` : `Loading ${view.title}…`}
      </div>
    )
  }
  return (
    <iframe
      ref={frameRef}
      data-orca-plugin-main-view="active"
      key={`${view.pluginKey}:${view.id}:${themeRevision}`}
      title={view.title}
      sandbox="allow-scripts"
      srcDoc={document}
      onLoad={() => {
        lastSnapshotRef.current = null
        eventSequenceRef.current = 0
        setLoadedDocument(document)
        setLoaded(true)
        setFrameLoadGeneration((generation) => generation + 1)
      }}
      className="h-full w-full flex-1 border-0 bg-background"
    />
  )
}
