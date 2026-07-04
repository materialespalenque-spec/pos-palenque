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
  if (palabras.length > 1) {
    // Buscar cada palabra por separado en nombre
    palabras.forEach(palabra => {
      query = query.ilike('nombre', `%${palabra}%`)
    })
  } else {
    // Una sola palabra: buscar en nombre, clave y clave alterna
    query = query.or(`clave.ilike.%${busqueda}%,codigo_barras.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%`)
  }
}

  const { data, error } = await query
  if (!error) setProductos(data || [])
  setCargando(false)
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
                const costoUnit = p.factor > 1 ? p.costo / p.factor : p.costo
                const margen = p.precio_venta > 0
                  ? ((p.precio_venta - costoUnit) / p.precio_venta * 100)
                  : 0
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>{p.nombre}</td>
                    <td style={{ ...td, color: '#888', fontSize: '12px' }}>{p.clave || '—'}</td>
                    <td style={{ ...td, color: '#888', fontSize: '12px' }}>{p.codigo_barras || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: '#f97316' }}>{fmt(p.precio_venta)}</td>
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

const th = {
  padding: '10px 1.25rem', textAlign: 'left',
  fontSize: '12px', color: '#888', fontWeight: '600'
}
const td = {
  padding: '10px 1.25rem', fontSize: '14px', color: '#333'
}