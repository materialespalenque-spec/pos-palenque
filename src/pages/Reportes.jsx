import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const hoy = new Date().toISOString().split('T')[0]

const primerDiaMes = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const fmt = n => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN'
}).format(n || 0)

const fmtFecha = f => {
  if (!f) return ''
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

const nombreMes = key => {
  const [y, m] = key.split('-')
  const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${meses[parseInt(m)]} ${y}`
}

export default function Reportes() {
  const [desde, setDesde]       = useState(primerDiaMes())
  const [hasta, setHasta]       = useState(hoy)
  const [datos, setDatos]       = useState(null)
  const [cargando, setCargando] = useState(false)
  const [vista, setVista]       = useState('dia')

  async function cargarReporte(d = desde, h = hasta) {
    setCargando(true)
    setDatos(null)

    let ventas = []
    let desde_idx = 0
    while (true) {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, total, subtotal, iva, descuento, estado, created_at, folio')
        .gte('created_at', `${d}T00:00:00`)
        .lte('created_at', `${h}T23:59:59`)
        .order('created_at', { ascending: false })
        .range(desde_idx, desde_idx + 999)
      if (error || !data || data.length === 0) break
      ventas = [...ventas, ...data]
      if (data.length < 1000) break
      desde_idx += 1000
    }

    let pagos = []
    let pagos_idx = 0
    while (true) {
      const { data, error } = await supabase
        .from('pagos')
        .select('metodo, monto, ventas!inner(created_at)')
        .gte('ventas.created_at', `${d}T00:00:00`)
        .lte('ventas.created_at', `${h}T23:59:59`)
        .range(pagos_idx, pagos_idx + 999)
      if (error || !data || data.length === 0) break
      pagos = [...pagos, ...data]
      if (data.length < 1000) break
      pagos_idx += 1000
    }

    const completadas = ventas.filter(v => v.estado === 'completada')
    const canceladas  = ventas.filter(v => v.estado === 'cancelada')
    const total       = completadas.reduce((s, v) => s + Number(v.total), 0)
    const promedio    = completadas.length > 0 ? total / completadas.length : 0

    const porDia = {}
    completadas.forEach(v => {
      const dia = v.created_at?.split('T')[0] || 'Sin fecha'
      if (!porDia[dia]) porDia[dia] = { count: 0, total: 0 }
      porDia[dia].count++
      porDia[dia].total += Number(v.total)
    })

    const porMetodo = {}
    pagos.forEach(p => {
      if (!porMetodo[p.metodo]) porMetodo[p.metodo] = 0
      porMetodo[p.metodo] += Number(p.monto)
    })

    setDatos({
      total_ventas:     completadas.length,
      total_canceladas: canceladas.length,
      monto_total:      total,
      ticket_promedio:  promedio,
      por_dia:          Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0])),
      por_metodo:       porMetodo,
    })
    setCargando(false)
  }

  useEffect(() => { cargarReporte() }, [])

  const setHoy = () => { setDesde(hoy); setHasta(hoy); cargarReporte(hoy, hoy) }
  const setMes = () => { const d = primerDiaMes(); setDesde(d); setHasta(hoy); cargarReporte(d, hoy) }

  const METODOS = {
    efectivo:      { label: 'Efectivo',      color: '#1D9E75' },
    tarjeta:       { label: 'Tarjeta',       color: '#534AB7' },
    transferencia: { label: 'Transferencia', color: '#0C447C' },
    credito:       { label: 'Crédito',       color: '#BA7517' },
    otro:          { label: 'Otro',          color: '#888'    },
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
        marginBottom: '1.25rem', background: 'white', padding: '1rem',
        borderRadius: '10px', border: '1px solid #e0e0e0'
      }}>
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
        <button onClick={() => cargarReporte()} style={{
          padding: '8px 20px', background: '#f97316', color: 'white',
          border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
        }}>Consultar</button>
        <button onClick={setHoy} style={{
          padding: '8px 16px', background: 'white', color: '#333',
          border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
        }}>Hoy</button>
        <button onClick={setMes} style={{
          padding: '8px 16px', background: 'white', color: '#333',
          border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
        }}>Este mes</button>
      </div>

      {cargando && <p style={{ color: '#888' }}>Cargando reporte...</p>}

      {datos && <>
        {/* Tarjetas */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '1rem', marginBottom: '1.25rem'
        }}>
          {[
            { label: 'Ventas completadas', valor: datos.total_ventas,        color: '#1D9E75' },
            { label: 'Monto total',        valor: fmt(datos.monto_total),    color: '#f97316' },
            { label: 'Ticket promedio',    valor: fmt(datos.ticket_promedio), color: '#534AB7' },
            { label: 'Canceladas',         valor: datos.total_canceladas,    color: '#e53e3e' },
          ].map((t, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: '10px', padding: '1.25rem',
              border: '1px solid #e0e0e0', borderTop: `4px solid ${t.color}`
            }}>
              <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#888' }}>{t.label}</p>
              <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: t.color }}>{t.valor}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
          {[
            { id: 'dia',        label: '📅 Por día' },
            { id: 'pagos',      label: '💳 Por método de pago' },
            { id: 'resultados', label: '📈 Estado de Resultados' },
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

        {/* Vista por día */}
        {vista === 'dia' && (
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={th}>Fecha</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ventas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {datos.por_dia.map(([dia, d]) => (
                  <tr key={dia} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>{fmtFecha(dia)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{d.count}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: '#f97316' }}>{fmt(d.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                  <td style={{ ...td, fontWeight: '700' }}>Total</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700' }}>
                    {datos.por_dia.reduce((s, [, d]) => s + d.count, 0)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>
                    {fmt(datos.por_dia.reduce((s, [, d]) => s + d.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Vista por método de pago */}
        {vista === 'pagos' && (
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Desglose por método de pago</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={th}>Método</th>
                  <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                  <th style={{ ...th, textAlign: 'right' }}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(datos.por_metodo)
                  .sort((a, b) => b[1] - a[1])
                  .map(([metodo, monto]) => {
                    const pct = datos.monto_total > 0
                      ? ((monto / datos.monto_total) * 100).toFixed(1) : 0
                    const cfg = METODOS[metodo] || { label: metodo, color: '#888' }
                    return (
                      <tr key={metodo} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={td}>
                          <span style={{
                            display: 'inline-block', width: '10px', height: '10px',
                            borderRadius: '50%', background: cfg.color, marginRight: '8px'
                          }}/>
                          {cfg.label}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: cfg.color }}>
                          {fmt(monto)}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: '#888' }}>{pct}%</td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                  <td style={{ ...td, fontWeight: '700' }}>Total cobrado</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>
                    {fmt(Object.values(datos.por_metodo).reduce((s, v) => s + v, 0))}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Vista estado de resultados */}
        {vista === 'resultados' && (
          <EstadoResultados desde={desde} hasta={hasta} />
        )}
      </>}
    </div>
  )
}

function EstadoResultados({ desde, hasta }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const { data, error } = await supabase.rpc('reporte_estado_resultados', {
        fecha_desde: `${desde}T00:00:00`,
        fecha_hasta: `${hasta}T23:59:59`
      })
      if (error) { console.error(error); setCargando(false); return }
      const meses = (data || []).map(d => ({
        mes:      d.mes,
        ventas:   Number(d.ventas || 0),
        costo:    Number(d.costo || 0),
        utilidad: Number(d.ventas || 0) - Number(d.costo || 0),
        margen:   Number(d.ventas) > 0
          ? ((Number(d.ventas) - Number(d.costo)) / Number(d.ventas) * 100)
          : 0
      }))
      setDatos(meses)
      setCargando(false)
    }
    cargar()
  }, [desde, hasta])

  if (cargando) return <p style={{ color: '#888' }}>Calculando estado de resultados...</p>
  if (!datos || datos.length === 0) return <p style={{ color: '#888' }}>Sin datos para el período.</p>

  const totalVentas   = datos.reduce((s, d) => s + d.ventas, 0)
  const totalCosto    = datos.reduce((s, d) => s + d.costo, 0)
  const totalUtilidad = totalVentas - totalCosto
  const margenTotal   = totalVentas > 0 ? (totalUtilidad / totalVentas * 100) : 0

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Estado de Resultados por Mes</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9f9f9' }}>
            <th style={th}>Mes</th>
            <th style={{ ...th, textAlign: 'right' }}>Ventas</th>
            <th style={{ ...th, textAlign: 'right' }}>Costo</th>
            <th style={{ ...th, textAlign: 'right' }}>Utilidad</th>
            <th style={{ ...th, textAlign: 'right' }}>Margen</th>
          </tr>
        </thead>
        <tbody>
          {datos.map(d => (
            <tr key={d.mes} style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={td}>{nombreMes(d.mes)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmt(d.ventas)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#e53e3e' }}>{fmt(d.costo)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: d.utilidad >= 0 ? '#1D9E75' : '#e53e3e' }}>{fmt(d.utilidad)}</td>
              <td style={{ ...td, textAlign: 'right', color: d.margen >= 0 ? '#534AB7' : '#e53e3e' }}>{d.margen.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
            <td style={{ ...td, fontWeight: '700' }}>Total</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: '700' }}>{fmt(totalVentas)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#e53e3e' }}>{fmt(totalCosto)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: totalUtilidad >= 0 ? '#1D9E75' : '#e53e3e' }}>{fmt(totalUtilidad)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: margenTotal >= 0 ? '#534AB7' : '#e53e3e' }}>{margenTotal.toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
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