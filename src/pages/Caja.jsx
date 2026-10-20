import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { imprimirTicket } from '../lib/ticket'
import { getSucursalId } from '../lib/config'
import { buscarCotizaciones, cargarCotizacion, cotizacionACarrito, marcarConvertida, estadoVisible } from '../lib/cotizaciones'

const NEGOCIO_ID  = 'b69b5ee8-b22a-426c-8426-cdf758a12b95'

const fmt = n => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN'
}).format(n || 0)

const METODOS_TICKET = {
  efectivo:      '💵 Efectivo',
  tarjeta:       '💳 Tarjeta',
  transferencia: '🏦 Transferencia',
  credito:       '📋 Crédito',
}

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
  const [totalEditable, setTotalEditable]     = useState(false)
  const [metodoPago, setMetodoPago]           = useState(() => localStorage.getItem('pos_metodo_pago') || 'efectivo')
  const [pagoDividido, setPagoDividido]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_pago_dividido') || 'false') } catch { return false }
  })
  const [pagosSplit, setPagosSplit]           = useState(() => {
    try {
      const g = localStorage.getItem('pos_pagos_split')
      return g ? JSON.parse(g) : [{ id: 1, metodo: 'efectivo', monto: '' }]
    } catch { return [{ id: 1, metodo: 'efectivo', monto: '' }] }
  })
  const [montoPago, setMontoPago]             = useState('')
  const [contacto, setContacto]               = useState(() => {
    try {
      const g = localStorage.getItem('pos_contacto')
      return g ? JSON.parse(g) : null
    } catch { return null }
  })
  const [busqContacto, setBusqContacto]       = useState('')
  const [contactos, setContactos]             = useState([])
  const [creandoContacto, setCreandoContacto] = useState(false)
  const [nuevoContacto, setNuevoContacto]     = useState({ nombre: '', telefono: '', colonia: '', direccion: '' })
  const [guardandoContacto, setGuardandoContacto] = useState(false)
  const [mostrarProdNuevo, setMostrarProdNuevo] = useState(false)
  const [prodNuevo, setProdNuevo]             = useState({ nombre: '', precio: '', costo: '', existencia: '', peso: '' })
  const [prodNuevoError, setProdNuevoError]   = useState('')
  const [guardandoProd, setGuardandoProd]     = useState(false)
  const [mostrarFlete, setMostrarFlete]       = useState(false)
  const [nuevoFlete, setNuevoFlete]           = useState({ descripcion: 'Flete foráneo', monto: '' })
  const [filaCarrito, setFilaCarrito]         = useState(null)
  const [cotizacionRef, setCotizacionRef]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_cotizacion') || 'null') } catch { return null }
  })
  const [mostrarCotiz, setMostrarCotiz]       = useState(false)
  const [qCotiz, setQCotiz]                   = useState('')
  const [cotizLista, setCotizLista]           = useState([])
  const [cargandoCotiz, setCargandoCotiz]     = useState(false)
  const [cliente, setCliente]                = useState(() => {
    try {
      const g = localStorage.getItem('pos_cliente')
      return g ? JSON.parse(g) : null
    } catch { return null }
  })
  const [busqCliente, setBusqCliente]         = useState('')
  const [clientesResultados, setClientesResultados] = useState([])
  const [procesando, setProcesando]           = useState(false)
  const [ventaExitosa, setVentaExitosa]       = useState(null)
  const [error, setError]                     = useState(null)
  const inputRef  = useRef(null)
  const cantRefs  = useRef({})
  const totalRef  = useRef(null)
  const [userId, setUserId] = useState(null)

useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    if (data?.user) setUserId(data.user.id)
  })
}, [])

  useEffect(() => { inputRef.current?.focus() }, [])

  // Persistir carrito
  useEffect(() => {
    localStorage.setItem('pos_carrito', JSON.stringify(carrito))
  }, [carrito])

  // Cotización de origen (si el carrito viene de una cotización)
  useEffect(() => {
    if (cotizacionRef) localStorage.setItem('pos_cotizacion', JSON.stringify(cotizacionRef))
    else localStorage.removeItem('pos_cotizacion')
  }, [cotizacionRef])

  // Lista del selector de cotizaciones
  useEffect(() => {
    if (!mostrarCotiz) return
    const timer = setTimeout(async () => {
      setCargandoCotiz(true)
      try { setCotizLista(await buscarCotizaciones({ q: qCotiz, estado: 'vigentes', limite: 12 })) } catch { setCotizLista([]) }
      setCargandoCotiz(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [mostrarCotiz, qCotiz])

  const abrirCotizacion = async (c) => {
    try {
      const { cot, items } = await cargarCotizacion(c.id)
      if (estadoVisible(cot) !== 'vigente') { setError('Esa cotización ya no está vigente.'); return }
      const { carrito: nuevo, avisos } = await cotizacionACarrito(cot, items)
      if (carrito.length > 0) ponerEnEspera()
      setCarrito(nuevo)
      setContacto(cot.contacto || null)
      setCliente(cot.cliente || null)
      setDescuentoGlobal(0)
      setCotizacionRef({ id: cot.id, folio: cot.folio, avisos })
      setMostrarCotiz(false); setQCotiz('')
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (e) { setError(e.message) }
  }

  // Persistir contacto de entrega y cliente de facturación/crédito
  useEffect(() => {
    if (contacto) localStorage.setItem('pos_contacto', JSON.stringify(contacto))
    else localStorage.removeItem('pos_contacto')
  }, [contacto])

  useEffect(() => {
    if (cliente) localStorage.setItem('pos_cliente', JSON.stringify(cliente))
    else localStorage.removeItem('pos_cliente')
  }, [cliente])

  // Persistir método de pago y renglones de pago dividido
  useEffect(() => {
    localStorage.setItem('pos_metodo_pago', metodoPago)
  }, [metodoPago])

  useEffect(() => {
    localStorage.setItem('pos_pago_dividido', JSON.stringify(pagoDividido))
    localStorage.setItem('pos_pagos_split', JSON.stringify(pagosSplit))
  }, [pagoDividido, pagosSplit])

  // Sincronizar input total
  useEffect(() => {
    if (totalRef.current) totalRef.current.value = total.toFixed(2)
  }, [carrito, descuentoGlobal])

  // Buscar productos
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqueda.trim()) { setResultados([]); setSeleccionado(-1); return }
      setBuscando(true)
      const palabras = busqueda.trim().split(/\s+/)
      let query = supabase
        .from('productos')
        .select('id, nombre, clave, codigo_barras, precio_venta, costo, factor, peso_kg, precio_2, mayoreo_2, precio_3, mayoreo_3, activo, ventas_recientes, inventario(existencia, sucursal_id)')
        .eq('activo', true)
        .order('ventas_recientes', { ascending: false })
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

  // Buscar clientes (facturación / crédito)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqCliente.trim()) { setClientesResultados([]); return }
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, rfc, telefono, credito_limite, saldo, saldo_a_favor')
        .eq('activo', true)
        .ilike('nombre', `%${busqCliente}%`)
        .limit(5)
      setClientesResultados(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [busqCliente])

  const agregarProducto = (p) => {
    // Precio neto = precio_venta * 1.16, redondeado
    const precio = Math.round(p.precio_venta * 1.16 * 100) / 100
    const existencia = p.inventario?.find(i => i.sucursal_id === getSucursalId())?.existencia ?? 0
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
        precio, costo: p.costo, factor: p.factor, peso: parseFloat(p.peso_kg) || 0, existencia,
        alt: [[p.precio_2, p.mayoreo_2, 'P2'], [p.precio_3, p.mayoreo_3, 'P3']]
          .filter(([pr]) => parseFloat(pr) > 0)
          .map(([pr, my, et]) => ({ et, precio: Math.round(parseFloat(pr) * 1.16 * 100) / 100, min: parseFloat(my) || 0 })),
        cantidad: 1, descuento: 0,
      }]
    })
    setBusqueda(''); setResultados([]); setSeleccionado(-1); setMostrarEspera(false)
  }

  const actualizarCantidad = (id, cantidad) => {
    if (cantidad <= 0) { quitarProducto(id); return }
    setCarrito(prev => prev.map(i => i.id === id ? { ...i, cantidad } : i))
  }

  const actualizarDescuento = (id, descuento) => {
    setCarrito(prev => prev.map(i => i.id === id ? { ...i, descuento: Math.min(descuento, 100) } : i))
  }

  const abrirCrearContacto = () => {
    setNuevoContacto({ nombre: busqContacto, telefono: '', colonia: '', direccion: '' })
    setCreandoContacto(true)
  }

  const crearContactoRapido = async () => {
    if (!nuevoContacto.nombre.trim()) return
    setGuardandoContacto(true)
    const { data, error } = await supabase
      .from('contactos')
      .insert({
        negocio_id: NEGOCIO_ID,
        nombre:     nuevoContacto.nombre.trim(),
        telefono:   nuevoContacto.telefono.trim() || null,
        colonia:    nuevoContacto.colonia.trim() || null,
        direccion:  nuevoContacto.direccion.trim() || null,
      })
      .select().single()
    setGuardandoContacto(false)
    if (!error && data) {
      setContacto(data)
      setCreandoContacto(false)
      setNuevoContacto({ nombre: '', telefono: '', colonia: '', direccion: '' })
      setBusqContacto('')
      setContactos([])
    }
  }

  const agregarFlete = () => {
    const monto = parseFloat(nuevoFlete.monto)
    if (!monto || monto <= 0) return
    const descripcion = nuevoFlete.descripcion.trim() || 'Flete foráneo'
    setCarrito(prev => [...prev, {
      id: `flete-${Date.now()}`, nombre: descripcion, clave: null, clave_alterna: null,
      precio: monto, costo: 0, factor: 1, existencia: null,
      cantidad: 1, descuento: 0, esServicio: true,
    }])
    setNuevoFlete({ descripcion: 'Flete foráneo', monto: '' })
    setMostrarFlete(false)
    inputRef.current?.focus()
  }

  const abrirProductoNuevo = () => {
    setProdNuevo({ nombre: busqueda.trim(), precio: '', costo: '', existencia: '', peso: '' })
    setProdNuevoError('')
    setMostrarProdNuevo(true)
    setBusqueda(''); setResultados([]); setSeleccionado(-1)
  }

  const cerrarProductoNuevo = () => {
    setMostrarProdNuevo(false)
    setProdNuevoError('')
    inputRef.current?.focus()
  }

  const guardarProductoNuevo = async () => {
    const precio = parseFloat(prodNuevo.precio)
    if (!prodNuevo.nombre.trim() || !(precio > 0) || guardandoProd) return
    setGuardandoProd(true)
    setProdNuevoError('')
    const existencia = parseFloat(prodNuevo.existencia) || 0
    const { data, error } = await supabase.rpc('crear_producto_nuevo', {
      p_nombre: prodNuevo.nombre.trim(),
      p_precio_venta_iva: precio,
      p_costo_iva: parseFloat(prodNuevo.costo) || 0,
      p_existencia: existencia,
      p_peso_kg: parseFloat(prodNuevo.peso) || 0,
    })
    setGuardandoProd(false)
    const p = Array.isArray(data) ? data[0] : data
    if (error || !p) {
      setProdNuevoError(error?.message || 'No se pudo crear el producto')
      return
    }
    agregarProducto({ ...p, inventario: [{ sucursal_id: getSucursalId(), existencia }] })
    setMostrarProdNuevo(false)
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
      carrito: [...carrito], contacto, cliente, descuentoGlobal, cotizacionRef,
    }
    const nuevaLista = [...enEspera, nueva]
    setEnEspera(nuevaLista)
    localStorage.setItem('pos_en_espera', JSON.stringify(nuevaLista))
    setCarrito([]); localStorage.removeItem('pos_carrito')
    setContacto(null); setBusqContacto(''); setCliente(null); setBusqCliente(''); setDescuentoGlobal(0)
    setCotizacionRef(null)
    setCreandoContacto(false)
    setMostrarFlete(false)
    setFilaCarrito(null)
    cantRefs.current = {}
    inputRef.current?.focus()
  }

  const recuperarEspera = (item) => {
    if (carrito.length > 0) ponerEnEspera()
    setCarrito(item.carrito)
    setContacto(item.contacto)
    setCliente(item.cliente || null)
    setDescuentoGlobal(item.descuentoGlobal || 0)
    setCotizacionRef(item.cotizacionRef || null)
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

  // Escape global: cierra búsquedas y paneles abiertos, sin tocar selecciones ya hechas
  // Flechas: cuando no se está escribiendo en un campo, mueven la marca entre productos del carrito
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setBusqueda(''); setResultados([]); setSeleccionado(-1)
        setMostrarEspera(false)
        setMostrarFlete(false); setNuevoFlete({ descripcion: 'Flete foráneo', monto: '' })
        setBusqContacto(''); setContactos([])
        setCreandoContacto(false); setNuevoContacto({ nombre: '', telefono: '', colonia: '', direccion: '' })
        setBusqCliente(''); setClientesResultados([])
        setError(null)
        setFilaCarrito(null)
        inputRef.current?.focus()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (carrito.length === 0) return
        e.preventDefault()
        setFilaCarrito(prev => {
          const idx = prev == null ? -1 : carrito.findIndex(i => i.id === prev)
          const siguiente = e.key === 'ArrowDown'
            ? Math.min(idx + 1, carrito.length - 1)
            : Math.max(idx - 1, 0)
          return carrito[siguiente]?.id ?? null
        })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [carrito])

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

  // Cálculos — sin IVA desglosado
  const subtotalBruto = Math.round(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100
  const descItems     = Math.round(carrito.reduce((s, i) => s + i.precio * i.cantidad * (i.descuento / 100), 0) * 100) / 100
  const descuentoTotal = Math.round(carrito.reduce((s, i) => s + (i.descuento > 0 ? i.precio * i.cantidad * (i.descuento / 100) : 0), 0) * 100) / 100
  const recargoTotal   = Math.round(carrito.reduce((s, i) => s + (i.descuento < 0 ? i.precio * i.cantidad * (-i.descuento / 100) : 0), 0) * 100) / 100
  const subtotal      = Math.round((subtotalBruto - descItems) * 100) / 100
  const total         = subtotal
  const pesoTotal     = carrito.reduce((s, i) => s + (i.esServicio ? 0 : (i.peso || 0) * i.cantidad), 0)
  const cambio        = Math.max(0, Number(montoPago) - total)
  const cubiertoSplit = Math.round(pagosSplit.reduce((s, p) => s + (Number(p.monto) || 0), 0) * 100) / 100
  const faltaCubrir   = Math.round((total - cubiertoSplit) * 100) / 100
  const splitUsaCredito = pagoDividido && pagosSplit.some(p => p.metodo === 'credito' && Number(p.monto) > 0)
  const excedeCredito = (pagoDividido ? splitUsaCredito : metodoPago === 'credito') && cliente && Number(cliente.credito_limite) > 0
    && (Number(cliente.saldo) + total) > Number(cliente.credito_limite)

  const usaSaldoAFavor = pagoDividido
    ? pagosSplit.some(p => p.metodo === 'saldo_a_favor' && Number(p.monto) > 0)
    : metodoPago === 'saldo_a_favor'
  const montoSaldoAFavorUsado = pagoDividido
    ? pagosSplit.filter(p => p.metodo === 'saldo_a_favor').reduce((s, p) => s + (Number(p.monto) || 0), 0)
    : (metodoPago === 'saldo_a_favor' ? total : 0)
  const excedeSaldoAFavor = usaSaldoAFavor && cliente && montoSaldoAFavorUsado > Number(cliente.saldo_a_favor || 0)

  const procesarVenta = async () => {
    if (carrito.length === 0) return
    if (pagoDividido) {
      if (Math.abs(faltaCubrir) > 0.009) {
        setError(faltaCubrir > 0 ? `Faltan ${fmt(faltaCubrir)} por cubrir.` : `Los montos suman ${fmt(Math.abs(faltaCubrir))} de más.`)
        return
      }
      if (splitUsaCredito && !cliente) {
        setError('Selecciona un cliente para poder usar crédito en el pago dividido.')
        return
      }
    } else if (metodoPago === 'credito' && !cliente) {
      setError('Selecciona un cliente para ventas a crédito.')
      return
    }
    if (usaSaldoAFavor && !cliente) {
      setError('Selecciona un cliente para poder usar su saldo a favor.')
      return
    }
    if (excedeSaldoAFavor) {
      setError(`El cliente solo tiene ${fmt(cliente.saldo_a_favor)} de saldo a favor disponible.`)
      return
    }
    setProcesando(true)
    setError(null)
    try {
      const folio = generarFolio()
      const { data: venta, error: eVenta } = await supabase
        .from('ventas')
        .insert({
          negocio_id:        NEGOCIO_ID,
          sucursal_id:       getSucursalId(),
          usuario_id:        userId,
          folio,
          subtotal:          Math.round(subtotalBruto * 100) / 100,
          descuento:         Math.round(descuentoTotal * 100) / 100,
          recargo:           Math.round(recargoTotal * 100) / 100,
          iva:               0,
          total:             Math.round(total * 100) / 100,
          estado:            'completada',
          contacto_id:       contacto?.id || null,
          cliente_id:        cliente?.id || null,
          direccion_entrega: contacto?.direccion || null,
        })
        .select().single()
      if (eVenta) throw new Error(eVenta.message)

      const items = carrito.map(i => {
        const descUnit = i.precio * (i.descuento / 100)
        return {
          venta_id:        venta.id,
          producto_id:     i.esServicio ? null : i.id,
          nombre_producto: i.nombre,
          cantidad:        i.cantidad,
          precio_unitario: i.precio,
          costo_unitario:  Math.round((i.costo / (i.factor || 1)) * 100) / 100,
          peso_unitario:   i.esServicio ? 0 : (i.peso || 0),
          descuento:       Math.round(descUnit * i.cantidad * 100) / 100,
          tasa_iva:        0,
          subtotal:        Math.round((i.precio - descUnit) * i.cantidad * 100) / 100,
        }
      })
      const { error: eItems } = await supabase.from('venta_items').insert(items)
      if (eItems) throw new Error(eItems.message)

      const pagosAGuardar = pagoDividido
        ? pagosSplit.filter(p => Number(p.monto) > 0).map(p => ({ venta_id: venta.id, metodo: p.metodo, monto: Math.round(Number(p.monto) * 100) / 100 }))
        : [{ venta_id: venta.id, metodo: metodoPago, monto: Math.round(total * 100) / 100 }]
      const { error: ePago } = await supabase.from('pagos').insert(pagosAGuardar)
      if (ePago) throw new Error(ePago.message)

      if (cotizacionRef?.id) {
        // Si falla no se cancela la venta ya cobrada; la cotización simplemente queda vigente
        try { await marcarConvertida(cotizacionRef.id, venta.id) } catch { /* ignorar */ }
        setCotizacionRef(null)
      }
      setVentaExitosa({ folio, total, cambio, contacto, cliente, pagos: pagosAGuardar, items: [...carrito], descItems, descuentoTotal, recargoTotal })
      setCarrito([]); localStorage.removeItem('pos_carrito')
      setDescuentoGlobal(0); setMontoPago('')
      setContacto(null); setBusqContacto(''); setCliente(null); setBusqCliente(''); setMetodoPago('efectivo')
      setPagoDividido(false); setPagosSplit([{ id: 1, metodo: 'efectivo', monto: '' }])
      setCreandoContacto(false)
      setMostrarFlete(false)
      setFilaCarrito(null)
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

        {/* Banner: el carrito viene de una cotización */}
        {cotizacionRef && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#1e3a8a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <b>📋 Cobrando cotización {cotizacionRef.folio}</b>
              <button onClick={() => setCotizacionRef(null)} title="Desvincular (la cotización seguirá vigente)"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#1e3a8a', fontSize: '12px', textDecoration: 'underline' }}>Desvincular</button>
            </div>
            {(cotizacionRef.avisos || []).length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#92400e' }}>
                {cotizacionRef.avisos.map((a, i) => (
                  <li key={i}>{a.faltante
                    ? `${a.nombre}: ya no está en el catálogo`
                    : `${a.nombre}: cotizado a ${fmt(a.cotizado)}, hoy el precio es ${fmt(a.actual)} (se respeta lo cotizado)`}</li>
                ))}
              </ul>
            )}
          </div>
        )}

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
            <button onClick={() => setMostrarCotiz(v => !v)} style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
              background: mostrarCotiz ? '#1a1a2e' : '#f97316',
              color: 'white', border: 'none', cursor: 'pointer'
            }}>📄 Cotizaciones</button>
            <button onClick={() => setMostrarFlete(!mostrarFlete)} style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
              background: mostrarFlete ? '#1a1a2e' : '#0C447C',
              color: 'white', border: 'none', cursor: 'pointer'
            }}>🚚 + Flete/Servicio</button>
            <button onClick={abrirProductoNuevo} style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
              background: mostrarProdNuevo ? '#1a1a2e' : '#166534',
              color: 'white', border: 'none', cursor: 'pointer'
            }}>➕ Producto nuevo</button>
          </div>

          {/* Alta rápida de producto fuera de catálogo */}
          {mostrarProdNuevo && (() => {
            const pv = parseFloat(prodNuevo.precio) || 0
            const co = parseFloat(prodNuevo.costo) || 0
            const margen = pv > 0 && co > 0 ? ((pv - co) / pv) * 100 : null
            const valido = prodNuevo.nombre.trim() && pv > 0
            const inp = { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }
            const lbl = { fontSize: '11px', color: '#666', fontWeight: '600', display: 'block', marginBottom: '2px' }
            const enter = e => { if (e.key === 'Enter') { e.preventDefault(); guardarProductoNuevo() } else if (e.key === 'Escape') cerrarProductoNuevo() }
            return (
              <div style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#166534', fontWeight: '700' }}>PRODUCTO NUEVO — precios con IVA incluido</p>
                <label style={lbl}>Nombre</label>
                <input type="text" value={prodNuevo.nombre} autoFocus onKeyDown={enter}
                  onChange={e => setProdNuevo(p => ({ ...p, nombre: e.target.value }))}
                  style={{ ...inp, marginBottom: '6px' }} />
                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Precio de venta</label>
                    <input type="number" min="0" step="0.01" value={prodNuevo.precio} onKeyDown={enter} onFocus={e => e.target.select()}
                      onChange={e => setProdNuevo(p => ({ ...p, precio: e.target.value }))} style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Precio de compra</label>
                    <input type="number" min="0" step="0.01" value={prodNuevo.costo} onKeyDown={enter} onFocus={e => e.target.select()}
                      onChange={e => setProdNuevo(p => ({ ...p, costo: e.target.value }))} style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Existencia (opc.)</label>
                    <input type="number" min="0" step="any" value={prodNuevo.existencia} onKeyDown={enter} onFocus={e => e.target.select()}
                      onChange={e => setProdNuevo(p => ({ ...p, existencia: e.target.value }))} style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Peso kg/unidad</label>
                    <input type="number" min="0" step="any" value={prodNuevo.peso} onKeyDown={enter} onFocus={e => e.target.select()}
                      onChange={e => setProdNuevo(p => ({ ...p, peso: e.target.value }))} style={inp} />
                  </div>
                </div>
                {margen !== null && (
                  <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: margen < 0 ? '#e53e3e' : margen < 10 ? '#BA7517' : '#166534' }}>
                    Margen: {margen.toFixed(1)}% · Utilidad {fmt(pv - co)} por unidad
                  </p>
                )}
                {prodNuevoError && <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#e53e3e' }}>{prodNuevoError}</p>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={guardarProductoNuevo} disabled={!valido || guardandoProd} style={{
                    flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: '600',
                    background: valido && !guardandoProd ? '#166534' : '#e0e0e0',
                    color: valido && !guardandoProd ? 'white' : '#aaa',
                    cursor: valido && !guardandoProd ? 'pointer' : 'not-allowed'
                  }}>{guardandoProd ? 'Guardando...' : 'Guardar y agregar al carrito'}</button>
                  <button onClick={cerrarProductoNuevo} style={{
                    padding: '8px 14px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '13px', cursor: 'pointer'
                  }}>Cancelar</button>
                </div>
              </div>
            )
          })()}

          {/* Mini-formulario de flete/servicio */}
          {mostrarFlete && (
            <div style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', background: '#fafafa', border: '1px solid #e0e0e0' }}>
              <input type="text" placeholder="Descripción" value={nuevoFlete.descripcion}
                onChange={e => setNuevoFlete(prev => ({ ...prev, descripcion: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '6px' }}
              />
              <input type="number" placeholder="Monto" value={nuevoFlete.monto} autoFocus
                onChange={e => setNuevoFlete(prev => ({ ...prev, monto: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') agregarFlete() }}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={agregarFlete} disabled={!nuevoFlete.monto || parseFloat(nuevoFlete.monto) <= 0} style={{
                  flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: '600',
                  background: parseFloat(nuevoFlete.monto) > 0 ? '#0C447C' : '#e0e0e0',
                  color: parseFloat(nuevoFlete.monto) > 0 ? 'white' : '#aaa',
                  cursor: parseFloat(nuevoFlete.monto) > 0 ? 'pointer' : 'not-allowed'
                }}>+ Agregar al carrito</button>
                <button onClick={() => setMostrarFlete(false)} style={{
                  padding: '8px 14px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '13px', cursor: 'pointer'
                }}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Panel ventas en espera */}
          {mostrarCotiz && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', padding: '12px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888', fontWeight: '600' }}>COTIZACIONES VIGENTES — clic para cobrar</p>
              <input autoFocus value={qCotiz} onChange={e => setQCotiz(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setMostrarCotiz(false) }}
                placeholder="Buscar por folio o cliente..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }} />
              {cargandoCotiz && <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Buscando...</p>}
              {!cargandoCotiz && cotizLista.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>No hay cotizaciones vigentes</p>}
              {cotizLista.map(c => (
                <div key={c.id} onClick={() => abrirCotizacion(c)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <span><b>{c.folio}</b> · {c.nombre_cliente || 'Público en general'}{c.es_envio ? ' 🚚' : ''}</span>
                  <b style={{ color: '#f97316' }}>{fmt(c.total)}</b>
                </div>
              ))}
            </div>
          )}

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
                    {e.cliente && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#0C447C' }}>🧾 {e.cliente.nombre}</p>}
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
          {(resultados.length > 0 || buscando || busqueda.trim()) && (
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
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#f97316' }}>{fmt(Math.round(p.precio_venta * 1.16 * 100) / 100)}</p>
                </div>
              ))}
              {!buscando && busqueda.trim() && (
                <div onClick={abrirProductoNuevo}
                  style={{ padding: '10px 1rem', cursor: 'pointer', background: '#f0fdf4', color: '#166534', fontSize: '13px', fontWeight: '600', borderRadius: '0 0 8px 8px' }}>
                  {resultados.length === 0 ? 'Sin resultados — ' : ''}➕ Crear producto nuevo «{busqueda.trim()}»
                </div>
              )}
            </div>
          )}
        </div>

        {/* Carrito */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e' }}>Carrito ({carrito.length} productos)</h3>
            {carrito.length > 0 && (
              <button onClick={() => { setCarrito([]); setCotizacionRef(null); localStorage.removeItem('pos_carrito'); cantRefs.current = {}; setFilaCarrito(null); inputRef.current?.focus() }}
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
                    <th style={{ ...th, textAlign: 'center', width: '110px' }}>Cant.</th>
                    <th style={{ ...th, textAlign: 'right', width: '70px' }}>Exist.</th>
                    <th style={{ ...th, textAlign: 'right', width: '100px' }}>Precio</th>
                    <th style={{ ...th, textAlign: 'center', width: '95px' }}>Desc%</th>
                    <th style={{ ...th, textAlign: 'right', width: '110px' }}>Subtotal</th>
                    <th style={{ ...th, width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {carrito.map(item => {
                    const subtotalItem = Math.round(item.precio * item.cantidad * (1 - item.descuento / 100) * 100) / 100
                    const marcada = filaCarrito === item.id
                    return (
                      <tr key={item.id}
                        onClick={() => setFilaCarrito(marcada ? null : item.id)}
                        style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer', ...(() => {
                        const costoUnit   = item.costo / (item.factor || 1)
                        const precioFinal = item.precio * (1 - item.descuento / 100)
                        const margen      = precioFinal > 0 ? (precioFinal - costoUnit) / precioFinal * 100 : 0
                      const margenStyle = margen < 0
                      ? { background: '#ffe4e4', borderLeft: '4px solid #e53e3e' }
                      : margen < 10
                      ? { background: '#fef3c7', borderLeft: '4px solid #BA7517' }
                      : {}
                      return marcada ? { ...margenStyle, boxShadow: 'inset 0 0 0 2px #534AB7' } : margenStyle
                      })() }}>
                        <td style={td}>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{item.esServicio && '🚚 '}{item.nombre}</p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>
                            {item.clave && <span style={{ color: '#534AB7', fontWeight: '600' }}>{item.clave}</span>}
                            {item.clave_alterna && item.clave_alterna !== item.clave && <span style={{ color: '#1D9E75', fontWeight: '600' }}> · {item.clave_alterna}</span>}
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
                              style={{ width: '50px', padding: '4px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px' }}
                            />
                            <button onClick={() => {
                              const nueva = parseFloat((item.cantidad + 1).toFixed(3))
                              actualizarCantidad(item.id, nueva)
                              if (cantRefs.current[item.id]) cantRefs.current[item.id].value = nueva
                            }} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>+</button>
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontSize: '12px', fontWeight: '600',
                          color: item.esServicio ? '#aaa' : item.existencia <= 0 ? '#e53e3e' : item.existencia < item.cantidad ? '#BA7517' : '#1D9E75' }}>
                          {item.esServicio ? '—' : item.existencia}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <input
                            key={(Math.round(item.precio * (1 - item.descuento / 100) * 100) / 100).toFixed(2)}
                            type="text"
                            defaultValue={(Math.round(item.precio * (1 - item.descuento / 100) * 100) / 100).toFixed(2)}
                            onBlur={e => {
                              const val = parseFloat(e.target.value.replace(/[$,]/g, ''))
                              const precioActual = Math.round(item.precio * (1 - item.descuento / 100) * 100) / 100
                              if (!isNaN(val) && val > 0 && Math.abs(val - precioActual) > 0.005) {
                                const descuento = Math.round((1 - val / item.precio) * 1000000) / 10000
                                actualizarDescuento(item.id, descuento)
                                e.target.value = val.toFixed(2)
                              } else {
                                e.target.value = precioActual.toFixed(2)
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.focus() }
                            }}
                            onFocus={e => e.target.select()}
                            style={{ width: '85px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'right', fontSize: '13px' }}
                          />
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input type="number" min="-1000" max="100" step="1" value={item.descuento}
                            title="Negativo = recargo (ej. flete o precio foráneo)"
                            onChange={e => actualizarDescuento(item.id, parseFloat(e.target.value) || 0)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.focus() }
                              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.target.blur() }
                            }}
                            onFocus={e => e.target.select()}
                            onWheel={e => e.target.blur()}
                            style={{ width: '55px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px' }}
                          />
                          {item.descuento !== 0 && (
                            <p style={{ margin: '3px 0 0', fontSize: '11px', fontWeight: '600', color: item.descuento > 0 ? '#e53e3e' : '#0C447C', whiteSpace: 'nowrap' }}>
                              → {fmt(Math.round(item.precio * (1 - item.descuento / 100) * 100) / 100)} c/u
                            </p>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <input
                            type="text"
                            ref={el => {
                              if (el && el !== document.activeElement) {
                                el.value = subtotalItem.toFixed(2)
                              }
                            }}
                            defaultValue={subtotalItem.toFixed(2)}
                            onBlur={e => {
                              const val = parseFloat(e.target.value.replace(/[$,]/g, ''))
                              if (!isNaN(val) && val > 0 && Math.abs(val - subtotalItem) > 0.005) {
                                const nuevaCantidad = val / item.precio
                                actualizarCantidad(item.id, nuevaCantidad)
                                if (cantRefs.current[item.id]) {
                                  cantRefs.current[item.id].value = Number.isInteger(nuevaCantidad) 
                                    ? nuevaCantidad 
                                    : nuevaCantidad.toFixed(3)
                                }
                              } else {
                                e.target.value = subtotalItem.toFixed(2)
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>{contacto.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: '14px', color: '#555' }}>{contacto.colonia} — {contacto.telefono}</p>
                {contacto.direccion && <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#888', lineHeight: '1.4' }}>{contacto.direccion}</p>}
              </div>
              <button onClick={() => { setContacto(null); setBusqContacto(''); setCreandoContacto(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: '18px' }}>✕</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Buscar contacto..." value={busqContacto}
                onChange={e => { setBusqContacto(e.target.value); setCreandoContacto(false) }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }}
              />
              {contactos.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '4px' }}>
                  {contactos.map(c => (
                    <div key={c.id} onClick={() => { setContacto(c); setContactos([]); setBusqContacto('') }}
                      style={{ padding: '10px 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9f9f9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      <p style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>{c.nombre}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '14px', color: '#555' }}>{c.colonia} — {c.telefono}</p>
                      {c.direccion && <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#888', lineHeight: '1.4' }}>{c.direccion}</p>}
                    </div>
                  ))}
                </div>
              )}
              {busqContacto.trim() && contactos.length === 0 && !creandoContacto && (
                <button onClick={abrirCrearContacto} style={{
                  marginTop: '8px', width: '100%', padding: '8px', borderRadius: '6px',
                  background: '#f0fdf4', color: '#1D9E75', border: '1px dashed #bbf7d0',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                }}>+ Crear contacto "{busqContacto}"</button>
              )}
              {creandoContacto && (
                <div style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', background: '#fafafa', border: '1px solid #e0e0e0' }}>
                  <input type="text" placeholder="Nombre *" value={nuevoContacto.nombre}
                    onChange={e => setNuevoContacto(prev => ({ ...prev, nombre: e.target.value }))}
                    autoFocus
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '6px' }}
                  />
                  <input type="text" placeholder="Teléfono" value={nuevoContacto.telefono}
                    onChange={e => setNuevoContacto(prev => ({ ...prev, telefono: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '6px' }}
                  />
                  <input type="text" placeholder="Colonia" value={nuevoContacto.colonia}
                    onChange={e => setNuevoContacto(prev => ({ ...prev, colonia: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '6px' }}
                  />
                  <textarea placeholder="Dirección (calle, número, referencias...)" value={nuevoContacto.direccion}
                    onChange={e => setNuevoContacto(prev => ({ ...prev, direccion: e.target.value }))}
                    rows={3}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={crearContactoRapido} disabled={!nuevoContacto.nombre.trim() || guardandoContacto} style={{
                      flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: '600',
                      background: nuevoContacto.nombre.trim() ? '#1D9E75' : '#e0e0e0',
                      color: nuevoContacto.nombre.trim() ? 'white' : '#aaa',
                      cursor: nuevoContacto.nombre.trim() ? 'pointer' : 'not-allowed'
                    }}>{guardandoContacto ? 'Guardando...' : '💾 Guardar y usar'}</button>
                    <button onClick={() => setCreandoContacto(false)} style={{
                      padding: '8px 14px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '13px', cursor: 'pointer'
                    }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cliente (facturación / crédito) */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888', fontWeight: '600' }}>CLIENTE (FACTURACIÓN / CRÉDITO)</p>
          {cliente ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{cliente.nombre}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>{cliente.rfc || 'Sin RFC'} — {cliente.telefono || 'Sin teléfono'}</p>
                </div>
                <button onClick={() => { setCliente(null); setBusqCliente('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: '18px' }}>✕</button>
              </div>
              {Number(cliente.credito_limite) > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: excedeCredito ? '#e53e3e' : '#888' }}>
                  Saldo: {fmt(cliente.saldo)} / Límite: {fmt(cliente.credito_limite)}
                  {excedeCredito && ' ⚠️ Esta venta excede el límite de crédito'}
                </p>
              )}
              {Number(cliente.saldo_a_favor) > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#1D9E75', fontWeight: '600' }}>
                  💰 Saldo a favor disponible: {fmt(cliente.saldo_a_favor)}
                </p>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Buscar cliente por nombre..." value={busqCliente}
                onChange={e => setBusqCliente(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }}
              />
              {clientesResultados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '4px' }}>
                  {clientesResultados.map(c => (
                    <div key={c.id} onClick={() => { setCliente(c); setClientesResultados([]); setBusqCliente('') }}
                      style={{ padding: '8px 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9f9f9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>{c.nombre}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>{c.rfc || 'Sin RFC'} — Saldo: {fmt(c.saldo)}</p>
                    </div>
                  ))}
                </div>
              )}
              {metodoPago === 'credito' && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#e53e3e' }}>Requerido para ventas a crédito.</p>
              )}
            </div>
          )}
        </div>

        {/* Resumen */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888', fontWeight: '600' }}>RESUMEN</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: '#888' }}>Subtotal</span>
              <span>{fmt(subtotalBruto)}</span>
            </div>
            {pesoTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#888' }}>⚖ Peso total</span>
                <span>{pesoTotal.toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span style={{ color: '#888' }}>Descuento global %</span>
              <input type="number" min="0" max="100" step="1" value={descuentoGlobal}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0
                  setDescuentoGlobal(val)
                  setCarrito(prev => prev.map(i => ({ ...i, descuento: val })))
                }}
                onFocus={e => e.target.select()}
                onWheel={e => e.target.blur()}
                onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.target.blur() } }}
                title="Aplica el mismo % a TODOS los productos del carrito — sobreescribe los descuentos/recargos individuales"
                style={{ width: '60px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px' }}
              />
            </div>
            {descuentoTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#e53e3e' }}>
                <span>Descuento</span>
                <span>-{fmt(descuentoTotal)}</span>
              </div>
            )}
            {recargoTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#0C447C' }}>
                <span>Recargo (foránea/flete)</span>
                <span>+{fmt(recargoTotal)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '20px', fontWeight: '700', borderTop: '2px solid #e0e0e0', paddingTop: '8px', marginTop: '4px' }}>
              <span>Total</span>
              <input
                ref={totalRef}
                type="text"
                defaultValue={total.toFixed(2)}
                readOnly={!totalEditable}
                onDoubleClick={() => { setTotalEditable(true); setTimeout(() => totalRef.current?.select(), 50) }}
                onBlur={e => {
                  setTotalEditable(false)
                  const val = parseFloat(e.target.value.replace(/[$,]/g, ''))
                  if (!isNaN(val) && val > 0 && Math.abs(val - total) > 0.005 && subtotalBruto > 0) {
                    const nuevoDesc = Math.max(0, Math.min(100, (1 - val / subtotalBruto) * 100))
                    const pct = Math.round(nuevoDesc * 10000) / 10000
                    setDescuentoGlobal(pct)
                    setCarrito(prev => prev.map(i => ({ ...i, descuento: pct })))
                    e.target.value = val.toFixed(2)
                  } else {
                    e.target.value = total.toFixed(2)
                  }
                }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                onFocus={e => e.target.select()}
                title="Doble clic para editar"
                style={{
                  width: '130px', padding: '4px 8px', borderRadius: '6px',
                  border: `2px solid ${totalEditable ? '#f97316' : '#e0e0e0'}`,
                  textAlign: 'right', fontSize: '20px', fontWeight: '700',
                  color: '#f97316', outline: 'none',
                  cursor: totalEditable ? 'text' : 'pointer',
                  background: totalEditable ? 'white' : '#fafafa',
                }}
              />
            </div>
          </div>
        </div>

        {/* Método de pago */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#888', fontWeight: '600' }}>MÉTODO DE PAGO</p>
            <button onClick={() => {
              const div = !pagoDividido
              setPagoDividido(div)
              if (div) setPagosSplit([{ id: 1, metodo: 'efectivo', monto: total.toFixed(2) }])
              setError(null)
            }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#534AB7', fontWeight: '600', textDecoration: 'underline' }}>
              {pagoDividido ? '✕ Cancelar división' : '💳 Dividir en varios métodos'}
            </button>
          </div>

          {!pagoDividido && (
            <>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                {[
                  { id: 'efectivo',      label: '💵 Efectivo' },
                  { id: 'tarjeta',       label: '💳 Tarjeta' },
                  { id: 'transferencia', label: '🏦 Transf.' },
                  { id: 'credito',       label: '📋 Crédito' },
                  ...(cliente && Number(cliente.saldo_a_favor) > 0 ? [{ id: 'saldo_a_favor', label: '💰 Saldo a favor' }] : []),
                ].map(m => (
                  <button key={m.id} onClick={() => setMetodoPago(m.id)} style={{
                    flex: 1, padding: '8px 6px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                    background: metodoPago === m.id ? '#1a1a2e' : 'white',
                    color: metodoPago === m.id ? 'white' : '#555',
                    border: '1px solid #ddd', cursor: 'pointer'
                  }}>{m.label}</button>
                ))}
              </div>
              {metodoPago === 'saldo_a_favor' && cliente && (
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: Number(total) > Number(cliente.saldo_a_favor) ? '#e53e3e' : '#1D9E75' }}>
                  Disponible: {fmt(cliente.saldo_a_favor)}
                  {Number(total) > Number(cliente.saldo_a_favor) && ' ⚠️ El total de la venta excede el saldo disponible'}
                </p>
              )}
              {metodoPago === 'efectivo' && (
                <div>
                  <input type="number" placeholder="Monto recibido" value={montoPago}
                    onChange={e => setMontoPago(e.target.value)}
                    onFocus={e => e.target.select()}
                    onWheel={e => e.target.blur()}
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
            </>
          )}

          {pagoDividido && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pagosSplit.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select value={p.metodo} onChange={e => setPagosSplit(prev => prev.map(x => x.id === p.id ? { ...x, metodo: e.target.value } : x))}
                    style={{ padding: '8px 6px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '12px', flex: '0 0 108px' }}>
                    <option value="efectivo">💵 Efectivo</option>
                    <option value="tarjeta">💳 Tarjeta</option>
                    <option value="transferencia">🏦 Transf.</option>
                    <option value="credito">📋 Crédito</option>
                    {cliente && Number(cliente.saldo_a_favor) > 0 && <option value="saldo_a_favor">💰 Saldo a favor</option>}
                  </select>
                  <input type="number" placeholder="Monto" value={p.monto}
                    onChange={e => setPagosSplit(prev => prev.map(x => x.id === p.id ? { ...x, monto: e.target.value } : x))}
                    onFocus={e => e.target.select()} onWheel={e => e.target.blur()}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', textAlign: 'right' }} />
                  {pagosSplit.length > 1 && (
                    <button onClick={() => setPagosSplit(prev => prev.filter(x => x.id !== p.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: '16px', flexShrink: 0 }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setPagosSplit(prev => [...prev, { id: Date.now(), metodo: 'tarjeta', monto: faltaCubrir > 0 ? faltaCubrir.toFixed(2) : '' }])}
                style={{ padding: '6px', borderRadius: '6px', border: '1px dashed #ccc', background: 'white', color: '#888', fontSize: '12px', cursor: 'pointer' }}>+ Agregar método</button>

              <div style={{
                display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '6px',
                background: Math.abs(faltaCubrir) <= 0.009 ? '#f0fdf4' : '#fef3c7',
              }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: Math.abs(faltaCubrir) <= 0.009 ? '#1D9E75' : '#BA7517' }}>
                  {Math.abs(faltaCubrir) <= 0.009 ? '✓ Cubierto completo' : faltaCubrir > 0 ? 'Falta cubrir' : 'Sobran'}
                </span>
                {Math.abs(faltaCubrir) > 0.009 && <span style={{ fontSize: '13px', fontWeight: '700', color: '#BA7517' }}>{fmt(Math.abs(faltaCubrir))}</span>}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p style={{ color: '#e53e3e', fontSize: '13px', margin: 0, padding: '8px 12px', background: '#fef2f2', borderRadius: '8px' }}>
            {error}
          </p>
        )}

        {(() => {
          const bloqueado = carrito.length === 0 || procesando
            || (!pagoDividido && metodoPago === 'credito' && !cliente)
            || (pagoDividido && (Math.abs(faltaCubrir) > 0.009 || (splitUsaCredito && !cliente)))
            || (usaSaldoAFavor && (!cliente || excedeSaldoAFavor))
          return (
            <button onClick={procesarVenta} disabled={bloqueado} style={{
              padding: '16px', borderRadius: '10px', fontSize: '18px', fontWeight: '700',
              background: !bloqueado ? '#f97316' : '#e0e0e0',
              color: !bloqueado ? 'white' : '#aaa',
              border: 'none', cursor: carrito.length > 0 && !procesando ? 'pointer' : 'not-allowed',
            }}>
          {procesando ? '⏳ Procesando...' : `💰 Cobrar ${fmt(total)}`}
        </button>
          )
        })()}
      </div>
    </div>
  )
}

function TicketVenta({ venta, onNueva }) {
  const datosTicket = () => ({
    folio: venta.folio,
    fecha: new Date().toLocaleString('es-MX'),
    cliente: venta.cliente ? { nombre: venta.cliente.nombre, rfc: venta.cliente.rfc } : null,
    contacto: venta.contacto ? { nombre: venta.contacto.nombre, telefono: venta.contacto.telefono, direccion: venta.contacto.direccion } : null,
    items: venta.items.map(item => {
      const precioFinal = Math.round(item.precio * (1 - item.descuento / 100) * 100) / 100
      const totalItem = Math.round(precioFinal * item.cantidad * 100) / 100
      return { nombre: item.nombre, cantidad: item.cantidad, precioUnitario: precioFinal, subtotal: totalItem }
    }),
    descuentoTotal: venta.descuentoTotal || 0,
    recargoTotal: venta.recargoTotal || 0,
    total: venta.total,
    pagos: venta.pagos || [],
    cambio: venta.cambio || 0,
  })

  useEffect(() => { imprimirTicket(datosTicket(), { silencioso: true }) }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '0.75rem' }}>
      <div style={{ fontSize: '48px' }}>✅</div>
      <h2 style={{ margin: 0, color: '#1a1a2e' }}>Venta registrada</h2>
      <p style={{ margin: 0, fontSize: '16px', color: '#555' }}>Folio: <strong>{venta.folio}</strong></p>
      <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#f97316' }}>{fmt(venta.total)}</p>
      {venta.cambio > 0 && (
        <p style={{ margin: 0, fontSize: '15px', color: '#1D9E75', fontWeight: '600' }}>Cambio: {fmt(venta.cambio)}</p>
      )}
      <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
        <button onClick={onNueva} style={{ padding: '12px 24px', background: '#f97316', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
          ➕ Nueva venta
        </button>
        <button onClick={() => imprimirTicket(datosTicket())} style={{ padding: '12px 24px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}>
          🖨️ Reimprimir
        </button>
      </div>
    </div>
  )
}

const th = { padding: '8px 1rem', textAlign: 'left', fontSize: '12px', color: '#888', fontWeight: '600' }
const td = { padding: '8px 1rem', fontSize: '13px', color: '#333' }
