import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'

export type WhatsappMediaUpload = {
  url: string
  filename: string
  mime: string
  size: number
  kind: 'image' | 'video' | 'document'
}

export function useUploadWhatsappMedia() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.upload<WhatsappMediaUpload>(withProject('/api/assets/whatsapp-media'), form)
    },
    onError: (err: Error) => toast.error(err.message ?? 'Upload failed'),
  })
}
