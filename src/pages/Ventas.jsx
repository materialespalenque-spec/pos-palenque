import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const hoy = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]

const fmt = n => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN'
}).format(n || 0)

const fmtFecha = f => {
  if (!f) return ''
  const d = new Date(f)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const fmtHora = f => {
  if (!f) return ''
  const d = new Date(f)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

const METODOS = {
  efectivo:      { label: 'Efectivo',      color: '#1D9E75' },
  tarjeta:       { label: 'Tarjeta',       color: '#534AB7' },
  transferencia: { label: 'Transferencia', color: '#0C447C' },
  credito:       { label: 'Crédito',       color: '#BA7517' },
  cheque:        { label: 'Cheque',        color: '#888' },
}

export default function Ventas() {
  const [desde, setDesde]               = useState(hoy())
  const [hasta, setHasta]               = useState(hoy())
  const [busqueda, setBusqueda]         = useState('')
  const [ventas, setVentas]             = useState([])
  const [cargando, setCargando]         = useState(false)
  const [ventaAbierta, setVentaAbierta] = useState(null)
  const [filaSeleccionada, setFilaSeleccionada] = useState(null)
  const [vista, setVista]               = useState('lista')
  const [ayer, setAyer]                 = useState(null)

  useEffect(() => {
    cargarVentas()
    cargarAyer()
  }, [])

  async function cargarVentas(d = desde, h = hasta) {
    setCargando(true)
    setVentas([])
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id, folio, total, subtotal, descuento, recargo, estado, created_at,
        direccion_entrega,
        contactos(id, nombre, telefono, colonia, direccion),
        clientes(id, nombre, rfc, telefono, direccion),
        usuarios(email),
        pagos(metodo, monto)
      `)
      .gte('created_at', new Date(`${d}T00:00:00`).toISOString())
      .lte('created_at', new Date(`${h}T23:59:59`).toISOString())
      .order('created_at', { ascending: false })
    if (!error && data) setVentas(data)
    setCargando(false)
  }

  async function cargarAyer() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const fecha = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]
    const { data } = await supabase
      .from('ventas')
      .select('total, estado')
      .gte('created_at', new Date(`${fecha}T00:00:00`).toISOString())
      .lte('created_at', new Date(`${fecha}T23:59:59`).toISOString())
    if (data) {
      const completadas = data.filter(v => v.estado === 'completada')
      setAyer(completadas.reduce((s, v) => s + Number(v.total), 0))
    }
  }

  const consultar = () => cargarVentas()

  const setHoyFecha = () => {
    const h = hoy(); setDesde(h); setHasta(h); cargarVentas(h, h)
  }
  const setAyerFecha = () => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    const f = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]
    setDesde(f); setHasta(f); cargarVentas(f, f)
  }
  const setSemana = () => {
    const d = new Date(); d.setDate(d.getDate() - 6)
    const f = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]
    const h = hoy(); setDesde(f); setHasta(h); cargarVentas(f, h)
  }

  const ventasFiltradas = ventas.filter(v => {
    if (!busqueda.trim()) return true
    const q = busqueda.trim().toLowerCase()
    if (q.startsWith('$')) {
      const monto = parseFloat(q.replace('$', '').replace(',', ''))
      return !isNaN(monto) && Number(v.total) === monto
    }
    return (
      v.folio?.toLowerCase().includes(q) ||
      v.contactos?.nombre?.toLowerCase().includes(q) ||
      v.clientes?.nombre?.toLowerCase().includes(q) ||
      v.usuarios?.email?.toLowerCase().includes(q)
    )
  })

  const completadas = ventasFiltradas.filter(v => v.estado === 'completada')
  const canceladas  = ventasFiltradas.filter(v => v.estado === 'cancelada')
  const totalVentas = completadas.reduce((s, v) => s + Number(v.total), 0)
  const totalDesc   = completadas.reduce((s, v) => s + Number(v.descuento || 0), 0)
  const ticketProm  = completadas.length > 0 ? totalVentas / completadas.length : 0
  const crecimiento = ayer > 0 ? ((totalVentas - ayer) / ayer * 100) : null

  const porMetodo = completadas.reduce((acc, v) => {
    v.pagos?.forEach(p => {
      acc[p.metodo] = (acc[p.metodo] || 0) + Number(p.monto)
    })
    return acc
  }, {})

  const abrirVenta = (v) => setVentaAbierta({ ...v })

  if (ventaAbierta) {
    return <DetalleVenta venta={ventaAbierta} onVolver={() => { setVentaAbierta(null); cargarVentas() }} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Filtros */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }} />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }} />
        </div>
        <button onClick={consultar} style={{ padding: '8px 20px', background: '#f97316', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Consultar</button>
        <button onClick={setHoyFecha} style={{ padding: '8px 14px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Hoy</button>
        <button onClick={setAyerFecha} style={{ padding: '8px 14px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Ayer</button>
        <button onClick={setSemana} style={{ padding: '8px 14px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>7 días</button>
        {vista === 'lista' && (
          <input type="text" placeholder="🔍 Buscar folio, cliente, vendedor o $monto..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ flex: 1, minWidth: '250px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {[
          { id: 'lista',    label: '🧾 Ventas' },
          { id: 'corte',    label: '🏧 Corte de caja' },
          { id: 'articulo', label: '📦 Por artículo' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setVista(tab.id)} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            fontWeight: vista === tab.id ? '600' : '400',
            background: vista === tab.id ? '#1a1a2e' : 'white',
            color: vista === tab.id ? 'white' : '#555',
            border: '1px solid #ddd', cursor: 'pointer'
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Tarjetas resumen — solo en lista y corte */}
      {vista !== 'articulo' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <Tarjeta label="Tickets" valor={completadas.length} color="#1D9E75" />
          <Tarjeta label="Total ventas" valor={fmt(totalVentas)} color="#f97316" />
          <Tarjeta label="Ticket promedio" valor={fmt(ticketProm)} color="#534AB7" />
          <Tarjeta label="Descuentos" valor={fmt(totalDesc)} color="#BA7517" />
          <Tarjeta label="Canceladas" valor={canceladas.length} color="#e53e3e" />
          {crecimiento !== null && (
            <Tarjeta
              label="vs ayer"
              valor={`${crecimiento >= 0 ? '▲' : '▼'} ${Math.abs(crecimiento).toFixed(1)}%`}
              color={crecimiento >= 0 ? '#1D9E75' : '#e53e3e'}
            />
          )}
        </div>
      )}

      {/* Vista lista */}
      {vista === 'lista' && (
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
          {cargando ? (
            <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>Cargando ventas...</p>
          ) : ventasFiltradas.length === 0 ? (
            <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>Sin ventas en el período.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={th}>Folio</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Hora</th>
                  <th style={th}>Cliente / Entrega</th>
                  <th style={th}>Vendedor</th>
                  <th style={{ ...th, textAlign: 'center' }}>Método</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas.map(v => (
                  <tr key={v.id}
                    onClick={() => setFilaSeleccionada(v.id === filaSeleccionada ? null : v.id)}
                    onDoubleClick={() => abrirVenta(v)}
                    style={{
                      borderTop: '1px solid #f0f0f0',
                      opacity: v.estado === 'cancelada' ? 0.5 : 1,
                      cursor: 'pointer',
                      background: filaSeleccionada === v.id ? '#fff7ed' : 'white',
                      borderLeft: filaSeleccionada === v.id ? '3px solid #f97316' : '3px solid transparent',
                    }}>
                    <td style={{ ...td, fontWeight: '600', color: '#534AB7' }}>{v.folio}</td>
                    <td style={td}>{fmtFecha(v.created_at)}</td>
                    <td style={td}>{fmtHora(v.created_at)}</td>
                    <td style={td}>{v.clientes?.nombre || v.contactos?.nombre || <span style={{ color: '#ccc' }}>Mostrador</span>}</td>
                    <td style={{ ...td, fontSize: '12px', color: '#888' }}>{v.usuarios?.email?.split('@')[0] || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {v.pagos?.map((p, i) => (
                        <span key={i} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '10px', background: `${METODOS[p.metodo]?.color}20`, color: METODOS[p.metodo]?.color, fontWeight: '600', marginRight: '2px' }}>
                          {METODOS[p.metodo]?.label || p.metodo}
                        </span>
                      ))}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: v.estado === 'cancelada' ? '#e53e3e' : '#f97316' }}>{fmt(v.total)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: v.estado === 'completada' ? '#f0fdf4' : '#fef2f2', color: v.estado === 'completada' ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                        {v.estado === 'completada' ? 'Completada' : 'Cancelada'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={e => { e.stopPropagation(); abrirVenta(v) }}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '12px', cursor: 'pointer', color: '#333' }}>
                        Ver →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                  <td colSpan={6} style={{ ...td, fontWeight: '700' }}>Total ({completadas.length} ventas)</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(totalVentas)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Vista corte de caja */}
      {vista === 'corte' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Resumen del período</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <FilaResumen label="Tickets completados" valor={completadas.length} />
              <FilaResumen label="Total ventas" valor={fmt(totalVentas)} destacado />
              <FilaResumen label="Ticket promedio" valor={fmt(ticketProm)} />
              <FilaResumen label="Total descuentos" valor={fmt(totalDesc)} color="#e53e3e" />
              <FilaResumen label="Tickets cancelados" valor={canceladas.length} color="#e53e3e" />
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Por método de pago</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).map(([metodo, monto]) => (
                <div key={metodo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: METODOS[metodo]?.color || '#888', display: 'inline-block' }}></span>
                    <span style={{ fontSize: '13px', color: '#555' }}>{METODOS[metodo]?.label || metodo}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: METODOS[metodo]?.color || '#333' }}>{fmt(monto)}</span>
                    <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '6px' }}>
                      {totalVentas > 0 ? ((monto / totalVentas) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              ))}
              {Object.keys(porMetodo).length === 0 && <p style={{ color: '#ccc', fontSize: '13px' }}>Sin datos</p>}
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1', background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Resumen por vendedor</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={th}>Vendedor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Tickets</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Descuentos</th>
                  <th style={{ ...th, textAlign: 'right' }}>Promedio</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const porVendedor = completadas.reduce((acc, v) => {
                    const email = v.usuarios?.email?.split('@')[0] || 'Sin asignar'
                    if (!acc[email]) acc[email] = { tickets: 0, total: 0, descuento: 0 }
                    acc[email].tickets++
                    acc[email].total     += Number(v.total)
                    acc[email].descuento += Number(v.descuento || 0)
                    return acc
                  }, {})
                  return Object.entries(porVendedor).sort((a, b) => b[1].total - a[1].total).map(([email, d]) => (
                    <tr key={email} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ ...td, fontWeight: '600' }}>{email}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{d.tickets}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(d.total)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#e53e3e' }}>{fmt(d.descuento)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#888' }}>{fmt(d.total / d.tickets)}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista por artículo */}
      {vista === 'articulo' && <PorArticulo desde={desde} hasta={hasta} />}
    </div>
  )
}

function PorArticulo({ desde, hasta }) {
  const [busqueda, setBusqueda]     = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando]     = useState(false)
  const [resumen, setResumen]       = useState(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqueda.trim()) { setResultados([]); setResumen(null); return }
      setBuscando(true)
      const { data } = await supabase
        .from('venta_items')
        .select(`
          nombre_producto, cantidad, subtotal, precio_unitario,
          ventas!inner(created_at, estado, folio)
        `)
        .ilike('nombre_producto', `%${busqueda}%`)
        .eq('ventas.estado', 'completada')
        .gte('ventas.created_at', new Date(`${desde}T00:00:00`).toISOString())
        .lte('ventas.created_at', new Date(`${hasta}T23:59:59`).toISOString())
        .order('nombre_producto')

      if (data) {
        const totalUnidades = data.reduce((s, i) => s + Number(i.cantidad), 0)
        const totalMonto    = data.reduce((s, i) => s + Number(i.subtotal), 0)
        const porProducto   = data.reduce((acc, i) => {
          const k = i.nombre_producto
          if (!acc[k]) acc[k] = { unidades: 0, monto: 0, ventas: 0 }
          acc[k].unidades += Number(i.cantidad)
          acc[k].monto    += Number(i.subtotal)
          acc[k].ventas   += 1
          return acc
        }, {})
        setResumen({ totalUnidades, totalMonto, porProducto, items: data })
        setResultados(data)
      }
      setBuscando(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [busqueda, desde, hasta])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem' }}>
        <input type="text" placeholder="🔍 Buscar producto — ej: block, cemento, varilla..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }}
        />
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#aaa' }}>
          Período: {desde} al {hasta}
        </p>
      </div>

      {buscando && <p style={{ color: '#888', textAlign: 'center' }}>Buscando...</p>}

      {resumen && !buscando && (
        <>
          {/* Tarjetas resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            <Tarjeta label="Total unidades" valor={resumen.totalUnidades.toFixed(2)} color="#1D9E75" />
            <Tarjeta label="Total monto" valor={fmt(resumen.totalMonto)} color="#f97316" />
            <Tarjeta label="Aparece en" valor={`${resultados.length} ventas`} color="#534AB7" />
          </div>

          {/* Resumen por producto si hay múltiples */}
          {Object.keys(resumen.porProducto).length > 1 && (
            <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Resumen por producto</h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9' }}>
                    <th style={th}>Producto</th>
                    <th style={{ ...th, textAlign: 'right' }}>Unidades</th>
                    <th style={{ ...th, textAlign: 'right' }}>Ventas</th>
                    <th style={{ ...th, textAlign: 'right' }}>Monto total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(resumen.porProducto).sort((a, b) => b[1].monto - a[1].monto).map(([nombre, d]) => (
                    <tr key={nombre} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={td}>{nombre}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '600' }}>{d.unidades.toFixed(2)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#888' }}>{d.ventas}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(d.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detalle de ventas */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Detalle de ventas</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={th}>Producto</th>
                  <th style={th}>Folio</th>
                  <th style={th}>Fecha</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cantidad</th>
                  <th style={{ ...th, textAlign: 'right' }}>Precio</th>
                  <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((item, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>{item.nombre_producto}</td>
                    <td style={{ ...td, color: '#534AB7', fontWeight: '600' }}>{item.ventas?.folio}</td>
                    <td style={{ ...td, color: '#888', fontSize: '12px' }}>
                      {new Date(item.ventas?.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600' }}>{Number(item.cantidad).toFixed(2)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                  <td colSpan={3} style={{ ...td, fontWeight: '700' }}>Total</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700' }}>{resumen.totalUnidades.toFixed(2)}</td>
                  <td></td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(resumen.totalMonto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!buscando && busqueda && resultados.length === 0 && (
        <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>
          Sin resultados para "{busqueda}" en el período seleccionado.
        </p>
      )}
    </div>
  )
}

function DetalleVenta({ venta, onVolver }) {
  const [items, setItems]                     = useState([])
  const [cargando, setCargando]               = useState(true)
  const [cancelando, setCancelando]           = useState(false)
  const [confirmando, setConfirmando]         = useState(false)
  const [mostrarDir, setMostrarDir]           = useState(false)
  const [editandoEntrega, setEditandoEntrega] = useState(false)
  const [busqContacto, setBusqContacto]       = useState('')
  const [contactos, setContactos]             = useState([])
  const [guardandoEntrega, setGuardandoEntrega] = useState(false)
  const [contactoActual, setContactoActual]   = useState(venta.contactos)
  const [dirActual, setDirActual]             = useState(venta.direccion_entrega)
  const [error, setError]                     = useState(null)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('venta_items')
        .select('nombre_producto, cantidad, precio_unitario, descuento, subtotal')
        .eq('venta_id', venta.id)
      setItems(data || [])
      setCargando(false)
    }
    cargar()
  }, [venta.id])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqContacto.trim()) { setContactos([]); return }
      const { data } = await supabase
        .from('contactos')
        .select('id, nombre, telefono, colonia, direccion')
        .ilike('nombre', `%${busqContacto}%`)
        .limit(5)
      setContactos(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [busqContacto])

  const asignarEntrega = async (contacto) => {
    setGuardandoEntrega(true)
    const { error: e } = await supabase
      .from('ventas')
      .update({ contacto_id: contacto.id, direccion_entrega: contacto.direccion })
      .eq('id', venta.id)
    if (!e) {
      setContactoActual(contacto)
      setDirActual(contacto.direccion)
      setEditandoEntrega(false)
      setBusqContacto('')
      setContactos([])
      setMostrarDir(false)
    }
    setGuardandoEntrega(false)
  }

  const cancelarVenta = async () => {
    setCancelando(true)
    setError(null)
    const { error: e } = await supabase.from('ventas').update({ estado: 'cancelada' }).eq('id', venta.id)
    if (e) { setError(e.message); setCancelando(false); return }
    setConfirmando(false)
    onVolver()
  }

  const reimprimir = () => {
    const w = window.open('', '_blank', 'width=400,height=600')
    const metodosTexto = (venta.pagos || []).map(p => METODOS[p.metodo]?.label || p.metodo).join(', ') || '—'
    w.document.write(`
      <html><head><title>Ticket ${venta.folio}</title>
      <style>body{font-family:monospace;font-size:12px;max-width:320px;margin:0 auto;padding:1rem}
      table{width:100%;border-collapse:collapse}th{text-align:left;padding-bottom:4px}
      td{padding-top:4px}hr{border:none;border-top:1px dashed #ccc;margin:8px 0}
      .right{text-align:right}.center{text-align:center}.bold{font-weight:700}.total{font-size:14px}
      </style></head><body>
      <div class="center"><div class="bold" style="font-size:14px">MATERIALES PALENQUE</div>
      <div>Palenque, Chiapas</div>
      <div style="font-size:11px;color:#888">${new Date(venta.created_at).toLocaleString('es-MX')}</div></div>
      <hr>
      <div>Folio: <strong>${venta.folio}</strong></div>
      ${venta.clientes ? `
        <div>Cliente: <strong>${venta.clientes.nombre}</strong></div>
        ${venta.clientes.rfc ? `<div>RFC: ${venta.clientes.rfc}</div>` : ''}
      ` : ''}
      ${contactoActual ? `
        <div>Entrega: <strong>${contactoActual.nombre}</strong></div>
        ${contactoActual.telefono ? `<div>Tel: ${contactoActual.telefono}</div>` : ''}
        ${dirActual ? `<div>Dir: ${dirActual}</div>` : ''}
      ` : ''}
      <hr>
      <div>
        ${items.map((i, idx) => {
          const totalItem   = Math.round(i.subtotal * 100) / 100
          const precioFinal = Math.round((totalItem / Number(i.cantidad)) * 100) / 100
          return `<div style="margin-top:${idx === 0 ? 0 : '7px'};padding-bottom:7px;${idx < items.length - 1 ? 'border-bottom:1px dotted #eee' : ''}">
            <div style="font-weight:600">${i.nombre_producto}</div>
            <div style="display:flex;justify-content:space-between;color:#555;margin-top:2px">
              <span>${i.cantidad} x ${precioFinal.toFixed(2)}</span>
              <span style="font-weight:600">${totalItem.toFixed(2)}</span>
            </div>
          </div>`
        }).join('')}
      </div>
      <hr>
      <div style="display:flex;justify-content:space-between" class="bold total"><span>TOTAL</span><span>$${Number(venta.total).toFixed(2)}</span></div>
      ${(Number(venta.descuento) > 0 || Number(venta.recargo) > 0) ? `<div style="font-size:10px;color:#aaa;font-style:italic;margin-top:4px">(precios de arriba ya incluyen${Number(venta.descuento) > 0 ? ` descuento de $${Number(venta.descuento).toFixed(2)}` : ''}${Number(venta.descuento) > 0 && Number(venta.recargo) > 0 ? ' y' : ''}${Number(venta.recargo) > 0 ? ` recargo de $${Number(venta.recargo).toFixed(2)}` : ''})</div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-top:2px"><span>Pago</span><span>${metodosTexto}</span></div>
      <hr><div class="center" style="color:#888;font-size:11px">¡Gracias por su compra!</div>
      </body></html>
    `)
    w.document.close()
    w.print()
  }

  const totalItems = items.reduce((s, i) => s + Number(i.subtotal), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <button onClick={onVolver} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
          ← Volver
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={reimprimir} style={{ padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            🖨️ Reimprimir
          </button>
          {venta.estado === 'completada' && !confirmando && (
            <button onClick={() => setConfirmando(true)} style={{ padding: '8px 16px', background: '#fef2f2', color: '#e53e3e', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
              ✕ Cancelar venta
            </button>
          )}
          {confirmando && (
            <>
              <button onClick={cancelarVenta} disabled={cancelando} style={{ padding: '8px 16px', background: '#e53e3e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                {cancelando ? 'Cancelando...' : '⚠️ Confirmar cancelación'}
              </button>
              <button onClick={() => setConfirmando(false)} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                No, volver
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p style={{ color: '#e53e3e', fontSize: '13px', padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Productos — {venta.folio}</h3>
          </div>
          {cargando ? (
            <p style={{ padding: '2rem', color: '#888' }}>Cargando...</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={th}>Producto</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cant.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Precio</th>
                  <th style={{ ...th, textAlign: 'right' }}>Desc.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>{item.nombre_producto}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{Number(item.cantidad)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#e53e3e' }}>{Number(item.descuento) > 0 ? fmt(item.descuento) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: '#f97316' }}>{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                  <td colSpan={4} style={{ ...td, fontWeight: '700' }}>Total</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(totalItems)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Información</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <FilaInfo label="Folio" valor={venta.folio} />
              <FilaInfo label="Fecha" valor={fmtFecha(venta.created_at)} />
              <FilaInfo label="Hora" valor={fmtHora(venta.created_at)} />
              <FilaInfo label="Vendedor" valor={venta.usuarios?.email?.split('@')[0] || '—'} />
              <FilaInfo label="Cliente" valor={venta.clientes?.nombre || 'Sin cliente'} />
              <FilaInfo label="Entrega" valor={contactoActual?.nombre || 'Mostrador'} />
              {contactoActual?.telefono && <FilaInfo label="Teléfono" valor={contactoActual.telefono} />}

              {dirActual && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ color: '#888' }}>Dirección</span>
                    <button onClick={() => setMostrarDir(!mostrarDir)} style={{
                      padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                      background: mostrarDir ? '#1a1a2e' : '#f0f0f0',
                      color: mostrarDir ? 'white' : '#555',
                      border: 'none', cursor: 'pointer'
                    }}>
                      {mostrarDir ? 'Ocultar' : 'Ver dirección'}
                    </button>
                  </div>
                  {mostrarDir && (
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#555', background: '#f9f9f9', padding: '8px', borderRadius: '6px', lineHeight: '1.5' }}>
                      {dirActual}
                    </p>
                  )}
                </>
              )}

              {!editandoEntrega && venta.estado === 'completada' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button onClick={() => setEditandoEntrega(true)} style={{
                    padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                    background: contactoActual ? '#f0f0f0' : '#f0fdf4',
                    color: contactoActual ? '#555' : '#1D9E75',
                    border: `1px solid ${contactoActual ? '#ddd' : '#bbf7d0'}`,
                    cursor: 'pointer'
                  }}>
                    {contactoActual ? '✏️ Cambiar entrega' : '+ Agregar entrega'}
                  </button>
                </div>
              )}

              {editandoEntrega && (
                <div style={{ position: 'relative', marginTop: '4px' }}>
                  <input type="text" placeholder="Buscar contacto..." value={busqContacto}
                    onChange={e => setBusqContacto(e.target.value)}
                    autoFocus
                    style={{ width: '100%', padding: '8px 32px 8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  <button onClick={() => { setEditandoEntrega(false); setBusqContacto(''); setContactos([]) }}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '16px' }}>✕</button>
                  {contactos.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '4px' }}>
                      {contactos.map(c => (
                        <div key={c.id} onClick={() => asignarEntrega(c)}
                          style={{ padding: '8px 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f9f9f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}
                        >
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{c.nombre}</p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>{c.colonia} — {c.telefono}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {guardandoEntrega && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>Guardando...</p>}
                </div>
              )}

              <FilaInfo label="Estado" valor={
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: venta.estado === 'completada' ? '#f0fdf4' : '#fef2f2', color: venta.estado === 'completada' ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                  {venta.estado === 'completada' ? 'Completada' : 'Cancelada'}
                </span>
              } />
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Resumen</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <FilaInfo label="Subtotal" valor={fmt(venta.subtotal)} />
              {Number(venta.descuento) > 0 && (
                <FilaInfo label="Descuento" valor={`-${fmt(venta.descuento)}`} color="#e53e3e" />
              )}
              {Number(venta.recargo) > 0 && (
                <FilaInfo label="Recargo" valor={`+${fmt(venta.recargo)}`} color="#0C447C" />
              )}
              <FilaInfo label="Total" valor={fmt(venta.total)} bold color="#f97316" />
              {venta.pagos?.map((p, i) => (
                <FilaInfo key={i} label={METODOS[p.metodo]?.label || p.metodo} valor={fmt(p.monto)} color={METODOS[p.metodo]?.color} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tarjeta({ label, valor, color }) {
  return (
    <div style={{ background: 'white', borderRadius: '10px', padding: '1.25rem', border: '1px solid #e0e0e0', borderTop: `4px solid ${color}` }}>
      <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#888' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color }}>{valor}</p>
    </div>
  )
}

function FilaResumen({ label, valor, destacado, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: destacado ? '16px' : '13px' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ fontWeight: destacado ? '700' : '600', color: color || (destacado ? '#f97316' : '#333') }}>{valor}</span>
    </div>
  )
}

function FilaInfo({ label, valor, bold, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ fontWeight: bold ? '700' : '500', color: color || '#333' }}>{valor}</span>
    </div>
  )
}

const th = { padding: '10px 1rem', textAlign: 'left', fontSize: '12px', color: '#888', fontWeight: '600' }
const td = { padding: '10px 1rem', fontSize: '13px', color: '#333' }
