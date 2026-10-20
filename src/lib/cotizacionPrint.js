// Formatos impresos de Cotización: carta (profesional) y ticket térmico (informal, como los tickets de venta).
// Recibe el objeto que arma prepararImpresion() en lib/cotizaciones.js

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const num2 = n => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const qty = n => { const x = Number(n) || 0; return Number.isInteger(x) ? String(x) : String(parseFloat(x.toFixed(3))) }
const fecha = v => {
  if (!v) return ''
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const kg = n => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(n || 0)

const logoSrc = logo => (logo && logo.startsWith('/') && typeof window !== 'undefined') ? window.location.origin + logo : (logo || '')

const AUTO_IMPRIMIR = `<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>`

function notaDescuento(d) {
  const partes = []
  if (d.descuento > 0) partes.push(`descuento de ${money(d.descuento)}`)
  if (d.recargo > 0) partes.push(`recargo de ${money(d.recargo)}`)
  return partes.length ? `Los precios ya incluyen ${partes.join(' y ')}.` : ''
}

export function generarCartaHTML(d) {
  const s = d.enc?.sucursal || {}
  const lineaDir = [s.direccion, s.colonia && `Col. ${s.colonia}`, s.cp && `C.P. ${s.cp}`].filter(Boolean).join(', ')
  const lineaCiudad = [s.ciudad, s.estado].filter(Boolean).join(', ')
  const lineaContacto = [s.telefono && `Tel. ${s.telefono}`, s.email].filter(Boolean).join('  ·  ')
  const logo = logoSrc(d.enc?.logo)
  const nota = notaDescuento(d)

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cotización ${esc(d.folio)}</title>
<style>
  @page { size: letter; margin: 12mm 13mm 14mm; }
  :root { --acc:#f26a00; --ink:#1f2430; --mut:#6b7280; --line:#e6e8ec; --soft:#f6f7f9; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; color: var(--ink); font-size: 11px; line-height: 1.4;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; padding-bottom: 12mm; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding-bottom: 12px; border-bottom: 3px solid var(--acc); }
  .brand { display: flex; gap: 14px; align-items: center; }
  .brand img { height: 64px; width: auto; display: block; }
  .brand .n { font-size: 15px; font-weight: 700; letter-spacing: .2px; }
  .brand .s { color: var(--mut); font-size: 10.5px; }
  .doc { text-align: right; min-width: 190px; }
  .doc .t { font-size: 10.5px; letter-spacing: 3px; color: var(--acc); font-weight: 700; }
  .doc .f { font-size: 23px; font-weight: 700; margin: 1px 0 6px; letter-spacing: .3px; }
  .doc .m { color: var(--mut); font-size: 10.5px; }
  .doc .m b { color: var(--ink); font-weight: 600; }
  .cli { display: grid; grid-template-columns: 1.5fr 1fr; gap: 6px 26px; background: var(--soft); border-radius: 8px; padding: 10px 14px; margin: 14px 0 14px; }
  .cli .k { color: var(--mut); font-size: 9px; text-transform: uppercase; letter-spacing: .9px; }
  .cli .v { font-weight: 600; font-size: 12px; }
  .cli .w { grid-column: 1 / -1; }
  table.p { width: 100%; border-collapse: collapse; }
  table.p thead { display: table-header-group; }
  table.p th { font-size: 9px; text-transform: uppercase; letter-spacing: .9px; color: var(--mut); text-align: left; padding: 7px 6px; border-bottom: 2px solid var(--ink); }
  table.p td { padding: 7px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.p tr { page-break-inside: avoid; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .c { text-align: center; }
  .cl { color: var(--mut); font-size: 10px; white-space: nowrap; }
  .bottom { display: flex; justify-content: space-between; gap: 24px; margin-top: 14px; page-break-inside: avoid; }
  .left { flex: 1; min-width: 0; }
  .box { width: 250px; flex: none; }
  .grand { display: flex; justify-content: space-between; align-items: center; background: var(--acc); color: #fff; border-radius: 8px; padding: 10px 14px; font-size: 16px; font-weight: 700; }
  .mut { color: var(--mut); font-size: 10px; margin-top: 6px; text-align: right; }
  .sec { margin-bottom: 10px; }
  .sec h4 { margin: 0 0 3px; font-size: 9px; text-transform: uppercase; letter-spacing: .9px; color: var(--mut); }
  .sec p, .sec li { margin: 0; font-size: 10.5px; }
  .sec ul { margin: 0; padding-left: 14px; }
  .notas { background: #fff8f1; border-left: 3px solid var(--acc); padding: 7px 10px; border-radius: 0 6px 6px 0; white-space: pre-wrap; }
  .firma { margin-top: 26px; text-align: center; }
  .firma .l { border-top: 1px solid var(--ink); width: 200px; margin: 0 auto 3px; }
  .pie { position: fixed; left: 0; right: 0; bottom: 0; text-align: center; color: var(--mut); font-size: 9.5px; border-top: 1px solid var(--line); padding-top: 4px; background: #fff; }
</style></head><body>
  <div class="head">
    <div class="brand">
      ${logo ? `<img src="${esc(logo)}" alt="">` : ''}
      <div>
        <div class="n">${esc(d.enc?.nombre || 'Materiales Palenque')}</div>
        ${d.enc?.rfc ? `<div class="s">RFC ${esc(d.enc.rfc)}</div>` : ''}
        ${lineaDir ? `<div class="s">${esc(lineaDir)}</div>` : ''}
        ${lineaCiudad ? `<div class="s">${esc(lineaCiudad)}</div>` : ''}
        ${lineaContacto ? `<div class="s">${esc(lineaContacto)}</div>` : ''}
      </div>
    </div>
    <div class="doc">
      <div class="t">COTIZACIÓN</div>
      <div class="f">${esc(d.folio)}</div>
      <div class="m">Fecha: <b>${esc(fecha(d.fecha))}</b></div>
      <div class="m">Vigencia: <b>${esc(fecha(d.vigenteHasta))}</b></div>
      <div class="m">Moneda: <b>MXN</b></div>
    </div>
  </div>

  <div class="cli">
    <div><div class="k">Cliente</div><div class="v">${esc(d.nombre)}</div></div>
    <div><div class="k">Teléfono</div><div class="v">${esc(d.telefono) || '—'}</div></div>
    ${d.rfc ? `<div><div class="k">RFC</div><div class="v">${esc(d.rfc)}</div></div>` : ''}
    ${d.esEnvio && d.direccion ? `<div class="w"><div class="k">Entrega en</div><div class="v">${esc(d.direccion)}</div></div>` : ''}
  </div>

  <table class="p">
    <thead><tr>
      <th style="width:92px">Clave</th><th class="c" style="width:48px">Cant.</th><th style="width:48px">Unidad</th>
      <th>Descripción</th><th class="r" style="width:84px">P. Unit.</th><th class="r" style="width:92px">Importe</th>
    </tr></thead>
    <tbody>
      ${d.items.map(it => `<tr>
        <td class="cl">${esc(it.clave)}</td>
        <td class="c">${qty(it.cantidad)}</td>
        <td class="cl">${esc(it.unidad)}</td>
        <td>${esc(it.nombre)}</td>
        <td class="r">${money(it.precio)}</td>
        <td class="r"><b>${money(it.importe)}</b></td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="bottom">
    <div class="left">
      ${d.notas ? `<div class="sec"><h4>Notas</h4><p class="notas">${esc(d.notas)}</p></div>` : ''}
      ${d.condiciones.length ? `<div class="sec"><h4>Condiciones</h4><ul>${d.condiciones.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${d.datosBancarios ? `<div class="sec"><h4>Datos bancarios</h4><p>${esc(d.datosBancarios)}</p></div>` : ''}
      <div class="firma"><div class="l"></div><div>${esc(d.vendedor) || '&nbsp;'}</div><div class="cl">Le atendió</div></div>
    </div>
    <div class="box">
      <div class="grand"><span>Total</span><span>${money(d.total)}</span></div>
      ${nota ? `<div class="mut">${esc(nota)}</div>` : ''}
    </div>
  </div>

  <div class="pie">${esc(d.enc?.nombre || '')}${lineaContacto ? '  ·  ' + esc(lineaContacto) : ''}</div>
  ${AUTO_IMPRIMIR}
</body></html>`
}

export function generarTermicoHTML(d) {
  const s = d.enc?.sucursal || {}
  const lineaDir = [s.direccion, s.colonia && `Col. ${s.colonia}`].filter(Boolean).join(', ')
  const nota = notaDescuento(d)
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cotización ${esc(d.folio)}</title>
<style>
  @page { margin: 4mm; }
  body{font-family:monospace;font-size:12px;max-width:320px;margin:0 auto;padding:1rem}
  hr{border:none;border-top:1px dashed #999;margin:8px 0}
  .center{text-align:center}.bold{font-weight:700}.total{font-size:14px}
  .item{margin-top:7px;padding-bottom:7px;border-bottom:1px dotted #ddd}
  .fila{display:flex;justify-content:space-between;gap:8px}
  .mut{color:#666;font-size:11px}
</style></head><body>
  <div class="center">
    <div class="bold" style="font-size:14px">${esc((d.enc?.nombre || 'MATERIALES PALENQUE').toUpperCase())}</div>
    ${lineaDir ? `<div class="mut">${esc(lineaDir)}</div>` : ''}
    ${s.telefono ? `<div class="mut">Tel. ${esc(s.telefono)}</div>` : ''}
    <div class="bold" style="margin-top:6px;letter-spacing:2px">COTIZACIÓN</div>
  </div>
  <hr>
  <div>Folio: <strong>${esc(d.folio)}</strong></div>
  <div>Fecha: ${esc(fecha(d.fecha))}</div>
  <div>Vigencia: <strong>${esc(fecha(d.vigenteHasta))}</strong></div>
  <div>Cliente: <strong>${esc(d.nombre)}</strong></div>
  ${d.telefono ? `<div>Tel: ${esc(d.telefono)}</div>` : ''}
  ${d.esEnvio && d.direccion ? `<div>Entrega: ${esc(d.direccion)}</div>` : ''}
  <hr>
  ${d.items.map(it => `<div class="item">
    <div style="font-weight:600">${esc(it.nombre)}</div>
    <div class="fila mut"><span>${qty(it.cantidad)}${it.unidad ? ' ' + esc(it.unidad) : ''} x ${num2(it.precio)}</span><span style="font-weight:600;color:#000">${num2(it.importe)}</span></div>
  </div>`).join('')}
  <hr>
  <div class="fila bold total"><span>TOTAL</span><span>${money(d.total)}</span></div>
  ${nota ? `<div class="mut" style="font-style:italic;margin-top:4px">(${esc(nota)})</div>` : ''}
  ${d.notas ? `<hr><div style="white-space:pre-wrap">${esc(d.notas)}</div>` : ''}
  <hr>
  <div class="center mut">
    ${d.condiciones.map(c => `<div>${esc(c)}</div>`).join('')}
    ${d.vendedor ? `<div style="margin-top:4px">Le atendió: ${esc(d.vendedor)}</div>` : ''}
  </div>
  ${AUTO_IMPRIMIR}
</body></html>`
}

/** tipo: 'carta' | 'termico'. Nunca truena la pantalla si el navegador bloquea la ventana. */
export function imprimirCotizacion(tipo, datos) {
  try {
    const w = window.open('', '_blank', tipo === 'carta' ? 'width=900,height=1000' : 'width=420,height=700')
    if (!w) {
      alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio e intenta de nuevo.')
      return false
    }
    w.document.write(tipo === 'carta' ? generarCartaHTML(datos) : generarTermicoHTML(datos))
    w.document.close()
    return true
  } catch (err) {
    console.error('Error al imprimir la cotización:', err)
    alert('No se pudo abrir la cotización para imprimir. Intenta de nuevo.')
    return false
  }
}
