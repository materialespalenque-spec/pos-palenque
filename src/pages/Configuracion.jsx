import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { NEGOCIO_ID, cargarConfig, LOGO_RESPALDO } from '../lib/config'

const NARANJA = '#f97316'
const AZUL = '#1a1a2e'
const DOMINIO_INTERNO = 'palenque.pos'

const TABS = [
  { id: 'general',       label: 'General',                icono: '🏢' },
  { id: 'sucursales',    label: 'Sucursales',             icono: '📍' },
  { id: 'usuarios',      label: 'Usuarios y roles',       icono: '👥', permiso: 'administrar_usuarios' },
  { id: 'caja',          label: 'Caja y ventas',          icono: '🛒' },
  { id: 'cotizaciones',  label: 'Cotizaciones',           icono: '📋' },
  { id: 'productos',     label: 'Productos e inventario', icono: '📦' },
  { id: 'clientes',      label: 'Clientes y crédito',     icono: '💳' },
]

const VISTAS = [
  ['v_caja', 'Caja'], ['v_cotizaciones', 'Cotizaciones'], ['v_ventas', 'Ventas'], ['v_productos', 'Productos'],
  ['v_entregas', 'Entregas'], ['v_clientes', 'Clientes'], ['v_reportes', 'Reportes'], ['v_cargas', 'Cargas de archivos'], ['v_configuracion', 'Configuración'],
]
// [clave, etiqueta, ya_funciona]
const ACCIONES = [
  ['ver_costos', 'Ver costos y utilidad', false],
  ['dar_descuentos', 'Dar descuentos (hasta el máximo del rol)', false],
  ['cancelar_ventas', 'Cancelar ventas de su sucursal', false],
  ['reimprimir', 'Reimprimir tickets', false],
  ['ver_otras_sucursales', 'Consultar otras sucursales (existencias, ventas, cotizaciones)', false],
  ['cobrar_cot_otra_sucursal', 'Cobrar cotizaciones de otra sucursal', false],
  ['crear_productos', 'Crear productos nuevos', false],
  ['editar_productos', 'Editar productos y precios', false],
  ['ajustar_inventario', 'Ajustar inventario', false],
  ['autorizar_credito', 'Autorizar ventas a crédito', false],
  ['administrar_usuarios', 'Administrar usuarios y roles', true],
  ['cambiar_sucursal', 'Cambiar de sucursal', true],
]
const BASES = {
  admin_negocio: 'Administrador (acceso total a la base de datos)',
  cajero: 'Vendedor / cajero',
  almacenista: 'Almacenista',
}

const input = { width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', background: 'white', fontFamily: 'inherit' }
const card = { background: 'white', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }
const btn = (primario = true, off = false) => ({
  padding: '9px 16px', borderRadius: '8px', border: primario ? 'none' : '1px solid #ccc',
  background: off ? '#bbb' : primario ? NARANJA : 'white', color: primario ? 'white' : '#444',
  fontSize: '14px', fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer',
})
const btnChico = { ...btn(false), padding: '5px 10px', fontSize: '12px' }

function Campo({ label, ayuda, children, style }) {
  return (
    <div style={{ marginBottom: '0.9rem', ...style }}>
      <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '5px', fontWeight: 600 }}>{label}</label>
      {children}
      {ayuda && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>{ayuda}</p>}
    </div>
  )
}

function Aviso({ msg }) {
  if (!msg) return null
  const ok = msg.startsWith('✓')
  return <span style={{ fontSize: '13px', marginLeft: '12px', color: ok ? '#15803d' : '#c0392b' }}>{msg}</span>
}

function Modal({ titulo, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: AZUL }}>{titulo}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

async function guardarClaves(obj) {
  const ahora = new Date().toISOString()
  const filas = Object.entries(obj).map(([clave, valor]) => ({ negocio_id: NEGOCIO_ID, clave, valor: String(valor ?? ''), updated_at: ahora }))
  const { error } = await supabase.from('negocio_config').upsert(filas, { onConflict: 'negocio_id,clave' })
  return error
}

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

/* ───────────────────────── General ───────────────────────── */
function TabGeneral() {
  const [cfg, setCfg] = useState(null)
  const [neg, setNeg] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    cargarConfig().then(setCfg)
    supabase.from('negocios').select('nombre, rfc').eq('id', NEGOCIO_ID).single().then(({ data }) => setNeg(data))
  }, [])

  async function subirLogo(file) {
    if (!file) return
    try {
      const data = await redimensionarLogo(file)
      const error = await guardarClaves({ logo_data: data })
      if (error) throw new Error(error.message)
      setCfg(p => ({ ...p, logo_data: data })); setMsg('✓ Logo actualizado')
    } catch (e) { setMsg(e.message) }
  }

  async function quitarLogo() {
    const { error } = await supabase.from('negocio_config').delete().eq('negocio_id', NEGOCIO_ID).eq('clave', 'logo_data')
    if (error) return setMsg(error.message)
    setCfg(p => { const n = { ...p }; delete n.logo_data; return n })
    setMsg('✓ Se usará el logo predeterminado')
  }

  if (!cfg) return <p>Cargando…</p>
  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 4px', color: AZUL }}>Negocio y logo</h3>
      <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888' }}>El logo aparece en las cotizaciones y documentos en tamaño carta.</p>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: '210px', height: '115px', border: '1px solid #eee', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img src={cfg.logo_data || LOGO_RESPALDO} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%' }} onError={e => { e.currentTarget.style.display = 'none' }} />
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700 }}>{neg?.nombre}</p>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888' }}>RFC: {neg?.rfc || '—'}</p>
          <label style={{ ...btn(true), display: 'inline-block' }}>
            Cambiar logo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { subirLogo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {cfg.logo_data && <button onClick={quitarLogo} style={{ ...btn(false), marginLeft: '8px' }}>Usar el predeterminado</button>}
          <Aviso msg={msg} />
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Sucursales ───────────────────────── */
function TabSucursales() {
  const [lista, setLista] = useState(null)
  const [folios, setFolios] = useState({})
  const [msg, setMsg] = useState({})

  const cargar = useCallback(async () => {
    const [{ data: s }, { data: f }] = await Promise.all([
      supabase.from('sucursales').select('*').eq('negocio_id', NEGOCIO_ID).order('created_at'),
      supabase.from('sucursal_folios').select('*').eq('negocio_id', NEGOCIO_ID),
    ])
    setLista(s || [])
    const m = {}
    ;(f || []).forEach(r => { m[`${r.sucursal_id}|${r.tipo}`] = { prefijo: r.prefijo, ultimo: r.ultimo, original: r.ultimo } })
    setFolios(m)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const setCampo = (id, k, v) => setLista(l => l.map(s => s.id === id ? { ...s, [k]: v } : s))
  const setFolio = (sid, tipo, k, v) => setFolios(m => ({ ...m, [`${sid}|${tipo}`]: { prefijo: '', ultimo: 0, original: 0, ...m[`${sid}|${tipo}`], [k]: v } }))
  const aviso = (id, t) => setMsg(m => ({ ...m, [id]: t }))

  async function guardar(s) {
    const campos = ['nombre', 'direccion', 'colonia', 'cp', 'ciudad', 'estado', 'telefono', 'email']
    const cambios = Object.fromEntries(campos.map(k => [k, (s[k] ?? '').toString().trim() || null]))
    cambios.activa = !!s.activa
    if (!cambios.nombre) return aviso(s.id, 'El nombre es obligatorio')

    for (const tipo of ['cotizacion', 'venta']) {
      const f = folios[`${s.id}|${tipo}`]
      if (!f) continue
      const nuevo = parseInt(f.ultimo) || 0
      if (nuevo < f.original && !window.confirm(`El último folio de ${tipo === 'venta' ? 'ventas' : 'cotizaciones'} baja de ${f.original} a ${nuevo}. Podrían repetirse folios ya usados. ¿Continuar?`)) return
    }

    const { error } = await supabase.from('sucursales').update(cambios).eq('id', s.id)
    if (error) return aviso(s.id, 'Error: ' + error.message)
    for (const tipo of ['cotizacion', 'venta']) {
      const f = folios[`${s.id}|${tipo}`]
      if (!f) continue
      const { error: e2 } = await supabase.from('sucursal_folios').upsert(
        { negocio_id: NEGOCIO_ID, sucursal_id: s.id, tipo, prefijo: (f.prefijo || '').trim(), ultimo: parseInt(f.ultimo) || 0 },
        { onConflict: 'sucursal_id,tipo' })
      if (e2) return aviso(s.id, 'Error en folios: ' + e2.message)
    }
    aviso(s.id, '✓ Guardado')
    cargar()
  }

  if (!lista) return <p>Cargando…</p>
  const fld = (s, k, label) => (
    <Campo label={label}><input style={input} value={s[k] || ''} onChange={e => setCampo(s.id, k, e.target.value)} /></Campo>
  )
  return lista.map(s => (
    <div key={s.id} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: AZUL }}>📍 {s.nombre}</h3>
        <label style={{ fontSize: '13px', color: '#555' }}>
          <input type="checkbox" checked={!!s.activa} onChange={e => setCampo(s.id, 'activa', e.target.checked)} /> Activa
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 14px' }}>
        {fld(s, 'nombre', 'Nombre')}
        {fld(s, 'direccion', 'Calle y número')}
        {fld(s, 'colonia', 'Colonia')}
        {fld(s, 'cp', 'C.P.')}
        {fld(s, 'ciudad', 'Ciudad')}
        {fld(s, 'estado', 'Estado')}
        {fld(s, 'telefono', 'Teléfono')}
        {fld(s, 'email', 'Correo')}
      </div>
      <h4 style={{ margin: '0.5rem 0', color: AZUL }}>Folios</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 14px' }}>
        {[['cotizacion', 'Cotizaciones'], ['venta', 'Ventas']].map(([tipo, nombre]) => {
          const f = folios[`${s.id}|${tipo}`] || { prefijo: '', ultimo: 0 }
          return (
            <div key={tipo} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '8px', padding: '10px', marginBottom: '0.9rem' }}>
              <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600 }}>{nombre}</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Campo label="Prefijo" style={{ flex: 1, marginBottom: 0 }}><input style={input} value={f.prefijo} onChange={e => setFolio(s.id, tipo, 'prefijo', e.target.value)} /></Campo>
                <Campo label="Último usado" style={{ flex: 1, marginBottom: 0 }}><input style={input} type="number" min="0" value={f.ultimo} onChange={e => setFolio(s.id, tipo, 'ultimo', e.target.value)} /></Campo>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888' }}>
                Siguiente: <b>{(f.prefijo || '') + String((parseInt(f.ultimo) || 0) + 1).padStart(5, '0')}</b>
                {tipo === 'venta' && ' · aún no se usa en los tickets'}
              </p>
            </div>
          )
        })}
      </div>
      <button style={btn()} onClick={() => guardar(s)}>Guardar sucursal</button>
      <Aviso msg={msg[s.id]} />
    </div>
  ))
}

/* ───────────────────────── Usuarios y roles ───────────────────────── */
async function llamarAdmin(body) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })
  if (error) {
    let m = error.message
    try { const j = await error.context.json(); if (j?.error) m = j.error } catch { /* ignorar */ }
    return { error: m }
  }
  if (data?.error) return { error: data.error }
  return { data }
}

const loginDe = email => (email || '').endsWith('@' + DOMINIO_INTERNO) ? email.split('@')[0] : email

function SubUsuarios({ roles, sucursales }) {
  const [usuarios, setUsuarios] = useState(null)
  const [modal, setModal] = useState(null) // {tipo:'nuevo'|'editar'|'password', u?}
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const [cargando, setCargando] = useState(false)
  const [miId, setMiId] = useState(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('*').eq('negocio_id', NEGOCIO_ID).order('created_at')
    setUsuarios(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMiId(data?.user?.id || null)) }, [])

  const abrir = (tipo, u) => {
    setMsg('')
    setModal({ tipo, u })
    setForm(tipo === 'nuevo'
      ? { nombre: '', usuario: '', email: '', password: '', rol_id: roles.find(r => r.nombre === 'Vendedor')?.id || roles[0]?.id, sucursal_id: sucursales[0]?.id }
      : tipo === 'editar' ? { nombre: u.nombre, rol_id: u.rol_id, sucursal_id: u.sucursal_id } : { password: '' })
  }

  async function enviar() {
    setCargando(true); setMsg('')
    let err = null
    if (modal.tipo === 'nuevo') {
      err = (await llamarAdmin({ accion: 'crear', ...form })).error
    } else if (modal.tipo === 'password') {
      err = (await llamarAdmin({ accion: 'password', id: modal.u.id, password: form.password })).error
    } else {
      if (!form.nombre.trim()) { setCargando(false); return setMsg('Falta el nombre') }
      const rol = roles.find(r => r.id === form.rol_id)
      const { error } = await supabase.from('usuarios')
        .update({ nombre: form.nombre.trim(), rol_id: form.rol_id, rol: rol?.rol_base, sucursal_id: form.sucursal_id })
        .eq('id', modal.u.id)
      err = error?.message
    }
    setCargando(false)
    if (err) return setMsg(err)
    setModal(null); cargar()
  }

  async function alternar(u) {
    const quiere = !u.activo
    if (!window.confirm(quiere ? `¿Reactivar a ${u.nombre}?` : `¿Desactivar a ${u.nombre}? Ya no podrá iniciar sesión.`)) return
    const { error } = await llamarAdmin({ accion: 'activo', id: u.id, activo: quiere })
    if (error) window.alert(error); else cargar()
  }

  if (!usuarios) return <p>Cargando…</p>
  const nombreRol = id => roles.find(r => r.id === id)?.nombre || '—'
  const nombreSuc = id => sucursales.find(s => s.id === id)?.nombre || '—'
  const esYo = modal?.u?.id === miId

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Quien no tenga correo entra solo con su <b>usuario</b> y contraseña.</p>
        <button style={btn()} onClick={() => abrir('nuevo')}>+ Nuevo usuario</button>
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: '#f7f7f7', textAlign: 'left' }}>
              {['Nombre', 'Acceso', 'Rol', 'Sucursal', 'Estado', ''].map(h => <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: '#555' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid #eee', opacity: u.activo ? 1 : .5 }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{u.nombre}{u.id === miId && ' (tú)'}</td>
                <td style={{ padding: '10px 12px' }}>{loginDe(u.email)}</td>
                <td style={{ padding: '10px 12px' }}>{nombreRol(u.rol_id)}</td>
                <td style={{ padding: '10px 12px' }}>{nombreSuc(u.sucursal_id)}</td>
                <td style={{ padding: '10px 12px' }}>{u.activo ? 'Activo' : 'Inactivo'}</td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  <button style={btnChico} onClick={() => abrir('editar', u)}>Editar</button>{' '}
                  <button style={btnChico} onClick={() => abrir('password', u)}>Contraseña</button>{' '}
                  {u.id !== miId && <button style={btnChico} onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Reactivar'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal titulo={modal.tipo === 'nuevo' ? 'Nuevo usuario' : modal.tipo === 'password' ? `Contraseña de ${modal.u.nombre}` : `Editar a ${modal.u.nombre}`} onClose={() => setModal(null)}>
          {modal.tipo !== 'password' && (
            <Campo label="Nombre"><input style={input} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></Campo>
          )}
          {modal.tipo === 'nuevo' && (
            <>
              <Campo label="Usuario" ayuda="Con esto inicia sesión (ej. miguel). Solo minúsculas, números, punto o guion.">
                <input style={input} value={form.usuario} autoCapitalize="none" onChange={e => setForm({ ...form, usuario: e.target.value.toLowerCase() })} />
              </Campo>
              <Campo label="Correo (opcional)" ayuda="Si lo llenas, entrará con este correo en lugar del usuario.">
                <input style={input} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </Campo>
            </>
          )}
          {(modal.tipo === 'nuevo' || modal.tipo === 'password') && (
            <Campo label="Contraseña" ayuda="Mínimo 6 caracteres.">
              <input style={input} type="text" value={form.password} autoComplete="off" onChange={e => setForm({ ...form, password: e.target.value })} />
            </Campo>
          )}
          {modal.tipo !== 'password' && (
            <>
              <Campo label="Rol" ayuda={esYo ? 'No puedes cambiar tu propio rol.' : ''}>
                <select style={input} value={form.rol_id || ''} disabled={esYo} onChange={e => setForm({ ...form, rol_id: e.target.value })}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Sucursal" ayuda="Sucursal con la que inicia. Solo los roles con “Cambiar de sucursal” pueden moverse.">
                <select style={input} value={form.sucursal_id || ''} onChange={e => setForm({ ...form, sucursal_id: e.target.value })}>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Campo>
            </>
          )}
          {msg && <p style={{ color: '#c0392b', fontSize: '13px', background: '#fdecea', padding: '8px 10px', borderRadius: '8px' }}>{msg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button style={btn(false)} onClick={() => setModal(null)}>Cancelar</button>
            <button style={btn(true, cargando)} disabled={cargando} onClick={enviar}>{cargando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

function ModalNuevoRol({ onClose, onCrear, baseActual, copiaDe }) {
  const [nombre, setNombre] = useState('')
  const [base, setBase] = useState(baseActual === 'admin_negocio' ? 'cajero' : baseActual)
  return (
    <Modal titulo="Nuevo rol" onClose={onClose}>
      <Campo label="Nombre"><input style={input} value={nombre} onChange={e => setNombre(e.target.value)} autoFocus /></Campo>
      <Campo label="Tipo base" ayuda={`Empieza con una copia de los permisos de “${copiaDe}”; luego los ajustas.`}>
        <select style={input} value={base} onChange={e => setBase(e.target.value)}>
          {Object.entries(BASES).filter(([k]) => k !== 'admin_negocio').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Campo>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button style={btn(false)} onClick={onClose}>Cancelar</button>
        <button style={btn(true, !nombre.trim())} disabled={!nombre.trim()} onClick={() => onCrear(nombre, base)}>Crear</button>
      </div>
    </Modal>
  )
}

function SubRoles({ roles, recargar }) {
  const [selId, setSelId] = useState(roles[0]?.id)
  const [ed, setEd] = useState(null)
  const [msg, setMsg] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [conteo, setConteo] = useState({})

  useEffect(() => {
    supabase.from('usuarios').select('rol_id').eq('negocio_id', NEGOCIO_ID).then(({ data }) => {
      const c = {}; (data || []).forEach(u => { c[u.rol_id] = (c[u.rol_id] || 0) + 1 }); setConteo(c)
    })
  }, [roles])

  useEffect(() => {
    const r = roles.find(x => x.id === selId) || roles[0]
    if (r) setEd({ ...r, permisos: { ...r.permisos } })
    setMsg('')
  }, [selId, roles])

  if (!ed) return <p>Cargando…</p>
  const bloqueado = ed.es_sistema && ed.rol_base === 'admin_negocio'
  const toggle = k => setEd(e => ({ ...e, permisos: { ...e.permisos, [k]: !e.permisos[k] } }))

  async function guardar() {
    if (!ed.nombre.trim()) return setMsg('Falta el nombre')
    const { error } = await supabase.from('roles').update({
      nombre: ed.nombre.trim(), descripcion: ed.descripcion || null,
      permisos: ed.permisos, descuento_max: Math.max(0, Math.min(100, parseFloat(ed.descuento_max) || 0)),
    }).eq('id', ed.id)
    if (error) return setMsg('Error: ' + (error.code === '23505' ? 'Ya existe un rol con ese nombre' : error.message))
    setMsg('✓ Guardado. Los usuarios verán el cambio al recargar la página.')
    recargar()
  }

  async function crear(nombre, base) {
    const { data, error } = await supabase.from('roles').insert({
      negocio_id: NEGOCIO_ID, nombre: nombre.trim(), rol_base: base,
      permisos: ed.permisos, descuento_max: ed.descuento_max, es_sistema: false,
    }).select().single()
    if (error) return window.alert(error.code === '23505' ? 'Ya existe un rol con ese nombre' : error.message)
    setNuevo(false); await recargar(); setSelId(data.id)
  }

  async function eliminar() {
    if (!window.confirm(`¿Eliminar el rol “${ed.nombre}”?`)) return
    const { error } = await supabase.from('roles').delete().eq('id', ed.id)
    if (error) return setMsg('Error: ' + error.message)
    setSelId(roles.find(r => r.id !== ed.id)?.id)
    await recargar()
  }

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ ...card, width: '220px', flexShrink: 0, padding: '0.75rem' }}>
        {roles.map(r => (
          <button key={r.id} onClick={() => setSelId(r.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', marginBottom: '4px', borderRadius: '8px',
            border: 'none', cursor: 'pointer', fontSize: '14px', background: r.id === ed.id ? '#fff1e6' : 'transparent',
            color: r.id === ed.id ? NARANJA : '#333', fontWeight: r.id === ed.id ? 700 : 400,
          }}>
            {r.nombre} <span style={{ color: '#999', fontWeight: 400, fontSize: '12px' }}>({conteo[r.id] || 0})</span>
          </button>
        ))}
        <button onClick={() => setNuevo(true)} style={{ ...btn(false), width: '100%', marginTop: '6px' }}>+ Nuevo rol</button>
      </div>

      <div style={{ ...card, flex: 1, minWidth: '300px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 14px' }}>
          <Campo label="Nombre del rol"><input style={input} value={ed.nombre} disabled={bloqueado} onChange={e => setEd({ ...ed, nombre: e.target.value })} /></Campo>
          <Campo label="Descripción"><input style={input} value={ed.descripcion || ''} disabled={bloqueado} onChange={e => setEd({ ...ed, descripcion: e.target.value })} /></Campo>
          <Campo label="Tipo base" ayuda={ed.rol_base === 'admin_negocio' ? 'Acceso total en la base de datos; úsalo solo para administradores.' : 'No se puede cambiar después de crearlo.'}>
            <input style={{ ...input, background: '#f3f3f3' }} value={BASES[ed.rol_base]} readOnly />
          </Campo>
          <Campo label="Descuento máximo (%)">
            <input style={input} type="number" min="0" max="100" value={ed.descuento_max} disabled={bloqueado} onChange={e => setEd({ ...ed, descuento_max: e.target.value })} />
          </Campo>
        </div>

        {bloqueado && <p style={{ background: '#fff7ed', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', color: '#9a3412' }}>El rol Administrador tiene todos los permisos y no se edita, para que nadie se quede sin acceso.</p>}

        <h4 style={{ margin: '0.5rem 0', color: AZUL }}>Vistas que puede abrir</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '6px', marginBottom: '1rem' }}>
          {VISTAS.map(([k, l]) => (
            <label key={k} style={{ fontSize: '14px' }}><input type="checkbox" disabled={bloqueado} checked={!!ed.permisos[k]} onChange={() => toggle(k)} /> {l}</label>
          ))}
        </div>

        <h4 style={{ margin: '0.5rem 0', color: AZUL }}>Acciones permitidas</h4>
        {ACCIONES.map(([k, l, activo]) => (
          <label key={k} style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>
            <input type="checkbox" disabled={bloqueado} checked={!!ed.permisos[k]} onChange={() => toggle(k)} /> {l}
            {!activo && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '10px' }}>se activa en la siguiente fase</span>}
          </label>
        ))}

        {!bloqueado && (
          <div style={{ marginTop: '1rem' }}>
            <button style={btn()} onClick={guardar}>Guardar rol</button>
            {!ed.es_sistema && !conteo[ed.id] && <button style={{ ...btn(false), marginLeft: '8px', color: '#c0392b' }} onClick={eliminar}>Eliminar</button>}
            <Aviso msg={msg} />
          </div>
        )}
      </div>

      {nuevo && <ModalNuevoRol onClose={() => setNuevo(false)} onCrear={crear} baseActual={ed.rol_base} copiaDe={ed.nombre} />}
    </div>
  )
}

function TabUsuarios() {
  const [sub, setSub] = useState('usuarios')
  const [roles, setRoles] = useState(null)
  const [sucursales, setSucursales] = useState([])

  const cargarRoles = useCallback(async () => {
    const { data } = await supabase.from('roles').select('*').eq('negocio_id', NEGOCIO_ID).order('created_at')
    setRoles(data || [])
  }, [])
  useEffect(() => {
    cargarRoles()
    supabase.from('sucursales').select('id, nombre').eq('negocio_id', NEGOCIO_ID).eq('activa', true).order('created_at').then(({ data }) => setSucursales(data || []))
  }, [cargarRoles])

  if (!roles) return <p>Cargando…</p>
  return (
    <>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '8px' }}>
        {[['usuarios', 'Usuarios'], ['roles', 'Roles y permisos']].map(([id, l]) => (
          <button key={id} onClick={() => setSub(id)} style={{ ...btn(sub === id), padding: '7px 14px' }}>{l}</button>
        ))}
      </div>
      {sub === 'usuarios' ? <SubUsuarios roles={roles} sucursales={sucursales} /> : <SubRoles roles={roles} recargar={cargarRoles} />}
    </>
  )
}

/* ───────────────────────── Cotizaciones ───────────────────────── */
function TabCotizaciones() {
  const [f, setF] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    cargarConfig().then(c => setF({
      vigencia: c.cotizacion_vigencia_dias || '15',
      condiciones: c.cotizacion_condiciones || '',
      bancarios: c.datos_bancarios || '',
    }))
  }, [])
  async function guardar() {
    const v = parseInt(f.vigencia)
    if (!(v >= 1)) return setMsg('La vigencia debe ser de al menos 1 día')
    const error = await guardarClaves({ cotizacion_vigencia_dias: v, cotizacion_condiciones: f.condiciones, datos_bancarios: f.bancarios })
    setMsg(error ? 'Error: ' + error.message : '✓ Guardado')
  }
  if (!f) return <p>Cargando…</p>
  return (
    <div style={card}>
      <Campo label="Vigencia por defecto (días)" ayuda="Las cotizaciones nuevas arrancan con esta vigencia; se puede cambiar en cada una.">
        <input style={{ ...input, maxWidth: '160px' }} type="number" min="1" value={f.vigencia} onChange={e => setF({ ...f, vigencia: e.target.value })} />
      </Campo>
      <Campo label="Condiciones (una por línea, salen impresas en la cotización)">
        <textarea style={{ ...input, minHeight: '90px' }} value={f.condiciones} onChange={e => setF({ ...f, condiciones: e.target.value })} />
      </Campo>
      <Campo label="Datos bancarios (formato carta)">
        <textarea style={{ ...input, minHeight: '70px' }} value={f.bancarios} onChange={e => setF({ ...f, bancarios: e.target.value })} />
      </Campo>
      <p style={{ fontSize: '12px', color: '#888', marginTop: 0 }}>El prefijo y el consecutivo de folio se ajustan por sucursal en la pestaña Sucursales.</p>
      <button style={btn()} onClick={guardar}>Guardar</button><Aviso msg={msg} />
    </div>
  )
}

function Proximamente({ titulo, items }) {
  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 6px', color: AZUL }}>{titulo}</h3>
      <p style={{ margin: '0 0 10px', color: '#666', fontSize: '14px' }}>Aquí irán estos ajustes cuando el módulo los necesite:</p>
      <ul style={{ margin: 0, paddingLeft: '20px', color: '#555', fontSize: '14px', lineHeight: 1.7 }}>{items.map(i => <li key={i}>{i}</li>)}</ul>
    </div>
  )
}

/* ───────────────────────── Principal ───────────────────────── */
export default function Configuracion() {
  const { tiene } = useSesion()
  const tabs = TABS.filter(t => !t.permiso || tiene(t.permiso))
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('pos_config_tab') || 'general' } catch { return 'general' } })
  const activo = tabs.find(t => t.id === tab) ? tab : 'general'
  const ir = id => { setTab(id); try { localStorage.setItem('pos_config_tab', id) } catch { /* ignorar */ } }

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1.25rem', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => ir(t.id)} style={{
            padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px',
            background: activo === t.id ? AZUL : 'white', color: activo === t.id ? 'white' : '#444', fontWeight: activo === t.id ? 700 : 400,
            boxShadow: activo === t.id ? 'none' : 'inset 0 0 0 1px #ddd',
          }}>{t.icono} {t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: '980px' }}>
        {activo === 'general' && <TabGeneral />}
        {activo === 'sucursales' && <TabSucursales />}
        {activo === 'usuarios' && <TabUsuarios />}
        {activo === 'cotizaciones' && <TabCotizaciones />}
        {activo === 'caja' && <Proximamente titulo="Caja y ventas" items={['Formatos de ticket por sucursal', 'Formas de pago permitidas', 'Redondeo', 'Folios de venta (ya están en Sucursales)']} />}
        {activo === 'productos' && <Proximamente titulo="Productos e inventario" items={['Departamentos y categorías', 'Inventario mínimo y alertas', 'Reglas de precios y utilidad por defecto']} />}
        {activo === 'clientes' && <Proximamente titulo="Clientes y crédito" items={['Límite y días de crédito por defecto', 'Políticas de autorización de crédito', 'Datos fiscales requeridos']} />}
      </div>
    </div>
  )
}
