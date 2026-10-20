import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { imprimirTicket } from '../lib/ticket'

const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const pad = n => String(n).padStart(2, '0')
const hoy = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]
}
const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtFecha = f => {
  if (!f) return ''
  const [y, m, d] = f.split('-')
  return `${d}/${m}`
}
const fmtHora = f => {
  if (!f) return ''
  return new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
const fmtHoraCorta = h => {
  if (!h) return ''
  return h.slice(0, 5)
}
const diaSemana = fecha => new Date(`${fecha}T12:00:00`).getDay()
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const horarioDe = (horarioLaboral, fecha) => horarioLaboral.find(h => h.dia_semana === diaSemana(fecha)) || null
const horaAMin = hora => {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}
const minAHora = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}:00`
const ahoraEnMinutos = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// Busca el primer hueco libre de "duracionMin" minutos dentro del horario del día, dados los bloques ya ocupados
function buscarHueco(bloquesOcupados, horario, duracionMin) {
  if (!horario || !horario.hora_inicio) return null
  const inicioDia = horaAMin(horario.hora_inicio)
  const finDia = horaAMin(horario.hora_fin)
  const bloques = bloquesOcupados
    .filter(b => b.hora_inicio_estimada)
    .map(b => {
      const ini = horaAMin(b.hora_inicio_estimada)
      return { ini, fin: ini + (b.tiempo_estimado_minutos || 60) }
    })
    .sort((a, b) => a.ini - b.ini)
  let cursor = inicioDia
  for (const b of bloques) {
    if (cursor + duracionMin <= b.ini) return cursor
    cursor = Math.max(cursor, b.fin)
  }
  if (cursor + duracionMin <= finDia) return cursor
  return null
}

// Valida si una hora específica pedida por el cliente está libre para ese vehículo ese día
function estaLibre(bloquesOcupados, horario, horaInicioMin, duracionMin, ahoraMin) {
  if (!horario || !horario.hora_inicio) return { libre: false, motivo: 'Ese día está cerrado (sin horario de entregas).' }
  const inicioDia = horaAMin(horario.hora_inicio)
  const finDia = horaAMin(horario.hora_fin)
  if (horaInicioMin < inicioDia || horaInicioMin + duracionMin > finDia) {
    return { libre: false, motivo: `Fuera del horario laboral (${minAHora(inicioDia).slice(0, 5)}–${minAHora(finDia).slice(0, 5)}).` }
  }
  if (ahoraMin != null && horaInicioMin < ahoraMin) {
    return { libre: false, motivo: 'Esa hora ya pasó.' }
  }
  const finPedido = horaInicioMin + duracionMin
  for (const b of bloquesOcupados) {
    if (!b.hora_inicio_estimada) continue
    const bIni = horaAMin(b.hora_inicio_estimada)
    const bFin = bIni + (b.tiempo_estimado_minutos || 60)
    if (horaInicioMin < bFin && bIni < finPedido) {
      return { libre: false, motivo: `Se encima con otra entrega ya asignada a ese vehículo (${minAHora(bIni).slice(0, 5)}–${minAHora(bFin).slice(0, 5)}).` }
    }
  }
  return { libre: true }
}

const agregarNota = (motivoActual, nuevaNota) => motivoActual ? `${motivoActual} | ${nuevaNota}` : nuevaNota

const fmtHoras = min => {
  if (!min && min !== 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

const ESTADOS = {
  pendiente_planificar: { label: 'Por planificar', color: '#e53e3e' },
  almacen:              { label: 'Almacén',         color: '#BA7517' },
  en_ruta:              { label: 'En ruta',          color: '#0C447C' },
  entregado:            { label: 'Entregado',        color: '#1D9E75' },
  incidencia:           { label: 'Incidencia',       color: '#e53e3e' },
}
const ORDEN_COLUMNAS = ['pendiente_planificar', 'almacen', 'en_ruta', 'incidencia', 'entregado']

const MOTIVOS_INCIDENCIA = [
  'Cliente no localizado',
  'Dirección incorrecta',
  'Cliente pidió reprogramar',
  'Problema con el vehículo',
  'Otro',
]

function enRiesgo(e) {
  const ahora = Date.now()
  if (e.estado === 'pendiente_planificar') return true
  if (e.estado === 'almacen' && e.planificado_at) return (ahora - new Date(e.planificado_at).getTime()) > 3 * 60 * 60 * 1000
  if (e.estado === 'en_ruta' && e.en_ruta_at) {
    const limite = (e.tiempo_estimado_minutos || 180) * 60 * 1000 * 1.3
    return (ahora - new Date(e.en_ruta_at).getTime()) > limite
  }
  return false
}

export default function Contactos() {
  const [fecha, setFecha]               = useState(hoy())
  const [entregas, setEntregas]         = useState([])
  const [vehiculos, setVehiculos]       = useState([])
  const [personal, setPersonal]         = useState([])
  const [horarioLaboral, setHorarioLaboral] = useState([])
  const [cargando, setCargando]         = useState(true)
  const [entregaAbierta, setEntregaAbierta] = useState(null)
  const [mostrarVehiculos, setMostrarVehiculos] = useState(false)
  const [mostrarPendientes, setMostrarPendientes] = useState(false)
  const [pendientesGlobal, setPendientesGlobal] = useState([])
  const [userId, setUserId]             = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data?.user) setUserId(data.user.id) })
    cargarVehiculos()
    cargarPersonal()
    cargarHorario()
    cargarPendientesGlobal()
  }, [])

  useEffect(() => { cargarEntregas() }, [fecha])

  // Tiempo real: cualquier cambio en entregas (de cualquier sucursal) refresca el tablero
  useEffect(() => {
    const canal = supabase.channel('entregas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => cargarEntregas())
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [fecha])

  // Tiempo real: cambios en el checklist también actualizan el contador de pendientes
  useEffect(() => {
    const canal = supabase.channel('entrega-items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entrega_items' }, () => cargarPendientesGlobal())
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [])

  async function cargarEntregas(f = fecha) {
    setCargando(true)
    const { data } = await supabase
      .from('entregas')
      .select(`
        id, estado, fecha_programada, viajes, tiempo_estimado_minutos, hora_inicio_estimada, intento, motivo_incidencia, notas,
        planificado_at, preparando_at, listo_at, en_ruta_at, entregado_at, vehiculo_id, repartidor_id, tripulacion,
        ventas(id, folio, total, pagos(metodo, monto)),
        contactos(id, nombre, telefono, colonia, direccion),
        vehiculos(id, nombre),
        repartidor:personal_reparto!entregas_repartidor_id_fkey(id, nombre, telefono)
      `)
      .eq('fecha_programada', f)
      .order('created_at', { ascending: true })
    setEntregas(data || [])
    setCargando(false)
  }

  async function cargarVehiculos() {
    const { data } = await supabase.from('vehiculos').select('*').order('nombre')
    setVehiculos(data || [])
  }

  async function cargarPersonal() {
    const { data } = await supabase.from('personal_reparto').select('*').order('nombre')
    setPersonal(data || [])
  }

  async function cargarHorario() {
    const { data } = await supabase.from('horario_laboral').select('*').order('dia_semana')
    setHorarioLaboral(data || [])
  }

  async function cargarPendientesGlobal() {
    const { data: idsData } = await supabase
      .from('entrega_items')
      .select('entrega_id')
      .in('estado', ['faltante', 'resguardo'])
      .eq('resuelto', false)
    const entregaIds = [...new Set((idsData || []).map(d => d.entrega_id))]
    if (entregaIds.length === 0) { setPendientesGlobal([]); return }

    const [{ data: entregasData }, { data: itemsData }] = await Promise.all([
      supabase.from('entregas')
        .select(`
          id, fecha_programada, hora_inicio_estimada,
          ventas(folio, total, pagos(metodo, monto)),
          contactos(nombre, telefono, colonia, direccion)
        `)
        .in('id', entregaIds)
        .order('fecha_programada', { ascending: true }),
      supabase.from('entrega_items').select('*').in('entrega_id', entregaIds).order('posicion'),
    ])

    const entregasConItems = (entregasData || []).map(e => ({
      ...e,
      items: (itemsData || []).filter(i => i.entrega_id === e.id),
    }))
    setPendientesGlobal(entregasConItems)
  }

  const horarioHoy = horarioDe(horarioLaboral, fecha)

  const actualizar = async (id, cambios) => {
    await supabase.from('entregas').update(cambios).eq('id', id)
    setEntregaAbierta(null)
    cargarEntregas()
  }

  if (entregaAbierta) {
    return (
      <PanelEntrega
        entrega={entregaAbierta}
        vehiculos={vehiculos}
        personal={personal}
        horarioLaboral={horarioLaboral}
        userId={userId}
        onVolver={() => { setEntregaAbierta(null); cargarEntregas() }}
        onActualizar={actualizar}
      />
    )
  }

  if (mostrarVehiculos) {
    return (
      <PanelVehiculos
        onVolver={() => { setMostrarVehiculos(false); cargarVehiculos(); cargarPersonal() }}
        vehiculos={vehiculos}
        personal={personal}
        onRecargarVehiculos={cargarVehiculos}
        onRecargarPersonal={cargarPersonal}
      />
    )
  }

  if (mostrarPendientes) {
    return (
      <PanelPendientes
        pendientes={pendientesGlobal}
        userId={userId}
        onVolver={() => { setMostrarPendientes(false); cargarPendientesGlobal() }}
        onRecargar={cargarPendientesGlobal}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filtros de fecha */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setFecha(hoy())} style={{ padding: '8px 16px', background: fecha === hoy() ? '#1a1a2e' : 'white', color: fecha === hoy() ? 'white' : '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Hoy</button>
        <button onClick={() => setFecha(sumarDias(hoy(), 1))} style={{ padding: '8px 16px', background: fecha === sumarDias(hoy(), 1) ? '#1a1a2e' : 'white', color: fecha === sumarDias(hoy(), 1) ? 'white' : '#333', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Mañana</button>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }} />
        <span style={{ fontSize: '13px', color: '#888' }}>{cargando ? 'Cargando...' : `${entregas.length} entregas`}</span>
        <div style={{ flex: 1 }} />
        {pendientesGlobal.length > 0 && (
          <button onClick={() => setMostrarPendientes(true)} style={{ padding: '8px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', fontWeight: '700', color: '#e53e3e', cursor: 'pointer' }}>
            ⚠️ Pendientes por surtir ({pendientesGlobal.length})
          </button>
        )}
        <button onClick={() => setMostrarVehiculos(true)} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>🚚 Vehículos y personal</button>
      </div>

      {/* Línea de tiempo del día por vehículo */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', color: '#1a1a2e' }}>{NOMBRES_DIA[diaSemana(fecha)]} {fmtFecha(fecha)}</h3>
          <span style={{ fontSize: '12px', color: '#888' }}>
            {horarioHoy?.hora_inicio ? `Horario: ${fmtHoraCorta(horarioHoy.hora_inicio)} – ${fmtHoraCorta(horarioHoy.hora_fin)}` : 'Cerrado — sin horario de entregas'}
          </span>
        </div>
        {horarioHoy?.hora_inicio && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {vehiculos.filter(v => v.activo).map(v => {
              const inicioDia = horaAMin(horarioHoy.hora_inicio)
              const finDia = horaAMin(horarioHoy.hora_fin)
              const totalMin = finDia - inicioDia
              const bloques = entregas.filter(e => e.vehiculo_id === v.id && e.hora_inicio_estimada)
              return (
                <div key={v.id}>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: '600', color: '#555' }}>🚚 {v.nombre}</p>
                  <div style={{ position: 'relative', height: '32px', background: '#f5f5f5', borderRadius: '6px', overflow: 'hidden' }}>
                    {bloques.map(e => {
                      const ini = horaAMin(e.hora_inicio_estimada)
                      const dur = e.tiempo_estimado_minutos || 60
                      const left = Math.max(0, (ini - inicioDia) / totalMin * 100)
                      const width = Math.max(2, dur / totalMin * 100)
                      const color = ESTADOS[e.estado]?.color || '#888'
                      return (
                        <div key={e.id} title={`${e.ventas?.folio} — ${e.contactos?.nombre} (${fmtHoraCorta(e.hora_inicio_estimada)})`}
                          style={{
                            position: 'absolute', left: `${left}%`, width: `${width}%`, top: 0, bottom: 0,
                            background: color, borderRight: '1px solid white', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', overflow: 'hidden',
                          }}>
                          <span style={{ fontSize: '10px', color: 'white', fontWeight: '600', whiteSpace: 'nowrap', padding: '0 2px' }}>{fmtHoraCorta(e.hora_inicio_estimada)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span style={{ fontSize: '10px', color: '#aaa' }}>{fmtHoraCorta(horarioHoy.hora_inicio)}</span>
                    <span style={{ fontSize: '10px', color: '#aaa' }}>{fmtHoraCorta(horarioHoy.hora_fin)}</span>
                  </div>
                </div>
              )
            })}
            {vehiculos.filter(v => v.activo).length === 0 && <p style={{ fontSize: '12px', color: '#ccc', margin: 0 }}>Agrega vehículos para ver su disponibilidad aquí.</p>}
          </div>
        )}
      </div>

      {/* Tablero */}
      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '8px' }}>
        {ORDEN_COLUMNAS.map(estado => {
          const items = entregas.filter(e => e.estado === estado)
          const cfg = ESTADOS[estado]
          return (
            <div key={estado} style={{ minWidth: '260px', width: '260px', flexShrink: 0 }}>
              <div style={{ padding: '8px 12px', borderRadius: '8px 8px 0 0', background: cfg.color, color: 'white', fontSize: '13px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                <span>{cfg.label}</span>
                <span>{items.length}</span>
              </div>
              <div style={{ background: '#f9f9f9', border: '1px solid #e0e0e0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '8px', minHeight: '80px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.length === 0 && <p style={{ margin: '8px 0', fontSize: '12px', color: '#ccc', textAlign: 'center' }}>Sin entregas</p>}
                {items.map(e => (
                  <div key={e.id} onClick={() => setEntregaAbierta(e)} style={{
                    background: 'white', borderRadius: '8px', border: `1px solid ${enRiesgo(e) ? '#e53e3e' : '#e0e0e0'}`,
                    padding: '10px', cursor: 'pointer', boxShadow: enRiesgo(e) ? '0 0 0 1px #fecaca' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#534AB7' }}>{e.ventas?.folio}</p>
                      {enRiesgo(e) && <span style={{ fontSize: '10px', color: '#e53e3e', fontWeight: '700' }}>⚠ en riesgo</span>}
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: '600' }}>{e.contactos?.nombre}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#888' }}>{e.contactos?.colonia || 'Sin colonia'}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#888' }}>{e.vehiculos?.nombre || 'Sin vehículo'}</span>
                      {e.hora_inicio_estimada && <span style={{ fontSize: '11px', color: '#534AB7', fontWeight: '600' }}>{fmtHoraCorta(e.hora_inicio_estimada)}</span>}
                    </div>
                    {e.viajes > 1 && <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#888' }}>{e.viajes} viajes</p>}
                    {e.intento > 1 && <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#e53e3e' }}>Intento #{e.intento}</p>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PanelEntrega({ entrega, vehiculos, personal, horarioLaboral, userId, onVolver, onActualizar }) {
  const [viajes, setViajes]           = useState(entrega.viajes || 1)
  const [horas, setHoras]             = useState(entrega.tiempo_estimado_minutos ? entrega.tiempo_estimado_minutos / 60 : 1)
  const [fechaProg, setFechaProg]     = useState(entrega.fecha_programada)
  const [horaDeseada, setHoraDeseada] = useState(entrega.hora_inicio_estimada ? entrega.hora_inicio_estimada.slice(0, 5) : '')
  const [vehiculoId, setVehiculoId]   = useState(entrega.vehiculo_id || '')
  const [repartidorId, setRepartidorId] = useState(entrega.repartidor_id || '')
  const [tripulacionSel, setTripulacionSel] = useState(entrega.tripulacion || [])
  const [motivo, setMotivo]           = useState(MOTIVOS_INCIDENCIA[0])
  const [notaIncidencia, setNotaIncidencia] = useState('')
  const [mostrarIncidencia, setMostrarIncidencia] = useState(false)
  const [mostrarReprogramar, setMostrarReprogramar] = useState(false)
  const [nuevaFecha, setNuevaFecha]   = useState(entrega.fecha_programada)
  const [items, setItems]             = useState([])
  const [cargandoItems, setCargandoItems] = useState(false)
  const [itemProblema, setItemProblema] = useState(null)
  const [tipoProblema, setTipoProblema] = useState('faltante')
  const [cantidadProblema, setCantidadProblema] = useState('')
  const [notaProblema, setNotaProblema] = useState('')
  const [errorProblema, setErrorProblema] = useState('')
  const [agruparPorUbicacion, setAgruparPorUbicacion] = useState(true)

  useEffect(() => {
    setCargandoItems(true)
    supabase.from('entrega_items').select('*').eq('entrega_id', entrega.id).order('posicion')
      .then(({ data }) => { setItems(data || []); setCargandoItems(false) })
  }, [entrega.id])

  const marcarVerificado = async (item) => {
    await supabase.from('entrega_items').update({
      estado: 'verificado', cantidad_verificada: item.cantidad, verificado_por: userId, verificado_at: new Date().toISOString(),
    }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, estado: 'verificado', cantidad_verificada: item.cantidad } : i))
  }

  const resetearItem = async (item) => {
    await supabase.from('entrega_items').update({
      estado: 'pendiente', cantidad_verificada: null, motivo: null, verificado_por: null, verificado_at: null,
    }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, estado: 'pendiente', cantidad_verificada: null, motivo: null } : i))
  }

  const guardarProblema = async () => {
    const item = items.find(i => i.id === itemProblema)
    if (!item) return
    const valor = Number(cantidadProblema)
    if (isNaN(valor) || valor <= 0) { setErrorProblema('Escribe una cantidad mayor a cero.'); return }
    if (valor > item.cantidad) { setErrorProblema(`No puede ser más de lo que se vendió (${item.cantidad}).`); return }
    setErrorProblema('')
    const cantAfectada = valor
    const cantVerificada = Math.max(0, item.cantidad - cantAfectada)
    await supabase.from('entrega_items').update({
      estado: tipoProblema, cantidad_verificada: cantVerificada, motivo: notaProblema || null,
      verificado_por: userId, verificado_at: new Date().toISOString(),
    }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, estado: tipoProblema, cantidad_verificada: cantVerificada, motivo: notaProblema } : i))
    setItemProblema(null); setCantidadProblema(''); setNotaProblema(''); setTipoProblema('faltante')
  }

  const pendientesChecklist = items.filter(i => i.estado === 'pendiente').length

  const imprimirEsteTicket = () => {
    imprimirTicket({
      folio: entrega.ventas?.folio,
      fecha: `${fmtFecha(entrega.fecha_programada)}${entrega.hora_inicio_estimada ? ` — ${fmtHoraCorta(entrega.hora_inicio_estimada)}` : ''}`,
      contacto: entrega.contactos ? { nombre: entrega.contactos.nombre, telefono: entrega.contactos.telefono, colonia: entrega.contactos.colonia, direccion: entrega.contactos.direccion } : null,
      items: items.map(it => {
        const pend = it.cantidad - (it.cantidad_verificada ?? it.cantidad)
        const esPendiente = (it.estado === 'faltante' || it.estado === 'resguardo') && (it.cantidad - (it.cantidad_verificada ?? 0)) > 0
        return {
          nombre: it.nombre_producto, cantidad: it.cantidad,
          precioUnitario: it.precio_unitario, subtotal: it.subtotal,
          notaExtra: esPendiente ? `⚠ Pendiente por entregar: ${it.cantidad - (it.cantidad_verificada ?? 0)}` : undefined,
        }
      }),
      total: Number(entrega.ventas?.total) || 0,
      pagos: entrega.ventas?.pagos || [],
    })
  }

  const todoRevisado = pendientesChecklist === 0
  const [buscando, setBuscando]       = useState(false)
  const [disponibilidad, setDisponibilidad] = useState(null) // { ok, fecha, hora, motivo }

  const choferes  = personal.filter(p => p.tipo === 'chofer' && p.activo)
  const ayudantes = personal.filter(p => p.tipo === 'ayudante' && p.activo)
  const nombrePersonal = id => personal.find(p => p.id === id)?.nombre || '—'

  const toggleAyudante = (id) => {
    setTripulacionSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const cfg = ESTADOS[entrega.estado]
  const minutosEstimados = Math.round(Number(horas) * 60)

  // Busca el próximo hueco libre a partir de una fecha, avanzando día por día (hasta 14) según el horario laboral
  async function buscarProximoHueco(fechaInicial, idsCancelado) {
    let fechaProbar = fechaInicial
    for (let i = 0; i < 14; i++) {
      const horario = horarioDe(horarioLaboral, fechaProbar)
      if (horario?.hora_inicio) {
        const esHoy = fechaProbar === hoy()
        const horarioEfectivo = esHoy
          ? { ...horario, hora_inicio: minAHora(Math.max(horaAMin(horario.hora_inicio), ahoraEnMinutos())) }
          : horario
        const { data } = await supabase
          .from('entregas')
          .select('hora_inicio_estimada, tiempo_estimado_minutos')
          .eq('vehiculo_id', vehiculoId)
          .eq('fecha_programada', fechaProbar)
          .neq('id', entrega.id)
        if (idsCancelado.v) return null
        const hueco = buscarHueco(data || [], horarioEfectivo, minutosEstimados)
        if (hueco != null) return { fecha: fechaProbar, hora: minAHora(hueco) }
      }
      fechaProbar = sumarDias(fechaProbar, 1)
    }
    return null
  }

  // Si el vendedor pide una hora específica, valida esa hora exacta; si no, busca automáticamente el primer hueco libre
  useEffect(() => {
    if (entrega.estado !== 'pendiente_planificar' || !vehiculoId || !minutosEstimados) { setDisponibilidad(null); return }
    const idsCancelado = { v: false }
    const timer = setTimeout(async () => {
      setBuscando(true)

      if (horaDeseada) {
        const horario = horarioDe(horarioLaboral, fechaProg)
        const { data } = await supabase
          .from('entregas')
          .select('hora_inicio_estimada, tiempo_estimado_minutos')
          .eq('vehiculo_id', vehiculoId)
          .eq('fecha_programada', fechaProg)
          .neq('id', entrega.id)
        if (idsCancelado.v) return
        const ahoraMin = fechaProg === hoy() ? ahoraEnMinutos() : null
        const chequeo = estaLibre(data || [], horario, horaAMin(horaDeseada), minutosEstimados, ahoraMin)
        if (chequeo.libre) {
          setDisponibilidad({ ok: true, fecha: fechaProg, hora: `${horaDeseada}:00`, exacta: true })
          setBuscando(false)
          return
        }
        const alterna = await buscarProximoHueco(fechaProg, idsCancelado)
        if (!idsCancelado.v) setDisponibilidad({ ok: false, fecha: alterna?.fecha || null, hora: alterna?.hora || null, exacta: true, motivoConflicto: chequeo.motivo })
        setBuscando(false)
        return
      }

      const alterna = await buscarProximoHueco(fechaProg, idsCancelado)
      if (!idsCancelado.v) {
        if (alterna) setDisponibilidad({ ok: alterna.fecha === fechaProg, fecha: alterna.fecha, hora: alterna.hora })
        else setDisponibilidad({ ok: false, fecha: null, hora: null })
      }
      setBuscando(false)
    }, 400)
    return () => { idsCancelado.v = true; clearTimeout(timer) }
  }, [vehiculoId, fechaProg, horaDeseada, minutosEstimados, horarioLaboral, entrega.estado, entrega.id])

  const aceptarSugerencia = () => {
    if (!disponibilidad?.fecha) return
    setFechaProg(disponibilidad.fecha)
    setHoraDeseada(disponibilidad.hora.slice(0, 5))
  }

  return (
    <div>
      <button onClick={onVolver} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '1rem' }}>← Volver al tablero</button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#1a1a2e' }}>{entrega.ventas?.folio}</h3>
              <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '10px', background: `${cfg.color}20`, color: cfg.color, fontWeight: '700' }}>{cfg.label}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
              <p style={{ margin: 0 }}><strong>{entrega.contactos?.nombre}</strong></p>
              <p style={{ margin: 0, color: '#888' }}>{entrega.contactos?.colonia}</p>
              <p style={{ margin: 0, color: '#888' }}>{entrega.contactos?.direccion}</p>
              {entrega.contactos?.telefono && (
                <a href={`tel:${entrega.contactos.telefono}`} style={{ marginTop: '6px', display: 'inline-block', padding: '8px 16px', background: '#1D9E75', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: '600', textDecoration: 'none', width: 'fit-content' }}>
                  📞 Llamar a {entrega.contactos.telefono}
                </a>
              )}
            </div>
          </div>

          {/* Ticket de la venta — editable en Almacén, solo lectura en los demás estados */}
          {(() => {
            const editable = entrega.estado === 'almacen'
            return (
              <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>
                    {editable ? `📋 Checklist de carga (${items.length - pendientesChecklist}/${items.length})` : '🧾 Detalle de la venta'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {editable && (
                      <div style={{ display: 'flex', gap: '4px', background: '#f5f5f5', borderRadius: '6px', padding: '3px' }}>
                        <button onClick={() => setAgruparPorUbicacion(true)} style={{
                          padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          background: agruparPorUbicacion ? 'white' : 'transparent', color: agruparPorUbicacion ? '#1a1a2e' : '#888',
                          boxShadow: agruparPorUbicacion ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                        }}>Por ubicación</button>
                        <button onClick={() => setAgruparPorUbicacion(false)} style={{
                          padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          background: !agruparPorUbicacion ? 'white' : 'transparent', color: !agruparPorUbicacion ? '#1a1a2e' : '#888',
                          boxShadow: !agruparPorUbicacion ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                        }}>Orden del ticket</button>
                      </div>
                    )}
                    {items.length > 0 && (
                      <button onClick={imprimirEsteTicket} style={{ padding: '6px 12px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>🖨️ Imprimir</button>
                    )}
                  </div>
                </div>
                {cargandoItems && <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Cargando…</p>}
                {!cargandoItems && items.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#ccc', margin: 0 }}>Esta venta no tiene productos físicos que verificar.</p>
                )}
                {!cargandoItems && items.length > 0 && (
                  <div style={{ fontFamily: 'monospace', background: '#fcfcfc', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem 1.25rem', fontSize: '13px', maxWidth: '460px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                      <p style={{ margin: 0, fontWeight: '700', fontSize: '15px' }}>MATERIALES PALENQUE</p>
                      <p style={{ margin: 0, color: '#888' }}>Palenque, Chiapas</p>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888' }}>{fmtFecha(entrega.fecha_programada)}{entrega.hora_inicio_estimada ? ` — ${fmtHoraCorta(entrega.hora_inicio_estimada)}` : ''}</p>
                    </div>
                    <div style={{ borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '8px 0', margin: '8px 0' }}>
                      <p style={{ margin: 0 }}>Folio: <strong>{entrega.ventas?.folio}</strong></p>
                      <p style={{ margin: '4px 0 0' }}>Entrega: <strong>{entrega.contactos?.nombre}</strong></p>
                      {entrega.contactos?.telefono && <p style={{ margin: '2px 0 0' }}>Tel: {entrega.contactos.telefono}</p>}
                      {entrega.contactos?.colonia && <p style={{ margin: '2px 0 0' }}>Col: {entrega.contactos.colonia}</p>}
                      {entrega.contactos?.direccion && <p style={{ margin: '2px 0 0' }}>Dir: {entrega.contactos.direccion}</p>}
                    </div>
                    <div>
                      {(() => {
                        const filaItem = (item, conEtiqueta) => (
                          <div key={item.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: itemProblema === item.id ? 'none' : '1px dotted #ddd' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontWeight: '600', fontSize: '14px', color: item.estado === 'pendiente' ? '#1a1a2e' : item.estado === 'verificado' ? '#1D9E75' : '#BA7517' }}>
                                {item.estado === 'verificado' && '✔ '}{item.nombre_producto}
                                {conEtiqueta && item.ubicacion && item.ubicacion !== 'Tienda' && (
                                  <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#0C447C', background: '#f0f9ff', padding: '2px 6px', borderRadius: '6px', verticalAlign: 'middle' }}>
                                    📍 {item.ubicacion}
                                  </span>
                                )}
                              </p>
                              <p style={{ margin: '2px 0 0', color: '#888', fontSize: '12px' }}>
                                {item.cantidad} x {fmt(item.precio_unitario)} = {fmt(item.subtotal)}
                                {item.estado === 'faltante' && ` · faltan ${item.cantidad - (item.cantidad_verificada ?? 0)} ⚠️`}
                                {item.estado === 'resguardo' && ` · resguardo ${item.cantidad - (item.cantidad_verificada ?? 0)} 📦`}
                                {item.motivo && ` — "${item.motivo}"`}
                              </p>
                            </div>
                            {editable && (
                              item.estado === 'pendiente' ? (
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                  <button onClick={() => marcarVerificado(item)} title="Completo" style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', fontSize: '17px' }}>✓</button>
                                  <button onClick={() => { setItemProblema(itemProblema === item.id ? null : item.id); setCantidadProblema(String(item.cantidad)); setErrorProblema('') }} title="Incompleto / problema" style={{ width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: '#e53e3e', color: 'white', cursor: 'pointer', fontSize: '17px' }}>✕</button>
                                </div>
                              ) : (
                                <button onClick={() => resetearItem(item)} title="Corregir" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#aaa', textDecoration: 'underline' }}>editar</button>
                              )
                            )}
                          </div>
                          {editable && itemProblema === item.id && (
                            <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px', margin: '4px 0 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <Campo label="Motivo">
                                <select value={tipoProblema} onChange={e => setTipoProblema(e.target.value)} style={inputStyle}>
                                  <option value="faltante">Falta material</option>
                                  <option value="resguardo">Cliente pidió resguardo</option>
                                </select>
                              </Campo>
                              <Campo label="¿Cuánto NO va a salir en esta entrega?">
                                <input type="number" min="0" step="any" value={cantidadProblema} onChange={e => { setCantidadProblema(e.target.value); setErrorProblema('') }} style={inputStyle} />
                              </Campo>
                              {errorProblema && <p style={{ margin: 0, fontSize: '12px', color: '#e53e3e' }}>⚠️ {errorProblema}</p>}
                              <Campo label="Notas (opcional)">
                                <input type="text" value={notaProblema} onChange={e => setNotaProblema(e.target.value)} style={inputStyle} />
                              </Campo>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={guardarProblema} style={{ ...btnPrimario, background: '#e53e3e', width: 'auto', padding: '8px 20px' }}>Guardar</button>
                                <button onClick={() => { setItemProblema(null); setErrorProblema('') }} style={{ ...btnSecundario, width: 'auto', padding: '8px 20px' }}>Cancelar</button>
                              </div>
                            </div>
                          )}
                          </div>
                        )

                        // Fuera de Almacén (o si se eligió "orden del ticket"), se respeta el orden original — más fácil de cotejar contra el ticket físico del cliente
                        if (!editable || !agruparPorUbicacion) {
                          return <div>{items.map(item => filaItem(item, editable))}</div>
                        }

                        const grupos = {}
                        items.forEach(it => {
                          const key = it.ubicacion || 'Tienda'
                          grupos[key] = grupos[key] || []
                          grupos[key].push(it)
                        })
                        const orden = Object.keys(grupos).sort((a, b) => a === 'Tienda' ? -1 : b === 'Tienda' ? 1 : a.localeCompare(b))
                        return orden.map(ubic => (
                          <div key={ubic}>
                            <p style={{ margin: '12px 0 2px', fontSize: '12px', fontWeight: '700', color: ubic === 'Tienda' ? '#534AB7' : '#0C447C' }}>
                              {ubic === 'Tienda' ? '🏪 Verifica en tienda' : `🚚 Recoger en: ${ubic}`}
                            </p>
                            {ubic !== 'Tienda' && <p style={{ margin: '0 0 6px', fontSize: '10px', color: '#aaa' }}>Confirma el chofer al momento de cargar ahí.</p>}
                            {grupos[ubic].map(item => filaItem(item, false))}
                          </div>
                        ))
                      })()}
                    </div>
                    <div style={{ borderTop: '1px dashed #ccc', marginTop: '8px', paddingTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '14px' }}>
                        <span>TOTAL</span>
                        <span>{fmt(entrega.ventas?.total)}</span>
                      </div>
                      {entrega.ventas?.pagos?.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginTop: '4px' }}>
                          <span>{p.metodo}</span>
                          <span>{fmt(p.monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

            </div>
            )
          })()}

          {/* Historial de tiempos */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '14px', color: '#1a1a2e' }}>Seguimiento</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#555' }}>
              {entrega.planificado_at && <p style={{ margin: 0 }}>Planificada: {fmtHora(entrega.planificado_at)}</p>}
              {entrega.preparando_at && <p style={{ margin: 0 }}>En preparación desde: {fmtHora(entrega.preparando_at)}</p>}
              {entrega.listo_at && <p style={{ margin: 0 }}>Lista desde: {fmtHora(entrega.listo_at)}</p>}
              {entrega.en_ruta_at && <p style={{ margin: 0 }}>Salió: {fmtHora(entrega.en_ruta_at)}</p>}
              {entrega.entregado_at && <p style={{ margin: 0, color: '#1D9E75', fontWeight: '600' }}>Entregado: {fmtHora(entrega.entregado_at)}</p>}
              {entrega.motivo_incidencia && <p style={{ margin: 0, color: '#e53e3e' }}>Incidencia: {entrega.motivo_incidencia}{entrega.notas ? ` — ${entrega.notas}` : ''}</p>}
              {!entrega.planificado_at && <p style={{ margin: 0, color: '#ccc' }}>Aún sin planificar</p>}
            </div>
          </div>
        </div>

        {/* Panel de acción según estado */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '14px', color: '#1a1a2e' }}>Acción</h3>

          {entrega.estado === 'pendiente_planificar' && (
            <>
              <Campo label="Fecha de la entrega">
                <input type="date" value={fechaProg} onChange={e => setFechaProg(e.target.value)} style={inputStyle} />
              </Campo>
              <Campo label="Hora que pide el cliente (opcional)">
                <input type="time" value={horaDeseada} onChange={e => setHoraDeseada(e.target.value)} style={inputStyle} />
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#aaa' }}>Déjalo vacío para que el sistema elija automáticamente el primer hueco libre.</p>
              </Campo>
              <Campo label="¿Cuántos viajes necesita?">
                <input type="number" min="1" value={viajes} onChange={e => setViajes(parseInt(e.target.value) || 1)} style={inputStyle} />
              </Campo>
              <Campo label="Tiempo total estimado (horas, incluye todos los viajes)">
                <input type="number" min="0.25" step="0.25" value={horas} onChange={e => setHoras(e.target.value)} style={inputStyle} />
              </Campo>
              <Campo label="Vehículo">
                <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} style={inputStyle}>
                  <option value="">Sin asignar aún</option>
                  {vehiculos.filter(v => v.activo).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Chofer">
                <select value={repartidorId} onChange={e => setRepartidorId(e.target.value)} style={inputStyle}>
                  <option value="">Sin asignar aún</option>
                  {choferes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Campo>
              {ayudantes.length > 0 && (
                <Campo label="Tripulación (ayudantes)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #ddd', borderRadius: '6px', padding: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {ayudantes.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={tripulacionSel.includes(p.id)} onChange={() => toggleAyudante(p.id)} />
                        {p.nombre}
                      </label>
                    ))}
                  </div>
                </Campo>
              )}
              {vehiculoId && buscando && (
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Verificando disponibilidad…</p>
              )}
              {vehiculoId && !buscando && disponibilidad && disponibilidad.ok && (
                <p style={{ margin: 0, fontSize: '12px', color: '#1D9E75', background: '#f0fdf4', padding: '8px', borderRadius: '6px' }}>
                  ✅ {disponibilidad.exacta ? `La hora que pide el cliente está libre` : 'Cabe'} el {fmtFecha(disponibilidad.fecha)} a las {fmtHoraCorta(disponibilidad.hora)}.
                </p>
              )}
              {vehiculoId && !buscando && disponibilidad && !disponibilidad.ok && disponibilidad.fecha && (
                <div style={{ fontSize: '12px', color: '#BA7517', background: '#fef3c7', padding: '8px', borderRadius: '6px' }}>
                  <p style={{ margin: '0 0 6px' }}>
                    ⚠️ {disponibilidad.exacta ? `No se puede a las ${horaDeseada} — ${disponibilidad.motivoConflicto}` : `Ese vehículo ya no tiene espacio el ${fmtFecha(fechaProg)} para ${fmtHoras(minutosEstimados)}.`}
                  </p>
                  <p style={{ margin: '0 0 6px' }}>Hueco disponible más cercano: <strong>{NOMBRES_DIA[diaSemana(disponibilidad.fecha)]} {fmtFecha(disponibilidad.fecha)} a las {fmtHoraCorta(disponibilidad.hora)}</strong></p>
                  <button type="button" onClick={aceptarSugerencia} style={{ padding: '6px 12px', background: '#BA7517', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Usar esta fecha y hora</button>
                </div>
              )}
              {vehiculoId && !buscando && disponibilidad && !disponibilidad.ok && !disponibilidad.fecha && (
                <p style={{ margin: 0, fontSize: '12px', color: '#e53e3e', background: '#fef2f2', padding: '8px', borderRadius: '6px' }}>
                  ⚠️ No encontré espacio para este vehículo en los próximos 14 días. Revisa su carga o elige otro vehículo.
                </p>
              )}
              <button
                disabled={buscando || (vehiculoId && disponibilidad && !disponibilidad.ok)}
                onClick={() => onActualizar(entrega.id, {
                  fecha_programada: fechaProg, viajes, tiempo_estimado_minutos: minutosEstimados,
                  hora_inicio_estimada: vehiculoId && disponibilidad?.ok && disponibilidad?.fecha === fechaProg ? disponibilidad.hora : null,
                  vehiculo_id: vehiculoId || null, repartidor_id: repartidorId || null, tripulacion: tripulacionSel,
                  estado: 'almacen', planificado_at: new Date().toISOString(), planificado_por: userId,
                })}
                style={{
                  ...btnPrimario, marginTop: '4px',
                  ...(buscando || (vehiculoId && disponibilidad && !disponibilidad.ok) ? { background: '#e0e0e0', color: '#aaa', cursor: 'not-allowed' } : {}),
                }}
              >
                {vehiculoId && disponibilidad && !disponibilidad.ok ? 'Usa la sugerencia de arriba para continuar' : 'Confirmar planificación'}
              </button>
            </>
          )}

          {entrega.estado === 'almacen' && (
            <>
              <FilaInfo label="Fecha" valor={fmtFecha(entrega.fecha_programada)} />
              {entrega.hora_inicio_estimada && <FilaInfo label="Hora estimada" valor={fmtHoraCorta(entrega.hora_inicio_estimada)} />}
              <FilaInfo label="Vehículo" valor={entrega.vehiculos?.nombre || '—'} />
              <FilaInfo label="Chofer" valor={entrega.repartidor?.nombre || '—'} />
              {entrega.tripulacion?.length > 0 && (
                <FilaInfo label="Tripulación" valor={entrega.tripulacion.map(nombrePersonal).join(', ')} />
              )}
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
                👈 Marca cada producto en el ticket de la izquierda.
              </p>
              <button
                disabled={!todoRevisado}
                onClick={() => onActualizar(entrega.id, { estado: 'en_ruta', en_ruta_at: new Date().toISOString() })}
                style={{ ...btnPrimario, ...(!todoRevisado ? { background: '#e0e0e0', color: '#aaa', cursor: 'not-allowed' } : {}) }}
              >
                {todoRevisado ? '🚚 Carga verificada — Marcar en ruta' : `Faltan ${pendientesChecklist} productos por revisar`}
              </button>
            </>
          )}

          {entrega.estado === 'en_ruta' && !mostrarIncidencia && (
            <>
              <button onClick={() => onActualizar(entrega.id, { estado: 'entregado', entregado_at: new Date().toISOString(), entregado_por: userId })} style={btnPrimario}>✅ Entregado</button>
              <button onClick={() => setMostrarIncidencia(true)} style={btnSecundario}>⚠️ No se pudo entregar</button>
            </>
          )}

          {entrega.estado === 'en_ruta' && mostrarIncidencia && (
            <>
              <Campo label="Motivo">
                <select value={motivo} onChange={e => setMotivo(e.target.value)} style={inputStyle}>
                  {MOTIVOS_INCIDENCIA.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo label="Notas (opcional)">
                <input type="text" value={notaIncidencia} onChange={e => setNotaIncidencia(e.target.value)} style={inputStyle} />
              </Campo>
              <button onClick={() => onActualizar(entrega.id, { estado: 'incidencia', motivo_incidencia: motivo, notas: notaIncidencia || null })} style={{ ...btnPrimario, background: '#e53e3e' }}>Registrar incidencia</button>
              <button onClick={() => setMostrarIncidencia(false)} style={btnSecundario}>Cancelar</button>
            </>
          )}

          {entrega.estado === 'incidencia' && !mostrarReprogramar && (
            <>
              <p style={{ fontSize: '12px', color: '#e53e3e', margin: 0, fontWeight: '600' }}>{entrega.motivo_incidencia}</p>
              {entrega.notas && <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{entrega.notas}</p>}
              <button onClick={() => setMostrarReprogramar(true)} style={btnPrimario}>📅 Reprogramar entrega</button>
            </>
          )}

          {entrega.estado === 'incidencia' && mostrarReprogramar && (
            <>
              <Campo label="Nueva fecha">
                <input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} style={inputStyle} />
              </Campo>
              <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>Al confirmar, vas a poder revisar/ajustar el horario disponible para esa nueva fecha.</p>
              <button onClick={() => onActualizar(entrega.id, {
                estado: 'pendiente_planificar', fecha_programada: nuevaFecha, intento: (entrega.intento || 1) + 1,
                motivo_incidencia: null, notas: null, en_ruta_at: null, hora_inicio_estimada: null,
              })} style={btnPrimario}>Confirmar nueva fecha</button>
            </>
          )}

          {entrega.estado === 'entregado' && (
            <p style={{ fontSize: '13px', color: '#1D9E75', fontWeight: '600', margin: 0 }}>✅ Entrega completada {fmtHora(entrega.entregado_at)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function PanelPendientes({ pendientes, userId, onVolver, onRecargar }) {
  const [itemParcial, setItemParcial] = useState(null)
  const [cantidadSurtida, setCantidadSurtida] = useState('')
  const [notaSurtido, setNotaSurtido] = useState('')
  const [errorSurtido, setErrorSurtido] = useState('')

  const guardarParcial = async (item) => {
    const cantPendiente = item.cantidad - (item.cantidad_verificada ?? 0)
    const valor = Number(cantidadSurtida)
    if (isNaN(valor) || valor <= 0) { setErrorSurtido('Escribe una cantidad mayor a cero.'); return }
    if (valor > cantPendiente) { setErrorSurtido(`No puede ser más de lo pendiente (${cantPendiente}).`); return }
    setErrorSurtido('')
    const surtidoAhora = valor
    const nuevaVerificada = (item.cantidad_verificada ?? 0) + surtidoAhora
    const quedaPendiente = item.cantidad - nuevaVerificada
    const nota = agregarNota(item.motivo, `Se surtieron ${surtidoAhora} el ${fmtFecha(hoy())}${notaSurtido ? ` — ${notaSurtido}` : ''}`)
    await supabase.from('entrega_items').update({
      cantidad_verificada: nuevaVerificada,
      motivo: nota,
      resuelto: quedaPendiente <= 0,
      ...(quedaPendiente <= 0 ? { resuelto_at: new Date().toISOString(), resuelto_por: userId } : {}),
    }).eq('id', item.id)
    setItemParcial(null); setCantidadSurtida(''); setNotaSurtido('')
    onRecargar()
  }

  const imprimirTicketPendiente = (entrega) => {
    imprimirTicket({
      folio: entrega.ventas?.folio,
      fecha: fmtFecha(entrega.fecha_programada),
      contacto: entrega.contactos ? { nombre: entrega.contactos.nombre, telefono: entrega.contactos.telefono, colonia: entrega.contactos.colonia, direccion: entrega.contactos.direccion } : null,
      items: (entrega.items || []).map(it => {
        const pend = it.cantidad - (it.cantidad_verificada ?? 0)
        const esPendiente = (it.estado === 'faltante' || it.estado === 'resguardo') && pend > 0
        return {
          nombre: it.nombre_producto, cantidad: it.cantidad,
          precioUnitario: it.precio_unitario, subtotal: it.subtotal,
          notaExtra: esPendiente ? `⚠ Pendiente por entregar: ${pend}${it.motivo ? ` — ${it.motivo}` : ''}` : '✔ Entregado completo',
        }
      }),
      total: Number(entrega.ventas?.total) || 0,
      pagos: entrega.ventas?.pagos || [],
      notaPie: 'Para aclaraciones, conserve este comprobante.',
    })
  }

  return (
    <div>
      <button onClick={onVolver} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '1rem' }}>← Volver al tablero</button>

      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: '#1a1a2e' }}>⚠️ Entregas con productos pendientes por surtir</h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Se ve el ticket completo — lo ya entregado queda fijo, solo se puede ajustar lo que sigue pendiente. Si se surte solo una parte, se queda con lo que resta — no se cierra hasta llegar a cero.</p>
      </div>

      {pendientes.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '2rem', textAlign: 'center', color: '#1D9E75' }}>
          ✅ No hay pendientes por surtir.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {pendientes.map(entrega => (
            <div key={entrega.id} style={{ background: 'white', borderRadius: '10px', border: '1px solid #fecaca', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#534AB7', fontWeight: '700' }}>{entrega.ventas?.folio}</span>
                <button onClick={() => imprimirTicketPendiente(entrega)} style={{ padding: '6px 14px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>🖨️ Imprimir</button>
              </div>

              <div style={{ fontFamily: 'monospace', background: '#fcfcfc', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem 1.25rem', fontSize: '13px', maxWidth: '460px' }}>
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <p style={{ margin: 0, fontWeight: '700', fontSize: '15px' }}>MATERIALES PALENQUE</p>
                  <p style={{ margin: 0, color: '#888' }}>Palenque, Chiapas</p>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888' }}>{fmtFecha(entrega.fecha_programada)}{entrega.hora_inicio_estimada ? ` — ${fmtHoraCorta(entrega.hora_inicio_estimada)}` : ''}</p>
                </div>
                <div style={{ borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '8px 0', margin: '8px 0' }}>
                  <p style={{ margin: 0 }}>Folio: <strong>{entrega.ventas?.folio}</strong></p>
                  <p style={{ margin: '4px 0 0' }}>Entrega: <strong>{entrega.contactos?.nombre}</strong></p>
                  {entrega.contactos?.telefono && <p style={{ margin: '2px 0 0' }}>Tel: {entrega.contactos.telefono}</p>}
                  {entrega.contactos?.colonia && <p style={{ margin: '2px 0 0' }}>Col: {entrega.contactos.colonia}</p>}
                  {entrega.contactos?.direccion && <p style={{ margin: '2px 0 0' }}>Dir: {entrega.contactos.direccion}</p>}
                </div>
                <div>
                  {(entrega.items || []).map(item => {
                    const cantPendiente = item.cantidad - (item.cantidad_verificada ?? 0)
                    const esPendienteAbierto = (item.estado === 'faltante' || item.estado === 'resguardo') && !item.resuelto && cantPendiente > 0
                    return (
                      <div key={item.id} style={{ borderBottom: '1px dotted #ddd', padding: '10px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: '600', fontSize: '14px', color: esPendienteAbierto ? '#BA7517' : '#1D9E75' }}>
                              {esPendienteAbierto ? '⚠ ' : '✔ '}{item.nombre_producto}
                            </p>
                            <p style={{ margin: '2px 0 0', color: '#888', fontSize: '12px' }}>
                              {item.cantidad} x {fmt(item.precio_unitario)} = {fmt(item.subtotal)}
                              {esPendienteAbierto && ` · pendiente: ${cantPendiente}`}
                              {!esPendienteAbierto && (item.estado === 'faltante' || item.estado === 'resguardo') && ' · ya surtido'}
                            </p>
                            {item.motivo && <p style={{ margin: '2px 0 0', color: '#aaa', fontSize: '11px' }}>{item.motivo}</p>}
                          </div>
                          {esPendienteAbierto && itemParcial !== item.id && (
                            <button onClick={() => { setItemParcial(item.id); setCantidadSurtida(String(cantPendiente)); setErrorSurtido('') }} style={{ padding: '0 16px', height: '32px', borderRadius: '8px', border: 'none', background: '#BA7517', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>📝 Registrar entrega</button>
                          )}
                        </div>
                        {itemParcial === item.id && (
                          <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <Campo label={`¿Cuánto se surtió ahora? (ya trae los ${cantPendiente} pendientes — bájalo si fue menos)`}>
                              <input type="number" min="0" max={cantPendiente} step="any" value={cantidadSurtida} onChange={e => { setCantidadSurtida(e.target.value); setErrorSurtido('') }} style={inputStyle} />
                            </Campo>
                            {errorSurtido && <p style={{ margin: 0, fontSize: '12px', color: '#e53e3e' }}>⚠️ {errorSurtido}</p>}
                            <Campo label="Notas (opcional)">
                              <input type="text" value={notaSurtido} onChange={e => setNotaSurtido(e.target.value)} style={inputStyle} />
                            </Campo>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => guardarParcial(item)} style={{ padding: '8px 16px', background: '#BA7517', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Guardar</button>
                              <button onClick={() => { setItemParcial(null); setCantidadSurtida(''); setNotaSurtido(''); setErrorSurtido('') }} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ borderTop: '1px dashed #ccc', marginTop: '8px', paddingTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '14px' }}>
                    <span>TOTAL</span>
                    <span>{fmt(entrega.ventas?.total)}</span>
                  </div>
                </div>
              </div>

              {entrega.contactos?.telefono && (
                <a href={`tel:${entrega.contactos.telefono}`} style={{ marginTop: '10px', display: 'inline-block', padding: '8px 16px', background: '#f0fdf4', color: '#1D9E75', borderRadius: '8px', fontSize: '13px', fontWeight: '600', textDecoration: 'none', border: '1px solid #bbf7d0' }}>
                  📞 Llamar a {entrega.contactos.telefono}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PanelVehiculos({ onVolver, vehiculos, personal, onRecargarVehiculos, onRecargarPersonal }) {
  const [tab, setTab] = useState('vehiculos')
  const [negocioId, setNegocioId] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        const { data: u } = await supabase.from('usuarios').select('negocio_id').eq('id', data.user.id).single()
        if (u) setNegocioId(u.negocio_id)
      }
    })
  }, [])

  return (
    <div>
      <button onClick={onVolver} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '1rem' }}>← Volver al tablero</button>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
        {[{ id: 'vehiculos', label: '🚚 Vehículos' }, { id: 'personal', label: '👷 Choferes y tripulación' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: tab === t.id ? '600' : '400',
            background: tab === t.id ? '#1a1a2e' : 'white', color: tab === t.id ? 'white' : '#555',
            border: '1px solid #ddd', cursor: 'pointer'
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'vehiculos' && <TabVehiculos vehiculos={vehiculos} negocioId={negocioId} onRecargar={onRecargarVehiculos} />}
      {tab === 'personal' && <TabPersonal personal={personal} negocioId={negocioId} onRecargar={onRecargarPersonal} />}
    </div>
  )
}

function TabVehiculos({ vehiculos, negocioId, onRecargar }) {
  const [nombre, setNombre]       = useState('')
  const [horas, setHoras]         = useState(9)
  const [capacidad, setCapacidad] = useState('')
  const [error, setError]         = useState(null)

  const agregar = async () => {
    if (!nombre.trim()) return
    setError(null)
    const { error: e } = await supabase.from('vehiculos').insert({
      negocio_id: negocioId, nombre: nombre.trim(), capacidad_horas_dia: Number(horas) || 9,
      capacidad_carga: capacidad.trim() || null,
    })
    if (e) { setError(e.message); return }
    setNombre(''); setHoras(9); setCapacidad('')
    onRecargar()
  }

  const toggleActivo = async (v) => {
    await supabase.from('vehiculos').update({ activo: !v.activo }).eq('id', v.id)
    onRecargar()
  }

  const editarCampo = async (v, campo, valor) => {
    await supabase.from('vehiculos').update({ [campo]: valor }).eq('id', v.id)
    onRecargar()
  }

  return (
    <div>
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Nuevo vehículo</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="Nombre"><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="ej. Camioneta 3 Ton" style={inputStyle} /></Campo>
          <Campo label="Capacidad de carga"><input value={capacidad} onChange={e => setCapacidad(e.target.value)} placeholder="ej. 3 toneladas" style={{ ...inputStyle, width: '160px' }} /></Campo>
          <Campo label="Horas de jornada/día"><input type="number" min="1" value={horas} onChange={e => setHoras(e.target.value)} style={{ ...inputStyle, width: '120px' }} /></Campo>
          <button onClick={agregar} style={{ ...btnPrimario, width: 'auto', padding: '10px 20px' }}>+ Agregar</button>
        </div>
        {error && <p style={{ color: '#e53e3e', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
      </div>

      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Vehículo</th>
              <th style={th}>Capacidad de carga</th>
              <th style={{ ...th, textAlign: 'center' }}>Horas/día</th>
              <th style={{ ...th, textAlign: 'center' }}>Estado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.map(v => (
              <tr key={v.id} style={{ borderTop: '1px solid #f0f0f0', opacity: v.activo ? 1 : 0.5 }}>
                <td style={td}>{v.nombre}</td>
                <td style={td}>
                  <input type="text" defaultValue={v.capacidad_carga || ''} placeholder="—"
                    onBlur={e => editarCampo(v, 'capacidad_carga', e.target.value.trim() || null)}
                    style={{ width: '100px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                  />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <input type="number" min="1" defaultValue={v.capacidad_horas_dia}
                    onBlur={e => editarCampo(v, 'capacidad_horas_dia', Number(e.target.value) || v.capacidad_horas_dia)}
                    style={{ width: '60px', padding: '4px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px' }}
                  />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: v.activo ? '#f0fdf4' : '#fef2f2', color: v.activo ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                    {v.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => toggleActivo(v)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '12px', cursor: 'pointer' }}>
                    {v.activo ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </td>
              </tr>
            ))}
            {vehiculos.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#888', padding: '2rem' }}>Sin vehículos registrados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabPersonal({ personal, negocioId, onRecargar }) {
  const [nombre, setNombre]     = useState('')
  const [telefono, setTelefono] = useState('')
  const [tipo, setTipo]         = useState('chofer')
  const [error, setError]       = useState(null)

  const agregar = async () => {
    if (!nombre.trim()) return
    setError(null)
    const { error: e } = await supabase.from('personal_reparto').insert({
      negocio_id: negocioId, nombre: nombre.trim(), telefono: telefono.trim() || null, tipo,
    })
    if (e) { setError(e.message); return }
    setNombre(''); setTelefono(''); setTipo('chofer')
    onRecargar()
  }

  const toggleActivo = async (p) => {
    await supabase.from('personal_reparto').update({ activo: !p.activo }).eq('id', p.id)
    onRecargar()
  }

  return (
    <div>
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Nuevo chofer o ayudante</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="Nombre"><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="ej. Juan Pérez" style={inputStyle} /></Campo>
          <Campo label="Teléfono"><input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="opcional" style={{ ...inputStyle, width: '150px' }} /></Campo>
          <Campo label="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inputStyle, width: '140px' }}>
              <option value="chofer">Chofer</option>
              <option value="ayudante">Ayudante</option>
            </select>
          </Campo>
          <button onClick={agregar} style={{ ...btnPrimario, width: 'auto', padding: '10px 20px' }}>+ Agregar</button>
        </div>
        {error && <p style={{ color: '#e53e3e', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
      </div>

      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Nombre</th>
              <th style={th}>Teléfono</th>
              <th style={{ ...th, textAlign: 'center' }}>Tipo</th>
              <th style={{ ...th, textAlign: 'center' }}>Estado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {personal.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0', opacity: p.activo ? 1 : 0.5 }}>
                <td style={td}>{p.nombre}</td>
                <td style={{ ...td, color: '#888' }}>{p.telefono || '—'}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: p.tipo === 'chofer' ? '#f0f9ff' : '#f5f3ff', color: p.tipo === 'chofer' ? '#0C447C' : '#534AB7', fontWeight: '600' }}>
                    {p.tipo === 'chofer' ? 'Chofer' : 'Ayudante'}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: p.activo ? '#f0fdf4' : '#fef2f2', color: p.activo ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => toggleActivo(p)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '12px', cursor: 'pointer' }}>
                    {p.activo ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </td>
              </tr>
            ))}
            {personal.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#888', padding: '2rem' }}>Sin choferes ni ayudantes registrados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}

function FilaInfo({ label, valor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ fontWeight: '600' }}>{valor}</span>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }
const btnPrimario = { width: '100%', padding: '10px', background: '#f97316', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }
const btnSecundario = { width: '100%', padding: '10px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }
const th = { padding: '10px 1.25rem', textAlign: 'left', fontSize: '12px', color: '#888', fontWeight: '600' }
const td = { padding: '10px 1.25rem', fontSize: '14px', color: '#333' }
