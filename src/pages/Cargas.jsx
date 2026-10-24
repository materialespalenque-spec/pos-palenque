import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { SUCURSAL_MATRIZ } from '../lib/config'
import { detectarReporte, procesarReporte } from '../lib/cargaReportes'
import { buscarEncabezado, leerArticulos, calcularCambios, aplicarCambios, reporteCSV } from '../lib/importarCatalogo'

const NARANJA = '#f97316'
const AZUL = '#1a1a2e'
const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const card = { background: 'white', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }
const boton = (activo = true, color = NARANJA) => ({
  padding: '10px 20px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 700,
  background: activo ? color : '#ddd', color: activo ? 'white' : '#999', cursor: activo ? 'pointer' : 'not-allowed',
})

const TIPOS = {
  catalogo:   { icono: '📦', titulo: 'Artículos de SICAR (catálogo y existencias)' },
  utilidades: { icono: '📊', titulo: 'Reporte de utilidades' },
  general:    { icono: '🧾', titulo: 'Reporte general de ventas' },
  canceladas: { icono: '🚫', titulo: 'Reporte de ventas canceladas' },
}

export default function Cargas() {
  const { sucursales, sucursalId } = useSesion()
  const [arrastrando, setArrastrando] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [archivo, setArchivo] = useState(null)   // { nombre, rows, tipo, idxEnc }
  const [error, setError] = useState('')
  const [sucursal, setSucursal] = useState(sucursalId)
  const [actualizarCatalogo, setActualizarCatalogo] = useState(sucursalId === SUCURSAL_MATRIZ)
  const [revisando, setRevisando] = useState(false)
  const [preview, setPreview] = useState(null)   // { r, excel, repetidas }
  const [confirmaBajas, setConfirmaBajas] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [resultado, setResultado] = useState(null)
  const [userId, setUserId] = useState(null)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null)) }, [])

  const reiniciar = () => { setArchivo(null); setPreview(null); setResultado(null); setError(''); setConfirmaBajas(false); setProgreso('') }

  async function leerArchivo(file) {
    if (!file) return
    reiniciar(); setLeyendo(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
      const idxEnc = buscarEncabezado(rows)
      let tipo = null
      if (idxEnc >= 0) tipo = 'catalogo'
      else {
        // los reportes se leen como texto, igual que antes
        const filasTexto = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })
        tipo = detectarReporte(filasTexto)
        if (tipo) { setArchivo({ nombre: file.name, rows: filasTexto, tipo, idxEnc: -1 }); setLeyendo(false); return }
      }
      if (!tipo) throw new Error('No reconocí este archivo. Acepto: la exportación de artículos de SICAR, y los reportes de utilidades, ventas generales y canceladas.')
      setArchivo({ nombre: file.name, rows, tipo, idxEnc })
    } catch (e) { setError(e.message) }
    setLeyendo(false)
  }

  const cambiarSucursal = id => {
    setSucursal(id); setPreview(null)
    setActualizarCatalogo(id === SUCURSAL_MATRIZ)
  }

  async function revisar() {
    setRevisando(true); setError(''); setPreview(null); setConfirmaBajas(false)
    try {
      const { productos, repetidas, sinNombre } = leerArticulos(archivo.rows, archivo.idxEnc)
      if (!Object.keys(productos).length) throw new Error('El archivo no tiene artículos.')
      const r = await calcularCambios(productos, { sucursalId: sucursal, actualizarCatalogo })
      setPreview({ r, excel: productos, repetidas, sinNombre })
    } catch (e) { setError(e.message) }
    setRevisando(false)
  }

  async function aplicar() {
    setAplicando(true); setError('')
    try {
      const res = await aplicarCambios(preview.r, preview.excel, { sucursalId: sucursal, nombreArchivo: archivo.nombre, progreso: setProgreso })
      setResultado({ tipo: 'catalogo', ...res })
      setPreview(null)
    } catch (e) { setError(e.message) }
    setProgreso(''); setAplicando(false)
  }

  async function cargarReporte() {
    setAplicando(true); setError('')
    try {
      const res = await procesarReporte(archivo.rows, archivo.tipo, { userId, sucursalId: sucursal, setProgreso })
      setResultado(res)
    } catch (e) { setError(e.message) }
    setProgreso(''); setAplicando(false)
  }

  function descargarReporte() {
    const blob = new Blob([reporteCSV(preview.r)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cambios_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const nomSuc = id => sucursales.find(s => s.id === id)?.nombre || ''
  const esReporte = archivo && archivo.tipo !== 'catalogo'
  const reporteBloqueado = esReporte && sucursal !== SUCURSAL_MATRIZ
  const r = preview?.r
  const totalCambios = r ? r.actualizar.length + r.reactivar.length + r.desactivar.length + r.nuevos.length + r.peso.length + r.existencias.length : 0
  const bloqueoBajas = r?.excesoBajas && !confirmaBajas

  return (
    <div style={{ maxWidth: '920px' }}>
      <p style={{ margin: '0 0 1rem', color: '#666', fontSize: '14px' }}>
        Sube cualquier archivo de SICAR: el sistema detecta si es el catálogo de artículos o un reporte. Antes de guardar, te muestra qué va a cambiar.
      </p>

      {!resultado && (
        <div
          onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={e => { e.preventDefault(); setArrastrando(false); leerArchivo(e.dataTransfer.files?.[0]) }}
          style={{ ...card, textAlign: 'center', border: `2px dashed ${arrastrando ? NARANJA : '#ddd'}`, background: arrastrando ? '#fff7ed' : archivo ? '#f0fdf4' : '#fafafa', padding: '2rem' }}>
          <input id="archivo-carga" type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { leerArchivo(e.target.files?.[0]); e.target.value = '' }} />
          <label htmlFor="archivo-carga" style={{ cursor: 'pointer' }}>
            <div style={{ fontSize: '34px' }}>{leyendo ? '⏳' : archivo ? TIPOS[archivo.tipo].icono : '📥'}</div>
            <p style={{ margin: '6px 0 2px', fontWeight: 700, color: AZUL }}>
              {leyendo ? 'Leyendo archivo…' : archivo ? archivo.nombre : 'Arrastra el Excel aquí o haz clic para elegirlo'}
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: archivo ? '#166534' : '#999' }}>
              {archivo ? `Detectado: ${TIPOS[archivo.tipo].titulo}` : 'Archivos .xls o .xlsx de SICAR'}
            </p>
          </label>
        </div>
      )}

      {error && <div style={{ ...card, background: '#fdecec', borderColor: '#f5b5b5', color: '#b91c1c', fontSize: '14px' }}>{error}</div>}

      {archivo && !resultado && (
        <div style={card}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '5px' }}>
                {archivo.tipo === 'catalogo' ? '¿De qué sucursal son estas existencias?' : 'Sucursal del reporte'}
              </label>
              <select value={sucursal || ''} onChange={e => cambiarSucursal(e.target.value)} disabled={aplicando}
                style={{ padding: '9px 11px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', minWidth: '220px' }}>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            {archivo.tipo === 'catalogo' && (
              <label style={{ fontSize: '14px', color: '#333', maxWidth: '420px' }}>
                <input type="checkbox" checked={actualizarCatalogo} disabled={aplicando} onChange={e => { setActualizarCatalogo(e.target.checked); setPreview(null) }} />{' '}
                También actualizar el catálogo (precios, productos nuevos y bajas)
                <span style={{ display: 'block', fontSize: '12px', color: '#888' }}>
                  Los precios son los mismos en ambas sucursales; normalmente solo se actualiza con el archivo de Matriz. Si lo apagas, solo se cargan las existencias.
                </span>
              </label>
            )}
          </div>

          {reporteBloqueado && (
            <p style={{ margin: '14px 0 0', padding: '10px 12px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px', fontSize: '13px', color: '#9a3412' }}>
              Los reportes de SICAR todavía no se guardan por sucursal: si cargas el de Libertad, sobrescribiría los días de Matriz. Por ahora solo se permiten reportes de Matriz.
            </p>
          )}

          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {archivo.tipo === 'catalogo' ? (
              <button style={boton(!revisando && !aplicando)} disabled={revisando || aplicando} onClick={revisar}>
                {revisando ? 'Revisando…' : preview ? '↻ Revisar de nuevo' : 'Revisar cambios'}
              </button>
            ) : (
              <button style={boton(!reporteBloqueado && !aplicando)} disabled={reporteBloqueado || aplicando} onClick={cargarReporte}>
                {aplicando ? 'Procesando…' : '⬆️ Cargar reporte'}
              </button>
            )}
            <button style={{ ...boton(true, '#fff'), color: '#444', border: '1px solid #ccc' }} onClick={reiniciar} disabled={aplicando}>Cancelar</button>
            {progreso && <span style={{ fontSize: '13px', color: '#0C447C' }}>⏳ {progreso}</span>}
          </div>
        </div>
      )}

      {r && !resultado && (
        <div style={card}>
          <h3 style={{ margin: '0 0 4px', color: AZUL }}>Esto es lo que cambiaría en {nomSuc(sucursal)}</h3>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#888' }}>
            {Object.keys(preview.excel).length.toLocaleString('es-MX')} artículos en el archivo
            {preview.repetidas ? ` · ${preview.repetidas} claves repetidas (se usa la última)` : ''}
            {preview.sinNombre ? ` · ${preview.sinNombre} renglones sin clave o descripción (ignorados)` : ''}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {[
              ['Existencias', r.existencias.length, '#0C447C'],
              ['Precios / código', r.actualizar.length, NARANJA],
              ['Productos nuevos', r.nuevos.length, '#166534'],
              ['Reactivados', r.reactivar.length, '#166534'],
              ['Se desactivan', r.desactivar.length, '#b91c1c'],
              ['Pesos nuevos', r.peso.length, '#666'],
            ].map(([t, n, c]) => (
              <div key={t} style={{ border: '1px solid #eee', borderTop: `4px solid ${c}`, borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '12px', color: '#888' }}>{t}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: c }}>{n.toLocaleString('es-MX')}</div>
              </div>
            ))}
          </div>

          {r.sinCatalogo > 0 && (
            <p style={{ fontSize: '13px', color: '#9a3412', background: '#fff7ed', padding: '8px 10px', borderRadius: '8px' }}>
              ℹ {r.sinCatalogo} artículos del archivo no existen en el catálogo y se omitieron. Para crearlos, marca «También actualizar el catálogo».
            </p>
          )}
          {r.extremas > 0 && (
            <p style={{ fontSize: '13px', color: '#9a3412', background: '#fff7ed', padding: '8px 10px', borderRadius: '8px' }}>
              ⚠ {r.extremas} artículos traen existencias absurdas (más de 100,000 o menos de −100,000). Se cargan tal como vienen de SICAR; conviene corregirlos allá.
            </p>
          )}

          {[
            ['Precios / código de barras', r.actualizar.slice(0, 6).map(({ p, cambios }) => `${p.clave}  ${p.nombre.slice(0, 36)} — ` + Object.entries(cambios).map(([c, [a, d]]) => `${c}: ${a ?? '—'} → ${d ?? '—'}`).join(', '))],
            ['Productos nuevos', r.nuevos.slice(0, 6).map(x => `${x.clave}  ${x.nombre.slice(0, 44)} — ${fmt(x.precio_venta)}`)],
            ['Se desactivan (ya no están en SICAR)', r.desactivar.slice(0, 6).map(p => `${p.clave}  ${p.nombre.slice(0, 56)}`)],
            ['Existencias', r.existencias.slice(0, 6).map(e => `${e.producto.clave}  ${e.producto.nombre.slice(0, 36)} — ${e.antes ?? 'sin dato'} → ${e.despues}`)],
          ].filter(([, l]) => l.length).map(([titulo, lineas]) => (
            <details key={titulo} style={{ marginBottom: '8px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>{titulo} (ejemplos)</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#555', lineHeight: 1.6 }}>
                {lineas.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </details>
          ))}

          {r.excesoBajas && (
            <label style={{ display: 'block', margin: '12px 0', padding: '10px 12px', background: '#fdecec', border: '1px solid #f5b5b5', borderRadius: '8px', fontSize: '13px', color: '#b91c1c' }}>
              <input type="checkbox" checked={confirmaBajas} onChange={e => setConfirmaBajas(e.target.checked)} />{' '}
              <b>Alto:</b> se desactivarían {r.desactivar.length} de {r.dbActivos} productos activos. Eso suele significar un archivo equivocado o incompleto. Marca esta casilla solo si estás seguro de que es correcto.
            </label>
          )}

          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={boton(totalCambios > 0 && !aplicando && !bloqueoBajas, '#166534')} disabled={totalCambios === 0 || aplicando || bloqueoBajas} onClick={aplicar}>
              {aplicando ? 'Aplicando…' : totalCambios === 0 ? 'No hay nada que cambiar' : `Aplicar ${totalCambios.toLocaleString('es-MX')} cambios`}
            </button>
            <button style={{ ...boton(true, '#fff'), color: '#444', border: '1px solid #ccc' }} onClick={descargarReporte} disabled={aplicando}>⬇ Descargar detalle (CSV)</button>
            {progreso && <span style={{ fontSize: '13px', color: '#0C447C' }}>⏳ {progreso}</span>}
          </div>
        </div>
      )}

      {resultado && (
        <div style={{ ...card, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 800, color: '#166534', fontSize: '16px' }}>
            {resultado.errores?.length ? '⚠ Carga terminada con errores' : '✅ Carga completada'}
          </p>
          {resultado.tipo === 'catalogo' ? (
            <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>
              {resultado.existenciasGuardadas} existencias guardadas en {nomSuc(sucursal)}
              {resultado.nuevosCreados ? ` · ${resultado.nuevosCreados} productos nuevos` : ''}.
            </p>
          ) : resultado.tipo === 'utilidades' ? (
            <p style={{ margin: 0, fontSize: '14px' }}>{resultado.dias} días y {resultado.meses} meses actualizados — Total ventas: {fmt(resultado.ventas)}</p>
          ) : resultado.tipo === 'general' ? (
            <p style={{ margin: 0, fontSize: '14px' }}>{resultado.dias} días de métodos de pago · {resultado.insertados} tickets nuevos ({resultado.existentes} ya existían) — {fmt(resultado.total)}</p>
          ) : (
            <p style={{ margin: 0, fontSize: '14px' }}>{resultado.dias} días · {resultado.canceladas} canceladas — {fmt(resultado.monto)}</p>
          )}
          {resultado.errores?.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#b91c1c' }}>
              {resultado.errores.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <button style={{ ...boton(true), marginTop: '12px' }} onClick={reiniciar}>Cargar otro archivo</button>
        </div>
      )}
    </div>
  )
}
