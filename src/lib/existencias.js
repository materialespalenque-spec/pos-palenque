// Texto con la existencia de un producto en la sucursal activa y, si se permite, en las demás.
// p.inventario = [{ sucursal_id, existencia }]. Sin renglón de inventario = "s/d" (sin dato).
export function textoExistencias(p, sucursales, activaId, verOtras) {
  const inv = p?.inventario || []
  const valor = id => {
    const r = inv.find(i => i.sucursal_id === id)
    return r ? Number(r.existencia) : null
  }
  const fmt = v => v === null ? 's/d' : v.toLocaleString('es-MX', { maximumFractionDigits: 2 })
  let t = `Aquí: ${fmt(valor(activaId))}`
  if (verOtras) {
    sucursales.filter(s => s.id !== activaId).forEach(s => { t += ` · ${s.nombre}: ${fmt(valor(s.id))}` })
  }
  return t
}
