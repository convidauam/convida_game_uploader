const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const drainSseBuffer = (buffer, onPayload) => {
  const events = buffer.split('\n\n')
  const remainder = events.pop() || ''

  events.forEach((event) => {
    const dataLines = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')

    if (!dataLines) return
    try {
      const payload = JSON.parse(dataLines)
      onPayload?.(payload)
    } catch (error) {
      // Ignore malformed chunks.
    }
  })

  return remainder
}

export const uploadGameBuild = async (files, { onProgress } = {}) => {
  const formData = new FormData()
  Object.entries(files).forEach(([key, file]) => {
    if (file) {
      formData.append(key, file)
    }
  })

  let result = null
  let streamError = null

  const handlePayload = (payload) => {
    onProgress?.(payload)
    if (payload?.result) {
      result = payload.result
    }
    if (payload?.error) {
      streamError = payload.error
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/upload/`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: formData,
  })

  if (!response.ok) {
    let detail = 'No se pudo subir el juego.'
    try {
      const data = await response.json()
      detail = data?.detail || detail
    } catch (error) {
      // Ignore JSON parse errors.
    }
    throw new Error(detail)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No se pudo leer el stream de progreso.')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer = drainSseBuffer(buffer + decoder.decode(value, { stream: true }), handlePayload)
  }

  if (streamError) {
    throw new Error(streamError)
  }

  return result || { message: 'Archivos subidos correctamente.' }
}
