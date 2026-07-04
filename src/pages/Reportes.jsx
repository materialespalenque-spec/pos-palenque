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
  const [desde, setDesde]           = useState(primerDiaMes())
  const [hasta, setHasta]           = useState(hoy)
  const [datos, setDatos]           = useState(null)
  const [porDiaSicar, setPorDiaSicar]   = useState(null)
  const [resumenSicar, setResumenSicar] = useState(null)
  const [pagosSicar, setPagosSicar]     = useState(null)
  const [cargando, setCargando]     = useState(false)
  const [vista, setVista]           = useState('dia')

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

    const completadas = ventas.filter(v => v.estado === 'completada')
    const canceladas  = ventas.filter(v => v.estado === 'cancelada')
    const total       = completadas.reduce((s, v) => s + Number(v.total), 0)
    const promedio    = completadas.length > 0 ? total / completadas.length : 0

    setDatos({
      total_ventas:     completadas.length,
      total_canceladas: canceladas.length,
      monto_total:      total,
      ticket_promedio:  promedio,
    })
    setCargando(false)
  }

  async function cargarPorDiaSicar(d = desde, h = hasta) {
    let registros = []
    let idx = 0
    while (true) {
      const { data, error } = await supabase
        .from('sicar_ventas_dia')
        .select('fecha, tickets, ventas, compras, utilidad')
        .gte('fecha', d)
        .lte('fecha', h)
        .order('fecha', { ascending: false })
        .range(idx, idx + 999)
      if (error || !data || data.length === 0) break
      registros = [...registros, ...data]
      if (data.length < 1000) break
      idx += 1000
    }
    setPorDiaSicar(registros)
  }

  async function cargarResumenSicar(d = desde, h = hasta) {
    const { data, error } = await supabase.rpc('reporte_estado_resultados', {
      fecha_desde: `${d}T00:00:00`,
      fecha_hasta: `${h}T23:59:59`
    })
    if (error || !data) { setResumenSicar(null); return }
    const ventas_total = data.reduce((s, m) => s + Number(m.ventas || 0), 0)
    const costo_total  = data.reduce((s, m) => s + Number(m.costo || 0), 0)
    const utilidad     = ventas_total - costo_total
    const margen       = ventas_total > 0 ? (utilidad / ventas_total * 100) : 0
    setResumenSicar({ ventas: ventas_total, costo: costo_total, utilidad, margen })
  }

  async function cargarPagosSicar(d = desde, h = hasta) {
    const { data, error } = await supabase
      .from('sicar_pagos_dia')
      .select('fecha, efectivo, tarjeta, transferencia, credito, cheque, otros, total')
      .gte('fecha', d)
      .lte('fecha', h)
    if (error || !data) { setPagosSicar(null); return }
    const totales = data.reduce((s, r) => ({
      efectivo:      s.efectivo      + Number(r.efectivo || 0),
      tarjeta:       s.tarjeta       + Number(r.tarjeta || 0),
      transferencia: s.transferencia + Number(r.transferencia || 0),
      credito:       s.credito       + Number(r.credito || 0),
      cheque:        s.cheque        + Number(r.cheque || 0),
      otros:         s.otros         + Number(r.otros || 0),
      total:         s.total         + Number(r.total || 0),
    }), { efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0, cheque: 0, otros: 0, total: 0 })
    setPagosSicar(totales)
  }

  useEffect(() => {
    cargarReporte()
    cargarPorDiaSicar()
    cargarResumenSicar()
    cargarPagosSicar()
  }, [])

  const setHoy = () => {
    setDesde(hoy); setHasta(hoy)
    cargarReporte(hoy, hoy)
    cargarPorDiaSicar(hoy, hoy)
    cargarResumenSicar(hoy, hoy)
    cargarPagosSicar(hoy, hoy)
  }

  const setMes = () => {
    const d = primerDiaMes()
    setDesde(d); setHasta(hoy)
    cargarReporte(d, hoy)
    cargarPorDiaSicar(d, hoy)
    cargarResumenSicar(d, hoy)
    cargarPagosSicar(d, hoy)
  }

  const consultar = () => {
    cargarReporte()
    cargarPorDiaSicar()
    cargarResumenSicar()
    cargarPagosSicar()
  }

  const sicarTotales = porDiaSicar && porDiaSicar.length > 0
    ? {
        tickets: porDiaSicar.reduce((s, d) => s + d.tickets, 0),
        ventas:  porDiaSicar.reduce((s, d) => s + Number(d.ventas), 0),
      }
    : null

  const tarjetas = vista === 'resultados' && resumenSicar
    ? [
        { label: 'Ventas (SICAR)',  valor: fmt(resumenSicar.ventas),   color: '#1D9E75' },
        { label: 'Costo (SICAR)',   valor: fmt(resumenSicar.costo),    color: '#e53e3e' },
        { label: 'Utilidad',        valor: fmt(resumenSicar.utilidad), color: '#f97316' },
        { label: 'Margen',          valor: `${resumenSicar.margen.toFixed(1)}%`, color: '#534AB7' },
      ]
    : vista === 'dia' && sicarTotales
    ? [
        { label: 'Tickets (SICAR)', valor: sicarTotales.tickets, color: '#1D9E75' },
        { label: 'Ventas (SICAR)',  valor: fmt(sicarTotales.ventas), color: '#f97316' },
        { label: 'Ticket promedio', valor: fmt(sicarTotales.ventas / (sicarTotales.tickets || 1)), color: '#534AB7' },
        { label: 'Canceladas',      valor: datos?.total_canceladas ?? 0, color: '#e53e3e' },
      ]
    : vista === 'pagos' && pagosSicar
    ? [
        { label: 'Efectivo',        valor: fmt(pagosSicar.efectivo),      color: '#1D9E75' },
        { label: 'Tarjeta',         valor: fmt(pagosSicar.tarjeta),       color: '#534AB7' },
        { label: 'Transferencia',   valor: fmt(pagosSicar.transferencia), color: '#0C447C' },
        { label: 'Total cobrado',   valor: fmt(pagosSicar.total),         color: '#f97316' },
      ]
    : datos
    ? [
        { label: 'Ventas completadas', valor: datos.total_ventas,        color: '#1D9E75' },
        { label: 'Monto total',        valor: fmt(datos.monto_total),    color: '#f97316' },
        { label: 'Ticket promedio',    valor: fmt(datos.ticket_promedio), color: '#534AB7' },
        { label: 'Canceladas',         valor: datos.total_canceladas,    color: '#e53e3e' },
      ]
    : []

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
        <button onClick={consultar} style={{
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

      {!cargando && tarjetas.length > 0 && <>
        {/* Tarjetas */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '1rem', marginBottom: '1.25rem'
        }}>
          {tarjetas.map((t, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: '10px', padding: '1.25rem',
              border: '1px solid #e0e0e0', borderTop: `4px solid ${t.color}`
            }}>
              <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#888' }}>{t.label}</p>
              <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: t.color }}>{t.valor}</p>
            </div>
          ))}
        </div>

        {(vista === 'resultados' || vista === 'dia' || vista === 'pagos') && (
          <p style={{ margin: '-0.75rem 0 1.25rem', fontSize: '12px', color: '#aaa' }}>
            * Datos tomados del reporte de SICAR
          </p>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'dia',        label: '📅 Por día' },
            { id: 'pagos',      label: '💳 Por método de pago' },
            { id: 'resultados', label: '📈 Estado de Resultados' },
            { id: 'anual',      label: '📊 Comparativo Anual' },
            { id: 'cargar',     label: '⬆️ Cargar SICAR' },
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
        {vista === 'dia' && porDiaSicar && (
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={th}>Fecha</th>
                  <th style={{ ...th, textAlign: 'right' }}>Tickets</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ventas</th>
                </tr>
              </thead>
              <tbody>
                {porDiaSicar.map(d => (
                  <tr key={d.fecha} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>{fmtFecha(d.fecha)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{d.tickets}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: '#f97316' }}>{fmt(d.ventas)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                  <td style={{ ...td, fontWeight: '700' }}>Total</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700' }}>
                    {porDiaSicar.reduce((s, d) => s + d.tickets, 0)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>
                    {fmt(porDiaSicar.reduce((s, d) => s + Number(d.ventas), 0))}
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
            {!pagosSicar ? (
              <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>
                Sin datos. Carga el reporte general de ventas de SICAR primero.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9' }}>
                    <th style={th}>Método</th>
                    <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                    <th style={{ ...th, textAlign: 'right' }}>% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries({
                    efectivo:      { label: 'Efectivo',      color: '#1D9E75', monto: pagosSicar.efectivo },
                    tarjeta:       { label: 'Tarjeta',       color: '#534AB7', monto: pagosSicar.tarjeta },
                    transferencia: { label: 'Transferencia', color: '#0C447C', monto: pagosSicar.transferencia },
                    credito:       { label: 'Crédito',       color: '#BA7517', monto: pagosSicar.credito },
                    cheque:        { label: 'Cheque',        color: '#888',    monto: pagosSicar.cheque },
                    otros:         { label: 'Otros',         color: '#aaa',    monto: pagosSicar.otros },
                  })
                  .filter(([, v]) => v.monto > 0)
                  .sort((a, b) => b[1].monto - a[1].monto)
                  .map(([key, v]) => (
                    <tr key={key} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block', width: '10px', height: '10px',
                          borderRadius: '50%', background: v.color, marginRight: '8px'
                        }}/>
                        {v.label}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: v.color }}>
                        {fmt(v.monto)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: '#888' }}>
                        {pagosSicar.total > 0 ? ((v.monto / pagosSicar.total) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                    <td style={{ ...td, fontWeight: '700' }}>Total</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>
                      {fmt(pagosSicar.total)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Vista estado de resultados */}
        {vista === 'resultados' && (
          <EstadoResultados desde={desde} hasta={hasta} />
        )}

        {/* Comparativo anual */}
        {vista === 'anual' && (
          <ComparativoAnual />
        )}

        {/* Cargar SICAR */}
        {vista === 'cargar' && (
          <CargadorSicar />
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

function ComparativoAnual() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const { data, error } = await supabase
        .from('sicar_utilidades')
        .select('mes, ventas, compras, utilidad')
        .order('mes', { ascending: true })
      if (error || !data) { setCargando(false); return }

      const porAño = {}
      data.forEach(d => {
        const año = d.mes.split('-')[0]
        if (!porAño[año]) porAño[año] = { ventas: 0, compras: 0, utilidad: 0 }
        porAño[año].ventas   += Number(d.ventas || 0)
        porAño[año].compras  += Number(d.compras || 0)
        porAño[año].utilidad += Number(d.utilidad || 0)
      })

      const años = Object.entries(porAño)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([año, d], i, arr) => {
          const anterior   = i > 0 ? arr[i - 1][1].ventas : null
          const crecimiento = anterior && anterior > 0
            ? ((d.ventas - anterior) / anterior * 100) : null
          return { año, ventas: d.ventas, compras: d.compras, utilidad: d.utilidad,
            margen: d.ventas > 0 ? (d.utilidad / d.ventas * 100) : 0, crecimiento }
        })

      setDatos(años)
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando) return <p style={{ color: '#888' }}>Cargando comparativo anual...</p>
  if (!datos || datos.length === 0) return <p style={{ color: '#888' }}>Sin datos.</p>

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Comparativo Anual de Ventas</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9f9f9' }}>
            <th style={th}>Año</th>
            <th style={{ ...th, textAlign: 'right' }}>Ventas</th>
            <th style={{ ...th, textAlign: 'right' }}>Costo</th>
            <th style={{ ...th, textAlign: 'right' }}>Utilidad</th>
            <th style={{ ...th, textAlign: 'right' }}>Margen</th>
            <th style={{ ...th, textAlign: 'right' }}>vs año anterior</th>
          </tr>
        </thead>
        <tbody>
          {datos.map(d => (
            <tr key={d.año} style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ ...td, fontWeight: '600' }}>{d.año}</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmt(d.ventas)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#e53e3e' }}>{fmt(d.compras)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: '600', color: '#1D9E75' }}>{fmt(d.utilidad)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#534AB7' }}>{d.margen.toFixed(1)}%</td>
              <td style={{ ...td, textAlign: 'right' }}>
                {d.crecimiento === null ? (
                  <span style={{ color: '#aaa' }}>—</span>
                ) : (
                  <span style={{ color: d.crecimiento >= 0 ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                    {d.crecimiento >= 0 ? '▲' : '▼'} {Math.abs(d.crecimiento).toFixed(1)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CargadorSicar() {
  const [archivo, setArchivo]     = useState(null)
  const [cargando, setCargando]   = useState(false)
  const [progreso, setProgreso]   = useState('')
  const [resultado, setResultado] = useState(null)
  const [error, setError]         = useState(null)

  const procesarArchivo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setArchivo(file.name)
    setResultado(null)
    setError(null)
  }

  const cargar = async () => {
    if (!archivo) return
    setCargando(true)
    setResultado(null)
    setError(null)

    try {
      setProgreso('Leyendo archivo Excel...')
      const input  = document.getElementById('archivo-sicar')
      const file   = input.files[0]
      const buffer = await file.arrayBuffer()

      setProgreso('Procesando datos...')
      const XLSX = await import('xlsx')
      const wb   = XLSX.read(buffer, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })

      const limpiar = v => {
        if (!v) return 0
        const s = v.toString().replace(/[$,]/g, '').trim()
        return parseFloat(s) || 0
      }

      const parseFecha = v => {
        if (!v) return null
        const s = v.toString().slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
          const [d, m, y] = s.split('/')
          return `${y}-${m}-${d}`
        }
        return null
      }

      const esUtilidades = rows.some(r => r[0]?.toString().trim() === 'Tickets' && r[19])
      const esGeneral    = rows.some(r => r[0]?.toString().trim() === 'Ticket' && r[32] !== undefined)

      let diasUtilidad = {}
      let mesesUtilidad = {}
      let diasPagos = {}

      if (esUtilidades) {
        setProgreso('Procesando reporte de utilidades...')
        for (const row of rows) {
          if (row[0]?.toString().trim() !== 'Tickets') continue
          const fecha = parseFecha(row[4])
          if (!fecha) continue
          const mes     = fecha.slice(0, 7)
          const ventas  = limpiar(row[19])
          const compras = limpiar(row[24])
          if (ventas <= 0) continue
          if (!diasUtilidad[fecha]) diasUtilidad[fecha] = { tickets: 0, ventas: 0, compras: 0 }
          diasUtilidad[fecha].tickets += 1
          diasUtilidad[fecha].ventas  += ventas
          diasUtilidad[fecha].compras += compras
          if (!mesesUtilidad[mes]) mesesUtilidad[mes] = { tickets: 0, ventas: 0, compras: 0 }
          mesesUtilidad[mes].tickets += 1
          mesesUtilidad[mes].ventas  += ventas
          mesesUtilidad[mes].compras += compras
        }
      }

      if (esGeneral) {
        setProgreso('Procesando reporte general de ventas...')
        for (const row of rows) {
          if (row[0]?.toString().trim() !== 'Ticket') continue
          const fecha = parseFecha(row[3])
          if (!fecha) continue
          const total = limpiar(row[30])
          if (total <= 0) continue
          if (!diasPagos[fecha]) diasPagos[fecha] = { efectivo: 0, cheque: 0, credito: 0, transferencia: 0, tarjeta: 0, otros: 0, total: 0 }
          diasPagos[fecha].efectivo      += limpiar(row[32])
          diasPagos[fecha].cheque        += limpiar(row[33])
          diasPagos[fecha].credito       += limpiar(row[34])
          diasPagos[fecha].transferencia += limpiar(row[35])
          diasPagos[fecha].tarjeta       += limpiar(row[37])
          diasPagos[fecha].otros         += limpiar(row[36]) + limpiar(row[38]) + limpiar(row[39])
          diasPagos[fecha].total         += total
        }
      }

      if (esUtilidades) {
        const diasArr = Object.entries(diasUtilidad).map(([fecha, d]) => ({
          fecha, tickets: d.tickets,
          ventas:   Math.round(d.ventas * 100) / 100,
          compras:  Math.round(d.compras * 100) / 100,
          utilidad: Math.round((d.ventas - d.compras) * 100) / 100,
        }))
        const mesesArr = Object.entries(mesesUtilidad).map(([mes, d]) => ({
          mes, tickets: d.tickets,
          ventas:   Math.round(d.ventas * 100) / 100,
          compras:  Math.round(d.compras * 100) / 100,
          utilidad: Math.round((d.ventas - d.compras) * 100) / 100,
          margen:   d.ventas > 0 ? Math.round((d.ventas - d.compras) / d.ventas * 10000) / 100 : 0,
        }))
        setProgreso(`Subiendo ${diasArr.length} días de utilidades...`)
        const { error: e1 } = await supabase.rpc('upsert_sicar_ventas_dia', { datos: diasArr })
        if (e1) throw new Error(`Error días: ${e1.message}`)
        const { error: e2 } = await supabase.rpc('upsert_sicar_utilidades', { datos: mesesArr })
        if (e2) throw new Error(`Error meses: ${e2.message}`)
        setResultado({ tipo: 'utilidades', dias: diasArr.length, meses: mesesArr.length, ventas: mesesArr.reduce((s, m) => s + m.ventas, 0) })
      }

      if (esGeneral) {
        const pagosArr = Object.entries(diasPagos).map(([fecha, d]) => ({
          fecha,
          efectivo:      Math.round(d.efectivo * 100) / 100,
          cheque:        Math.round(d.cheque * 100) / 100,
          credito:       Math.round(d.credito * 100) / 100,
          transferencia: Math.round(d.transferencia * 100) / 100,
          tarjeta:       Math.round(d.tarjeta * 100) / 100,
          otros:         Math.round(d.otros * 100) / 100,
          total:         Math.round(d.total * 100) / 100,
        }))
        setProgreso(`Subiendo ${pagosArr.length} días de métodos de pago...`)
        const { error: e3 } = await supabase.rpc('upsert_sicar_pagos_dia', { datos: pagosArr })
        if (e3) throw new Error(`Error pagos: ${e3.message}`)
        setResultado({ tipo: 'general', dias: pagosArr.length, total: pagosArr.reduce((s, d) => s + d.total, 0) })
      }

      setProgreso('')
    } catch (err) {
      setError(err.message)
      setProgreso('')
    } finally {
      setCargando(false)
    }
  }

  const fmt2 = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.5rem' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '15px', color: '#1a1a2e' }}>
        Cargar Reporte de SICAR
      </h3>
      <p style={{ margin: '0 0 1.5rem', fontSize: '13px', color: '#888' }}>
        Carga el reporte de utilidades o el reporte general de ventas (.xlsx). El sistema detecta automáticamente el tipo y actualiza los reportes correspondientes.
      </p>

      <div style={{
        border: '2px dashed #e0e0e0', borderRadius: '10px', padding: '2rem',
        textAlign: 'center', marginBottom: '1.5rem',
        background: archivo ? '#f0fdf4' : '#fafafa'
      }}>
        <input id="archivo-sicar" type="file" accept=".xlsx,.xls" onChange={procesarArchivo} style={{ display: 'none' }} />
        <label htmlFor="archivo-sicar" style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#333', fontWeight: '600' }}>
            {archivo || 'Seleccionar archivo Excel de SICAR'}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>
            {archivo ? '✓ Archivo seleccionado' : 'Haz clic para seleccionar el archivo .xlsx'}
          </p>
        </label>
      </div>

      <button onClick={cargar} disabled={!archivo || cargando} style={{
        width: '100%', padding: '12px', borderRadius: '8px',
        background: archivo && !cargando ? '#f97316' : '#e0e0e0',
        color: archivo && !cargando ? 'white' : '#aaa',
        border: 'none', fontSize: '15px', fontWeight: '600',
        cursor: archivo && !cargando ? 'pointer' : 'not-allowed',
      }}>
        {cargando ? '⏳ Procesando...' : '⬆️ Cargar y Actualizar Reportes'}
      </button>

      {progreso && (
        <div style={{ marginTop: '1rem', padding: '12px', background: '#f0f9ff', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#0C447C' }}>⏳ {progreso}</p>
        </div>
      )}

      {resultado && (
        <div style={{ marginTop: '1rem', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
          <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '600', color: '#1D9E75' }}>
            ✅ Carga completada exitosamente
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>
            {resultado.tipo === 'utilidades'
              ? `${resultado.dias} días y ${resultado.meses} meses actualizados — Total ventas: ${fmt2(resultado.ventas)}`
              : `${resultado.dias} días de métodos de pago actualizados — Total: ${fmt2(resultado.total)}`
            }
          </p>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '1rem', padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#e53e3e' }}>❌ {error}</p>
        </div>
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
