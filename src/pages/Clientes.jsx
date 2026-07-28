import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const fmt = n => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN'
}).format(n || 0)

const fmtFecha = f => {
  if (!f) return ''
  return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const USO_CFDI = {
  G01: 'Adquisición de mercancías',
  G03: 'Gastos en general',
  S01: 'Sin efectos fiscales',
  P01: 'Por definir',
}

const METODOS_ABONO = {
  efectivo:      { label: 'Efectivo',      color: '#1D9E75' },
  tarjeta:       { label: 'Tarjeta',       color: '#534AB7' },
  transferencia: { label: 'Transferencia', color: '#0C447C' },
  otro:          { label: 'Otro',          color: '#888' },
}

const METODOS_VENTA = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
  credito:       'Crédito',
}

export default function Clientes() {
  const [negocioId, setNegocioId]           = useState(null)
  const [clientes, setClientes]             = useState([])
  const [cargando, setCargando]             = useState(true)
  const [busqueda, setBusqueda]             = useState('')
  const [verInactivos, setVerInactivos]     = useState(false)
  const [vista, setVista]                   = useState('todos')
  const [clienteAbierto, setClienteAbierto] = useState(null)
  const [mostrarForm, setMostrarForm]       = useState(false)

  useEffect(() => { obtenerNegocio() }, [])
  useEffect(() => { if (negocioId) cargarClientes() }, [negocioId, busqueda, verInactivos, vista])

  async function obtenerNegocio() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('usuarios').select('negocio_id').eq('id', user.id).single()
    if (data) setNegocioId(data.negocio_id)
  }

  async function cargarClientes() {
    setCargando(true)
    let query = supabase.from('clientes').select('*')
    if (vista === 'credito') {
      query = query.gt('saldo', 0)
    } else {
      query = query.eq('activo', !verInactivos)
    }
    if (busqueda.trim()) {
      const q = busqueda.trim()
      query = query.or(`nombre.ilike.%${q}%,rfc.ilike.%${q}%,telefono.ilike.%${q}%`)
    }
    query = vista === 'credito'
      ? query.order('saldo', { ascending: false })
      : query.order('nombre', { ascending: true })
    const { data, error } = await query
    if (!error) setClientes(data || [])
    setCargando(false)
  }

  if (clienteAbierto) {
    return (
      <DetalleCliente
        cliente={clienteAbierto}
        negocioId={negocioId}
        onVolver={() => { setClienteAbierto(null); cargarClientes() }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {[
          { id: 'todos',   label: '👥 Todos los clientes' },
          { id: 'credito', label: '📋 Con crédito pendiente' },
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

      {/* Tarjetas resumen de crédito */}
      {vista === 'credito' && !cargando && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <TarjetaResumen label="Clientes con adeudo" valor={clientes.length} color="#BA7517" />
          <TarjetaResumen label="Total en crédito" valor={fmt(clientes.reduce((s, c) => s + Number(c.saldo), 0))} color="#e53e3e" />
          <TarjetaResumen label="Límite total otorgado" valor={fmt(clientes.reduce((s, c) => s + Number(c.credito_limite), 0))} color="#534AB7" />
          <TarjetaResumen label="Crédito disponible" valor={fmt(clientes.reduce((s, c) => s + Math.max(0, Number(c.credito_limite) - Number(c.saldo)), 0))} color="#1D9E75" />
        </div>
      )}

      {/* Buscador y acciones */}
      <div style={{ background: 'white', padding: '1rem', borderRadius: '10px', border: '1px solid #e0e0e0', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por nombre, RFC o teléfono..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', outline: 'none' }}
        />
        {vista === 'todos' && (
          <button onClick={() => setVerInactivos(!verInactivos)} style={{
            padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
            background: verInactivos ? '#1a1a2e' : 'white', color: verInactivos ? 'white' : '#555',
            border: '1px solid #ddd', cursor: 'pointer'
          }}>{verInactivos ? '👁️ Viendo inactivos' : '👁️ Ver inactivos'}</button>
        )}
        <button onClick={() => setMostrarForm(true)} style={{
          padding: '10px 20px', background: '#f97316', color: 'white', border: 'none',
          borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
        }}>+ Nuevo cliente</button>
      </div>

      {mostrarForm && (
        <FormCliente
          negocioId={negocioId}
          onCancelar={() => setMostrarForm(false)}
          onGuardado={() => { setMostrarForm(false); cargarClientes() }}
        />
      )}

      {/* Tabla */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Clientes</h3>
          <span style={{ fontSize: '12px', color: '#888' }}>{cargando ? 'Cargando...' : `${clientes.length} clientes`}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Cliente</th>
              <th style={th}>RFC</th>
              <th style={th}>Teléfono</th>
              <th style={{ ...th, textAlign: 'right' }}>Límite crédito</th>
              <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
              <th style={{ ...th, textAlign: 'center' }}>Estado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#888', padding: '2rem' }}>Cargando clientes...</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#888', padding: '2rem' }}>No se encontraron clientes</td></tr>
            ) : clientes.map(c => {
              const excede = Number(c.credito_limite) > 0 && Number(c.saldo) > Number(c.credito_limite)
              return (
                <tr key={c.id} onDoubleClick={() => setClienteAbierto(c)} style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer', opacity: c.activo ? 1 : 0.5 }}>
                  <td style={{ ...td, fontWeight: '600' }}>{c.nombre}</td>
                  <td style={{ ...td, color: '#888', fontSize: '12px' }}>{c.rfc || '—'}</td>
                  <td style={{ ...td, color: '#888', fontSize: '12px' }}>{c.telefono || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#888' }}>{fmt(c.credito_limite)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: excede ? '#e53e3e' : Number(c.saldo) > 0 ? '#BA7517' : '#888' }}>{fmt(c.saldo)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: c.activo ? '#f0fdf4' : '#fef2f2', color: c.activo ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button onClick={() => setClienteAbierto(c)}
                      style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '12px', cursor: 'pointer', color: '#333' }}>
                      Ver →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TarjetaResumen({ label, valor, color }) {
  return (
    <div style={{ background: 'white', borderRadius: '10px', padding: '1.25rem', border: '1px solid #e0e0e0', borderTop: `4px solid ${color}` }}>
      <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#888' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color }}>{valor}</p>
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

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }

function FormCliente({ negocioId, cliente, onCancelar, onGuardado }) {
  const esEdicion = !!cliente
  const [nombre, setNombre]               = useState(cliente?.nombre || '')
  const [rfc, setRfc]                     = useState(cliente?.rfc || '')
  const [usoCfdi, setUsoCfdi]             = useState(cliente?.uso_cfdi || 'G03')
  const [email, setEmail]                 = useState(cliente?.email || '')
  const [telefono, setTelefono]           = useState(cliente?.telefono || '')
  const [direccion, setDireccion]         = useState(cliente?.direccion || '')
  const [creditoLimite, setCreditoLimite] = useState(cliente?.credito_limite ?? 0)
  const [guardando, setGuardando]         = useState(false)
  const [error, setError]                 = useState(null)

  const guardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setGuardando(true); setError(null)
    const payload = {
      nombre: nombre.trim(), rfc: rfc.trim() || null, uso_cfdi: usoCfdi,
      email: email.trim() || null, telefono: telefono.trim() || null,
      direccion: direccion.trim() || null, credito_limite: Number(creditoLimite) || 0,
    }
    let errorOp
    if (esEdicion) {
      ({ error: errorOp } = await supabase.from('clientes').update(payload).eq('id', cliente.id))
    } else {
      ({ error: errorOp } = await supabase.from('clientes').insert({ ...payload, negocio_id: negocioId }))
    }
    setGuardando(false)
    if (errorOp) { setError(errorOp.message); return }
    onGuardado()
  }

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>{esEdicion ? 'Editar cliente' : 'Nuevo cliente'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Campo label="Nombre *"><input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} /></Campo>
        <Campo label="RFC"><input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} style={inputStyle} /></Campo>
        <Campo label="Uso de CFDI">
          <select value={usoCfdi} onChange={e => setUsoCfdi(e.target.value)} style={inputStyle}>
            {Object.entries(USO_CFDI).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
          </select>
        </Campo>
        <Campo label="Teléfono"><input value={telefono} onChange={e => setTelefono(e.target.value)} style={inputStyle} /></Campo>
        <Campo label="Email"><input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></Campo>
        <Campo label="Límite de crédito"><input type="number" min="0" value={creditoLimite} onChange={e => setCreditoLimite(e.target.value)} style={inputStyle} /></Campo>
        <div style={{ gridColumn: '1 / -1' }}>
          <Campo label="Dirección"><input value={direccion} onChange={e => setDireccion(e.target.value)} style={inputStyle} /></Campo>
        </div>
      </div>
      {error && <p style={{ color: '#e53e3e', fontSize: '13px', margin: '1rem 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '10px', marginTop: '1.25rem' }}>
        <button onClick={guardar} disabled={guardando} style={{ padding: '10px 20px', background: '#f97316', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          {guardando ? 'Guardando...' : '💾 Guardar'}
        </button>
        <button onClick={onCancelar} style={{ padding: '10px 20px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
      </div>
    </div>
  )
}

function DetalleCliente({ cliente: clienteInicial, negocioId, onVolver }) {
  const [cliente, setCliente]           = useState(clienteInicial)
  const [editando, setEditando]         = useState(false)
  const [ventas, setVentas]             = useState([])
  const [abonos, setAbonos]             = useState([])
  const [cargando, setCargando]         = useState(true)
  const [mostrarAbono, setMostrarAbono] = useState(false)
  const [filaSeleccionada, setFilaSeleccionada] = useState(null)
  const [ventaAbierta, setVentaAbierta] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: v }, { data: a }, { data: c }] = await Promise.all([
      supabase.from('ventas').select('id, folio, total, descuento, recargo, estado, created_at, pagos(metodo)').eq('cliente_id', cliente.id).order('created_at', { ascending: false }),
      supabase.from('abonos').select('id, monto, metodo, referencia, notas, created_at, usuarios(email)').eq('cliente_id', cliente.id).order('created_at', { ascending: false }),
      supabase.from('clientes').select('*').eq('id', cliente.id).single(),
    ])
    setVentas(v || [])
    setAbonos(a || [])
    if (c) setCliente(c)
    setCargando(false)
  }

  const darDeBaja = async () => {
    const { error } = await supabase.from('clientes').update({ activo: !cliente.activo }).eq('id', cliente.id)
    if (!error) setCliente(prev => ({ ...prev, activo: !prev.activo }))
  }

  const imprimirVenta = async (venta) => {
    const { data: items } = await supabase
      .from('venta_items')
      .select('nombre_producto, cantidad, precio_unitario, subtotal')
      .eq('venta_id', venta.id)
    const metodosTexto = (venta.pagos || []).map(p => METODOS_VENTA[p.metodo] || p.metodo).join(', ') || '—'
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
      <div>Cliente: <strong>${cliente.nombre}</strong></div>
      ${cliente.rfc ? `<div>RFC: ${cliente.rfc}</div>` : ''}
      <hr>
      <div>
        ${(items || []).map((i, idx) => {
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

  const imprimirAbono = (abono, saldoOverride) => {
    const saldoMostrar = saldoOverride !== undefined && saldoOverride !== null ? saldoOverride : cliente.saldo
    const w = window.open('', '_blank', 'width=380,height=500')
    w.document.write(`
      <html><head><title>Abono ${cliente.nombre}</title>
      <style>body{font-family:monospace;font-size:12px;max-width:320px;margin:0 auto;padding:1rem}
      hr{border:none;border-top:1px dashed #ccc;margin:8px 0}
      .center{text-align:center}.bold{font-weight:700}
      .fila{display:flex;justify-content:space-between}
      </style></head><body>
      <div class="center"><div class="bold" style="font-size:14px">MATERIALES PALENQUE</div>
      <div>Palenque, Chiapas</div>
      <div class="bold" style="margin-top:6px">Comprobante de Abono</div></div>
      <hr>
      <div>Cliente: <strong>${cliente.nombre}</strong></div>
      ${cliente.rfc ? `<div>RFC: ${cliente.rfc}</div>` : ''}
      <div style="font-size:11px;color:#888;margin-top:4px">${new Date(abono.created_at).toLocaleString('es-MX')}</div>
      <hr>
      <div class="fila bold" style="font-size:14px"><span>Monto abonado</span><span>$${Number(abono.monto).toFixed(2)}</span></div>
      <div style="margin-top:6px">Método: ${METODOS_ABONO[abono.metodo]?.label || abono.metodo}</div>
      ${abono.referencia ? `<div>Referencia: ${abono.referencia}</div>` : ''}
      <hr>
      <div class="fila bold"><span>Saldo actual</span><span>$${Number(saldoMostrar).toFixed(2)}</span></div>
      <hr><div class="center" style="color:#888;font-size:11px">Gracias por su pago</div>
      </body></html>
    `)
    w.document.close()
    w.print()
  }

  const imprimirEstadoCuenta = () => {
    const movimientos = [
      ...ventas.filter(v => v.estado === 'completada').map(v => ({
        fecha: v.created_at, tipo: 'venta', cargo: Number(v.total), folio: v.folio,
      })),
      ...abonos.map(a => ({
        fecha: a.created_at, tipo: 'abono', abono: Number(a.monto), referencia: a.referencia,
      })),
    ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

    let saldoCorrido = 0
    const filas = movimientos.map(m => {
      saldoCorrido += m.tipo === 'venta' ? m.cargo : -m.abono
      return { ...m, saldoCorrido }
    })

    const w = window.open('', '_blank', 'width=420,height=650')
    w.document.write(`
      <html><head><title>Estado de cuenta — ${cliente.nombre}</title>
      <style>body{font-family:monospace;font-size:12px;max-width:360px;margin:0 auto;padding:1rem}
      table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;padding-bottom:4px;border-bottom:1px solid #ccc}
      td{padding:4px 0}hr{border:none;border-top:1px dashed #ccc;margin:8px 0}
      .right{text-align:right}.center{text-align:center}.bold{font-weight:700}
      </style></head><body>
      <div class="center"><div class="bold" style="font-size:14px">MATERIALES PALENQUE</div>
      <div>Palenque, Chiapas</div>
      <div class="bold" style="margin-top:6px">Estado de Cuenta</div></div>
      <hr>
      <div>Cliente: <strong>${cliente.nombre}</strong></div>
      ${cliente.rfc ? `<div>RFC: ${cliente.rfc}</div>` : ''}
      <div style="font-size:11px;color:#888;margin-top:4px">Generado: ${new Date().toLocaleString('es-MX')}</div>
      <table>
        <thead><tr><th>Fecha</th><th>Movimiento</th><th class="right">Cargo/Abono</th><th class="right">Saldo</th></tr></thead>
        <tbody>
          ${filas.map(f => `
            <tr>
              <td>${new Date(f.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
              <td>${f.tipo === 'venta' ? `Venta ${f.folio}` : `Abono${f.referencia ? ' (' + f.referencia + ')' : ''}`}</td>
              <td class="right">${f.tipo === 'venta' ? '+' : '-'}$${(f.tipo === 'venta' ? f.cargo : f.abono).toFixed(2)}</td>
              <td class="right">$${f.saldoCorrido.toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <hr>
      <div style="display:flex;justify-content:space-between" class="bold" style="font-size:14px"><span>SALDO ACTUAL</span><span>$${Number(cliente.saldo).toFixed(2)}</span></div>
      ${Number(cliente.credito_limite) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-top:4px"><span>Límite de crédito</span><span>$${Number(cliente.credito_limite).toFixed(2)}</span></div>` : ''}
      <hr><div class="center" style="color:#888;font-size:11px">Gracias por su preferencia</div>
      </body></html>
    `)
    w.document.close()
    w.print()
  }

  const completadas    = ventas.filter(v => v.estado === 'completada')
  const totalComprado  = completadas.reduce((s, v) => s + Number(v.total), 0)
  const ticketProm     = completadas.length > 0 ? totalComprado / completadas.length : 0

  if (editando) {
    return (
      <FormCliente
        negocioId={negocioId}
        cliente={cliente}
        onCancelar={() => setEditando(false)}
        onGuardado={() => { setEditando(false); cargar() }}
      />
    )
  }

  if (ventaAbierta) {
    return (
      <DetalleVentaCliente
        venta={ventaAbierta}
        cliente={cliente}
        onVolver={() => setVentaAbierta(null)}
        onReimprimir={() => imprimirVenta(ventaAbierta)}
      />
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <button onClick={onVolver} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>← Volver</button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={imprimirEstadoCuenta} style={{ padding: '8px 16px', background: '#534AB7', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>🖨️ Estado de cuenta</button>
          <button onClick={() => setEditando(true)} style={{ padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>✏️ Editar</button>
          <button onClick={darDeBaja} style={{
            padding: '8px 16px', background: cliente.activo ? '#fef2f2' : '#f0fdf4', color: cliente.activo ? '#e53e3e' : '#1D9E75',
            border: `1px solid ${cliente.activo ? '#fecaca' : '#bbf7d0'}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer'
          }}>
            {cliente.activo ? '✕ Dar de baja' : '✓ Reactivar'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Historial de compras */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Historial de compras</h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#aaa' }}>Doble clic sobre una venta para ver el detalle y reimprimir</p>
            </div>
            {cargando ? (
              <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>Cargando...</p>
            ) : ventas.length === 0 ? (
              <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>Sin compras registradas.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9' }}>
                    <th style={th}>Folio</th>
                    <th style={th}>Fecha</th>
                    <th style={{ ...th, textAlign: 'center' }}>Método</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map(v => (
                    <tr key={v.id}
                      onClick={() => setFilaSeleccionada(v.id === filaSeleccionada ? null : v.id)}
                      onDoubleClick={() => setVentaAbierta(v)}
                      style={{
                        borderTop: '1px solid #f0f0f0', cursor: 'pointer',
                        opacity: v.estado === 'cancelada' ? 0.5 : 1,
                        background: filaSeleccionada === v.id ? '#fff7ed' : 'white',
                        borderLeft: filaSeleccionada === v.id ? '3px solid #f97316' : '3px solid transparent',
                      }}>
                      <td style={{ ...td, fontWeight: '600', color: '#534AB7' }}>{v.folio}</td>
                      <td style={td}>{fmtFecha(v.created_at)}</td>
                      <td style={{ ...td, textAlign: 'center', fontSize: '12px', color: '#888' }}>{v.pagos?.map(p => p.metodo).join(', ') || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(v.total)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: v.estado === 'completada' ? '#f0fdf4' : '#fef2f2', color: v.estado === 'completada' ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                          {v.estado === 'completada' ? 'Completada' : 'Cancelada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9f9f9', borderTop: '2px solid #e0e0e0' }}>
                    <td colSpan={3} style={{ ...td, fontWeight: '700' }}>Total ({completadas.length} compras)</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#f97316' }}>{fmt(totalComprado)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Historial de abonos */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Abonos a cuenta</h3>
              <button onClick={() => setMostrarAbono(true)} style={{ padding: '6px 14px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>+ Registrar abono</button>
            </div>
            {mostrarAbono && (
              <FormAbono
                negocioId={negocioId}
                clienteId={cliente.id}
                onCancelar={() => setMostrarAbono(false)}
                onGuardado={({ abono, saldo }) => { setMostrarAbono(false); cargar(); imprimirAbono(abono, saldo) }}
              />
            )}
            {!cargando && abonos.length === 0 ? (
              <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>Sin abonos registrados.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9' }}>
                    <th style={th}>Fecha</th>
                    <th style={{ ...th, textAlign: 'center' }}>Método</th>
                    <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                    <th style={th}>Referencia</th>
                    <th style={th}>Registrado por</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {abonos.map(a => (
                    <tr key={a.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={td}>{fmtFecha(a.created_at)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: `${METODOS_ABONO[a.metodo]?.color}20`, color: METODOS_ABONO[a.metodo]?.color, fontWeight: '600' }}>
                          {METODOS_ABONO[a.metodo]?.label || a.metodo}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#1D9E75' }}>{fmt(a.monto)}</td>
                      <td style={{ ...td, color: '#888', fontSize: '12px' }}>{a.referencia || '—'}</td>
                      <td style={{ ...td, color: '#888', fontSize: '12px' }}>{a.usuarios?.email?.split('@')[0] || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button onClick={() => imprimirAbono(a)}
                          style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>🖨️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>{cliente.nombre}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <FilaInfo label="RFC" valor={cliente.rfc || '—'} />
              <FilaInfo label="Uso CFDI" valor={cliente.uso_cfdi ? `${cliente.uso_cfdi} — ${USO_CFDI[cliente.uso_cfdi] || ''}` : '—'} />
              <FilaInfo label="Teléfono" valor={cliente.telefono || '—'} />
              <FilaInfo label="Email" valor={cliente.email || '—'} />
              <FilaInfo label="Dirección" valor={cliente.direccion || '—'} />
              <FilaInfo label="Estado" valor={
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: cliente.activo ? '#f0fdf4' : '#fef2f2', color: cliente.activo ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                  {cliente.activo ? 'Activo' : 'Inactivo'}
                </span>
              } />
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Crédito</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <FilaInfo label="Límite" valor={fmt(cliente.credito_limite)} />
              <FilaInfo label="Saldo actual" valor={fmt(cliente.saldo)} bold
                color={Number(cliente.saldo) > Number(cliente.credito_limite) ? '#e53e3e' : Number(cliente.saldo) > 0 ? '#BA7517' : '#1D9E75'} />
              {Number(cliente.credito_limite) > 0 && (
                <FilaInfo label="Disponible" valor={fmt(Math.max(0, Number(cliente.credito_limite) - Number(cliente.saldo)))} color="#534AB7" />
              )}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Resumen de compras</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <FilaInfo label="Compras completadas" valor={completadas.length} />
              <FilaInfo label="Total comprado" valor={fmt(totalComprado)} bold color="#f97316" />
              <FilaInfo label="Ticket promedio" valor={fmt(ticketProm)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetalleVentaCliente({ venta, cliente, onVolver, onReimprimir }) {
  const [items, setItems]       = useState([])
  const [cargando, setCargando] = useState(true)

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

  const totalItems = items.reduce((s, i) => s + Number(i.subtotal), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <button onClick={onVolver} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>← Volver</button>
        <button onClick={onReimprimir} style={{ padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>🖨️ Reimprimir</button>
      </div>

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

        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '15px', color: '#1a1a2e' }}>Información</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <FilaInfo label="Folio" valor={venta.folio} />
            <FilaInfo label="Fecha" valor={fmtFecha(venta.created_at)} />
            <FilaInfo label="Cliente" valor={cliente.nombre} />
            <FilaInfo label="Método de pago" valor={venta.pagos?.map(p => METODOS_VENTA[p.metodo] || p.metodo).join(', ') || '—'} />
            <FilaInfo label="Estado" valor={
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: venta.estado === 'completada' ? '#f0fdf4' : '#fef2f2', color: venta.estado === 'completada' ? '#1D9E75' : '#e53e3e', fontWeight: '600' }}>
                {venta.estado === 'completada' ? 'Completada' : 'Cancelada'}
              </span>
            } />
            {Number(venta.descuento) > 0 && (
              <FilaInfo label="Descuento" valor={`-${fmt(venta.descuento)}`} color="#e53e3e" />
            )}
            {Number(venta.recargo) > 0 && (
              <FilaInfo label="Recargo" valor={`+${fmt(venta.recargo)}`} color="#0C447C" />
            )}
            <FilaInfo label="Total" valor={fmt(venta.total)} bold color="#f97316" />
          </div>
        </div>
      </div>
    </div>
  )
}

function FormAbono({ negocioId, clienteId, onCancelar, onGuardado }) {
  const [monto, setMonto]           = useState('')
  const [metodo, setMetodo]         = useState('efectivo')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas]           = useState('')
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState(null)

  const guardar = async () => {
    const val = parseFloat(monto)
    if (!val || val <= 0) { setError('Ingresa un monto válido.'); return }
    setGuardando(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: nuevoAbono, error: e } = await supabase.from('abonos').insert({
      negocio_id: negocioId, cliente_id: clienteId, usuario_id: user?.id || null,
      monto: val, metodo, referencia: referencia.trim() || null, notas: notas.trim() || null,
    }).select().single()
    if (e) { setGuardando(false); setError(e.message); return }
    const { data: clienteActualizado } = await supabase.from('clientes').select('saldo').eq('id', clienteId).single()
    setGuardando(false)
    onGuardado({ abono: nuevoAbono, saldo: clienteActualizado?.saldo })
  }

  return (
    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0', background: '#fafafa' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <input type="number" placeholder="Monto" value={monto} onChange={e => setMonto(e.target.value)} style={inputStyle} autoFocus />
        <select value={metodo} onChange={e => setMetodo(e.target.value)} style={inputStyle}>
          {Object.entries(METODOS_ABONO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="text" placeholder="Referencia (opcional)" value={referencia} onChange={e => setReferencia(e.target.value)} style={inputStyle} />
      </div>
      <input type="text" placeholder="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} style={{ ...inputStyle, marginBottom: '10px' }} />
      {error && <p style={{ color: '#e53e3e', fontSize: '13px', margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={guardar} disabled={guardando} style={{ padding: '8px 18px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          {guardando ? 'Guardando...' : '💾 Guardar abono'}
        </button>
        <button onClick={onCancelar} style={{ padding: '8px 18px', background: 'white', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
      </div>
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

const th = { padding: '10px 1.25rem', textAlign: 'left', fontSize: '12px', color: '#888', fontWeight: '600' }
const td = { padding: '10px 1.25rem', fontSize: '14px', color: '#333' }
