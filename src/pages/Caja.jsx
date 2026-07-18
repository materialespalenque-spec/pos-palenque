import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const IVA = 0.16
const NEGOCIO_ID  = 'b69b5ee8-b22a-426c-8426-cdf758a12b95'
const SUCURSAL_ID = '8e56bb7a-9041-4741-a468-4ba68a97f163'

const fmt = n => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN'
}).format(n || 0)

const generarFolio = () => {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `TEST-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Date.now().toString().slice(-5)}`
}

export default function Caja() {
  const [busqueda, setBusqueda]               = useState('')
  const [resultados, setResultados]           = useState([])
  const [buscando, setBuscando]               = useState(false)
  const [seleccionado, setSeleccionado]       = useState(-1)
  const [carrito, setCarrito]                 = useState(() => {
    try {
      const g = localStorage.getItem('pos_carrito')
      return g ? JSON.parse(g) : []
    } catch { return [] }
  })
  const [enEspera, setEnEspera]               = useState(() => {
    try {
      const g = localStorage.getItem('pos_en_espera')
      return g ? JSON.parse(g) : []
    } catch { return [] }
  })
  const [mostrarEspera, setMostrarEspera]     = useState(false)
  const [descuentoGlobal, setDescuentoGlobal] = useState(0)
  const [metodoPago, setMetodoPago]           = useState('efectivo')
  const [montoPago, setMontoPago]             = useState('')
  const [contacto, setContacto]               = useState(null)
  const [busqContacto, setBusqContacto]       = useState('')
  const [contactos, setContactos]             = useState([])
  const [procesando, setProcesando]           = useState(false)
  const [ventaExitosa, setVentaExitosa]       = useState(null)
  const [error, setError]                     = useState(null)
  const inputRef  = useRef(null)
  const cantRefs  = useRef({})
  const totalRef  = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Persistir carrito
  useEffect(() => {
    localStorage.setItem('pos_carrito', JSON.stringify(carrito))
  }, [carrito])

  // Buscar productos
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqueda.trim()) { setResultados([]); setSeleccionado(-1); return }
      setBuscando(true)
      const palabras = busqueda.trim().split(/\s+/)
      let query = supabase
        .from('productos')
        .select('id, nombre, clave, codigo_barras, precio_venta, costo, factor, activo')
        .eq('activo', true)
        .limit(8)
      palabras.forEach(p => {
        query = query.or(`nombre.ilike.%${p}%,clave.ilike.%${p}%,codigo_barras.ilike.%${p}%`)
      })
      const { data } = await query
      setResultados(data || [])
      setSeleccionado(-1)
      setBuscando(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [busqueda])

  // Buscar contactos
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

  const agregarProducto = (p) => {
    const precioConIva = Math.round(p.precio_venta * (1 + IVA) * 100) / 100
    setCarrito(prev => {
      const existe = prev.find(i => i.id === p.id)
      if (existe) {
        const nueva = existe.cantidad + 1
        setTimeout(() => {
          if (cantRefs.current[p.id]) cantRefs.current[p.id].value = nueva
          cantRefs.current[p.id]?.focus()
        }, 50)
        return prev.map(i => i.id === p.id ? { ...i, cantidad: nueva } : i)
      }
      setTimeout(() => {
        if (cantRefs.current[p.id]) cantRefs.current[p.id].value = 1
        cantRefs.current[p.id]?.focus()
      }, 50)
      return [...prev, {
        id: p.id, nombre: p.nombre, clave: p.clave, clave_alterna: p.codigo_barras,
        precio: precioConIva, costo: p.costo, factor: p.factor,
        cantidad: 1, descuento: 0,
      }]
    })
    setBusqueda('')
    setResultados([])
    setSeleccionado(-1)
    setMostrarEspera(false)
  }

  const actualizarCantidad = (id, cantidad) => {
    if (cantidad <= 0) { quitarProducto(id); return }
    setCarrito(prev => prev.map(i => i.id === id ? { ...i, cantidad } : i))
  }

  const actualizarDescuento = (id, descuento) => {
    setCarrito(prev => prev.map(i => i.id === id ? { ...i, descuento: Math.min(descuento, 100) } : i))
  }

  const quitarProducto = (id) => {
    setCarrito(prev => prev.filter(i => i.id !== id))
    inputRef.current?.focus()
  }

  const ponerEnEspera = () => {
    if (carrito.length === 0) return
    const nueva = {
      id: Date.now(),
      hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      carrito: [...carrito], contacto, descuentoGlobal,
    }
    const nuevaLista = [...enEspera, nueva]
    setEnEspera(nuevaLista)
    localStorage.setItem('pos_en_espera', JSON.stringify(nuevaLista))
    setCarrito([])
    localStorage.removeItem('pos_carrito')
    setContacto(null); setBusqContacto(''); setDescuentoGlobal(0)
    cantRefs.current = {}
    inputRef.current?.focus()
  }

  const recuperarEspera = (item) => {
    if (carrito.length > 0) ponerEnEspera()
    setCarrito(item.carrito)
    setContacto(item.contacto)
    setDescuentoGlobal(item.descuentoGlobal || 0)
    const nuevaLista = enEspera.filter(e => e.id !== item.id)
    setEnEspera(nuevaLista)
    localStorage.setItem('pos_en_espera', JSON.stringify(nuevaLista))
    setMostrarEspera(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const eliminarEspera = (id) => {
    const nuevaLista = enEspera.filter(e => e.id !== id)
    setEnEspera(nuevaLista)
    localStorage.setItem('pos_en_espera', JSON.stringify(nuevaLista))
  }

  const handleKeyDown = (e) => {
    if (resultados.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSeleccionado(prev => Math.min(prev + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSeleccionado(prev => Math.max(prev - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (seleccionado >= 0) agregarProducto(resultados[seleccionado])
      else if (resultados.length === 1) agregarProducto(resultados[0])
    } else if (e.key === 'Escape') {
      setBusqueda(''); setResultados([]); setSeleccionado(-1)
    }
  }

  // Cálculos
  const subtotalConIva = Math.round(carrito.reduce((s, i) => s + i.precio * i.cantidad * (1 - i.descuento / 100), 0) * 100) / 100
  const descGlobal     = Math.round(subtotalConIva * (descuentoGlobal / 100) * 100) / 100
  const baseTotal      = subtotalConIva - descGlobal
  const subtotalSinIva = baseTotal / (1 + IVA)
  const ivaTotal       = baseTotal - subtotalSinIva
  const total          = Math.round(baseTotal * 100) / 100
  const cambio         = Math.max(0, Number(montoPago) - total)

  // Sincronizar input total con estado
  useEffect(() => {
    if (totalRef.current) totalRef.current.value = total.toFixed(2)
  }, [total])

  const procesarVenta = async () => {
    if (carrito.length === 0) return
    setProcesando(true)
    setError(null)
    try {
      const folio = generarFolio()
      const { data: venta, error: eVenta } = await supabase
        .from('ventas')
        .insert({
          negocio_id:        NEGOCIO_ID,
          sucursal_id:       SUCURSAL_ID,
          folio,
          subtotal:          Math.round(subtotalSinIva * 100) / 100,
          descuento:         Math.round(descGlobal / (1 + IVA) * 100) / 100,
          iva:               Math.round(ivaTotal * 100) / 100,
          total:             Math.round(total * 100) / 100,
          estado:            'completada',
          contacto_id:       contacto?.id || null,
          direccion_entrega: contacto?.direccion || null,
        })
        .select().single()
      if (eVenta) throw new Error(eVenta.message)

      const items = carrito.map(i => {
        const precioSinIva = i.precio / (1 + IVA)
        const descUnit     = precioSinIva * (i.descuento / 100)
        return {
          venta_id:        venta.id,
          producto_id:     i.id,
          nombre_producto: i.nombre,
          cantidad:        i.cantidad,
          precio_unitario: Math.round(precioSinIva * 100) / 100,
          costo_unitario:  Math.round((i.costo / (i.factor || 1)) * 100) / 100,
          descuento:       Math.round(descUnit * i.cantidad * 100) / 100,
          tasa_iva:        IVA,
          subtotal:        Math.round((precioSinIva - descUnit) * i.cantidad * 100) / 100,
        }
      })
      const { error: eItems } = await supabase.from('venta_items').insert(items)
      if (eItems) throw new Error(eItems.message)

      const { error: ePago } = await supabase.from('pagos').insert({
        venta_id: venta.id, metodo: metodoPago, monto: Math.round(total * 100) / 100,
      })
      if (ePago) throw new Error(ePago.message)

      setVentaExitosa({ folio, total, cambio, contacto, items: [...carrito] })
      setCarrito([]); localStorage.removeItem('pos_carrito')
      setDescuentoGlobal(0); setMontoPago('')
      setContacto(null); setBusqContacto(''); setMetodoPago('efectivo')
      cantRefs.current = {}
    } catch (err) {
      setError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const nuevaVenta = () => {
    setVentaExitosa(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  if (ventaExitosa) {
    return <TicketVenta venta={ventaExitosa} onNueva={nuevaVenta} />
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1rem', height: 'calc(100vh - 120px)' }}>

      {/* Panel izquierdo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>

        {/* Búsqueda */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem', position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="🔍 Buscar producto — ↑↓ navegar · Enter seleccionar · Esc cerrar"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setSeleccionado(-1); setMostrarEspera(false) }}
            onKeyDown={handleKeyDown}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
          />

          {/* Botones espera */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={ponerEnEspera} disabled={carrito.length === 0} style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
              background: carrito.length > 0 ? '#534AB7' : '#e0e0e0',
              color: carrito.length > 0 ? 'white' : '#aaa',
              border: 'none', cursor: carrito.length > 0 ? 'pointer' : 'not-allowed'
            }}>⏸ Poner en espera</button>
            {enEspera.length > 0 && (
              <button onClick={() => setMostrarEspera(!mostrarEspera)} style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
                background: mostrarEspera ? '#1a1a2e' : '#1D9E75',
                color: 'white', border: 'none', cursor: 'pointer'
              }}>📋 En espera ({enEspera.length})</button>
            )}
          </div>

          {/* Panel ventas en espera */}
          {mostrarEspera && enEspera.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', padding: '12px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888', fontWeight: '600' }}>VENTAS EN ESPERA — clic para recuperar</p>
              {enEspera.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '8px' }}
                  onMouseEnter={el => el.currentTarget.style.background = '#f9f9f9'}
                  onMouseLeave={el => el.currentTarget.style.background = 'white'}
                >
                  <div onClick={() => recuperarEspera(e)} style={{ flex: 1, cursor: 'pointer' }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>🕐 {e.hora} — {e.carrito.length} producto{e.carrito.length > 1 ? 's' : ''}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#888' }}>{e.carrito.slice(0, 2).map(i => i.nombre).join(', ')}{e.carrito.length > 2 ? '...' : ''}</p>
                    {e.contacto && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#534AB7' }}>📍 {e.contacto.nombre}</p>}
                    <p style={{ margin: '2px 0 0', fontSize: '12px', fontWeight: '700', color: '#f97316' }}>
                      {fmt(Math.round(e.carrito.reduce((s, i) => s + i.precio * i.cantidad * (1 - i.descuento / 100), 0) * 100) / 100)}
                    </p>
                  </div>
                  <button onClick={() => eliminarEspera(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: '18px', marginLeft: '8px' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Resultados búsqueda */}
          {(resultados.length > 0 || buscando) && (
            <div style={{ position: 'absolute', top: '100%', left: '1rem', right: '1rem', background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 100, marginTop: '4px' }}>
              {buscando && <p style={{ padding: '1rem', color: '#888', margin: 0 }}>Buscando...</p>}
              {resultados.map((p, idx) => (
                <div key={p.id}
                  onClick={() => agregarProducto(p)}
                  onMouseEnter={() => setSeleccionado(idx)}
                  onMouseLeave={() => setSeleccionado(-1)}
                  style={{
                    padding: '10px 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: idx === seleccionado ? '#fff7ed' : 'white',
                    borderLeft: idx === seleccionado ? '3px solid #f97316' : '3px solid transparent',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{p.nombre}</p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>{p.clave}{p.codigo_barras ? ` · ${p.codigo_barras}` : ''}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#f97316' }}>{fmt(Math.round(p.precio_venta * (1 + IVA) * 100) / 100)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Carrito */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Carrito ({carrito.length} productos)</h3>
            {carrito.length > 0 && (
              <button onClick={() => { setCarrito([]); localStorage.removeItem('pos_carrito'); cantRefs.current = {}; inputRef.current?.focus() }}
                style={{ fontSize: '12px', color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer' }}>
                Limpiar todo
              </button>
            )}
          </div>
          {carrito.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#ccc', fontSize: '14px' }}>Busca un producto para agregar al carrito</p>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f9f9f9' }}>
                  <tr>
                    <th style={th}>Producto</th>
                    <th style={{ ...th, textAlign: 'center', width: '140px' }}>Cant.</th>
                    <th style={{ ...th, textAlign: 'center', width: '80px' }}>Desc%</th>
                    <th style={{ ...th, textAlign: 'right', width: '110px' }}>Subtotal</th>
                    <th style={{ ...th, width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {carrito.map(item => {
                    const subtotal = Math.round(item.precio * item.cantidad * (1 - item.descuento / 100) * 100) / 100
                    return (
                      <tr key={item.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={td}>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{item.nombre}</p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>
                            {item.clave && <span style={{ color: '#534AB7', fontWeight: '600' }}>{item.clave}</span>}
                            {item.clave_alterna && item.clave_alterna !== item.clave && <span style={{ color: '#1D9E75', fontWeight: '600' }}> · {item.clave_alterna}</span>}
                            <span> · {fmt(item.precio)} c/u</span>
                          </p>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => {
                              const nueva = Math.max(0.001, parseFloat((item.cantidad - 1).toFixed(3)))
                              actualizarCantidad(item.id, nueva)
                              if (cantRefs.current[item.id]) cantRefs.current[item.id].value = nueva
                            }} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>−</button>
                            <input
                              ref={el => cantRefs.current[item.id] = el}
                              type="text"
                              defaultValue={item.cantidad}
                              onBlur={e => {
                                const val = parseFloat(e.target.value.replace(',', '.'))
                                if (!isNaN(val) && val > 0) actualizarCantidad(item.id, val)
                                else e.target.value = item.cantidad
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const val = parseFloat(e.target.value.replace(',', '.'))
                                  if (!isNaN(val) && val > 0) actualizarCantidad(item.id, val)
                                  inputRef.current?.focus()
                                }
                              }}
                              onFocus={e => e.target.select()}
                              style={{ width: '55px', padding: '4px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px' }}
                            />
                            <button onClick={() => {
                              const nueva = parseFloat((item.cantidad + 1).toFixed(3))
                              actualizarCantidad(item.id, nueva)
                              if (cantRefs.current[item.id]) cantRefs.current[item.id].value = nueva
                            }} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>+</button>
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input type="number" min="0" max="100" step="1" value={item.descuento}
                            onChange={e => actualizarDescuento(item.id, parseFloat(e.target.value) || 0)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.focus() } }}
                            onFocus={e => e.target.select()}
                            style={{ width: '60px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px' }}
                          />
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <input
                            type="text"
                            defaultValue={subtotal.toFixed(2)}
                            onBlur={e => {
                              const val = parseFloat(e.target.value.replace(/[$,]/g, ''))
                              if (!isNaN(val) && val > 0) {
                                const nuevaCantidad = val / item.precio
                                actualizarCantidad(item.id, nuevaCantidad)
                                if (cantRefs.current[item.id]) cantRefs.current[item.id].value = nuevaCantidad.toFixed(3)
                                e.target.value = val.toFixed(2)
                              } else {
                                e.target.value = subtotal.toFixed(2)
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); inputRef.current?.focus() }
                            }}
                            onFocus={e => e.target.select()}
                            style={{ width: '90px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #f97316', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#f97316' }}
                          />
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <button onClick={() => quitarProducto(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: '16px' }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>

        {/* Contacto entrega */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888', fontWeight: '600' }}>ENTREGA (OPCIONAL)</p>
          {contacto ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{contacto.nombre}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>{contacto.colonia} — {contacto.telefono}</p>
              </div>
              <button onClick={() => { setContacto(null); setBusqContacto('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: '18px' }}>✕</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Buscar contacto..." value={busqContacto}
                onChange={e => setBusqContacto(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }}
              />
              {contactos.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '4px' }}>
                  {contactos.map(c => (
                    <div key={c.id} onClick={() => { setContacto(c); setContactos([]); setBusqContacto('') }}
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
            </div>
          )}
        </div>

        {/* Totales */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888', fontWeight: '600' }}>RESUMEN</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: '#888' }}>Subtotal</span>
              <span>{fmt(subtotalConIva)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span style={{ color: '#888' }}>Descuento global %</span>
              <input type="number" min="0" max="100" step="0.01" value={descuentoGlobal}
                onChange={e => setDescuentoGlobal(parseFloat(e.target.value) || 0)}
                onFocus={e => e.target.select()}
                style={{ width: '70px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px' }}
              />
            </div>
            {descuentoGlobal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#e53e3e' }}>
                <span>Descuento</span>
                <span>-{fmt(descGlobal)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#888' }}>
              <span>IVA (16%)</span>
              <span>{fmt(Math.round(ivaTotal * 100) / 100)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '20px', fontWeight: '700', borderTop: '2px solid #e0e0e0', paddingTop: '8px', marginTop: '4px' }}>
              <span>Total</span>
              <input
                ref={totalRef}
                type="text"
                defaultValue={total.toFixed(2)}
                onBlur={e => {
                  const val = parseFloat(e.target.value.replace(/[$,]/g, ''))
                  if (!isNaN(val) && val > 0 && subtotalConIva > 0) {
                    const nuevoDesc = Math.max(0, Math.min(100, (1 - val / subtotalConIva) * 100))
                    setDescuentoGlobal(Math.round(nuevoDesc * 10000) / 10000)
                    e.target.value = val.toFixed(2)
                  } else {
                    e.target.value = total.toFixed(2)
                  }
                }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                onFocus={e => e.target.select()}
                style={{
                  width: '130px', padding: '4px 8px', borderRadius: '6px',
                  border: '2px solid #f97316', textAlign: 'right',
                  fontSize: '20px', fontWeight: '700', color: '#f97316', outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Método de pago */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888', fontWeight: '600' }}>MÉTODO DE PAGO</p>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {[
              { id: 'efectivo',      label: '💵 Efectivo' },
              { id: 'tarjeta',       label: '💳 Tarjeta' },
              { id: 'transferencia', label: '🏦 Transf.' },
              { id: 'credito',       label: '📋 Crédito' },
            ].map(m => (
              <button key={m.id} onClick={() => setMetodoPago(m.id)} style={{
                flex: 1, padding: '8px 6px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                background: metodoPago === m.id ? '#1a1a2e' : 'white',
                color: metodoPago === m.id ? 'white' : '#555',
                border: '1px solid #ddd', cursor: 'pointer'
              }}>{m.label}</button>
            ))}
          </div>
          {metodoPago === 'efectivo' && (
            <div>
              <input type="number" placeholder="Monto recibido" value={montoPago}
                onChange={e => setMontoPago(e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === 'Enter') procesarVenta() }}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', textAlign: 'right', boxSizing: 'border-box', marginBottom: '8px' }}
              />
              {cambio > 0 && (
                <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#1D9E75', fontWeight: '600' }}>Cambio</span>
                  <span style={{ fontSize: '18px', color: '#1D9E75', fontWeight: '700' }}>{fmt(cambio)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p style={{ color: '#e53e3e', fontSize: '13px', margin: 0, padding: '8px 12px', background: '#fef2f2', borderRadius: '8px' }}>
            {error}
          </p>
        )}

        <button onClick={procesarVenta} disabled={carrito.length === 0 || procesando} style={{
          padding: '16px', borderRadius: '10px', fontSize: '18px', fontWeight: '700',
          background: carrito.length > 0 && !procesando ? '#f97316' : '#e0e0e0',
          color: carrito.length > 0 && !procesando ? 'white' : '#aaa',
          border: 'none', cursor: carrito.length > 0 && !procesando ? 'pointer' : 'not-allowed',
        }}>
          {procesando ? '⏳ Procesando...' : `💰 Cobrar ${fmt(total)}`}
        </button>
      </div>
    </div>
  )
}

function TicketVenta({ venta, onNueva }) {
  useEffect(() => { window.print() }, [])

  return (
    <div>
      <div className="no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '10px' }}>
        <button onClick={onNueva} style={{ padding: '10px 20px', background: '#f97316', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          ➕ Nueva venta
        </button>
        <button onClick={() => window.print()} style={{ padding: '10px 20px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
          🖨️ Reimprimir
        </button>
      </div>

      <div id="ticket" style={{ maxWidth: '320px', fontFamily: 'monospace', fontSize: '12px', background: 'white', padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <p style={{ margin: 0, fontWeight: '700', fontSize: '14px' }}>MATERIALES PALENQUE</p>
          <p style={{ margin: 0, color: '#888' }}>Palenque, Chiapas</p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888' }}>{new Date().toLocaleString('es-MX')}</p>
        </div>
        <div style={{ borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '6px 0', margin: '8px 0' }}>
          <p style={{ margin: 0 }}>Folio: <strong>{venta.folio}</strong></p>
          {venta.contacto && <p style={{ margin: '4px 0 0' }}>Entrega: <strong>{venta.contacto.nombre}</strong></p>}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Producto</th>
              <th style={{ textAlign: 'right' }}>Cant</th>
              <th style={{ textAlign: 'right' }}>Precio</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {venta.items.map((item, i) => (
              <tr key={i} style={{ borderTop: '1px dotted #eee' }}>
                <td style={{ paddingTop: '4px', paddingRight: '4px' }}>{item.nombre}</td>
                <td style={{ textAlign: 'right', paddingTop: '4px' }}>{item.cantidad}</td>
                <td style={{ textAlign: 'right', paddingTop: '4px' }}>{new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(item.precio)}</td>
                <td style={{ textAlign: 'right', paddingTop: '4px' }}>{new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Math.round(item.precio * item.cantidad * (1 - item.descuento / 100) * 100) / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ borderTop: '1px dashed #ccc', marginTop: '8px', paddingTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '14px' }}>
            <span>TOTAL</span>
            <span>{fmt(venta.total)}</span>
          </div>
          {venta.cambio > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span>Cambio</span>
              <span>{fmt(venta.cambio)}</span>
            </div>
          )}
        </div>
        <p style={{ textAlign: 'center', marginTop: '12px', color: '#888', fontSize: '11px' }}>¡Gracias por su compra!</p>
      </div>
    </div>
  )
}

const th = { padding: '8px 1rem', textAlign: 'left', fontSize: '12px', color: '#888', fontWeight: '600' }
const td = { padding: '8px 1rem', fontSize: '13px', color: '#333' }
