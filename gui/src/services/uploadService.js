import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 60000,
})

export const uploadGameBuild = async (files) => {
  const formData = new FormData()
  Object.entries(files).forEach(([key, file]) => {
    if (file) {
      formData.append(key, file)
    }
  })

  const response = await apiClient.post('/api/upload', formData)
  return response.data
}
