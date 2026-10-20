// Fuente única del formato de ticket — usado por Caja, Ventas, Clientes y Entregas.
// Cualquier ajuste al formato del ticket se hace aquí UNA sola vez y aplica en todos lados.

const fmt2 = n => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(n || 0)
const fmtMoney = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)

export const METODOS_LABEL = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  credito: 'Crédito',
  cheque: 'Cheque',
  saldo_a_favor: 'Saldo a favor',
}

/**
 * Genera el HTML completo del ticket.
 * datos: {
 *   folio, fecha (string ya formateado), cliente: {nombre, rfc}, contacto: {nombre, telefono, colonia, direccion},
 *   items: [{ nombre, cantidad, precioUnitario, subtotal, notaExtra? }],
 *   descuentoTotal, recargoTotal, total,
 *   pagos: [{ metodo, monto }], cambio,
 *   extraHtml (bloque adicional opcional, ej. pendientes de surtir), notaPie
 * }
 */
export function generarTicketHTML(datos) {
  const {
    folio, fecha, cliente, contacto, items = [],
    descuentoTotal = 0, recargoTotal = 0, total = 0,
    pagos = [], cambio = 0, extraHtml = '', notaPie = '¡Gracias por su compra!',
  } = datos

  return `
    <html><head><title>Ticket ${folio}</title>
    <style>
      body{font-family:monospace;font-size:12px;max-width:320px;margin:0 auto;padding:1rem}
      hr{border:none;border-top:1px dashed #ccc;margin:8px 0}
      .center{text-align:center}.bold{font-weight:700}.total{font-size:14px}
      .item{margin-top:7px;padding-bottom:7px;border-bottom:1px dotted #eee}
      .item:first-child{margin-top:0}
      .fila{display:flex;justify-content:space-between}
    </style></head><body>
    <div class="center">
      <div class="bold" style="font-size:14px">MATERIALES PALENQUE</div>
      <div>Palenque, Chiapas</div>
      <div style="font-size:11px;color:#888">${fecha}</div>
    </div>
    <hr>
    <div>Folio: <strong>${folio}</strong></div>
    ${cliente ? `
      <div>Cliente: <strong>${cliente.nombre}</strong></div>
      ${cliente.rfc ? `<div>RFC: ${cliente.rfc}</div>` : ''}
    ` : ''}
    ${contacto ? `
      <div>Entrega: <strong>${contacto.nombre}</strong></div>
      ${contacto.telefono ? `<div>Tel: ${contacto.telefono}</div>` : ''}
      ${contacto.colonia ? `<div>Col: ${contacto.colonia}</div>` : ''}
      ${contacto.direccion ? `<div>Dir: ${contacto.direccion}</div>` : ''}
    ` : ''}
    <hr>
    <div>
      ${items.map(it => `
        <div class="item">
          <div style="font-weight:600">${it.nombre}</div>
          <div class="fila" style="color:#555;margin-top:2px">
            <span>${it.cantidad} x ${fmt2(it.precioUnitario)}</span>
            <span style="font-weight:600">${fmt2(it.subtotal)}</span>
          </div>
          ${it.notaExtra ? `<div style="font-size:10px;color:#888;margin-top:1px">${it.notaExtra}</div>` : ''}
        </div>
      `).join('')}
    </div>
    <hr>
    <div class="fila bold total"><span>TOTAL</span><span>${fmtMoney(total)}</span></div>
    ${(descuentoTotal > 0 || recargoTotal > 0) ? `
      <div style="font-size:10px;color:#aaa;font-style:italic;margin-top:4px">
        (precios de arriba ya incluyen${descuentoTotal > 0 ? ` descuento de ${fmtMoney(descuentoTotal)}` : ''}${descuentoTotal > 0 && recargoTotal > 0 ? ' y' : ''}${recargoTotal > 0 ? ` recargo de ${fmtMoney(recargoTotal)}` : ''})
      </div>` : ''}
    ${pagos.map(p => `
      <div class="fila" style="font-size:11px;color:#888;margin-top:2px">
        <span>${pagos.length > 1 ? `Pago (${METODOS_LABEL[p.metodo] || p.metodo})` : 'Pago'}</span>
        <span>${pagos.length > 1 ? fmtMoney(p.monto) : (METODOS_LABEL[p.metodo] || p.metodo)}</span>
      </div>
    `).join('')}
    ${cambio > 0 ? `<div class="fila" style="margin-top:4px"><span>Cambio</span><span>${fmtMoney(cambio)}</span></div>` : ''}
    ${extraHtml}
    <hr>
    <div class="center" style="color:#888;font-size:11px">${notaPie}</div>
    </body></html>
  `
}

/** Abre una ventana nueva, escribe el ticket y manda a imprimir. Nunca truena la pantalla si el navegador bloquea la ventana. */
export function imprimirTicket(datos, opciones = {}) {
  const { silencioso = false } = opciones
  try {
    const w = window.open('', '_blank', 'width=400,height=600')
    if (!w) {
      if (!silencioso) alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio e intenta de nuevo.')
      return
    }
    w.document.write(generarTicketHTML(datos))
    w.document.close()
    w.print()
  } catch (err) {
    console.error('Error al imprimir el ticket:', err)
    if (!silencioso) alert('No se pudo abrir el ticket para imprimir. Intenta de nuevo.')
  }
}
