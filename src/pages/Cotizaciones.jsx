import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { NEGOCIO_ID, getSucursalId, cargarConfig } from '../lib/config'
import {
  r2, hoyISO, calcularTotales, preciosAlternos, guardarCotizacion, cargarCotizacion, cotizacionACarrito,
  enviarACaja, cancelarCotizacion, buscarCotizaciones, estadoVisible, prepararImpresion,
} from '../lib/cotizaciones'
import { imprimirCotizacion } from '../lib/cotizacionPrint'

const IVA = 1.16
const TABS_KEY = 'pos_cot_tabs'

const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const fmtFecha = v => v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const precioEf = i => r2(i.precio * (1 - (i.descuento || 0) / 100))

const C = { acc: '#f97316', ink: '#1a1a2e', mut: '#888', line: '#e0e0e0', ok: '#1D9E75', err: '#e53e3e' }
const card = { background: 'white', borderRadius: '10px', border: `1px solid ${C.line}`, padding: '14px' }
const lbl = { display: 'block', fontSize: '11px', fontWeight: '700', color: '#666', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '.4px' }
const inp = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }
const th = { padding: '10px 8px', fontSize: '11px', color: '#888', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: `1px solid ${C.line}`, textAlign: 'left' }
const td = { padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle', fontSize: '14px' }
const boton = (bg, activo = true) => ({
  padding: '10px 14px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: '700',
  background: activo ? bg : '#e0e0e0', color: activo ? 'white' : '#aaa', cursor: activo ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
})
const chip = { padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', display: 'inline-block' }

const ESTADO_CHIP = {
  vigente:    { t: 'Vigente',    bg: '#e6f7f0', c: '#0f6e52' },
  vencida:    { t: 'Vencida',    bg: '#fff3e0', c: '#b45309' },
  convertida: { t: 'Convertida', bg: '#e8f0fe', c: '#1d4ed8' },
  cancelada:  { t: 'Cancelada',  bg: '#fdecec', c: '#b91c1c' },
}

const nuevoSnap = (vig = '') => ({
  editId: null, editFolio: null, soloLectura: false, carrito: [], cliente: null, contacto: null, nombreCliente: '',
  esEnvio: false, direccion: '', notas: '', notasInt: '', descGlobal: 0, vigHasta: vig, foto: null,
})
const leerTabs = () => {
  try {
    const t = JSON.parse(localStorage.getItem(TABS_KEY) || 'null')
    if (t?.tabs?.length && t.tabs.some(x => x.id === t.activa)) return t
  } catch { /* ignorar */ }
  try {   // migra el borrador de la versión anterior
    const o = JSON.parse(localStorage.getItem('pos_cot_borrador') || 'null')
    if (o) return { activa: 1, tabs: [{ id: 1, snap: { ...nuevoSnap(), ...o } }] }
  } catch { /* ignorar */ }
  return { activa: 1, tabs: [{ id: 1, snap: nuevoSnap() }] }
}

export default function Cotizaciones({ irA }) {
  const ini = useRef(leerTabs()).current
  const b0 = ini.tabs.find(t => t.id === ini.activa).snap
  const [tabs, setTabs] = useState(ini.tabs)
  const [tabActiva, setTabActiva] = useState(ini.activa)
  const [vista, setVista] = useState('captura')

  // ---- Estado del editor ----
  const [editId, setEditId]         = useState(b0?.editId || null)
  const [editFolio, setEditFolio]   = useState(b0?.editFolio || null)
  const [soloLectura, setSoloLectura] = useState(!!b0.soloLectura)
  const [carrito, setCarrito]       = useState(b0?.carrito || [])
  const [cliente, setCliente]       = useState(b0?.cliente || null)
  const [contacto, setContacto]     = useState(b0?.contacto || null)
  const [nombreCliente, setNombreCliente] = useState(b0?.nombreCliente || '')
  const [esEnvio, setEsEnvio]       = useState(b0?.esEnvio || false)
  const [direccion, setDireccion]   = useState(b0?.direccion || '')
  const [notas, setNotas]           = useState(b0?.notas || '')
  const [notasInt, setNotasInt]     = useState(b0?.notasInt || '')
  const [descGlobal, setDescGlobal] = useState(b0?.descGlobal || 0)
  const [vigHasta, setVigHasta]     = useState(b0?.vigHasta || '')
  const [vigDias, setVigDias]       = useState(15)
  const [totalDeseado, setTotalDeseado] = useState('')

  // ---- Búsquedas ----
  const [busqueda, setBusqueda]     = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando]     = useState(false)
  const [sel, setSel]               = useState(-1)
  const [busqCliente, setBusqCliente] = useState('')
  const [clientesRes, setClientesRes] = useState([])
  const [busqContacto, setBusqContacto] = useState('')
  const [contactosRes, setContactosRes] = useState([])
  const [creandoContacto, setCreandoContacto] = useState(false)
  const [nuevoContacto, setNuevoContacto] = useState({ nombre: '', telefono: '', colonia: '', direccion: '' })

  // ---- Flete y producto nuevo ----
  const [mostrarFlete, setMostrarFlete] = useState(false)
  const [nuevoFlete, setNuevoFlete] = useState({ descripcion: 'Flete', monto: '' })
  const [mostrarProdNuevo, setMostrarProdNuevo] = useState(false)
  const [prodNuevo, setProdNuevo]   = useState({ nombre: '', precio: '', costo: '', existencia: '', peso: '' })
  const [prodNuevoError, setProdNuevoError] = useState('')
  const [guardandoProd, setGuardandoProd] = useState(false)

  const [guardando, setGuardando]   = useState(false)
  const [estadoGuardado, setEstadoGuardado] = useState(null)   // null | 'guardando' | 'error' | { hora }
  const idRef = useRef(b0?.editId || null)
  const folioRef = useRef(b0?.editFolio || null)
  const snapRef = useRef(null)          // foto de lo último guardado (para no guardar dos veces lo mismo)
  const cola = useRef(Promise.resolve())
  const omitirFlush = useRef(false)
  const [aviso, setAviso]           = useState(null)
  const inputRef = useRef(null)
  const cantRefs = useRef({})

  // ---- Lista ----
  const [lista, setLista]           = useState([])
  const [filtro, setFiltro]         = useState('vigentes')
  const [qLista, setQLista]         = useState('')
  const [cargandoLista, setCargandoLista] = useState(false)
  const [ocupado, setOcupado]       = useState(null)

  const t = calcularTotales(carrito)
  // Utilidad interna (precios con IVA, igual que SICAR: % sobre el costo)
  const costoUnit = i => r2((i.costo || 0) * IVA / (i.factor || 1))
  const lineasProd = carrito.filter(i => !i.esServicio)
  const costoTot = r2(lineasProd.reduce((s, i) => s + costoUnit(i) * i.cantidad, 0))
  const ventaProd = r2(lineasProd.reduce((s, i) => s + precioEf(i) * i.cantidad, 0))
  const utilidad = r2(ventaProd - costoTot)
  const utilPct = costoTot > 0 ? (utilidad / costoTot) * 100 : null

  // Total deseado: reparte la diferencia en descuento (o recargo) proporcional entre los productos
  const aplicarTotalDeseado = () => {
    const objetivo = parseFloat(String(totalDeseado).replace(/[$,]/g, ''))
    if (!(objetivo > 0)) return
    const neto = i => i.precio * i.cantidad * (1 - (i.descuento || 0) / 100)
    const serv = carrito.filter(i => i.esServicio).reduce((s, i) => s + neto(i), 0)
    const prod = carrito.filter(i => !i.esServicio).reduce((s, i) => s + neto(i), 0)
    const meta = objetivo - serv
    if (!(prod > 0) || !(meta > 0)) { avisar('err', 'El total deseado debe ser mayor que los fletes/servicios'); return }
    const k = meta / prod
    const nuevo = carrito.map(i => i.esServicio ? i : { ...i, descuento: Math.min(100, Math.round((1 - (1 - (i.descuento || 0) / 100) * k) * 1000000) / 10000) })
    setCarrito(nuevo); setDescGlobal(0); setTotalDeseado('')
    avisar('ok', `Total ajustado a ${fmt(calcularTotales(nuevo).total)}`)
  }

  const avisar = (tipo, texto) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(a => (a && a.texto === texto ? null : a)), 4500)
  }

  // Vigencia por defecto desde Configuración
  useEffect(() => {
    cargarConfig().then(cfg => {
      const dias = parseInt(cfg.cotizacion_vigencia_dias) || 15
      setVigDias(dias)
      setVigHasta(v => v || hoyISO(dias))
    })
  }, [])

  // Guardar las pestañas abiertas en el navegador (por si se cierra o se recarga)
  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify({
        activa: tabActiva, tabs: tabs.map(t => t.id === tabActiva ? { ...t, snap: capturar() } : t),
      }))
    } catch { /* ignorar */ }
  }, [tabs, tabActiva, editId, editFolio, soloLectura, carrito, cliente, contacto, nombreCliente, esEnvio, direccion, notas, notasInt, descGlobal, vigHasta])

  useEffect(() => { if (vista === 'captura') inputRef.current?.focus() }, [vista])

  // Buscar productos
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqueda.trim()) { setResultados([]); setSel(-1); return }
      setBuscando(true)
      let query = supabase.from('productos')
        .select('id, nombre, clave, codigo_barras, precio_venta, costo, factor, peso_kg, unidad, precio_2, mayoreo_2, precio_3, mayoreo_3, activo, ventas_recientes, inventario(existencia, sucursal_id)')
        .eq('activo', true).order('ventas_recientes', { ascending: false }).limit(8)
      busqueda.trim().split(/\s+/).forEach(p => {
        query = query.or(`nombre.ilike.%${p}%,clave.ilike.%${p}%,codigo_barras.ilike.%${p}%`)
      })
      const { data } = await query
      setResultados(data || []); setSel(-1); setBuscando(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [busqueda])

  // Buscar clientes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqCliente.trim()) { setClientesRes([]); return }
      const { data } = await supabase.from('clientes')
        .select('id, nombre, rfc, telefono, direccion, credito_limite, saldo, saldo_a_favor')
        .ilike('nombre', `%${busqCliente}%`).limit(5)
      setClientesRes(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [busqCliente])

  // Buscar contactos
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!busqContacto.trim()) { setContactosRes([]); return }
      const { data } = await supabase.from('contactos')
        .select('id, nombre, telefono, colonia, direccion').ilike('nombre', `%${busqContacto}%`).limit(5)
      setContactosRes(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [busqContacto])

  // ---------- Carrito ----------
  const agregarProducto = p => {
    const precio = r2(p.precio_venta * IVA)
    const existencia = p.inventario?.find(i => i.sucursal_id === getSucursalId())?.existencia ?? 0
    setCarrito(prev => {
      const existe = prev.find(i => i.id === p.id)
      if (existe) return prev.map(i => i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, {
        id: p.id, nombre: p.nombre, clave: p.clave, clave_alterna: p.codigo_barras,
        precio, costo: p.costo, factor: p.factor, peso: parseFloat(p.peso_kg) || 0, unidad: p.unidad || null,
        existencia, alt: preciosAlternos(p), cantidad: 1, descuento: descGlobal || 0,
      }]
    })
    setBusqueda(''); setResultados([]); setSel(-1)
    // Igual que Caja: el foco pasa a la cantidad del producto agregado (Enter regresa a buscar)
    setTimeout(() => {
      const el = cantRefs.current[p.id]
      if (el) { el.focus(); el.select() } else inputRef.current?.focus()
    }, 60)
  }

  const setCantidad = (id, cantidad) => {
    if (!(cantidad > 0)) { setCarrito(prev => prev.filter(i => i.id !== id)); return }
    setCarrito(prev => prev.map(i => i.id === id ? { ...i, cantidad: parseFloat(cantidad.toFixed(3)) } : i))
  }
  const setDescuento = (id, descuento) =>
    setCarrito(prev => prev.map(i => i.id === id ? { ...i, descuento: Math.min(descuento, 100) } : i))
  const quitar = id => { setCarrito(prev => prev.filter(i => i.id !== id)); inputRef.current?.focus() }

  const agregarFlete = () => {
    const monto = parseFloat(nuevoFlete.monto)
    if (!(monto > 0)) return
    setCarrito(prev => [...prev, {
      id: `flete-${Date.now()}`, nombre: nuevoFlete.descripcion.trim() || 'Flete', clave: null, clave_alterna: null,
      precio: monto, costo: 0, factor: 1, existencia: null, cantidad: 1, descuento: 0, esServicio: true,
    }])
    setNuevoFlete({ descripcion: 'Flete', monto: '' }); setMostrarFlete(false)
    inputRef.current?.focus()
  }

  const onKeyBusqueda = e => {
    if (resultados.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (sel >= 0) agregarProducto(resultados[sel])
      else if (resultados.length === 1) agregarProducto(resultados[0])
    } else if (e.key === 'Escape') { setBusqueda(''); setResultados([]); setSel(-1) }
  }

  // ---------- Producto fuera de catálogo ----------
  const abrirProdNuevo = () => {
    setProdNuevo({ nombre: busqueda.trim(), precio: '', costo: '', existencia: '', peso: '' })
    setProdNuevoError(''); setMostrarProdNuevo(true)
    setBusqueda(''); setResultados([]); setSel(-1)
  }
  const guardarProdNuevo = async () => {
    const precio = parseFloat(prodNuevo.precio)
    if (!prodNuevo.nombre.trim() || !(precio > 0) || guardandoProd) return
    setGuardandoProd(true); setProdNuevoError('')
    const existencia = parseFloat(prodNuevo.existencia) || 0
    const { data, error } = await supabase.rpc('crear_producto_nuevo', {
      p_nombre: prodNuevo.nombre.trim(), p_precio_venta_iva: precio, p_costo_iva: parseFloat(prodNuevo.costo) || 0,
      p_existencia: existencia, p_peso_kg: parseFloat(prodNuevo.peso) || 0,
    })
    setGuardandoProd(false)
    const p = Array.isArray(data) ? data[0] : data
    if (error || !p) { setProdNuevoError(error?.message || 'No se pudo crear el producto'); return }
    agregarProducto({ ...p, inventario: [{ sucursal_id: getSucursalId(), existencia }] })
    setMostrarProdNuevo(false)
  }

  // ---------- Cliente / contacto ----------
  const elegirContacto = c => {
    setContacto(c); setBusqContacto(''); setContactosRes([])
    if (esEnvio && !direccion.trim()) setDireccion([c.direccion, c.colonia && `Col. ${c.colonia}`].filter(Boolean).join(', '))
  }
  const crearContacto = async () => {
    if (!nuevoContacto.nombre.trim()) return
    const { data, error } = await supabase.from('contactos').insert({
      negocio_id: NEGOCIO_ID, nombre: nuevoContacto.nombre.trim(),
      telefono: nuevoContacto.telefono.trim() || null, colonia: nuevoContacto.colonia.trim() || null,
      direccion: nuevoContacto.direccion.trim() || null,
    }).select().single()
    if (error || !data) { avisar('err', error?.message || 'No se pudo crear el contacto'); return }
    elegirContacto(data)
    setCreandoContacto(false); setNuevoContacto({ nombre: '', telefono: '', colonia: '', direccion: '' })
  }
  const alternarEnvio = v => {
    setEsEnvio(v)
    if (v && !direccion.trim() && contacto) setDireccion([contacto.direccion, contacto.colonia && `Col. ${contacto.colonia}`].filter(Boolean).join(', '))
  }

  // ---------- Guardar / acciones ----------
  const datosRef = useRef({})
  datosRef.current = { carrito, cliente, contacto, nombreCliente, esEnvio, direccion, notas, notasInt, descGlobal, vigHasta }
  const soloLecturaRef = useRef(false)
  soloLecturaRef.current = soloLectura

  const fotoDe = d => JSON.stringify([d.carrito, d.cliente, d.contacto, d.nombreCliente, d.esEnvio, d.direccion, d.notas, d.notasInt, d.descGlobal, d.vigHasta])
  if (snapRef.current === null && b0.editId) snapRef.current = b0.foto ?? fotoDe(b0)

  const fijarId = (id, folio) => { idRef.current = id; folioRef.current = folio; setEditId(id); setEditFolio(folio) }

  // Guarda en orden (una a la vez). origen: 'auto' | 'manual'
  const guardarAhora = origen => {
    cola.current = cola.current.then(async () => {
      const d = datosRef.current
      if (soloLecturaRef.current || d.carrito.length === 0 || !d.vigHasta) return null
      const foto = fotoDe(d)
      if (idRef.current && foto === snapRef.current) return { id: idRef.current, folio: folioRef.current }
      if (origen !== 'auto') setGuardando(true)
      setEstadoGuardado('guardando')
      try {
        const res = await guardarCotizacion({ ...d, id: idRef.current })
        fijarId(res.id, res.folio)
        snapRef.current = foto
        setEstadoGuardado({ hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) })
        return res
      } catch (e) {
        if (/ya no se puede editar/.test(e.message)) {
          // Se convirtió en venta o se canceló desde otro lado (por ejemplo, al cobrarla en Caja)
          setSoloLectura(true); setEstadoGuardado('cerrada')
        } else {
          setEstadoGuardado('error')
          if (origen !== 'auto') avisar('err', e.message)
        }
        return null
      } finally { if (origen !== 'auto') setGuardando(false) }
    })
    return cola.current
  }
  const guardarRef = useRef(guardarAhora)
  guardarRef.current = guardarAhora

  // Guardado automático: 1.5 s después de dejar de teclear, y al salir de la pantalla
  useEffect(() => {
    if (soloLectura || carrito.length === 0) return
    if (fotoDe(datosRef.current) === snapRef.current) return
    const timer = setTimeout(() => guardarRef.current('auto'), 1500)
    return () => clearTimeout(timer)
  }, [carrito, cliente, contacto, nombreCliente, esEnvio, direccion, notas, notasInt, descGlobal, vigHasta, soloLectura])
  useEffect(() => () => { if (!omitirFlush.current) guardarRef.current('auto') }, [])

  const guardar = async (silencioso = false) => {
    if (soloLectura) return null
    if (carrito.length === 0) { if (!silencioso) avisar('err', 'Agrega al menos un producto'); return null }
    if (!vigHasta) { avisar('err', 'Indica hasta cuándo es vigente'); return null }
    const res = await guardarAhora('manual')
    if (res && !silencioso) avisar('ok', `Guardada ${res.folio}`)
    return res
  }

  // Devuelve el id de la cotización lista para usar (guarda primero si hace falta)
  const asegurarGuardada = async () => {
    if (soloLectura) return idRef.current
    const res = await guardar(true)
    return res?.id || null
  }

  const imprimir = async tipo => {
    const id = await asegurarGuardada()
    if (!id) return
    try {
      const { cot, items } = await cargarCotizacion(id)
      imprimirCotizacion(tipo, await prepararImpresion(cot, items))
      if (!soloLectura) avisar('ok', `Guardada ${cot.folio}`)
    } catch (e) { avisar('err', e.message) }
  }

  // ---------- Pestañas (varias cotizaciones abiertas a la vez) ----------
  const capturar = () => ({ editId: idRef.current, editFolio: folioRef.current, soloLectura: soloLecturaRef.current, ...datosRef.current, foto: snapRef.current })
  const restaurar = sn => {
    setCarrito(sn.carrito || []); setCliente(sn.cliente || null); setContacto(sn.contacto || null)
    setNombreCliente(sn.nombreCliente || ''); setEsEnvio(!!sn.esEnvio); setDireccion(sn.direccion || '')
    setNotas(sn.notas || ''); setNotasInt(sn.notasInt || ''); setDescGlobal(sn.descGlobal || 0)
    setVigHasta(sn.vigHasta || hoyISO(vigDias)); setSoloLectura(!!sn.soloLectura)
    fijarId(sn.editId || null, sn.editFolio || null); snapRef.current = sn.foto ?? null
    setEstadoGuardado(null); setBusqCliente(''); setBusqContacto(''); setCreandoContacto(false)
    setMostrarFlete(false); setMostrarProdNuevo(false); setBusqueda(''); setResultados([]); setTotalDeseado('')
    verificarVigente(sn.editId)
  }
  // Si la cotización ya se cobró o canceló mientras estaba abierta, se pasa a solo consulta
  const verificarVigente = async id => {
    if (!id) return
    const { data } = await supabase.from('cotizaciones').select('estado').eq('id', id).maybeSingle()
    if (data && data.estado !== 'vigente' && idRef.current === id) { setSoloLectura(true); setEstadoGuardado('cerrada') }
  }
  useEffect(() => { verificarVigente(idRef.current) }, [])
  const tabsConActiva = () => tabs.map(t => t.id === tabActiva ? { ...t, snap: capturar() } : t)
  const enfocarBusqueda = () => setTimeout(() => inputRef.current?.focus(), 80)
  const pestanaVacia = () => datosRef.current.carrito.length === 0 && !idRef.current

  const irAPestana = async key => {
    if (key === tabActiva) { setVista('captura'); return }
    await guardarAhora('auto')
    const actual = tabsConActiva()
    const destino = actual.find(t => t.id === key)
    if (!destino) return
    setTabs(actual); setTabActiva(key); restaurar(destino.snap); setVista('captura'); enfocarBusqueda()
  }
  const pestanaNueva = async () => {
    setVista('captura')
    if (pestanaVacia()) { enfocarBusqueda(); return }
    await guardarAhora('auto')
    const actual = tabsConActiva()
    const key = Date.now()
    const sn = nuevoSnap(hoyISO(vigDias))
    setTabs([...actual, { id: key, snap: sn }]); setTabActiva(key); restaurar(sn); enfocarBusqueda()
  }
  const cerrarPestana = async key => {
    if (key === tabActiva) await guardarAhora('auto')   // la cotización queda guardada en «Guardadas»
    const actual = tabsConActiva()
    const resto = actual.filter(t => t.id !== key)
    if (resto.length === 0) {
      const k = Date.now(); const sn = nuevoSnap(hoyISO(vigDias))
      setTabs([{ id: k, snap: sn }]); setTabActiva(k); restaurar(sn); enfocarBusqueda(); return
    }
    if (key === tabActiva) {
      const idx = actual.findIndex(t => t.id === key)
      const sig = resto[Math.min(idx, resto.length - 1)]
      setTabs(resto); setTabActiva(sig.id); restaurar(sig.snap); enfocarBusqueda()
    } else setTabs(resto)
  }
  const infoPestana = t => {
    const sn = t.id === tabActiva ? { ...datosRef.current, editFolio } : t.snap
    const nom = (sn.nombreCliente || '').trim() || sn.cliente?.nombre || sn.contacto?.nombre || ''
    return { folio: sn.editFolio, nom, n: (sn.carrito || []).length, total: calcularTotales(sn.carrito || []).total }
  }

  const aCaja = async () => {
    const id = await asegurarGuardada()
    if (!id) return
    try {
      const { cot, items } = await cargarCotizacion(id)
      if (cot.estado !== 'vigente') { avisar('err', 'Esta cotización ya no está vigente'); return }
      const { carrito: c, avisos } = await cotizacionACarrito(cot, items)
      enviarACaja({ cot, carrito: c, contacto: cot.contacto, cliente: cot.cliente, avisos })
      // La pestaña enviada se cierra; las demás siguen abiertas
      omitirFlush.current = true
      const resto = tabsConActiva().filter(t => t.id !== tabActiva)
      const lista = resto.length ? resto : [{ id: Date.now(), snap: nuevoSnap(hoyISO(vigDias)) }]
      localStorage.setItem(TABS_KEY, JSON.stringify({ activa: lista[0].id, tabs: lista }))
      irA?.('caja')
    } catch (e) { avisar('err', e.message) }
  }

  // Atajos de teclado (usan siempre la versión más reciente de las funciones)
  const accionesRef = useRef({})
  accionesRef.current = { guardar, imprimir, aCaja, vista }
  useEffect(() => {
    const onKey = e => {
      const a = accionesRef.current
      if (a.vista !== 'captura') return
      if (e.key === 'F2') { e.preventDefault(); a.guardar() }
      else if (e.key === 'F4') { e.preventDefault(); a.imprimir('carta') }
      else if (e.key === 'F8') { e.preventDefault(); a.aCaja() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- Lista ----------
  const cargarLista = async () => {
    setCargandoLista(true)
    try { setLista(await buscarCotizaciones({ q: qLista, estado: filtro })) }
    catch (e) { avisar('err', e.message) }
    setCargandoLista(false)
  }
  useEffect(() => {
    if (vista !== 'lista') return
    const timer = setTimeout(cargarLista, 250)
    return () => clearTimeout(timer)
  }, [vista, filtro, qLista])

  const cargarEnEditor = async (id, { duplicar = false } = {}) => {
    await guardarAhora('auto')   // antes de cambiar, queda guardado lo que se estaba capturando
    if (!duplicar) {
      if (idRef.current === id) { setVista('captura'); return }
      const abierta = tabs.find(t => t.id !== tabActiva && t.snap.editId === id)
      if (abierta) { await irAPestana(abierta.id); return }
    }
    const { cot, items } = await cargarCotizacion(id)
    const { carrito: c } = await cotizacionACarrito(cot, items)
    const v = {
      carrito: c, cliente: cot.cliente || null, contacto: cot.contacto || null,
      nombreCliente: cot.nombre_cliente && cot.nombre_cliente !== (cot.cliente?.nombre || cot.contacto?.nombre) ? cot.nombre_cliente : '',
      esEnvio: !!cot.es_envio, direccion: cot.direccion_entrega || '',
      notas: cot.notas || '', notasInt: cot.notas_internas || '', descGlobal: Number(cot.descuento_global) || 0,
      vigHasta: duplicar ? hoyISO(vigDias) : cot.vigente_hasta,
    }
    // Si la pestaña actual ya tiene algo, la cotización se abre en una pestaña nueva
    let actual = tabsConActiva(); let key = tabActiva
    if (!pestanaVacia()) { key = Date.now(); actual = [...actual, { id: key, snap: nuevoSnap() }] }
    setTabs(actual); setTabActiva(key)
    restaurar(duplicar
      ? { ...v, editId: null, editFolio: null, soloLectura: false, foto: null }   // copia nueva: se guarda sola con folio nuevo
      : { ...v, editId: cot.id, editFolio: cot.folio, soloLectura: cot.estado !== 'vigente', foto: fotoDe(v) })
    setVista('captura')
  }

  const accionLista = async (c, tipo) => {
    setOcupado(c.id)
    try {
      if (tipo === 'abrir') await cargarEnEditor(c.id)
      else if (tipo === 'duplicar') { await cargarEnEditor(c.id, { duplicar: true }); avisar('ok', 'Copia lista: se guardará con folio nuevo') }
      else if (tipo === 'carta' || tipo === 'termico') {
        const { cot, items } = await cargarCotizacion(c.id)
        imprimirCotizacion(tipo, await prepararImpresion(cot, items))
      } else if (tipo === 'caja') {
        const { cot, items } = await cargarCotizacion(c.id)
        if (cot.estado !== 'vigente') throw new Error('Esta cotización ya no está vigente')
        const { carrito: cc, avisos } = await cotizacionACarrito(cot, items)
        enviarACaja({ cot, carrito: cc, contacto: cot.contacto, cliente: cot.cliente, avisos })
        irA?.('caja')
      } else if (tipo === 'cancelar') {
        if (!confirm(`¿Cancelar la cotización ${c.folio}?`)) { setOcupado(null); return }
        await cancelarCotizacion(c.id)
        await cargarLista()
        avisar('ok', `${c.folio} cancelada`)
      }
    } catch (e) { avisar('err', e.message) }
    setOcupado(null)
  }

  // =====================================================================
  const nombreMostrado = nombreCliente.trim() || cliente?.nombre || contacto?.nombre || 'Público en general'

  return (
    <div>
      {/* Pestañas */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[['captura', '✏️ Cotizar'], ['lista', '📁 Guardadas']].map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)} style={{
            padding: '9px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
            border: `1px solid ${vista === k ? C.acc : '#ddd'}`, background: vista === k ? C.acc : 'white', color: vista === k ? 'white' : '#444',
          }}>{l}</button>
        ))}
        <button onClick={pestanaNueva} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #ddd', background: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>+ Nueva</button>
        {vista === 'captura' && (!soloLectura || estadoGuardado === 'cerrada') && estadoGuardado && (
          <span style={{ fontSize: '12px', fontWeight: '600', color: estadoGuardado === 'error' ? C.err : C.mut }}>
            {estadoGuardado === 'guardando' ? 'Guardando...' : estadoGuardado === 'cerrada' ? '🔒 Esta cotización ya se cobró o se canceló: solo consulta' : estadoGuardado === 'error' ? '⚠ No se pudo guardar (se reintenta al siguiente cambio)' : `✓ Guardado automáticamente ${estadoGuardado.hora}`}
          </span>
        )}
        {aviso && (
          <span style={{ marginLeft: '8px', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
            background: aviso.tipo === 'ok' ? '#e6f7f0' : '#fdecec', color: aviso.tipo === 'ok' ? '#0f6e52' : '#b91c1c' }}>
            {aviso.texto}
          </span>
        )}
      </div>

      {vista === 'lista' ? (
        /* ------------------------------ LISTA ------------------------------ */
        <div style={card}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
            <input value={qLista} onChange={e => setQLista(e.target.value)} placeholder="🔍 Buscar por folio o cliente..."
              style={{ ...inp, maxWidth: '320px' }} />
            {[['vigentes', 'Vigentes'], ['vencidas', 'Vencidas'], ['convertidas', 'Convertidas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']].map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} style={{
                padding: '7px 14px', borderRadius: '16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                border: `1px solid ${filtro === k ? C.ink : '#ddd'}`, background: filtro === k ? C.ink : 'white', color: filtro === k ? 'white' : '#555',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Folio</th><th style={th}>Fecha</th><th style={th}>Cliente</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th><th style={{ ...th, textAlign: 'right' }}>Peso</th>
                <th style={th}>Estado</th><th style={th}>Vigencia</th><th style={th}>Acciones</th>
              </tr></thead>
              <tbody>
                {lista.map(c => {
                  const est = estadoVisible(c)
                  const ec = ESTADO_CHIP[est]
                  const puedeUsar = est === 'vigente' || est === 'vencida'
                  const b = { padding: '5px 9px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }
                  return (
                    <tr key={c.id} style={{ opacity: ocupado === c.id ? 0.5 : 1 }}>
                      <td style={{ ...td, fontWeight: '700' }}>{c.folio}</td>
                      <td style={td}>{fmtFecha(c.created_at)}</td>
                      <td style={td}>{c.nombre_cliente || <span style={{ color: '#aaa' }}>Público en general</span>}{c.es_envio ? ' 🚚' : ''}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '700' }}>{fmt(c.total)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#666' }}>{Number(c.peso_total) > 0 ? `${Number(c.peso_total).toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg` : '—'}</td>
                      <td style={td}><span style={{ ...chip, background: ec.bg, color: ec.c }}>{ec.t}</span></td>
                      <td style={{ ...td, color: '#666' }}>{fmtFecha(c.vigente_hasta)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button style={b} onClick={() => accionLista(c, 'abrir')}>Abrir</button>
                          {puedeUsar && <button style={{ ...b, background: C.ok, color: 'white', border: 'none' }} onClick={() => accionLista(c, 'caja')}>→ Caja</button>}
                          <button style={b} onClick={() => accionLista(c, 'carta')}>Carta</button>
                          <button style={b} onClick={() => accionLista(c, 'termico')}>Ticket</button>
                          <button style={b} onClick={() => accionLista(c, 'duplicar')}>Duplicar</button>
                          {puedeUsar && <button style={{ ...b, color: C.err }} onClick={() => accionLista(c, 'cancelar')}>Cancelar</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!cargandoLista && lista.length === 0 && (
                  <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#999', padding: '2rem' }}>No hay cotizaciones en esta vista</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {cargandoLista && <p style={{ color: C.mut, fontSize: '13px' }}>Cargando...</p>}
        </div>
      ) : (
        /* ------------------------------ CAPTURA ------------------------------ */
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Columna izquierda: búsqueda + carrito */}
          <div style={{ flex: '1 1 560px', minWidth: 0 }}>
            {soloLectura && (
              <div style={{ ...card, marginBottom: '10px', background: '#fff8e1', borderColor: '#f5d77a', fontSize: '13px', fontWeight: '600', color: '#7a5b00' }}>
                {editFolio} ya no está vigente (vencida, convertida o cancelada) y no se puede editar. Usa «Duplicar» en Guardadas para hacer una copia nueva.
              </div>
            )}
            <div style={{ ...card, position: 'relative', marginBottom: '10px' }}>
              <input ref={inputRef} value={busqueda} disabled={soloLectura}
                onChange={e => { setBusqueda(e.target.value); setSel(-1) }} onKeyDown={onKeyBusqueda}
                placeholder="🔍 Buscar producto — ↑↓ navegar · Enter agregar · Esc limpiar"
                style={{ ...inp, padding: '12px 14px', fontSize: '16px' }} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button disabled={soloLectura} onClick={() => setMostrarFlete(v => !v)} style={{ ...boton(mostrarFlete ? C.ink : '#0C447C', !soloLectura), padding: '7px 14px', fontSize: '13px' }}>🚚 + Flete / servicio</button>
                <button disabled={soloLectura} onClick={abrirProdNuevo} style={{ ...boton(mostrarProdNuevo ? C.ink : '#166534', !soloLectura), padding: '7px 14px', fontSize: '13px' }}>➕ Producto nuevo</button>
              </div>

              {mostrarFlete && (
                <div style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', background: '#fafafa', border: '1px solid #e0e0e0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input value={nuevoFlete.descripcion} onChange={e => setNuevoFlete(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción (flete, sobrecosto foráneo...)" style={{ ...inp, flex: '2 1 200px', width: 'auto' }} />
                  <input type="number" min="0" autoFocus value={nuevoFlete.monto} onChange={e => setNuevoFlete(p => ({ ...p, monto: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') agregarFlete() }} placeholder="Monto" style={{ ...inp, flex: '1 1 110px', width: 'auto' }} />
                  <button onClick={agregarFlete} disabled={!(parseFloat(nuevoFlete.monto) > 0)} style={boton('#0C447C', parseFloat(nuevoFlete.monto) > 0)}>Agregar</button>
                </div>
              )}

              {mostrarProdNuevo && (() => {
                const pv = parseFloat(prodNuevo.precio) || 0
                const co = parseFloat(prodNuevo.costo) || 0
                const margen = pv > 0 && co > 0 ? ((pv - co) / pv) * 100 : null
                const valido = prodNuevo.nombre.trim() && pv > 0
                const enter = e => { if (e.key === 'Enter') { e.preventDefault(); guardarProdNuevo() } else if (e.key === 'Escape') setMostrarProdNuevo(false) }
                const campo = (k, l, extra = {}) => (
                  <div style={{ flex: '1 1 110px' }}>
                    <label style={lbl}>{l}</label>
                    <input type="number" min="0" step="any" value={prodNuevo[k]} onKeyDown={enter} onFocus={e => e.target.select()}
                      onChange={e => setProdNuevo(p => ({ ...p, [k]: e.target.value }))} style={inp} {...extra} />
                  </div>
                )
                return (
                  <div style={{ marginTop: '8px', padding: '12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#166534', fontWeight: '700' }}>PRODUCTO NUEVO — precios con IVA incluido</p>
                    <label style={lbl}>Nombre</label>
                    <input autoFocus value={prodNuevo.nombre} onKeyDown={enter} onChange={e => setProdNuevo(p => ({ ...p, nombre: e.target.value }))} style={{ ...inp, marginBottom: '8px' }} />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {campo('precio', 'Precio de venta')}{campo('costo', 'Precio de compra')}{campo('existencia', 'Existencia (opc.)')}{campo('peso', 'Peso kg/unidad')}
                    </div>
                    {margen !== null && <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '700', color: margen < 0 ? C.err : margen < 10 ? '#BA7517' : '#166534' }}>Margen: {margen.toFixed(1)}% · Utilidad {fmt(pv - co)} por unidad</p>}
                    {prodNuevoError && <p style={{ margin: '0 0 8px', fontSize: '12px', color: C.err }}>{prodNuevoError}</p>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={guardarProdNuevo} disabled={!valido || guardandoProd} style={{ ...boton('#166534', valido && !guardandoProd), flex: 1 }}>{guardandoProd ? 'Guardando...' : 'Guardar y agregar'}</button>
                      <button onClick={() => setMostrarProdNuevo(false)} style={{ ...boton('#999'), background: 'white', color: '#444', border: '1px solid #ddd' }}>Cancelar</button>
                    </div>
                  </div>
                )
              })()}

              {(resultados.length > 0 || buscando || busqueda.trim()) && (
                <div style={{ position: 'absolute', top: '58px', left: '14px', right: '14px', background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 6px 16px rgba(0,0,0,.14)', zIndex: 100 }}>
                  {buscando && <p style={{ padding: '12px 16px', color: C.mut, margin: 0 }}>Buscando...</p>}
                  {resultados.map((p, idx) => (
                    <div key={p.id} onClick={() => agregarProducto(p)} onMouseEnter={() => setSel(idx)}
                      style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: idx === sel ? '#fff7ed' : 'white', borderLeft: idx === sel ? `3px solid ${C.acc}` : '3px solid transparent' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: C.ink }}>{p.nombre}</p>
                        <p style={{ margin: 0, fontSize: '12px', color: C.mut }}>{p.clave}{p.codigo_barras ? ` · ${p.codigo_barras}` : ''}</p>
                      </div>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: C.acc }}>{fmt(r2(p.precio_venta * IVA))}</p>
                    </div>
                  ))}
                  {!buscando && busqueda.trim() && (
                    <div onClick={abrirProdNuevo} style={{ padding: '10px 16px', cursor: 'pointer', background: '#f0fdf4', color: '#166534', fontSize: '13px', fontWeight: '700' }}>
                      {resultados.length === 0 ? 'Sin resultados — ' : ''}➕ Crear producto nuevo «{busqueda.trim()}»
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Carrito */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '15px', color: C.ink }}>
                  {editFolio ? `Cotización ${editFolio}` : 'Cotización nueva'} · {carrito.length} renglón{carrito.length === 1 ? '' : 'es'}
                </h3>
                {carrito.length > 0 && !soloLectura && (
                  <button onClick={() => { if (confirm('¿Quitar todos los productos?')) { setCarrito([]); inputRef.current?.focus() } }}
                    style={{ fontSize: '12px', color: C.err, background: 'none', border: 'none', cursor: 'pointer' }}>Limpiar todo</button>
                )}
              </div>
              {carrito.length === 0 ? (
                <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#aaa', margin: 0 }}>Busca un producto arriba para empezar a cotizar</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={th}>Producto</th>
                      <th style={{ ...th, textAlign: 'center', width: '150px' }}>Cantidad</th>
                      <th style={{ ...th, textAlign: 'right', width: '130px' }}>Precio</th>
                      <th style={{ ...th, textAlign: 'center', width: '80px' }} title="Utilidad sobre el costo. Edítala para fijar el precio">Util%</th>
                      <th style={{ ...th, textAlign: 'center', width: '90px' }}>Desc%</th>
                      <th style={{ ...th, textAlign: 'right', width: '110px' }}>Importe</th>
                      <th style={{ ...th, width: '36px' }}></th>
                    </tr></thead>
                    <tbody>
                      {carrito.map(item => {
                        const ef = precioEf(item)
                        const importe = r2(item.precio * item.cantidad * (1 - (item.descuento || 0) / 100))
                        const cu = costoUnit(item)
                        const pu = !item.esServicio && cu > 0 ? (ef - cu) / cu * 100 : null
                        const sinStock = !item.esServicio && item.existencia != null && item.existencia < item.cantidad
                        return (
                          <tr key={item.id}>
                            <td style={td}>
                              <div style={{ fontWeight: '600', color: C.ink }}>{item.esServicio && '🚚 '}{item.nombre}</div>
                              {!item.esServicio && (
                                <div style={{ fontSize: '12px', color: sinStock ? '#BA7517' : '#999' }}>
                                  {item.clave}{item.clave ? ' · ' : ''}Existencia: {item.existencia}{sinStock ? ' ⚠ menor a lo cotizado' : ''}
                                </div>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <button disabled={soloLectura} onClick={() => setCantidad(item.id, item.cantidad - 1)} style={{ width: '28px', height: '30px', borderRadius: '6px', border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: '16px', padding: 0 }}>−</button>
                                <input key={item.cantidad} ref={el => { if (el) cantRefs.current[item.id] = el }} defaultValue={item.cantidad} disabled={soloLectura}
                                  onFocus={e => e.target.select()}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); inputRef.current?.focus() } }}
                                  onBlur={e => {
                                    const v = parseFloat(e.target.value.replace(',', '.'))
                                    if (v > 0 && v !== item.cantidad) setCantidad(item.id, v)
                                    else e.target.value = item.cantidad
                                  }}
                                  style={{ width: '58px', padding: '6px 4px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '15px', fontWeight: '700' }} />
                                <button disabled={soloLectura} onClick={() => setCantidad(item.id, item.cantidad + 1)} style={{ width: '28px', height: '30px', borderRadius: '6px', border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: '16px', padding: 0 }}>+</button>
                              </div>
                            </td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              <input key={ef.toFixed(2)} defaultValue={ef.toFixed(2)} disabled={soloLectura}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); inputRef.current?.focus() } }}
                                onBlur={e => {
                                  const v = parseFloat(e.target.value.replace(/[$,]/g, ''))
                                  if (v > 0 && Math.abs(v - ef) > 0.005) setDescuento(item.id, Math.round((1 - v / item.precio) * 1000000) / 10000)
                                  else e.target.value = ef.toFixed(2)
                                }}
                                style={{ width: '92px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'right', fontSize: '14px' }} />
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              {pu !== null ? (
                                <input key={pu.toFixed(1)} defaultValue={pu.toFixed(1)} disabled={soloLectura}
                                  title="Utilidad sobre el costo: escribe 25 y el precio se ajusta"
                                  onFocus={e => e.target.select()}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); inputRef.current?.focus() } }}
                                  onBlur={e => {
                                    const v = parseFloat(e.target.value.replace(',', '.'))
                                    if (!isNaN(v) && v > -100 && Math.abs(v - pu) > 0.049) {
                                      const nuevo = r2(cu * (1 + v / 100))
                                      setDescuento(item.id, Math.round((1 - nuevo / item.precio) * 1000000) / 10000)
                                    } else e.target.value = pu.toFixed(1)
                                  }}
                                  style={{ width: '58px', padding: '6px 4px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: pu < 0 ? C.err : '#444' }} />
                              ) : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <input type="number" min="-1000" max="100" step="1" value={item.descuento || 0} disabled={soloLectura}
                                title="Negativo = recargo (ej. precio foráneo)"
                                onChange={e => setDescuento(item.id, parseFloat(e.target.value) || 0)}
                                onFocus={e => e.target.select()} onWheel={e => e.target.blur()}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.focus() } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.target.blur() } }}
                                style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '14px' }} />
                              {(item.descuento || 0) !== 0 && (
                                <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '2px', color: item.descuento > 0 ? C.err : '#0C447C', whiteSpace: 'nowrap' }}>→ {fmt(ef)} c/u</div>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: '700', fontSize: '15px' }}>
                              {fmt(importe)}
                              
                            </td>
                            <td style={td}>
                              {!soloLectura && <button onClick={() => quitar(item.id)} title="Quitar" style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: '16px' }}>✕</button>}
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

          {/* Columna derecha: datos + resumen + acciones */}
          <div style={{ flex: '0 0 330px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={card}>
              <label style={lbl}>Cliente</label>
              {cliente ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f0f7ff', borderRadius: '8px', marginBottom: '8px' }}>
                  <div><div style={{ fontWeight: '700', fontSize: '14px' }}>{cliente.nombre}</div>{cliente.rfc && <div style={{ fontSize: '12px', color: C.mut }}>RFC {cliente.rfc}</div>}</div>
                  {!soloLectura && <button onClick={() => setCliente(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}>✕</button>}
                </div>
              ) : (
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <input value={busqCliente} disabled={soloLectura} onChange={e => setBusqCliente(e.target.value)} placeholder="Buscar cliente registrado..." style={inp} />
                  {clientesRes.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,.12)', zIndex: 50 }}>
                      {clientesRes.map(c => (
                        <div key={c.id} onClick={() => { setCliente(c); setBusqCliente(''); setClientesRes([]) }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                          <b>{c.nombre}</b>{c.rfc ? <span style={{ color: C.mut }}> · {c.rfc}</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <label style={lbl}>A nombre de (opcional)</label>
              <input value={nombreCliente} disabled={soloLectura} onChange={e => setNombreCliente(e.target.value)}
                placeholder={cliente?.nombre || contacto?.nombre || 'Público en general'} style={inp} />
              <p style={{ margin: '5px 0 0', fontSize: '11px', color: C.mut }}>Se imprime: <b>{nombreMostrado}</b></p>
            </div>

            <div style={card}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                <input type="checkbox" checked={esEnvio} disabled={soloLectura} onChange={e => alternarEnvio(e.target.checked)} style={{ width: '17px', height: '17px' }} />
                🚚 Es para envío
              </label>
              {esEnvio && (
                <div style={{ marginTop: '10px' }}>
                  {contacto ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f6f6ff', borderRadius: '8px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '13px' }}><b>{contacto.nombre}</b>{contacto.telefono ? <span style={{ color: C.mut }}> · {contacto.telefono}</span> : null}</div>
                      {!soloLectura && <button onClick={() => setContacto(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}>✕</button>}
                    </div>
                  ) : creandoContacto ? (
                    <div style={{ padding: '10px', background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '8px' }}>
                      {[['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['colonia', 'Colonia'], ['direccion', 'Dirección']].map(([k, l]) => (
                        <input key={k} value={nuevoContacto[k]} placeholder={l} onChange={e => setNuevoContacto(p => ({ ...p, [k]: e.target.value }))} style={{ ...inp, marginBottom: '6px', padding: '6px 9px', fontSize: '13px' }} />
                      ))}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={crearContacto} disabled={!nuevoContacto.nombre.trim()} style={{ ...boton(C.ink, !!nuevoContacto.nombre.trim()), flex: 1, padding: '7px' }}>Guardar contacto</button>
                        <button onClick={() => setCreandoContacto(false)} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}>×</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', marginBottom: '8px' }}>
                      <input value={busqContacto} disabled={soloLectura} onChange={e => setBusqContacto(e.target.value)} placeholder="Buscar contacto de entrega..." style={inp} />
                      {(contactosRes.length > 0 || busqContacto.trim()) && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,.12)', zIndex: 50 }}>
                          {contactosRes.map(c => (
                            <div key={c.id} onClick={() => elegirContacto(c)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                              <b>{c.nombre}</b><span style={{ color: C.mut }}>{c.colonia ? ` · ${c.colonia}` : ''}</span>
                            </div>
                          ))}
                          <div onClick={() => { setNuevoContacto({ nombre: busqContacto, telefono: '', colonia: '', direccion: '' }); setCreandoContacto(true) }}
                            style={{ padding: '8px 12px', cursor: 'pointer', color: '#166534', background: '#f0fdf4', fontSize: '13px', fontWeight: '700' }}>➕ Crear contacto «{busqContacto.trim()}»</div>
                        </div>
                      )}
                    </div>
                  )}
                  <label style={lbl}>Dirección de entrega</label>
                  <textarea rows={2} value={direccion} disabled={soloLectura} onChange={e => setDireccion(e.target.value)} style={{ ...inp, resize: 'vertical' }} />
                </div>
              )}
            </div>

            <div style={card}>
              <label style={lbl}>Notas (se imprimen)</label>
              <textarea rows={3} value={notas} disabled={soloLectura} onChange={e => setNotas(e.target.value)}
                placeholder="Ej. el cliente pide marca específica, entregar por la tarde..." style={{ ...inp, resize: 'vertical' }} />
              <label style={{ ...lbl, marginTop: '8px' }}>Nota interna (no se imprime)</label>
              <textarea rows={2} value={notasInt} disabled={soloLectura} onChange={e => setNotasInt(e.target.value)} style={{ ...inp, resize: 'vertical' }} />
              <label style={{ ...lbl, marginTop: '8px' }}>Vigente hasta</label>
              <input type="date" value={vigHasta} disabled={soloLectura} onChange={e => setVigHasta(e.target.value)} style={inp} />
            </div>

            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#666' }}>Descuento global %</span>
                <input type="number" min="0" max="100" step="1" value={descGlobal} disabled={soloLectura}
                  title="Aplica el mismo % a todos los productos (no a fletes ni servicios)"
                  onChange={e => { const v = parseFloat(e.target.value) || 0; setDescGlobal(v); setCarrito(prev => prev.map(i => i.esServicio ? i : { ...i, descuento: v })) }}
                  onFocus={e => e.target.select()} onWheel={e => e.target.blur()}
                  style={{ width: '64px', padding: '5px 6px', borderRadius: '6px', border: '1px solid #ddd', textAlign: 'center', fontSize: '14px' }} />
              </div>
              {t.descuento > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: C.err }}><span>Descuento</span><span>-{fmt(t.descuento)}</span></div>}
              {t.recargo > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#0C447C' }}><span>Recargo</span><span>+{fmt(t.recargo)}</span></div>}
              {t.peso > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', marginTop: '4px' }}><span>⚖ Peso aprox.</span><span>{t.peso.toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg</span></div>}
              {lineasProd.length > 0 && !soloLectura && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>Total deseado</span>
                  <input type="number" min="0" value={totalDeseado} placeholder={t.total.toFixed(2)}
                    onChange={e => setTotalDeseado(e.target.value)} onFocus={e => e.target.select()} onWheel={e => e.target.blur()}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicarTotalDeseado() } }}
                    title="Escribe el total redondo que quieres cobrar y Enter: se calcula el descuento"
                    style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', textAlign: 'right' }} />
                  <button onClick={aplicarTotalDeseado} disabled={!(parseFloat(totalDeseado) > 0)} style={{ ...boton(C.ink, parseFloat(totalDeseado) > 0), padding: '6px 10px', fontSize: '12px' }}>Aplicar</button>
                </div>
              )}
              {costoTot > 0 && (
                <div style={{ marginTop: '6px', padding: '6px 8px', borderRadius: '6px', background: '#f7f7f7', fontSize: '12px', color: utilidad < 0 ? C.err : '#666' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Costo (interno)</span><span>{fmt(costoTot)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}><span>Utilidad</span><span>{fmt(utilidad)}{utilPct !== null ? ` · ${utilPct.toFixed(1)}%` : ''}</span></div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>TOTAL</span>
                <span style={{ fontSize: '26px', fontWeight: '800', color: C.acc }}>{fmt(t.total)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => guardar()} disabled={guardando || soloLectura || carrito.length === 0} style={{ ...boton(C.ink, !guardando && !soloLectura && carrito.length > 0), padding: '13px' }}>
                {guardando ? 'Guardando...' : '💾 Guardar'} <span style={{ opacity: .6, fontSize: '11px' }}>F2</span>
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => imprimir('carta')} disabled={guardando || carrito.length === 0} style={{ ...boton('#534AB7', !guardando && carrito.length > 0), flex: 1 }}>🖨 Carta <span style={{ opacity: .6, fontSize: '11px' }}>F4</span></button>
                <button onClick={() => imprimir('termico')} disabled={guardando || carrito.length === 0} style={{ ...boton('#0C447C', !guardando && carrito.length > 0), flex: 1 }}>🧾 Ticket</button>
              </div>
              <button onClick={aCaja} disabled={guardando || soloLectura || carrito.length === 0} style={{ ...boton(C.ok, !guardando && !soloLectura && carrito.length > 0), padding: '13px' }}>
                → Enviar a Caja <span style={{ opacity: .7, fontSize: '11px' }}>F8</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cotizaciones abiertas (pestañas) */}
      {vista === 'captura' && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 20, marginTop: '14px', padding: '8px', background: '#e9ecf1', borderRadius: '10px', border: `1px solid ${C.line}`, display: 'flex', gap: '6px', alignItems: 'stretch', overflowX: 'auto' }}>
          {tabs.map((t, n) => {
            const inf = infoPestana(t); const act = t.id === tabActiva
            return (
              <div key={t.id} onClick={() => irAPestana(t.id)} title={inf.nom || ''}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', flex: '0 0 auto', minWidth: '130px', maxWidth: '230px',
                  background: act ? 'white' : '#f4f5f8', border: `2px solid ${act ? C.acc : 'transparent'}`, boxShadow: act ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    📄 {inf.folio || `Nueva ${n + 1}`}
                  </div>
                  <div style={{ fontSize: '11px', color: '#777', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inf.n > 0 ? `${fmt(inf.total)}${inf.nom ? ' · ' + inf.nom : ''}` : (inf.nom || 'vacía')}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); cerrarPestana(t.id) }} title="Cerrar pestaña (la cotización queda guardada)"
                  style={{ border: 'none', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px', padding: '2px' }}>✕</button>
              </div>
            )
          })}
          <button onClick={pestanaNueva} title="Abrir otra cotización" style={{ flex: '0 0 auto', padding: '0 16px', borderRadius: '8px', border: '1px dashed #aaa', background: 'transparent', fontSize: '20px', color: '#666', cursor: 'pointer' }}>+</button>
        </div>
      )}
    </div>
  )
}
