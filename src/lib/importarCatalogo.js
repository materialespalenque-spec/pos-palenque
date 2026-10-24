// Importa la exportación de artículos de SICAR: catálogo (precios, altas, bajas) y existencias por sucursal.
// Mismas reglas que sincronizar_catalogo_v4.py, más las existencias.
import { supabase } from './supabase'

const NEGOCIO_ID = 'b69b5ee8-b22a-426c-8426-cdf758a12b95'
const TOL = 0.00005
const TOL_EXIST = 0.0005
export const LIMITE_DESACTIVAR = 0.20
const CAMPOS_PRECIO = ['precio_venta', 'costo', 'precio_2', 'mayoreo_2', 'precio_3', 'mayoreo_3']
const REQUERIDAS = ['CLAVE', 'DESCRIPCION', 'PRECIO COMPRA', 'PRECIO 1']

const num = v => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
const texto = v => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isInteger(v)) v = String(v)
  const t = String(v).trim()
  return t || null
}
const distinto = (a, b) => Math.abs((num(a) || 0) - (num(b) || 0)) > TOL
const esSi = v => v === true || ['S', 'SI', 'SÍ', 'TRUE', '1'].includes(String(v ?? '').trim().toUpperCase())

/** ¿Las filas (header:1) son la exportación de artículos? Devuelve el índice del renglón de encabezados o -1. */
export function buscarEncabezado(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const celdas = (rows[i] || []).map(c => String(c ?? '').trim().toUpperCase())
    if (REQUERIDAS.every(c => celdas.includes(c))) return i
  }
  return -1
}

/** Convierte las filas del Excel en { clave: producto }. */
export function leerArticulos(rows, idxEnc) {
  const enc = rows[idxEnc].map(c => String(c ?? '').trim().toUpperCase())
  const col = nombre => enc.indexOf(nombre)
  const ix = Object.fromEntries(['CLAVE', 'CLAVE ALTERNA', 'DESCRIPCION', 'SERVICIO (S/N)', 'INV_MIN', 'PRECIO COMPRA', 'PRECIO 1', 'PRECIO 2', 'MAYOREO 2', 'PRECIO 3', 'MAYOREO 3', 'EXIST.', 'PESO'].map(n => [n, col(n)]))
  const get = (r, n) => (ix[n] >= 0 ? r[ix[n]] : null)
  const productos = {}
  let repetidas = 0, sinNombre = 0
  for (let i = idxEnc + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const clave = texto(get(r, 'CLAVE')), nombre = texto(get(r, 'DESCRIPCION'))
    if (!clave && !nombre) continue
    if (!clave || !nombre) { sinNombre++; continue }
    if (productos[clave]) repetidas++
    productos[clave] = {
      clave, nombre,
      codigo_barras: texto(get(r, 'CLAVE ALTERNA')),
      servicio: esSi(get(r, 'SERVICIO (S/N)')),
      precio_venta: num(get(r, 'PRECIO 1')) || 0,
      costo: num(get(r, 'PRECIO COMPRA')) || 0,
      precio_2: num(get(r, 'PRECIO 2')) || 0, mayoreo_2: num(get(r, 'MAYOREO 2')) || 0,
      precio_3: num(get(r, 'PRECIO 3')) || 0, mayoreo_3: num(get(r, 'MAYOREO 3')) || 0,
      peso_kg: num(get(r, 'PESO')) || 0,
      existencia: num(get(r, 'EXIST.')),
      minimo: num(get(r, 'INV_MIN')) || 0,
    }
  }
  return { productos, repetidas, sinNombre }
}

async function leerTodo(consulta) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return filas
}

/** Compara el Excel contra la base. No escribe nada. */
export async function calcularCambios(excel, { sucursalId, actualizarCatalogo }) {
  const db = await leerTodo(() => supabase.from('productos')
    .select('id, clave, nombre, codigo_barras, precio_venta, costo, precio_2, mayoreo_2, precio_3, mayoreo_3, peso_kg, activo, pendiente_revision')
    .eq('negocio_id', NEGOCIO_ID).order('id'))
  const inv = await leerTodo(() => supabase.from('inventario')
    .select('id, producto_id, existencia, minimo').eq('sucursal_id', sucursalId).order('id'))
  const invPorProducto = new Map(inv.map(i => [i.producto_id, i]))
  const porClave = new Map(db.filter(p => p.clave).map(p => [p.clave, p]))
  const r = { actualizar: [], reactivar: [], desactivar: [], nuevos: [], peso: [], existencias: [], sinCatalogo: 0, dbActivos: db.filter(p => p.activo).length, extremas: 0 }

  for (const x of Object.values(excel)) {
    const p = porClave.get(x.clave)
    if (!p) {
      if (actualizarCatalogo) r.nuevos.push(x)
      else r.sinCatalogo++
      continue
    }
    if (actualizarCatalogo) {
      const cambios = {}
      for (const c of CAMPOS_PRECIO) if (distinto(x[c], p[c])) cambios[c] = [num(p[c]), x[c]]
      if ((x.codigo_barras || null) !== (p.codigo_barras || null)) cambios.codigo_barras = [p.codigo_barras, x.codigo_barras]
      if (Object.keys(cambios).length) r.actualizar.push({ p, cambios })
      if (!p.activo) r.reactivar.push(p)
      if (x.peso_kg > 0 && !((num(p.peso_kg) || 0) > 0)) r.peso.push({ p, peso: x.peso_kg })
    }
    // Existencias de la sucursal elegida (los servicios no llevan inventario)
    if (!x.servicio && x.existencia !== null) {
      const i = invPorProducto.get(p.id)
      if (!i || Math.abs((num(i.existencia) || 0) - x.existencia) > TOL_EXIST || Math.abs((num(i.minimo) || 0) - x.minimo) > TOL_EXIST) {
        r.existencias.push({ producto: p, antes: i ? num(i.existencia) : null, despues: x.existencia, minimo: x.minimo })
      }
      if (Math.abs(x.existencia) > 100000) r.extremas++
    }
  }
  if (actualizarCatalogo) {
    for (const p of db) {
      if (p.activo && !p.pendiente_revision && p.clave && !excel[p.clave]) r.desactivar.push(p)
    }
  }
  r.excesoBajas = r.dbActivos > 0 && r.desactivar.length > Math.max(50, r.dbActivos * LIMITE_DESACTIVAR)
  return r
}

export function reporteCSV(r) {
  const filas = [['accion', 'clave', 'producto', 'campo', 'antes', 'despues']]
  r.actualizar.forEach(({ p, cambios }) => Object.entries(cambios).forEach(([c, [a, d]]) => filas.push(['ACTUALIZAR', p.clave, p.nombre, c, a ?? '', d ?? ''])))
  r.reactivar.forEach(p => filas.push(['REACTIVAR', p.clave, p.nombre, 'activo', 'no', 'si']))
  r.desactivar.forEach(p => filas.push(['DESACTIVAR', p.clave, p.nombre, 'activo', 'si', 'no']))
  r.nuevos.forEach(x => filas.push(['NUEVO', x.clave, x.nombre, 'precio_venta', '', x.precio_venta]))
  r.peso.forEach(({ p, peso }) => filas.push(['PESO NUEVO', p.clave, p.nombre, 'peso_kg', '', peso]))
  r.existencias.forEach(e => filas.push(['EXISTENCIA', e.producto.clave, e.producto.nombre, 'existencia', e.antes ?? '', e.despues]))
  const esc = v => `"${String(v).replace(/"/g, '""')}"`
  return '﻿' + filas.map(f => f.map(esc).join(',')).join('\r\n')
}

const lotes = (lista, n) => { const o = []; for (let i = 0; i < lista.length; i += n) o.push(lista.slice(i, i + n)); return o }

async function enParalelo(tareas, concurrencia, alAvanzar) {
  let i = 0, hechas = 0
  const errores = []
  async function worker() {
    while (i < tareas.length) {
      const t = tareas[i++]
      try { await t() } catch (e) { errores.push(e.message) }
      hechas++
      alAvanzar?.(hechas, tareas.length)
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, worker))
  return errores
}

/** Aplica los cambios calculados. Devuelve { errores: [...] }. */
export async function aplicarCambios(r, excel, { sucursalId, nombreArchivo, progreso = () => {} }) {
  const errores = []
  const sumar = e => errores.push(...e)

  // 1. Precios / costo / código de barras
  if (r.actualizar.length) {
    sumar(await enParalelo(r.actualizar.map(({ p, cambios }) => async () => {
      const cuerpo = Object.fromEntries(Object.entries(cambios).map(([c, [, nuevo]]) => [c, nuevo]))
      const { error } = await supabase.from('productos').update(cuerpo).eq('id', p.id)
      if (error) throw new Error(`${p.clave}: ${error.message}`)
    }), 8, (h, t) => progreso(`Actualizando precios… ${h}/${t}`)))
  }
  // 2. Reactivar / desactivar
  for (const [lista, valor, et] of [[r.reactivar, true, 'Reactivando'], [r.desactivar, false, 'Desactivando']]) {
    for (const lote of lotes(lista.map(p => p.id), 80)) {
      progreso(`${et} productos…`)
      const { error } = await supabase.from('productos').update({ activo: valor }).in('id', lote)
      if (error) errores.push(`${et}: ${error.message}`)
    }
  }
  // 3. Pesos que estaban vacíos
  if (r.peso.length) {
    sumar(await enParalelo(r.peso.map(({ p, peso }) => async () => {
      const { error } = await supabase.from('productos').update({ peso_kg: peso }).eq('id', p.id)
      if (error) throw new Error(`${p.clave}: ${error.message}`)
    }), 8, (h, t) => progreso(`Rellenando pesos… ${h}/${t}`)))
  }
  // 4. Productos nuevos (y su existencia)
  const idNuevos = new Map()
  for (const lote of lotes(r.nuevos, 200)) {
    progreso(`Insertando productos nuevos… ${idNuevos.size}/${r.nuevos.length}`)
    const registros = lote.map(x => ({
      negocio_id: NEGOCIO_ID, nombre: x.nombre, clave: x.clave, codigo_barras: x.codigo_barras,
      precio_venta: x.precio_venta, costo: x.costo, precio_2: x.precio_2, mayoreo_2: x.mayoreo_2,
      precio_3: x.precio_3, mayoreo_3: x.mayoreo_3, peso_kg: x.peso_kg || null,
      tasa_iva: 0.16, activo: true, factor: 1, clave_sat: '01010101', unidad_sat: 'H87',
    }))
    const { data, error } = await supabase.from('productos').insert(registros).select('id, clave')
    if (error) { errores.push(`Nuevos: ${error.message}`); continue }
    ;(data || []).forEach(d => idNuevos.set(d.clave, d.id))
  }
  // 5. Existencias de la sucursal
  const filasInv = r.existencias.map(e => ({ producto_id: e.producto.id, sucursal_id: sucursalId, existencia: e.despues, minimo: e.minimo }))
  for (const x of r.nuevos) {
    const id = idNuevos.get(x.clave)
    if (id && !x.servicio && x.existencia !== null) filasInv.push({ producto_id: id, sucursal_id: sucursalId, existencia: x.existencia, minimo: x.minimo })
  }
  let hechas = 0
  for (const lote of lotes(filasInv, 400)) {
    progreso(`Guardando existencias… ${hechas}/${filasInv.length}`)
    const { error } = await supabase.from('inventario').upsert(lote.map(f => ({ ...f, updated_at: new Date().toISOString() })), { onConflict: 'producto_id,sucursal_id' })
    if (error) errores.push(`Existencias: ${error.message}`)
    hechas += lote.length
  }
  // Bitácora (si la tabla lo permite)
  await supabase.from('sicar_sync').insert({ negocio_id: NEGOCIO_ID, archivo: nombreArchivo, productos_nuevos: idNuevos.size, errores: errores.length ? errores.slice(0, 5).join(' | ') : null }).then(() => {}, () => {})
  return { errores, nuevosCreados: idNuevos.size, existenciasGuardadas: filasInv.length }
}
