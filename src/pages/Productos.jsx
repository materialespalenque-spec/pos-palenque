import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const fmt = n => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN'
}).format(n || 0)

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando]   = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [pagina, setPagina]       = useState(0)
  const [mostrarUbicaciones, setMostrarUbicaciones] = useState(false)
  const POR_PAGINA = 50

  useEffect(() => {
    cargar()
  }, [busqueda, pagina])

async function cargar() {
  setCargando(true)
  let query = supabase
    .from('productos')
    .select('id, nombre, codigo_barras, clave, precio_venta, costo, factor, activo, sicar_id')
    .order('nombre', { ascending: true })
    .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)

query = query.eq('activo', true)
if (busqueda.trim()) {
  const palabras = busqueda.trim().split(/\s+/)
  palabras.forEach(palabra => {
    query = query.or(`nombre.ilike.%${palabra}%,clave.ilike.%${palabra}%,codigo_barras.ilike.%${palabra}%`)
  })
}

  const { data, error } = await query
  if (!error) setProductos(data || [])
  setCargando(false)
}

  if (mostrarUbicaciones) {
    return <PanelUbicaciones onVolver={() => setMostrarUbicaciones(false)} />
  }

  return (
    <div>
      {/* Buscador */}
      <div style={{
        background: 'white', padding: '1rem', borderRadius: '10px',
        border: '1px solid #e0e0e0', marginBottom: '1.25rem',
        display: 'flex', gap: '10px', alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="🔍 Buscar por nombre, clave o clave alterna..."
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPagina(0) }}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '8px',
            border: '1px solid #ddd', fontSize: '14px', outline: 'none'
          }}
        />
        {busqueda && (
          <button onClick={() => { setBusqueda(''); setPagina(0) }} style={{
            padding: '10px 16px', background: '#f5f5f5', border: '1px solid #ddd',
            borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
          }}>✕ Limpiar</button>
        )}
        <button onClick={() => setMostrarUbicaciones(true)} style={{
          padding: '10px 16px', background: 'white', border: '1px solid #ddd',
          borderRadius: '8px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap'
        }}>📍 Ubicación</button>
      </div>

      {/* Tabla */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Catálogo de Productos</h3>
          <span style={{ fontSize: '12px', color: '#888' }}>
            {cargando ? 'Cargando...' : `${productos.length} productos`}
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Producto</th>
              <th style={th}>Clave</th>
              <th style={th}>Clave Alterna</th>
              <th style={{ ...th, textAlign: 'right' }}>Precio Venta</th>
              <th style={{ ...th, textAlign: 'right' }}>Costo</th>
              <th style={{ ...th, textAlign: 'right' }}>Factor</th>
              <th style={{ ...th, textAlign: 'right' }}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#888', padding: '2rem' }}>Cargando productos...</td></tr>
            ) : productos.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#888', padding: '2rem' }}>No se encontraron productos</td></tr>
            ) : (
              productos.map(p => {
                const costoUnit   = (p.factor > 1 ? p.costo / p.factor : p.costo) * 1.16
                const precioVenta = p.precio_venta * 1.16
                const margen = precioVenta > 0
                  ? ((precioVenta - costoUnit) / precioVenta * 100)
                  : 0
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>{p.nombre}</td>
                    <td style={{ ...td, color: '#888', fontSize: '12px' }}>{p.clave || '—'}</td>
                    <td style={{ ...td, color: '#888', fontSize: '12px' }}>{p.codigo_barras || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: '#f97316' }}>{fmt(precioVenta)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#888' }}>{fmt(costoUnit)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#888' }}>{p.factor > 1 ? `x${p.factor}` : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: margen >= 0 ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                      {margen.toFixed(1)}%
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Paginación */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e0e0e0', display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={() => setPagina(p => Math.max(0, p - 1))}
            disabled={pagina === 0}
            style={{
              padding: '6px 16px', borderRadius: '6px', border: '1px solid #ddd',
              background: pagina === 0 ? '#f5f5f5' : 'white',
              cursor: pagina === 0 ? 'not-allowed' : 'pointer',
              color: pagina === 0 ? '#aaa' : '#333', fontSize: '13px'
            }}
          >← Anterior</button>
          <span style={{ padding: '6px 12px', fontSize: '13px', color: '#888' }}>
            Página {pagina + 1}
          </span>
          <button
            onClick={() => setPagina(p => p + 1)}
            disabled={productos.length < POR_PAGINA}
            style={{
              padding: '6px 16px', borderRadius: '6px', border: '1px solid #ddd',
              background: productos.length < POR_PAGINA ? '#f5f5f5' : 'white',
              cursor: productos.length < POR_PAGINA ? 'not-allowed' : 'pointer',
              color: productos.length < POR_PAGINA ? '#aaa' : '#333', fontSize: '13px'
            }}
          >Siguiente →</button>
        </div>
      </div>
    </div>
  )
}

function PanelUbicaciones({ onVolver }) {
  const [ubicaciones, setUbicaciones]   = useState([])
  const [activa, setActiva]             = useState(null)
  const [negocioId, setNegocioId]       = useState(null)
  const [nuevaUbicacion, setNuevaUbicacion] = useState('')
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [asignados, setAsignados]       = useState([])
  const [cargandoAsignados, setCargandoAsignados] = useState(false)
  const [busqueda, setBusqueda]         = useState('')
  const [resultados, setResultados]     = useState([])
  const [buscando, setBuscando]         = useState(false)

  useEffect(() => {
    cargarUbicaciones()
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        const { data: u } = await supabase.from('usuarios').select('negocio_id').eq('id', data.user.id).single()
        if (u) setNegocioId(u.negocio_id)
      }
    })
  }, [])

  useEffect(() => {
    if (activa) cargarAsignados(activa)
  }, [activa])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqueda.trim() || !activa) { setResultados([]); return }
      setBuscando(true)
      const palabras = busqueda.trim().split(/\s+/)
      let query = supabase.from('productos').select('id, nombre, clave, ubicacion').eq('activo', true).neq('ubicacion', activa).limit(8)
      palabras.forEach(p => { query = query.or(`nombre.ilike.%${p}%,clave.ilike.%${p}%`) })
      const { data } = await query
      setResultados(data || [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [busqueda, activa])

  async function cargarUbicaciones() {
    const { data } = await supabase.from('ubicaciones_producto').select('*').eq('activo', true).order('nombre')
    setUbicaciones(data || [])
    if (data && data.length > 0 && !activa) {
      const primeraNoTienda = data.find(u => u.nombre !== 'Tienda') || data[0]
      setActiva(primeraNoTienda.nombre)
    }
  }

  async function cargarAsignados(ubicacion) {
    setCargandoAsignados(true)
    const { data } = await supabase.from('productos').select('id, nombre, clave').eq('ubicacion', ubicacion).eq('activo', true).order('nombre')
    setAsignados(data || [])
    setCargandoAsignados(false)
  }

  const agregarProducto = async (producto) => {
    await supabase.from('productos').update({ ubicacion: activa }).eq('id', producto.id)
    setBusqueda(''); setResultados([])
    cargarAsignados(activa)
  }

  const quitarProducto = async (producto) => {
    await supabase.from('productos').update({ ubicacion: 'Tienda' }).eq('id', producto.id)
    cargarAsignados(activa)
  }

  const agregarUbicacion = async () => {
    if (!nuevaUbicacion.trim() || !negocioId) return
    const { error } = await supabase.from('ubicaciones_producto').insert({ negocio_id: negocioId, nombre: nuevaUbicacion.trim() })
    if (!error) {
      const nombre = nuevaUbicacion.trim()
      setNuevaUbicacion(''); setMostrarNueva(false)
      await cargarUbicaciones()
      setActiva(nombre)
    }
  }

  return (
    <div>
      <button onClick={onVolver} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '1rem' }}>← Volver al catálogo</button>

      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem', marginBottom: '1rem' }}>
        <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#888' }}>
          Por default, todos los productos son de "Tienda". Aquí solo manejas las excepciones — productos que se cargan en otro lugar (bloquera, depósito, etc.).
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {ubicaciones.filter(u => u.nombre !== 'Tienda').map(u => (
            <button key={u.id} onClick={() => setActiva(u.nombre)} style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
              fontWeight: activa === u.nombre ? '600' : '400',
              background: activa === u.nombre ? '#1a1a2e' : 'white',
              color: activa === u.nombre ? 'white' : '#555',
              border: '1px solid #ddd', cursor: 'pointer'
            }}>{u.nombre}</button>
          ))}
          {!mostrarNueva ? (
            <button onClick={() => setMostrarNueva(true)} style={{ padding: '8px 16px', background: 'white', border: '1px dashed #ccc', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#888' }}>+ Nueva ubicación</button>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <input type="text" value={nuevaUbicacion} onChange={e => setNuevaUbicacion(e.target.value)}
                placeholder="ej. Bodega 2" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') agregarUbicacion() }}
                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '140px' }} />
              <button onClick={agregarUbicacion} style={{ padding: '8px 14px', background: '#f97316', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => { setMostrarNueva(false); setNuevaUbicacion('') }} style={{ padding: '8px 10px', background: 'white', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>✕</button>
            </div>
          )}
        </div>
      </div>

      {activa && (
        <>
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem', marginBottom: '1rem', position: 'relative' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '14px', color: '#1a1a2e' }}>Agregar producto a "{activa}"</h3>
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar producto por nombre o clave..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }} />
            {(resultados.length > 0 || buscando) && (
              <div style={{ position: 'absolute', top: '100%', left: '1.25rem', right: '1.25rem', background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 10, marginTop: '4px' }}>
                {buscando && <p style={{ padding: '1rem', color: '#888', margin: 0 }}>Buscando...</p>}
                {resultados.map(p => (
                  <div key={p.id} onClick={() => agregarProducto(p)} style={{ padding: '10px 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9f9f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    <div>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{p.nombre}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>{p.clave}{p.ubicacion && p.ubicacion !== 'Tienda' ? ` · actualmente en ${p.ubicacion}` : ''}</p>
                    </div>
                    <span style={{ fontSize: '12px', color: '#f97316', fontWeight: '600' }}>+ agregar</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Productos en "{activa}" ({asignados.length})</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {cargandoAsignados ? (
                  <tr><td style={{ ...td, textAlign: 'center', color: '#888', padding: '2rem' }}>Cargando...</td></tr>
                ) : asignados.length === 0 ? (
                  <tr><td style={{ ...td, textAlign: 'center', color: '#ccc', padding: '2rem' }}>Sin productos asignados todavía</td></tr>
                ) : asignados.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>{p.nombre}</td>
                    <td style={{ ...td, color: '#888', fontSize: '12px' }}>{p.clave || '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => quitarProducto(p)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '12px', cursor: 'pointer', color: '#e53e3e' }}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const th = {
  padding: '10px 1.25rem', textAlign: 'left',
  fontSize: '12px', color: '#888', fontWeight: '600'
}
const td = {
  padding: '10px 1.25rem', fontSize: '14px', color: '#333'
}
