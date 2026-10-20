import { supabase } from './supabase'

export const NEGOCIO_ID = 'b69b5ee8-b22a-426c-8426-cdf758a12b95'
export const SUCURSAL_ID = '8e56bb7a-9041-4741-a468-4ba68a97f163'

// Logo de respaldo: archivo en /public/logo.jpg (se usa si no hay logo cargado en Configuración)
export const LOGO_RESPALDO = '/logo.jpg'

// Devuelve { clave: valor } con la configuración del negocio
export async function cargarConfig() {
  const { data } = await supabase.from('negocio_config').select('clave, valor').eq('negocio_id', NEGOCIO_ID)
  const cfg = {}
  ;(data || []).forEach(r => { cfg[r.clave] = r.valor })
  return cfg
}

// Datos listos para encabezados de documentos impresos (ticket, cotización carta)
export async function cargarEncabezado(sucursalId = SUCURSAL_ID) {
  const [cfg, { data: suc }, { data: neg }] = await Promise.all([
    cargarConfig(),
    supabase.from('sucursales').select('*').eq('id', sucursalId).single(),
    supabase.from('negocios').select('nombre, rfc').eq('id', NEGOCIO_ID).single(),
  ])
  return {
    nombre: neg?.nombre || 'Materiales Palenque',
    rfc: neg?.rfc || '',
    sucursal: suc || {},
    logo: cfg.logo_data || LOGO_RESPALDO,
    datosBancarios: cfg.datos_bancarios || '',
    condiciones: cfg.cotizacion_condiciones || '',
    vigenciaDias: parseInt(cfg.cotizacion_vigencia_dias) || 15,
  }
}
