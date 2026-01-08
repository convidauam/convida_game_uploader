import { useMemo, useRef, useState } from 'react'
import './App.css'
import Icon from '@mdi/react';
import { mdiDataMatrix, mdiCube, mdiReload, mdiUnity, mdiLanguageHtml5 } from '@mdi/js';
import logo from './assets/logo.png';
import { uploadGameBuild } from './services/uploadService'


const getFilePath = (file) => file.webkitRelativePath || file.name

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

const VERSION_OPTIONS = ['2020.3 LTS', '2021.3 LTS', '2022.3 LTS', 'Unity 6']
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
  const [version, setVersion] = useState('2021.3 LTS')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadResult, setUploadResult] = useState('')
  const buildInputRef = useRef(null)
  const htmlInputRef = useRef(null)

  const summary = useMemo(() => {
    const results = REQUIRED_FILES.map((item) => {
      const found = files.find((file) => item.match(file))
      return { ...item, found }
    })
    const missing = results.filter((item) => !item.found)
    return { results, missing }
  }, [files])

  const buildItems = summary.results.filter((item) => item.group === 'build')
  const htmlItem = summary.results.find((item) => item.id === 'html')
  const buildPresent = buildItems.filter((item) => item.found).length
  const extraFiles = files.filter(
    (file) => !summary.results.some((item) => item.match(file))
  )
  const canUpload = files.length > 0 && summary.missing.length === 0
  const findFileById = (id) =>
    summary.results.find((item) => item.id === id)?.found

  const mergeFiles = (incoming) => {
    if (!incoming?.length) return
    setFiles((prev) => {
      const map = new Map()
      ;[...prev, ...incoming].forEach((file) => {
        const key = `${file.webkitRelativePath || file.name}-${file.size}`
        map.set(key, file)
      })
      return Array.from(map.values())
    })
    setStep(2)
    setUploadError('')
    setUploadResult('')
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

  const handlePickBuildFolder = async () => {
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker()
        const collected = await collectFilesFromDirectory(dirHandle)
        mergeFiles(collected)
        return
      } catch (error) {
        if (error?.name !== 'AbortError') {
          buildInputRef.current?.click()
        }
        return
      }
    }

    buildInputRef.current?.click()
  }

  const handlePickHtml = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'HTML',
              accept: { 'text/html': ['.html'] },
            },
          ],
        })
        if (handle) {
          const file = await handle.getFile()
          mergeFiles([file])
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

  const handleBuildPick = (event) => {
    mergeFiles(Array.from(event.target.files || []))
    event.target.value = ''
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
  }

  const handleUpload = async () => {
    if (!canUpload || isUploading) return
    setIsUploading(true)
    setUploadError('')
    setUploadResult('')
    try {
      const response = await uploadGameBuild({
        data: findFileById('data'),
        framework: findFileById('framework'),
        loader: findFileById('loader'),
        wasm: findFileById('wasm'),
        html: findFileById('html'),
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
                <h2>Selecciona tu carpeta Build</h2>
                <p>
                  Debe contener los archivos de <code>data</code>,{' '}
                  <code>framework</code>, <code>loader</code> y <code>wasm</code>.
                </p>
                <div className="dropzone-actions">
                  <button
                    className="btn primary"
                    type="button"
                    onClick={handlePickBuildFolder}
                  >
                    Seleccionar carpeta Build
                  </button>
                </div>
                <p className="dropzone-hint" style={{ marginTop: '14px'}}>
                  O arrastra la carpeta Build y el <code>index.html</code> en un
                  solo drop.
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
                <ul className="validation-list">
                  {summary.results.map((item) => (
                    <li
                      key={item.id}
                      className={`validation-item ${
                        item.found ? 'is-ok' : 'is-missing'
                      }`}
                    >
                      <span className="validation-dot" aria-hidden="true" />
                      <span>
                        <code>{item.label}</code>
                      </span>
                    </li>
                  ))}
                </ul>
                <label className="field">
                  <span>Version de Unity</span>
                  <select
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                  >
                    {VERSION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
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
                      onClick={handlePickBuildFolder}
                    >
                      Reemplazar carpeta Build
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={handlePickHtml}
                    >
                      Subir index.html
                    </button>
                  </div>
                </div>

                <div className="folder-card">
                  <div className="folder-header">
                    <div>
                      <p className="folder-title">Build</p>
                      <p className="folder-subtitle">
                        {buildPresent} / {buildItems.length} requeridos
                      </p>
                    </div>
                    <span className="folder-chip">Carpeta</span>
                  </div>
                  <div className="file-grid">
                    {buildItems.map((item, index) => (
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
                            {item.found ? item.found.name : 'Sin archivo'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="standalone-card">
                  <div className="standalone-file">
                    <span className="file-icon" aria-hidden="true">
                      <Icon path={FILE_ICONS['html']} size={1} />
                    </span>
                    <p className="file-name">index.html</p>
                    <p className="file-meta">
                      {htmlItem?.found ? htmlItem.found.name : 'Sin archivo'}
                    </p>
                  </div>
                  <div
                    className={`standalone-status ${
                      htmlItem?.found ? 'is-present' : 'is-missing'
                    }`}
                  >
                    {htmlItem?.found ? 'Listo' : 'Faltante'}
                  </div>
                </div>

                {extraFiles.length > 0 && (
                  <div className="extras-card">
                    <p className="extras-title">Otros archivos detectados</p>
                    <div className="extras-list">
                      {extraFiles.slice(0, 6).map((file, index) => (
                        <span
                          key={`${file.name}-${index}`}
                          className="extras-pill"
                        >
                          {file.name}
                        </span>
                      ))}
                      {extraFiles.length > 6 && (
                        <span className="extras-pill">
                          +{extraFiles.length - 6} mas
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <input
        ref={buildInputRef}
        type="file"
        multiple
        webkitdirectory=""
        onChange={handleBuildPick}
        className="sr-only"
      />
      <input
        ref={htmlInputRef}
        type="file"
        accept=".html"
        onChange={handleHtmlPick}
        className="sr-only"
      />
    </div>
  )
}

export default App
