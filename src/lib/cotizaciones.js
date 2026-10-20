// Lógica compartida de Cotizaciones — usada por la pantalla de Cotizaciones y por Caja.
import { supabase } from './supabase'
import { getSucursalId, cargarEncabezado } from './config'

export const IVA = 1.16
export const r2 = n => Math.round((Number(n) || 0) * 100) / 100

// Precio final de una línea (precio base con IVA menos descuento %; negativo = recargo)
export const precioFinal = (precio, desc) => r2(precio * (1 - (desc || 0) / 100))

// Fecha local YYYY-MM-DD (no UTC, para que "hoy" sea el de Chiapas)
export const hoyISO = (offsetDias = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return d.toLocaleDateString('en-CA')
}

// Mismos cálculos que Caja (precios con IVA incluido, sin desglose)
export function calcularTotales(carrito) {
  const subtotal = r2(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0))
  const neto     = r2(carrito.reduce((s, i) => s + i.precio * i.cantidad * ((i.descuento || 0) / 100), 0))
  const descuento = r2(carrito.reduce((s, i) => s + ((i.descuento || 0) > 0 ? i.precio * i.cantidad * (i.descuento / 100) : 0), 0))
  const recargo   = r2(carrito.reduce((s, i) => s + ((i.descuento || 0) < 0 ? i.precio * i.cantidad * (-i.descuento / 100) : 0), 0))
  const total = r2(subtotal - neto)
  const peso  = carrito.reduce((s, i) => s + (i.esServicio ? 0 : (i.peso || 0) * i.cantidad), 0)
  return { subtotal, descuento, recargo, total, peso }
}

// Precios alternos (P2/P3) con IVA, para las etiquetas del carrito
export function preciosAlternos(p) {
  return [[p.precio_2, p.mayoreo_2, 'P2'], [p.precio_3, p.mayoreo_3, 'P3']]
    .filter(([pr]) => parseFloat(pr) > 0)
    .map(([pr, my, et]) => ({ et, precio: r2(parseFloat(pr) * IVA), min: parseFloat(my) || 0 }))
}

/** Guarda (crea o edita) una cotización completa. Devuelve { id, folio, rev, total }. */
export async function guardarCotizacion(d) {
  const t = calcularTotales(d.carrito)
  const nombre = (d.nombreCliente || '').trim() || d.cliente?.nombre || d.contacto?.nombre || ''
  const cot = {
    id: d.id || null,
    sucursal_id: getSucursalId(),
    cliente_id: d.cliente?.id || null,
    contacto_id: d.contacto?.id || null,
    nombre_cliente: nombre,
    telefono: d.contacto?.telefono || d.cliente?.telefono || '',
    es_envio: !!d.esEnvio,
    direccion_entrega: d.esEnvio ? (d.direccion || '') : '',
    notas: d.notas || '',
    notas_internas: d.notasInt || '',
    descuento_global: d.descGlobal || 0,
    subtotal: t.subtotal, descuento: t.descuento, recargo: t.recargo, total: t.total,
    peso_total: Math.round(t.peso * 1000) / 1000,
    vigente_hasta: d.vigHasta,
  }
  const items = d.carrito.map((i, idx) => ({
    orden: idx,
    producto_id: i.esServicio ? null : i.id,
    nombre_producto: i.nombre,
    clave: i.clave || null,
    unidad: i.unidad || null,
    cantidad: i.cantidad,
    precio_unitario: i.precio,
    descuento_pct: i.descuento || 0,
    subtotal: r2((i.precio - i.precio * (i.descuento || 0) / 100) * i.cantidad),
    costo_unitario: i.esServicio ? 0 : r2((i.costo || 0) / (i.factor || 1)),
    peso_unitario: i.esServicio ? 0 : (i.peso || 0),
    es_servicio: !!i.esServicio,
  }))
  const { data, error } = await supabase.rpc('guardar_cotizacion', { p_cot: cot, p_items: items })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return { id: row.out_id, folio: row.out_folio, rev: row.out_rev, total: t.total }
}

/** Carga una cotización con sus renglones vigentes (última revisión). */
export async function cargarCotizacion(id) {
  const { data: cot, error } = await supabase
    .from('cotizaciones').select('*, cliente:clientes(*), contacto:contactos(*)').eq('id', id).single()
  if (error) throw new Error(error.message)
  const { data: items, error: eI } = await supabase
    .from('cotizacion_items').select('*').eq('cotizacion_id', id).eq('rev', cot.rev).order('orden')
  if (eI) throw new Error(eI.message)
  return { cot, items: items || [] }
}

/**
 * Convierte los renglones guardados en el formato de carrito de Caja/Cotizaciones.
 * Respeta el precio cotizado; si el precio actual del catálogo es distinto, lo reporta en `avisos`.
 */
export async function cotizacionACarrito(cot, items) {
  const ids = items.filter(i => i.producto_id).map(i => i.producto_id)
  const prods = {}
  if (ids.length) {
    const { data } = await supabase.from('productos')
      .select('id, precio_venta, costo, factor, peso_kg, unidad, activo, precio_2, mayoreo_2, precio_3, mayoreo_3, inventario(existencia, sucursal_id)')
      .in('id', ids)
    ;(data || []).forEach(p => { prods[p.id] = p })
  }
  const avisos = []
  const carrito = items.map(it => {
    if (it.es_servicio) {
      return {
        id: `flete-${it.id}`, nombre: it.nombre_producto, clave: null, clave_alterna: null,
        precio: Number(it.precio_unitario), costo: 0, factor: 1, existencia: null,
        cantidad: Number(it.cantidad), descuento: Number(it.descuento_pct) || 0, esServicio: true,
      }
    }
    const p = prods[it.producto_id]
    const cotizado = Number(it.precio_unitario)
    if (!p || p.activo === false) {
      avisos.push({ nombre: it.nombre_producto, faltante: true })
    } else {
      const actual = r2(p.precio_venta * IVA)
      if (Math.abs(actual - cotizado) > 0.005) avisos.push({ nombre: it.nombre_producto, cotizado, actual })
    }
    return {
      id: it.producto_id, nombre: it.nombre_producto, clave: it.clave, clave_alterna: null,
      precio: cotizado,
      costo: p ? p.costo : Number(it.costo_unitario) || 0,
      factor: p ? (p.factor || 1) : 1,
      peso: Number(it.peso_unitario) || parseFloat(p?.peso_kg) || 0,
      unidad: it.unidad || p?.unidad || null,
      existencia: p?.inventario?.find(x => x.sucursal_id === getSucursalId())?.existencia ?? 0,
      alt: p ? preciosAlternos(p) : [],
      cantidad: Number(it.cantidad), descuento: Number(it.descuento_pct) || 0,
    }
  })
  return { carrito, avisos }
}

/** Deja el carrito de Caja listo con esta cotización (lo que había en Caja pasa a "en espera"). */
export function enviarACaja({ cot, carrito, contacto, cliente, avisos }) {
  try {
    const actual = JSON.parse(localStorage.getItem('pos_carrito') || '[]')
    if (actual.length > 0) {
      const espera = JSON.parse(localStorage.getItem('pos_en_espera') || '[]')
      espera.push({
        id: Date.now(),
        hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        carrito: actual,
        contacto: JSON.parse(localStorage.getItem('pos_contacto') || 'null'),
        cliente: JSON.parse(localStorage.getItem('pos_cliente') || 'null'),
        descuentoGlobal: 0,
      })
      localStorage.setItem('pos_en_espera', JSON.stringify(espera))
    }
  } catch { /* si el almacenamiento falla, seguimos */ }
  localStorage.setItem('pos_carrito', JSON.stringify(carrito))
  if (contacto) localStorage.setItem('pos_contacto', JSON.stringify(contacto)); else localStorage.removeItem('pos_contacto')
  if (cliente) localStorage.setItem('pos_cliente', JSON.stringify(cliente)); else localStorage.removeItem('pos_cliente')
  localStorage.setItem('pos_cotizacion', JSON.stringify({ id: cot.id, folio: cot.folio, avisos: avisos || [] }))
}

/** Marca la cotización como convertida en venta (se llama al cobrar en Caja). */
export async function marcarConvertida(cotizacionId, ventaId) {
  const { error } = await supabase.from('cotizaciones')
    .update({ estado: 'convertida', venta_id: ventaId, convertida_at: new Date().toISOString() })
    .eq('id', cotizacionId).eq('estado', 'vigente')
  return !error
}

export async function cancelarCotizacion(id) {
  const { error } = await supabase.from('cotizaciones').update({ estado: 'cancelada' }).eq('id', id).eq('estado', 'vigente')
  if (error) throw new Error(error.message)
}

/** Lista para la pantalla de Cotizaciones y para el selector de Caja. */
export async function buscarCotizaciones({ q = '', estado = 'vigentes', limite = 60 } = {}) {
  const hoy = hoyISO()
  let query = supabase.from('cotizaciones')
    .select('id, folio, estado, nombre_cliente, total, peso_total, vigente_hasta, created_at, es_envio, notas')
    .order('created_at', { ascending: false }).limit(limite)
  if (estado === 'vigentes')        query = query.eq('estado', 'vigente').gte('vigente_hasta', hoy)
  else if (estado === 'vencidas')   query = query.eq('estado', 'vigente').lt('vigente_hasta', hoy)
  else if (estado === 'convertidas') query = query.eq('estado', 'convertida')
  else if (estado === 'canceladas') query = query.eq('estado', 'cancelada')
  const t = q.trim().replace(/[,%()]/g, ' ')
  if (t) query = query.or(`folio.ilike.%${t}%,nombre_cliente.ilike.%${t}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export function estadoVisible(c) {
  if (c.estado === 'vigente' && c.vigente_hasta < hoyISO()) return 'vencida'
  return c.estado
}

/** Arma todos los datos que necesitan los formatos impresos (carta y ticket). */
export async function prepararImpresion(cot, items) {
  const [enc, vend] = await Promise.all([
    cargarEncabezado(cot.sucursal_id || getSucursalId()),
    cot.usuario_id
      ? supabase.from('usuarios').select('nombre').eq('id', cot.usuario_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return {
    folio: cot.folio,
    fecha: cot.created_at,
    vigenteHasta: cot.vigente_hasta,
    nombre: cot.nombre_cliente || cot.cliente?.nombre || cot.contacto?.nombre || 'Público en general',
    rfc: cot.cliente?.rfc || '',
    telefono: cot.telefono || '',
    esEnvio: !!cot.es_envio,
    direccion: cot.es_envio ? (cot.direccion_entrega || '') : '',
    items: items.map(it => ({
      clave: it.es_servicio ? '' : (it.clave || ''),
      nombre: it.nombre_producto,
      unidad: it.es_servicio ? '' : (it.unidad || 'PZA'),
      cantidad: Number(it.cantidad),
      precio: precioFinal(Number(it.precio_unitario), Number(it.descuento_pct)),
      importe: Number(it.subtotal),
    })),
    total: Number(cot.total),
    descuento: Number(cot.descuento) || 0,
    recargo: Number(cot.recargo) || 0,
    pesoTotal: Number(cot.peso_total) || 0,
    notas: cot.notas || '',
    condiciones: (enc.condiciones || '').split('\n').map(s => s.trim()).filter(Boolean),
    datosBancarios: enc.datosBancarios || '',
    enc,
    vendedor: vend?.data?.nombre || '',
  }
}
