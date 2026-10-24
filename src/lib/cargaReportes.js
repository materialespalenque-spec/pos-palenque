// Procesa los reportes de SICAR (utilidades, ventas generales, canceladas).
// Generado a partir de la logica de Reportes > Cargar, sin cambios de reglas.
import { supabase } from './supabase'

const NEGOCIO_ID = 'b69b5ee8-b22a-426c-8426-cdf758a12b95'

function parsearFechaISO(fechaStr) {
  // Soporta: "2026-06-01 07:55:45", "2026-06-01T07:55:45", "2026-06-01"
  if (!fechaStr) return null
  const s = fechaStr.toString().trim()
  // Formato YYYY-MM-DD HH:MM:SS o YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.replace(' ', 'T')
    const d = new Date(iso)
    if (!isNaN(d.getTime())) return d.toISOString()
    // Si falla, usar solo la fecha
    return new Date(s.slice(0, 10) + 'T12:00:00').toISOString()
  }
  // Formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [d, m, y] = s.split('/')
    return new Date(`${y}-${m}-${d}T12:00:00`).toISOString()
  }
  return new Date().toISOString()
}


/** Devuelve 'utilidades' | 'general' | 'canceladas' | null segun el contenido (filas con header:1). */
export function detectarReporte(rows) {
  if (rows.some(r => r[0]?.toString().includes('Reporte de Ventas Canceladas'))) return 'canceladas'
  if (rows.some(r => r[0]?.toString().trim() === 'Tickets' && r[19])) return 'utilidades'
  if (rows.some(r => r[0]?.toString().trim() === 'Ticket' && r[32] !== undefined)) return 'general'
  return null
}

export async function procesarReporte(rows, tipo, { userId, sucursalId, setProgreso = () => {} }) {
  const esUtilidades = tipo === 'utilidades'
  const esGeneral = tipo === 'general'
  const esCanceladas = tipo === 'canceladas'
  let resultado = null
    const limpiar = v => {
      if (!v) return 0
      return parseFloat(v.toString().replace(/[$,]/g, '').trim()) || 0
    }
    const parseFechaUtil = v => {
      if (!v) return null
      const s = v.toString().slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d,m,y] = s.split('/'); return `${y}-${m}-${d}` }
      return null
    }
    const parseFechaCanc = v => {
      if (!v) return null
      const partes = v.toString().split(' ')[0].split('/')
      if (partes.length < 3) return null
      return `${partes[2]}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}`
    }

    let diasUtilidad = {}, mesesUtilidad = {}, diasPagos = {}, diasCanc = {}
    let ticketsNuevos = []

    if (esUtilidades) {
      setProgreso('Procesando reporte de utilidades...')
      for (const row of rows) {
        if (row[0]?.toString().trim() !== 'Tickets') continue
        const fecha = parseFechaUtil(row[4])
        if (!fecha) continue
        const mes = fecha.slice(0, 7)
        const ventas = limpiar(row[19]), compras = limpiar(row[24])
        if (ventas <= 0) continue
        if (!diasUtilidad[fecha]) diasUtilidad[fecha] = { tickets: 0, ventas: 0, compras: 0 }
        diasUtilidad[fecha].tickets++; diasUtilidad[fecha].ventas += ventas; diasUtilidad[fecha].compras += compras
        if (!mesesUtilidad[mes]) mesesUtilidad[mes] = { tickets: 0, ventas: 0, compras: 0 }
        mesesUtilidad[mes].tickets++; mesesUtilidad[mes].ventas += ventas; mesesUtilidad[mes].compras += compras
      }
    }

    if (esGeneral) {
      setProgreso('Procesando reporte general de ventas...')
      for (const row of rows) {
        if (row[0]?.toString().trim() !== 'Ticket') continue
        const fechaOriginal = row[3]?.toString().trim() || ''
        const fecha = parseFechaUtil(fechaOriginal)
        if (!fecha) continue
        const total = limpiar(row[30])
        if (total <= 0) continue
        const sicarId = parseInt(row[5])
        const estado  = row[26]?.toString().trim()
        if (estado !== 'V') continue

        // Pagos por día
        if (!diasPagos[fecha]) diasPagos[fecha] = { efectivo: 0, cheque: 0, credito: 0, transferencia: 0, tarjeta: 0, otros: 0, total: 0 }
        diasPagos[fecha].efectivo      += limpiar(row[32])
        diasPagos[fecha].cheque        += limpiar(row[33])
        diasPagos[fecha].credito       += limpiar(row[34])
        diasPagos[fecha].transferencia += limpiar(row[35])
        diasPagos[fecha].tarjeta       += limpiar(row[37])
        diasPagos[fecha].otros         += limpiar(row[36]) + limpiar(row[38]) + limpiar(row[39])
        diasPagos[fecha].total         += total

        // Método principal
        const ef = limpiar(row[32]), ch = limpiar(row[33]), cr = limpiar(row[34])
        const tr = limpiar(row[35]), ta = limpiar(row[37])
        let metodo = 'efectivo'
        if (ta > 0) metodo = 'tarjeta'
        if (tr > 0) metodo = 'transferencia'
        if (cr > 0) metodo = 'credito'
        if (ch > 0) metodo = 'cheque'

        ticketsNuevos.push({ sicar_id: sicarId, fechaOriginal, total, metodo })
      }
    }

    if (esCanceladas) {
      setProgreso('Procesando reporte de canceladas...')
      for (const row of rows) {
        const col0 = row[0]?.toString().trim() || ''
        if (!col0.startsWith('Ticket ')) continue
        const fecha = parseFechaCanc(row[3])
        if (!fecha) continue
        const monto = limpiar(row[18])
        if (!diasCanc[fecha]) diasCanc[fecha] = { canceladas: 0, monto: 0 }
        diasCanc[fecha].canceladas++
        diasCanc[fecha].monto += monto
      }
    }

    if (esUtilidades) {
      const diasArr  = Object.entries(diasUtilidad).map(([fecha, d]) => ({ fecha, tickets: d.tickets, ventas: Math.round(d.ventas*100)/100, compras: Math.round(d.compras*100)/100, utilidad: Math.round((d.ventas-d.compras)*100)/100 }))
      const mesesArr = Object.entries(mesesUtilidad).map(([mes, d]) => ({ mes, tickets: d.tickets, ventas: Math.round(d.ventas*100)/100, compras: Math.round(d.compras*100)/100, utilidad: Math.round((d.ventas-d.compras)*100)/100, margen: d.ventas > 0 ? Math.round((d.ventas-d.compras)/d.ventas*10000)/100 : 0 }))
      setProgreso(`Subiendo ${diasArr.length} días de utilidades...`)
      const { error: e1 } = await supabase.rpc('upsert_sicar_ventas_dia', { datos: diasArr })
      if (e1) throw new Error(`Error días: ${e1.message}`)
      const { error: e2 } = await supabase.rpc('upsert_sicar_utilidades', { datos: mesesArr })
      if (e2) throw new Error(`Error meses: ${e2.message}`)
      resultado = ({ tipo: 'utilidades', dias: diasArr.length, meses: mesesArr.length, ventas: mesesArr.reduce((s,m) => s+m.ventas, 0) })
    }

    if (esGeneral) {
      // Subir pagos por día
      const pagosArr = Object.entries(diasPagos).map(([fecha, d]) => ({
        fecha,
        efectivo:      Math.round(d.efectivo*100)/100,
        cheque:        Math.round(d.cheque*100)/100,
        credito:       Math.round(d.credito*100)/100,
        transferencia: Math.round(d.transferencia*100)/100,
        tarjeta:       Math.round(d.tarjeta*100)/100,
        otros:         Math.round(d.otros*100)/100,
        total:         Math.round(d.total*100)/100,
      }))
      setProgreso(`Subiendo ${pagosArr.length} días de métodos de pago...`)
      const { error: e3 } = await supabase.rpc('upsert_sicar_pagos_dia', { datos: pagosArr })
      if (e3) throw new Error(`Error pagos: ${e3.message}`)

      // Verificar cuáles ya existen (en lotes, para no exceder el límite de la consulta)
      setProgreso('Verificando tickets existentes...')
      const sicarIds = ticketsNuevos.map(t => t.sicar_id)
      const idsExistentes = new Set()
      for (let i = 0; i < sicarIds.length; i += 500) {
        const lote = sicarIds.slice(i, i + 500)
        const { data: existentes, error: eExist } = await supabase
          .from('ventas')
          .select('sicar_id')
          .in('sicar_id', lote)
        if (eExist) throw new Error(`Error verificando existentes: ${eExist.message}`)
        ;(existentes || []).forEach(v => idsExistentes.add(v.sicar_id))
        setProgreso(`Verificando tickets existentes... ${Math.min(i + 500, sicarIds.length)}/${sicarIds.length}`)
      }
      const porInsertar = ticketsNuevos.filter(t => !idsExistentes.has(t.sicar_id))

      if (porInsertar.length > 0) {
        setProgreso(`Insertando ${porInsertar.length} tickets nuevos...`)
        const ventasRows = porInsertar.map(t => ({
          negocio_id:  NEGOCIO_ID,
          sucursal_id: sucursalId,
          usuario_id:  userId,
          sicar_id:    t.sicar_id,
          folio:       `SICAR-${t.sicar_id}`,
          subtotal:    Math.round(t.total * 100) / 100,
          descuento:   0,
          iva:         0,
          total:       Math.round(t.total * 100) / 100,
          estado:      'completada',
          created_at:  parsearFechaISO(t.fechaOriginal),
        }))

        for (let i = 0; i < ventasRows.length; i += 100) {
          const lote = ventasRows.slice(i, i + 100)
          const { data: ventasInsertadas, error: eV } = await supabase
            .from('ventas')
            .upsert(lote, { onConflict: 'negocio_id,folio', ignoreDuplicates: true })
            .select('id, sicar_id')
          if (eV) throw new Error(`Error insertando ventas: ${eV.message}`)

          const pagosVentas = (ventasInsertadas || []).map(v => {
            const t = porInsertar.find(x => x.sicar_id === v.sicar_id)
            return { venta_id: v.id, metodo: t.metodo, monto: Math.round(t.total * 100) / 100 }
          })
          if (pagosVentas.length > 0) {
            const { error: eP } = await supabase.from('pagos').insert(pagosVentas)
            if (eP) throw new Error(`Error insertando pagos: ${eP.message}`)
          }
          setProgreso(`Insertando tickets... ${Math.min(i + 100, ventasRows.length)}/${ventasRows.length}`)
        }
      }

      resultado = ({
        tipo:       'general',
        dias:       pagosArr.length,
        total:      pagosArr.reduce((s, d) => s + d.total, 0),
        insertados: porInsertar.length,
        existentes: idsExistentes.size,
      })
    }

    if (esCanceladas) {
      const cancArr = Object.entries(diasCanc).map(([fecha, d]) => ({ fecha, canceladas: d.canceladas, monto: Math.round(d.monto*100)/100 }))
      setProgreso(`Subiendo ${cancArr.length} días de canceladas...`)
      const { error: e4 } = await supabase.rpc('upsert_sicar_canceladas_dia', { datos: cancArr })
      if (e4) throw new Error(`Error canceladas: ${e4.message}`)
      resultado = ({ tipo: 'canceladas', dias: cancArr.length, canceladas: cancArr.reduce((s,d) => s+d.canceladas, 0), monto: cancArr.reduce((s,d) => s+d.monto, 0) })
    }


  return resultado
}
