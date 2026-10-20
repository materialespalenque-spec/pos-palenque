import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { NEGOCIO_ID, LOGO_RESPALDO, cargarConfig } from '../lib/config'

const CAMPOS_SUCURSAL = [
  { k: 'nombre',    l: 'Nombre de la sucursal', ancho: '100%' },
  { k: 'direccion', l: 'Calle y número',        ancho: '100%' },
  { k: 'colonia',   l: 'Colonia',               ancho: '48%' },
  { k: 'cp',        l: 'C.P.',                  ancho: '22%' },
  { k: 'ciudad',    l: 'Ciudad',                ancho: '48%' },
  { k: 'estado',    l: 'Estado',                ancho: '48%' },
  { k: 'telefono',  l: 'Teléfono',              ancho: '48%' },
  { k: 'email',     l: 'Correo electrónico',    ancho: '48%' },
]

const caja = { background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem', marginBottom: '1.25rem' }
const titulo = { margin: '0 0 4px', fontSize: '15px', color: '#1a1a2e' }
const ayuda = { margin: '0 0 14px', fontSize: '12px', color: '#888' }
const lbl = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '3px' }
const inp = { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }
const btn = (activo = true, color = '#f97316') => ({
  padding: '8px 18px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: '600',
  background: activo ? color : '#e0e0e0', color: activo ? 'white' : '#aaa', cursor: activo ? 'pointer' : 'not-allowed',
})

// Reduce la imagen a máx. 600 px de ancho y la devuelve como data URL JPG (fondo blanco)
function redimensionarLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'))
      img.onload = () => {
        const escala = Math.min(1, 600 / img.width)
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * escala)
        c.height = Math.round(img.height * escala)
        const ctx = c.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function Configuracion() {
  const [cargando, setCargando]     = useState(true)
  const [negocio, setNegocio]       = useState(null)
  const [cfg, setCfg]               = useState({})
  const [sucursales, setSucursales] = useState([])
  const [msg, setMsg]               = useState({})   // { seccion: { ok, texto } }
  const [guardando, setGuardando]   = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [c, { data: n }, { data: s }] = await Promise.all([
      cargarConfig(),
      supabase.from('negocios').select('nombre, rfc').eq('id', NEGOCIO_ID).single(),
      supabase.from('sucursales').select('*').eq('negocio_id', NEGOCIO_ID).order('created_at'),
    ])
    setCfg(c); setNegocio(n); setSucursales(s || [])
    setCargando(false)
  }

  const avisar = (seccion, ok, texto) => {
    setMsg(prev => ({ ...prev, [seccion]: { ok, texto } }))
    setTimeout(() => setMsg(prev => ({ ...prev, [seccion]: null })), 4000)
  }

  async function guardarClaves(seccion, claves) {
    setGuardando(seccion)
    const filas = claves.map(k => ({ negocio_id: NEGOCIO_ID, clave: k, valor: cfg[k] ?? '', updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('negocio_config').upsert(filas, { onConflict: 'negocio_id,clave' })
    setGuardando('')
    if (error) avisar(seccion, false, `No se pudo guardar: ${error.message}`)
    else avisar(seccion, true, 'Guardado')
  }

  async function subirLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await redimensionarLogo(file)
      setGuardando('logo')
      const { error } = await supabase.from('negocio_config').upsert(
        [{ negocio_id: NEGOCIO_ID, clave: 'logo_data', valor: dataUrl, updated_at: new Date().toISOString() }],
        { onConflict: 'negocio_id,clave' })
      setGuardando('')
      if (error) throw new Error(error.message)
      setCfg(prev => ({ ...prev, logo_data: dataUrl }))
      avisar('logo', true, 'Logo actualizado')
    } catch (err) {
      setGuardando('')
      avisar('logo', false, err.message)
    }
  }

  async function quitarLogo() {
    setGuardando('logo')
    const { error } = await supabase.from('negocio_config').delete().eq('negocio_id', NEGOCIO_ID).eq('clave', 'logo_data')
    setGuardando('')
    if (error) { avisar('logo', false, error.message); return }
    setCfg(prev => { const n = { ...prev }; delete n.logo_data; return n })
    avisar('logo', true, 'Se usará el logo predeterminado')
  }

  const editarSucursal = (id, k, v) =>
    setSucursales(prev => prev.map(s => s.id === id ? { ...s, [k]: v } : s))

  async function guardarSucursal(s) {
    setGuardando(`suc-${s.id}`)
    const cambios = {}
    CAMPOS_SUCURSAL.forEach(({ k }) => { cambios[k] = (s[k] ?? '').toString().trim() || null })
    if (!cambios.nombre) { setGuardando(''); avisar(`suc-${s.id}`, false, 'El nombre es obligatorio'); return }
    const { error } = await supabase.from('sucursales').update(cambios).eq('id', s.id)
    setGuardando('')
    if (error) avisar(`suc-${s.id}`, false, `No se pudo guardar: ${error.message}`)
    else avisar(`suc-${s.id}`, true, 'Guardado')
  }

  const Aviso = ({ id }) => msg[id]
    ? <span style={{ marginLeft: '12px', fontSize: '12px', fontWeight: '600', color: msg[id].ok ? '#1D9E75' : '#e53e3e' }}>{msg[id].ok ? '✓ ' : ''}{msg[id].texto}</span>
    : null

  if (cargando) return <p style={{ padding: '1rem', color: '#888' }}>Cargando configuración...</p>

  return (
    <div style={{ maxWidth: '820px' }}>

      {/* Negocio y logo */}
      <div style={caja}>
        <h3 style={titulo}>Negocio y logo</h3>
        <p style={ayuda}>El logo aparece en las cotizaciones y documentos en tamaño carta.</p>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: '210px', height: '115px', border: '1px solid #eee', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', overflow: 'hidden' }}>
            <img src={cfg.logo_data || LOGO_RESPALDO} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }}
              onError={e => { e.currentTarget.style.display = 'none' }} />
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: '700' }}>{negocio?.nombre}</p>
            <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888' }}>RFC: {negocio?.rfc || '—'}</p>
            <label style={{ ...btn(guardando !== 'logo'), display: 'inline-block' }}>
              {guardando === 'logo' ? 'Guardando...' : 'Cambiar logo'}
              <input type="file" accept="image/*" onChange={subirLogo} disabled={guardando === 'logo'} style={{ display: 'none' }} />
            </label>
            {cfg.logo_data && (
              <button onClick={quitarLogo} style={{ marginLeft: '8px', padding: '8px 14px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '13px', cursor: 'pointer' }}>
                Usar el predeterminado
              </button>
            )}
            <Aviso id="logo" />
          </div>
        </div>
      </div>

      {/* Sucursales */}
      {sucursales.map(s => (
        <div key={s.id} style={caja}>
          <h3 style={titulo}>Sucursal: {s.nombre}</h3>
          <p style={ayuda}>Estos datos salen en el encabezado de los documentos emitidos desde esta sucursal.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 2%' }}>
            {CAMPOS_SUCURSAL.map(({ k, l, ancho }) => (
              <div key={k} style={{ width: ancho }}>
                <label style={lbl}>{l}</label>
                <input type="text" value={s[k] ?? ''} onChange={e => editarSucursal(s.id, k, e.target.value)} style={inp} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: '14px' }}>
            <button onClick={() => guardarSucursal(s)} disabled={guardando === `suc-${s.id}`} style={btn(guardando !== `suc-${s.id}`)}>
              {guardando === `suc-${s.id}` ? 'Guardando...' : 'Guardar sucursal'}
            </button>
            <Aviso id={`suc-${s.id}`} />
          </div>
        </div>
      ))}

      {/* Cotizaciones */}
      <div style={caja}>
        <h3 style={titulo}>Cotizaciones</h3>
        <p style={ayuda}>Textos y valores que se imprimen en cada cotización.</p>
        <div style={{ display: 'flex', gap: '2%', flexWrap: 'wrap' }}>
          <div style={{ width: '24%', minWidth: '140px' }}>
            <label style={lbl}>Vigencia (días)</label>
            <input type="number" min="1" value={cfg.cotizacion_vigencia_dias ?? ''} style={inp}
              onChange={e => setCfg(prev => ({ ...prev, cotizacion_vigencia_dias: e.target.value }))} />
          </div>
        </div>
        <div style={{ marginTop: '10px' }}>
          <label style={lbl}>Condiciones (una por línea)</label>
          <textarea rows={3} value={cfg.cotizacion_condiciones ?? ''} style={{ ...inp, resize: 'vertical' }}
            onChange={e => setCfg(prev => ({ ...prev, cotizacion_condiciones: e.target.value }))} />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label style={lbl}>Datos bancarios (opcional)</label>
          <textarea rows={2} value={cfg.datos_bancarios ?? ''} style={{ ...inp, resize: 'vertical' }}
            onChange={e => setCfg(prev => ({ ...prev, datos_bancarios: e.target.value }))} />
        </div>
        <div style={{ marginTop: '14px' }}>
          <button onClick={() => guardarClaves('cot', ['cotizacion_vigencia_dias', 'cotizacion_condiciones', 'datos_bancarios'])}
            disabled={guardando === 'cot'} style={btn(guardando !== 'cot')}>
            {guardando === 'cot' ? 'Guardando...' : 'Guardar'}
          </button>
          <Aviso id="cot" />
        </div>
      </div>
    </div>
  )
}
