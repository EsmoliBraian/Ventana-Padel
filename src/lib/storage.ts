import { supabase } from '@/lib/supabaseClient'

const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.82
const BUCKET = 'slides'
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`

interface UploadOptions {
  // Para logos: conserva el fondo transparente guardando PNG en vez de JPG.
  keepTransparency?: boolean
  maxDimension?: number
}

async function compressImage(
  file: File,
  options: UploadOptions = {},
): Promise<{ blob: Blob; contentType: string }> {
  const maxDimension = options.maxDimension ?? MAX_DIMENSION
  const outputType = options.keepTransparency ? 'image/png' : 'image/jpeg'
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No canvas context')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, JPEG_QUALITY),
    )
    if (!blob) throw new Error('No se pudo comprimir la imagen')
    return { blob, contentType: outputType }
  } catch {
    // El navegador no pudo decodificar el archivo (formato raro, etc.):
    // subimos el original tal cual en vez de romper la carga.
    return { blob: file, contentType: file.type || 'application/octet-stream' }
  }
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

export async function uploadImage(file: File, options: UploadOptions = {}): Promise<string> {
  const { blob, contentType } = await compressImage(file, options)
  const extension = EXTENSIONS[contentType] ?? file.name.split('.').pop() ?? 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// Borra una imagen del almacenamiento. Ignora todo lo que no este ahi: URLs
// externas pegadas a mano y las imagenes del complejo demo, que estan
// escritas en la propia base (data:...) y no en el almacenamiento.
export async function deleteImage(url: string): Promise<void> {
  if (url.startsWith('data:')) return
  const idx = url.indexOf(PUBLIC_URL_MARKER)
  if (idx === -1) return
  const path = decodeURIComponent(url.slice(idx + PUBLIC_URL_MARKER.length))
  await supabase.storage.from(BUCKET).remove([path])
}
