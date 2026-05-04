import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'

export type WidgetTriggerType = 'exit_intent' | 'time_on_page' | 'scroll_depth' | 'manual'

export type OptinWidget = {
  id: string
  projectId: string
  name: string
  headline: string
  body: string | null
  buttonLabel: string
  consentText: string
  triggerType: WidgetTriggerType
  triggerConfig: Record<string, unknown>
  targetPages: string[]
  showOnce: boolean
  collectEmail: boolean
  collectName: boolean
  phoneRequired: boolean
  preCheckConsent: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type WidgetInput = Omit<OptinWidget, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>

export function useOptinWidgets() {
  return useQuery({
    queryKey: ['optin-widgets'],
    queryFn: () => api.get<OptinWidget[]>(withProject('/api/optin-widgets')),
  })
}

export function useCreateOptinWidget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<WidgetInput>) =>
      api.post<OptinWidget>(withProject('/api/optin-widgets'), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optin-widgets'] })
      toast.success('Widget created')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to create widget'),
  })
}

export function useUpdateOptinWidget(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<WidgetInput>) =>
      api.patch<OptinWidget>(withProject(`/api/optin-widgets/${id}`), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optin-widgets'] })
      toast.success('Widget saved')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to save widget'),
  })
}

export function useDeleteOptinWidget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(withProject(`/api/optin-widgets/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optin-widgets'] })
      toast.success('Widget deleted')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to delete widget'),
  })
}
