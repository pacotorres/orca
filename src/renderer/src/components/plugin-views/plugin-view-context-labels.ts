export function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'working':
    case 'running':
    case 'active':
      return 'Trabajando'
    case 'blocked':
      return 'Bloqueado'
    case 'waiting':
      return 'En espera'
    case 'done':
    case 'completed':
      return 'Finalizado'
    case 'error':
    case 'failed':
      return 'Error'
    default:
      return status
  }
}

export function activityLabel(status: string, attention: boolean): string {
  if (attention) {
    return 'Requiere atención'
  }
  switch (status) {
    case 'working':
      return 'En curso'
    case 'waiting':
      return 'Esperando'
    case 'blocked':
      return 'Bloqueado'
    case 'done':
      return 'Completado'
    default:
      return 'Sin actividad reciente'
  }
}

export function observedActivityLabel(activity: string | undefined): string | null {
  switch (activity) {
    case 'reading':
      return 'Leyendo información'
    case 'editing':
      return 'Modificando archivos'
    case 'running':
      return 'Ejecutando un comando'
    case 'other':
      return 'Usando una herramienta'
    default:
      return null
  }
}
