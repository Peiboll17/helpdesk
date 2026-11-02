'use client'

// Base de Conocimiento / FAQ: alimenta la deflexión del formulario
// y el copiloto del agente. Editor completo con vista previa de búsqueda.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, Plus, Pencil, Trash2, Eye, Search, Info } from 'lucide-react'
import { api, type KBArticleDTO, type KBSearchResult } from '@/lib/client-types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { timeAgo } from '@/lib/constants'

interface ArticleForm {
  id?: string
  title: string
  content: string
  tags: string
  keywords: string
}

const EMPTY: ArticleForm = { title: '', content: '', tags: '', keywords: '' }

export default function KnowledgeView() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [form, setForm] = useState<ArticleForm | null>(null)
  const [preview, setPreview] = useState<KBArticleDTO | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['kb', debounced],
    queryFn: () => api.get<{ mode: string; results: KBSearchResult[] }>(`/api/kb?q=${encodeURIComponent(debounced)}`),
  })

  const save = useMutation({
    mutationFn: (f: ArticleForm) =>
      f.id ? api.patch(`/api/kb/${f.id}`, f) : api.post('/api/kb', f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      setForm(null)
      toast.success('Artículo guardado: ya está disponible para deflexión y copiloto')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/kb/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      toast.success('Artículo eliminado')
    },
  })

  const markUseful = useMutation({
    mutationFn: (id: string) => api.patch(`/api/kb/${id}`, { deflect: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb'] }),
  })

  const results = data?.results ?? []

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Base de Conocimiento
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Los artículos alimentan la <strong>deflexión</strong> del formulario y el <strong>copiloto IA</strong>.
          </p>
        </div>
        <Button size="sm" onClick={() => setForm(EMPTY)}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo artículo
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
          <Info className="h-3 w-3" /> Prueba la búsqueda semántica que verá tu cliente mientras escribe:
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Ej.: "cómo cambiar mi contraseña" o "error en el pago"'
            className="pl-8"
            aria-label="Probar búsqueda de la base de conocimiento"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
                <div className="h-3 w-full bg-muted animate-pulse rounded" />
                <div className="h-3 w-5/6 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Sin resultados para esa búsqueda. Crea un artículo que la cubra 😉
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map(({ article, score }) => (
            <Card key={article.id} className="flex flex-col">
              <CardContent className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug">{article.title}</h3>
                  {debounced && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {(score * 100).toFixed(0)}% match
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3 flex-1">{article.content}</p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {article.tags
                    .split(',')
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((tag) => (
                      <span key={tag} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                        {tag}
                      </span>
                    ))}
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Eye className="h-3 w-3" /> {article.views} · {timeAgo(article.updatedAt)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 border-t pt-2.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPreview(article)}>
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() =>
                      setForm({
                        id: article.id,
                        title: article.title,
                        content: article.content,
                        tags: article.tags,
                        keywords: article.keywords,
                      })
                    }
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    title="Registrar que este artículo resolvió una duda (deflexión)"
                    onClick={() => markUseful.mutate(article.id)}
                  >
                    👍 Deflexión
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-700 ml-auto"
                    onClick={() => {
                      if (confirm(`¿Eliminar "${article.title}"?`)) remove.mutate(article.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor */}
      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar artículo' : 'Nuevo artículo de ayuda'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="kb-title">Título</Label>
                <Input
                  id="kb-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Cómo cambiar tu contraseña"
                />
              </div>
              <div>
                <Label htmlFor="kb-content">Contenido</Label>
                <Textarea
                  id="kb-content"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={8}
                  placeholder="Pasos claros y numerados para resolver la duda…"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="kb-tags">Etiquetas (separadas por comas)</Label>
                  <Input
                    id="kb-tags"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="cuenta, contrasena"
                  />
                </div>
                <div>
                  <Label htmlFor="kb-keywords">Sinónimos extra para la búsqueda</Label>
                  <Input
                    id="kb-keywords"
                    value={form.keywords}
                    onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                    placeholder="password, clave, resetear"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => form && save.mutate(form)}
              disabled={!form?.title?.trim() || !form?.content?.trim() || save.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vista previa */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{preview?.content}</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
