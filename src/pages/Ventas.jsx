import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const hoy = new Date().toISOString().split('T')[0]

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
  const [desde, setDesde]           = useState(hoy)
  const [hasta, setHasta]           = useState(hoy)
  const [busqueda, setBusqueda]     = useState('')
  const [ventas, setVentas]         = useState([])
  const [cargando, setCargando]     = useState(false)
  const [ventaAbierta, setVentaAbierta] = useState(null)
  const [vista, setVista]           = useState('lista') // lista | corte
  const [ayer, setAyer]             = useState(null)

  useEffect(() => {
    cargarVentas()
  }, [])

  async function cargarVentas(d = desde, h = hasta) {
    setCargando(true)
    setVentas([])
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id, folio, total, subtotal, descuento, estado, created_at,
        contactos(nombre),
        usuarios(email),
        pagos(metodo, monto)
      `)
      .gte('created_at', `${d}T00:00:00`)
      .lte('created_at', `${h}T23:59:59`)
      .order('created_at', { ascending: false })
    if (!error && data) setVentas(data)
    setCargando(false)
  }

  async function cargarAyer() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const fecha = d.toISOString().split('T')[0]
    const { data } = await supabase
      .from('ventas')
      .select('total, estado')
      .gte('created_at', `${fecha}T00:00:00`)
      .lte('created_at', `${fecha}T23:59:59`)
    if (data) {
      const completadas = data.filter(v => v.estado === 'completada')
      setAyer(completadas.reduce((s, v) => s + Number(v.total), 0))
    }
  }

  useEffect(() => { cargarAyer() }, [])

  const consultar = () => cargarVentas()

  const setHoy = () => { setDesde(hoy); setHasta(hoy); cargarVentas(hoy, hoy) }
  const setAyerFecha = () => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    const f = d.toISOString().split('T')[0]
    setDesde(f); setHasta(f); cargarVentas(f, f)
  }
  const setSemana = () => {
    const d = new Date(); d.setDate(d.getDate() - 6)
    const f = d.toISOString().split('T')[0]
    setDesde(f); setHasta(hoy); cargarVentas(f, hoy)
  }

  const ventasFiltradas = ventas.filter(v => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    return (
      v.folio?.toLowerCase().includes(q) ||
      v.contactos?.nombre?.toLowerCase().includes(q) ||
      v.usuarios?.email?.toLowerCase().includes(q) ||
      String(v.total).includes(q)
    )
  })

  const completadas  = ventasFiltradas.filter(v => v.estado === 'completada')
  const canceladas   = ventasFiltradas.filter(v => v.estado === 'cancelada')
  const totalVentas  = completadas.reduce((s, v) => s + Number(v.total), 0)
  const totalDesc    = completadas.reduce((s, v) => s + Number(v.descuento || 0), 0)
  const ticketProm   = completadas.length > 0 ? totalVentas / completadas.length : 0
  const crecimiento  = ayer > 0 ? ((totalVentas - ayer) / ayer * 100) : null

  const porMetodo = completadas.reduce((acc, v) => {
    v.pagos?.forEach(p => {
      acc[p.metodo] = (acc[p.metodo] || 0) + Number(p.monto)
    })
    return acc
  }, {})

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
        <button onClick={setHoy} style={{ padding: '8px 14px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Hoy</button>
        <button onClick={setAyerFecha} style={{ padding: '8px 14px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Ayer</button>
        <button onClick={setSemana} style={{ padding: '8px 14px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>7 días</button>
        <input type="text" placeholder="🔍 Buscar folio, cliente, vendedor o monto..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: '250px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {[
          { id: 'lista', label: '🧾 Ventas' },
          { id: 'corte', label: '🏧 Corte de caja' },
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

      {/* Tarjetas resumen */}
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
                  <tr key={v.id} onDoubleClick={() => setVentaAbierta(v)} style={{ borderTop: '1px solid #f0f0f0', opacity: v.estado === 'cancelada' ? 0.5 : 1, cursor: 'pointer' }}>
                    <td style={{ ...td, fontWeight: '600', color: '#534AB7' }}>{v.folio}</td>
                    <td style={td}>{fmtFecha(v.created_at)}</td>
                    <td style={td}>{fmtHora(v.created_at)}</td>
                    <td style={td}>{v.contactos?.nombre || <span style={{ color: '#ccc' }}>Mostrador</span>}</td>
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
                      <button onClick={() => setVentaAbierta(v)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '12px', cursor: 'pointer', color: '#333' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Resumen por vendedor</h3>
            </div>
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
                    acc[email].total    += Number(v.total)
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
    </div>
  )
}

function DetalleVenta({ venta, onVolver }) {
  const [items, setItems]           = useState([])
  const [cargando, setCargando]     = useState(true)
  const [cancelando, setCancelando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError]           = useState(null)

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

  const cancelarVenta = async () => {
    setCancelando(true)
    setError(null)
    const { error: e } = await supabase
      .from('ventas')
      .update({ estado: 'cancelada' })
      .eq('id', venta.id)
    if (e) { setError(e.message); setCancelando(false); return }
    setConfirmando(false)
    onVolver()
  }

  const reimprimir = () => {
    const ventaData = { ...venta, items, total: venta.total, cambio: 0, contacto: venta.contactos, descItems: venta.descuento }
    // Crear ventana de impresión
    const w = window.open('', '_blank', 'width=400,height=600')
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
      ${venta.contactos ? `<div>Entrega: <strong>${venta.contactos.nombre}</strong></div>` : ''}
      <hr>
      <table>
        <thead><tr><th>Producto</th><th class="right">Cant</th><th class="right">Precio</th><th class="right">Total</th></tr></thead>
        <tbody>
          ${items.map(i => {
            const precioFinal = Math.round(i.precio_unitario * 100) / 100
            const totalItem   = Math.round(i.subtotal * 100) / 100
            return `<tr><td>${i.nombre_producto}</td><td class="right">${i.cantidad}</td><td class="right">${precioFinal.toFixed(2)}</td><td class="right">${totalItem.toFixed(2)}</td></tr>`
          }).join('')}
        </tbody>
      </table>
      <hr>
      ${Number(venta.descuento) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Descuento</span><span>-$${Number(venta.descuento).toFixed(2)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between" class="bold total"><span>TOTAL</span><span>$${Number(venta.total).toFixed(2)}</span></div>
      <hr><div class="center" style="color:#888;font-size:11px">¡Gracias por su compra!</div>
      </body></html>
    `)
    w.document.close()
    w.print()
  }

  const totalItems = items.reduce((s, i) => s + Number(i.subtotal), 0)

  return (
    <div>
      {/* Header */}
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
        {/* Productos */}
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

        {/* Info venta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Información</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <FilaInfo label="Folio" valor={venta.folio} />
              <FilaInfo label="Fecha" valor={fmtFecha(venta.created_at)} />
              <FilaInfo label="Hora" valor={fmtHora(venta.created_at)} />
              <FilaInfo label="Vendedor" valor={venta.usuarios?.email?.split('@')[0] || '—'} />
              <FilaInfo label="Cliente" valor={venta.contactos?.nombre || 'Mostrador'} />
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
              {Number(venta.descuento) > 0 && <FilaInfo label="Descuento" valor={`-${fmt(venta.descuento)}`} color="#e53e3e" />}
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
