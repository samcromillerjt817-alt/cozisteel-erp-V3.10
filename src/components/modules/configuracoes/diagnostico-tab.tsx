'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/platform/page-header'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import type { SystemDiagnostics } from './types'

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1
  do {
    value /= 1024
    unitIndex++
  } while (value >= 1024 && unitIndex < units.length - 1)
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

function formatUptime(ms: number): string {
  if (!ms) return '-'
  const seconds = Math.floor((Date.now() - ms) / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}min`
  return `${minutes}min`
}

/**
 * Aba "Diagnóstico" de Configurações (ADR-021, Subetapa 2) — saúde do sistema: tamanho do banco,
 * espaço em disco, status do PM2, e alerta de patch preso (achado 2.2.1 do levantamento). Puro
 * diagnóstico — nenhuma correção acontece aqui, isso fica na aba "Correções".
 */
export function DiagnosticoTab() {
  const [data, setData] = useState<SystemDiagnostics | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/system/diagnostics')
      if (r.ok) setData(await r.json())
      else toast.error('Erro ao carregar diagnóstico')
    } catch {
      toast.error('Erro ao carregar diagnóstico')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnóstico do Sistema"
        description="Saúde do banco de dados, disco, processo PM2 e detecção de atualizações presas."
      />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <>
          {data?.stuckPatch.stuck && (
            <Card className="border-destructive">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-destructive">Atualização travada detectada</p>
                  <p className="text-sm text-muted-foreground">
                    Estado &quot;{data.stuckPatch.state}&quot; há {data.stuckPatch.ageMinutes} min, sem processo
                    correspondente rodando{data.stuckPatch.pid ? ` (PID ${data.stuckPatch.pid})` : ''}. Corrija na
                    aba <strong>Correções</strong>.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Banco de Dados</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatBytes(data?.databaseSizeBytes ?? null)}</p></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Disco (uso)</CardTitle></CardHeader>
              <CardContent>
                {data?.diskSpace ? (
                  <>
                    <p className="text-2xl font-bold">{data.diskSpace.usedPercent}%</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatBytes(data.diskSpace.usedBytes)} de {formatBytes(data.diskSpace.totalBytes)}
                    </p>
                  </>
                ) : <p className="text-muted-foreground text-sm">Indisponível</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Atualização (patch)</CardTitle></CardHeader>
              <CardContent>
                <Badge variant={data?.stuckPatch.stuck ? 'destructive' : 'outline'}>
                  {data?.stuckPatch.stuck ? 'Travada' : 'OK'}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Processos PM2</CardTitle></CardHeader>
            <CardContent>
              {data?.pm2 && data.pm2.length > 0 ? (
                <div className="space-y-3">
                  {data.pm2.map((p) => (
                    <div key={p.name} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm border-b last:border-0 pb-3 last:pb-0">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant={p.status === 'online' ? 'outline' : 'destructive'}>{p.status}</Badge>
                      <span className="text-muted-foreground">PID {p.pid}</span>
                      <span className="text-muted-foreground">Uptime: {formatUptime(p.uptimeMs)}</span>
                      <span className="text-muted-foreground">Reinícios: {p.restarts}</span>
                      <span className="text-muted-foreground">Memória: {formatBytes(p.memoryBytes)}</span>
                      <span className="text-muted-foreground">CPU: {p.cpuPercent}%</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-muted-foreground text-sm">Indisponível</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
