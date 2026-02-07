import { useMemo, useRef, useState } from 'react'
import './App.css'
import Icon from '@mdi/react';
import { mdiDataMatrix, mdiCube, mdiReload, mdiUnity, mdiLanguageHtml5, mdiTrashCanOutline } from '@mdi/js';
import logo from './assets/logo.png';
import { uploadGameBuild } from './services/uploadService'


const getFilePath = (file) => file.webkitRelativePath || file.name
const getFileKey = (file) => `${getFilePath(file)}-${file.size}`

const REQUIRED_FILES = [
  {
    id: 'data',
    label: 'Build/data',
    group: 'build',
    match: (file) =>
      /\.data(\.(gz|br|unityweb))?$/i.test(getFilePath(file)),
  },
  {
    id: 'framework',
    label: 'Build/framework',
    group: 'build',
    match: (file) =>
      /\.framework(\.js)?(\.(gz|br|unityweb))?$/i.test(getFilePath(file)),
  },
  {
    id: 'loader',
    label: 'Build/loader',
    group: 'build',
    match: (file) =>
      /\.loader(\.js)?(\.(gz|br|unityweb))?$/i.test(getFilePath(file)),
  },
  {
    id: 'wasm',
    label: 'Build/wasm',
    group: 'build',
    match: (file) =>
      /\.wasm(\.(gz|br|unityweb))?$/i.test(getFilePath(file)),
  },
  {
    id: 'html',
    label: 'index.html',
    group: 'root',
    match: (file) => getFilePath(file).toLowerCase().endsWith('index.html'),
  },
]

const FILE_ICONS = {
  data: mdiDataMatrix,
  framework: mdiCube,
  loader: mdiReload,
  wasm: mdiUnity,
  html: mdiLanguageHtml5,
}

function App() {
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState(1)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadResult, setUploadResult] = useState('')
  const [progress, setProgress] = useState({
    current: 0,
    total: 5,
    label: '',
  })
  const htmlInputRef = useRef(null)

  const summary = useMemo(() => {
    const results = REQUIRED_FILES.map((item) => {
      const found = files.find((file) => item.match(file))
      return { ...item, found }
    })
    const missing = results.filter((item) => !item.found)
    return { results, missing }
  }, [files])

  const extraFiles = files.filter(
    (file) => !summary.results.some((item) => item.match(file))
  )
  const canUpload = files.length > 0 && summary.missing.length === 0

  const mergeFiles = (incoming) => {
    if (!incoming?.length) return
    setFiles((prev) => {
      const map = new Map()
      ;[...prev, ...incoming].forEach((file) => {
        const key = getFileKey(file)
        map.set(key, file)
      })
      return Array.from(map.values())
    })
    setStep(2)
    setUploadError('')
    setUploadResult('')
    setProgress({ current: 0, total: 5, label: '' })
  }

  const collectFilesFromDirectory = async (dirHandle, prefix = '') => {
    const collected = []
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile()
        const relativePath = `${prefix}${entry.name}`
        try {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: relativePath,
          })
        } catch (error) {
          // Ignore if the property can't be defined.
        }
        collected.push(file)
      } else if (entry.kind === 'directory') {
        const nested = await collectFilesFromDirectory(
          entry,
          `${prefix}${entry.name}/`
        )
        collected.push(...nested)
      }
    }
    return collected
  }

  const readAllEntries = (reader) =>
    new Promise((resolve, reject) => {
      const entries = []
      const readBatch = () => {
        reader.readEntries(
          (batch) => {
            if (!batch.length) {
              resolve(entries)
              return
            }
            entries.push(...batch)
            readBatch()
          },
          (error) => reject(error)
        )
      }
      readBatch()
    })

  const collectFilesFromEntry = async (entry, prefix = '') => {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) =>
        entry.file(resolve, reject)
      )
      const relativePath = `${prefix}${entry.name}`
      try {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relativePath,
        })
      } catch (error) {
        // Ignore if the property can't be defined.
      }
      return [file]
    }

    if (entry.isDirectory) {
      const reader = entry.createReader()
      const entries = await readAllEntries(reader)
      const nested = await Promise.all(
        entries.map((child) =>
          collectFilesFromEntry(child, `${prefix}${entry.name}/`)
        )
      )
      return nested.flat()
    }

    return []
  }

  const handlePickHtml = async () => {
    if (window.showOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
        })
        if (handles?.length) {
          const picked = await Promise.all(handles.map((handle) => handle.getFile()))
          mergeFiles(picked)
        }
        return
      } catch (error) {
        if (error?.name !== 'AbortError') {
          htmlInputRef.current?.click()
        }
        return
      }
    }

    htmlInputRef.current?.click()
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    setIsDragging(false)
    const items = Array.from(event.dataTransfer?.items || [])
    const entryItems = items.filter(
      (item) => item.kind === 'file' && item.webkitGetAsEntry
    )

    if (entryItems.length) {
      const dropped = await Promise.all(
        entryItems.map((item) => {
          const entry = item.webkitGetAsEntry()
          return entry ? collectFilesFromEntry(entry) : []
        })
      )
      const collected = dropped.flat()
      if (collected.length) {
        mergeFiles(collected)
        return
      }
    }

    mergeFiles(Array.from(event.dataTransfer.files || []))
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleHtmlPick = (event) => {
    mergeFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }

  const resetAll = () => {
    setFiles([])
    setStep(1)
    setUploadError('')
    setUploadResult('')
    setProgress({ current: 0, total: 5, label: '' })
  }

  const removeFile = (target) => {
    if (!target) return
    const targetKey = getFileKey(target)
    setFiles((prev) => prev.filter((file) => getFileKey(file) !== targetKey))
  }

  const handleUpload = async () => {
    if (!canUpload || isUploading) return
    setIsUploading(true)
    setUploadError('')
    setUploadResult('')
    setProgress({ current: 0, total: 5, label: 'Iniciando proceso...' })
    try {
      const response = await uploadGameBuild(files, {
        onProgress: (payload) => {
          const stepValue = Number(payload?.step)
          const totalValue = Number(payload?.total)
          setProgress((prev) => ({
            current: Number.isFinite(stepValue) ? stepValue : prev.current,
            total: Number.isFinite(totalValue) ? totalValue : prev.total,
            label: payload?.label || prev.label,
          }))
          if (payload?.error) {
            setUploadError(payload.error)
          }
          if (payload?.result?.message) {
            setUploadResult(payload.result.message)
          }
        },
      })
      setUploadResult(response?.message || 'Archivos subidos correctamente.')
    } catch (error) {
      const detail =
        error?.response?.data?.detail ||
        error?.message ||
        'No se pudo subir el juego.'
      setUploadError(detail)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <nav className="topbar">
          <div className="brand">
            <img src={logo} alt="Logo" style={{width: '75px', height: '70px'}}/>
            <span className="brand-name">Game Uploader</span>
          </div>
        </nav>
        <div className="shell-body">
          <header className="hero">
            <h1 className="hero-title">Sube tu build de Unity WebGL</h1>
            <p className="hero-subtitle">
              Sube la carpeta Build y el archivo index.html. Validamos lo
              esencial para que todo funcione sin errores.
            </p>
          </header>

          {step === 1 ? (
            <section
              className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="dropzone-inner">
                <h2>Arrastra tu carpeta Videojuego compilado</h2>
                <p>
                  Debe contener la carpeta de <code>Build</code> y el archivo <code>index.html</code>.
                </p>
                <p className="dropzone-hint" style={{ marginTop: '14px'}}>
                  Si la compilación WebGL de tu videojuego tiene más archivos o carpetas, no te preocupes, también los detectamos y subimos.
                </p>
              </div>
            </section>
          ) : (
            <section
              className="workspace"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <aside className="sidebar">
                <div className="sidebar-header">
                  <p className="sidebar-title">Upload Game</p>
                  <p className="sidebar-subtitle">
                    Validacion en tiempo real de tu build.
                  </p>
                </div>
                <button
                  className="btn primary"
                  type="button"
                  disabled={!canUpload || isUploading}
                  onClick={handleUpload}
                >
                  {isUploading ? 'Subiendo...' : 'Subir juego'}
                </button>
                <button className="btn ghost" type="button" onClick={resetAll}>
                  Limpiar seleccion
                </button>
                {(isUploading || progress.current > 0) && (
                  <div className="progress-card">
                    <p className="progress-label">
                      {progress.label || 'Procesando...'}
                    </p>
                    <div
                      className="progress-dots"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={progress.total}
                      aria-valuenow={progress.current}
                    >
                      {Array.from({ length: progress.total }).map(
                        (_, index) => (
                          <span
                            key={`dot-${index}`}
                            className={`progress-dot ${
                              index < progress.current ? 'is-active' : ''
                            }`}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}
                {!canUpload && (
                  <p className="sidebar-warning">
                    Faltan archivos obligatorios para continuar.
                  </p>
                )}
                {uploadError && (
                  <p className="sidebar-warning">{uploadError}</p>
                )}
                {!uploadError && uploadResult && (
                  <p className="sidebar-success">{uploadResult}</p>
                )}
              </aside>

              <div className="files-area">
                <div className="files-header">
                  <div>
                    <p className="files-title">Archivos detectados</p>
                    <p className="files-subtitle">
                      {files.length} archivos listos para revisar.
                    </p>
                  </div>
                  <div className="files-actions">
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={handlePickHtml}
                    >
                      Subir mas archivos
                    </button>
                  </div>
                </div>

                <div className="folder-card">
                  <div className="folder-header">
                    <div>
                      <p className="folder-title">Archivos principales</p>
                      <p className="folder-subtitle">
                        {summary.results.filter((item) => item.found).length} / {summary.results.length} requeridos
                      </p>
                    </div>
                  </div>
                  <div className="file-grid">
                    {summary.results.map((item, index) => (
                  <div
                    key={item.id}
                    className={`file-tile ${
                      item.found ? 'is-present' : 'is-missing'
                    }`}
                    style={{ '--delay': `${index * 0.08}s` }}
                  >
                    <span className="file-icon" aria-hidden="true">
                      <Icon path={FILE_ICONS[item.id]} size={1} />
                    </span>
                    <div>
                      <p className="file-name">{item.label}</p>
                          <p className="file-meta">
                            {item.found ? getFilePath(item.found) : 'Sin archivo'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {extraFiles.length > 0 && (
                  <div className="extras-card">
                    <p className="extras-title">Otros archivos detectados</p>
                    <div className="extras-list">
                      {extraFiles.map((file) => (
                        <div key={getFileKey(file)} className="extras-item">
                          <span className="extras-name">{getFilePath(file)}</span>
                          <button
                            className="extras-remove"
                            type="button"
                            onClick={() => removeFile(file)}
                            aria-label={`Eliminar ${getFilePath(file)}`}
                          >
                            <Icon path={mdiTrashCanOutline} size={0.7} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <input
        ref={htmlInputRef}
        type="file"
        multiple
        onChange={handleHtmlPick}
        className="sr-only"
      />
    </div>
  )
}

export default App
