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
  const [porDiaSicar, setPorDiaSicar] = useState(null)
  const [resumenSicar, setResumenSicar] = useState(null)
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
      por_metodo:       porMetodo,
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
    const utilidad      = ventas_total - costo_total
    const margen        = ventas_total > 0 ? (utilidad / ventas_total * 100) : 0

    setResumenSicar({ ventas: ventas_total, costo: costo_total, utilidad, margen })
  }

  useEffect(() => {
    cargarReporte()
    cargarPorDiaSicar()
    cargarResumenSicar()
  }, [])

  const consultarTodo = (d = desde, h = hasta) => {
    cargarReporte(d, h)
    cargarPorDiaSicar(d, h)
    cargarResumenSicar(d, h)
  }

  const setHoy = () => { setDesde(hoy); setHasta(hoy); consultarTodo(hoy, hoy) }
  const setMes = () => { const d = primerDiaMes(); setDesde(d); setHasta(hoy); consultarTodo(d, hoy) }
  const consultar = () => consultarTodo()

  const METODOS = {
    efectivo:      { label: 'Efectivo',      color: '#1D9E75' },
    tarjeta:       { label: 'Tarjeta',       color: '#534AB7' },
    transferencia: { label: 'Transferencia', color: '#0C447C' },
    credito:       { label: 'Crédito',       color: '#BA7517' },
    otro:          { label: 'Otro',          color: '#888'    },
  }

  // Tarjetas dinámicas según la vista activa
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
        { label: 'Tickets (SICAR)', valor: sicarTotales.tickets,        color: '#1D9E75' },
        { label: 'Ventas (SICAR)',  valor: fmt(sicarTotales.ventas),    color: '#f97316' },
        { label: 'Ticket promedio', valor: fmt(sicarTotales.ventas / (sicarTotales.tickets || 1)), color: '#534AB7' },
        { label: 'Canceladas',      valor: datos?.total_canceladas ?? 0, color: '#e53e3e' },
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
        {/* Tarjetas dinámicas */}
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

        {(vista === 'resultados' || vista === 'dia') && (
          <p style={{ margin: '-0.75rem 0 1.25rem', fontSize: '12px', color: '#aaa' }}>
            * Datos tomados del reporte de utilidades de SICAR
          </p>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
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

        {/* Vista por día — datos exactos de SICAR */}
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
        {vista === 'pagos' && datos && (
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
        {vista === 'anual' && (
  <ComparativoAnual />
)}
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
  if (!datos || datos.length === 0) return <p style={{ color: '#888' }}>Sin datos para el período. Carga el reporte de utilidades de SICAR primero.</p>

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
          const anterior = i > 0 ? arr[i - 1][1].ventas : null
          const crecimiento = anterior && anterior > 0
            ? ((d.ventas - anterior) / anterior * 100)
            : null
          return {
            año,
            ventas:   d.ventas,
            compras:  d.compras,
            utilidad: d.utilidad,
            margen:   d.ventas > 0 ? (d.utilidad / d.ventas * 100) : 0,
            crecimiento,
          }
        })

      setDatos(años)
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando) return <p style={{ color: '#888' }}>Cargando comparativo anual...</p>
  if (!datos || datos.length === 0) return <p style={{ color: '#888' }}>Sin datos. Carga el reporte de utilidades de SICAR primero.</p>

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
                  <span style={{
                    color: d.crecimiento >= 0 ? '#1D9E75' : '#e53e3e',
                    fontWeight: '600'
                  }}>
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

  const procesarArchivo = async (e) => {
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
      const input = document.getElementById('archivo-sicar')
      const file  = input.files[0]
      const buffer = await file.arrayBuffer()

      setProgreso('Procesando tickets...')
      const XLSX = await import('xlsx')
      const wb   = XLSX.read(buffer, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })

      const porDia = {}
      const porMes = {}

      for (const row of rows) {
        if (!row[0] || row[0].toString().trim() !== 'Tickets') continue

        const fechaRaw = row[4]
        if (!fechaRaw) continue

let fecha = null
if (typeof fechaRaw === 'string') {
  if (/^\d{4}-\d{2}-\d{2}/.test(fechaRaw)) {
    fecha = fechaRaw.slice(0, 10)
  } else if (/^\d{2}\/\d{2}\/\d{4}/.test(fechaRaw)) {
    const [d, m, y] = fechaRaw.split('/')
    fecha = `${y}-${m}-${d}`
  }
}
if (!fecha) continue

        const mes = fecha.slice(0, 7)

        const limpiar = v => {
          if (!v) return 0
          const s = v.toString().replace(/[$,]/g, '').trim()
          return parseFloat(s) || 0
        }

        const ventas  = limpiar(row[19])
        const compras = limpiar(row[24])
        if (ventas <= 0) continue

        if (!porDia[fecha]) porDia[fecha] = { tickets: 0, ventas: 0, compras: 0 }
        porDia[fecha].tickets += 1
        porDia[fecha].ventas  += ventas
        porDia[fecha].compras += compras

        if (!porMes[mes]) porMes[mes] = { tickets: 0, ventas: 0, compras: 0 }
        porMes[mes].tickets += 1
        porMes[mes].ventas  += ventas
        porMes[mes].compras += compras
      }

      const diasArray = Object.entries(porDia).map(([fecha, d]) => ({
        fecha,
        tickets:  d.tickets,
        ventas:   Math.round(d.ventas * 100) / 100,
        compras:  Math.round(d.compras * 100) / 100,
        utilidad: Math.round((d.ventas - d.compras) * 100) / 100,
      }))

      const mesesArray = Object.entries(porMes).map(([mes, d]) => ({
        mes,
        tickets:  d.tickets,
        ventas:   Math.round(d.ventas * 100) / 100,
        compras:  Math.round(d.compras * 100) / 100,
        utilidad: Math.round((d.ventas - d.compras) * 100) / 100,
        margen:   d.ventas > 0 ? Math.round((d.ventas - d.compras) / d.ventas * 10000) / 100 : 0,
      }))

      setProgreso(`Subiendo ${diasArray.length} días y ${mesesArray.length} meses a Supabase...`)

      const { error: e1 } = await supabase.rpc('upsert_sicar_ventas_dia', { datos: diasArray })
      if (e1) throw new Error(`Error actualizando días: ${e1.message}`)

      const { error: e2 } = await supabase.rpc('upsert_sicar_utilidades', { datos: mesesArray })
      if (e2) throw new Error(`Error actualizando meses: ${e2.message}`)

      setResultado({
        dias:   diasArray.length,
        meses:  mesesArray.length,
        ventas: mesesArray.reduce((s, m) => s + m.ventas, 0),
      })
      setProgreso('')

    } catch (err) {
      setError(err.message)
      setProgreso('')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.5rem' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '15px', color: '#1a1a2e' }}>
        Cargar Reporte de Utilidades SICAR
      </h3>
      <p style={{ margin: '0 0 1.5rem', fontSize: '13px', color: '#888' }}>
        Exporta el reporte de utilidades desde SICAR (.xlsx) y cárgalo aquí para actualizar los reportes del POS.
      </p>

      <div style={{
        border: '2px dashed #e0e0e0', borderRadius: '10px', padding: '2rem',
        textAlign: 'center', marginBottom: '1.5rem',
        background: archivo ? '#f0fdf4' : '#fafafa'
      }}>
        <input
          id="archivo-sicar"
          type="file"
          accept=".xlsx,.xls"
          onChange={procesarArchivo}
          style={{ display: 'none' }}
        />
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

      <button
        onClick={cargar}
        disabled={!archivo || cargando}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px',
          background: archivo && !cargando ? '#f97316' : '#e0e0e0',
          color: archivo && !cargando ? 'white' : '#aaa',
          border: 'none', fontSize: '15px', fontWeight: '600',
          cursor: archivo && !cargando ? 'pointer' : 'not-allowed',
        }}
      >
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
            {resultado.dias} días y {resultado.meses} meses actualizados — Total ventas: {fmt(resultado.ventas)}
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
