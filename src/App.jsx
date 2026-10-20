import { Fragment, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { setSucursalActiva, sucursalGuardada } from './lib/config'
import { SesionContext } from './lib/sesion'
import Login from './pages/Login'
import Layout from './components/Layout'
import Caja from './pages/Caja'
import Productos from './pages/Productos'
import Contactos from './pages/Contactos'
import Clientes from './pages/Clientes'
import Reportes from './pages/Reportes'
import Ventas from './pages/Ventas'
import Cotizaciones from './pages/Cotizaciones'
import Configuracion from './pages/Configuracion'

// Qué permiso de vista necesita cada pantalla (el orden es el de preferencia al entrar)
const PERMISO_PAGINA = {
  caja: 'v_caja', cotizaciones: 'v_cotizaciones', ventas: 'v_ventas', productos: 'v_productos',
  contactos: 'v_entregas', clientes: 'v_clientes', reportes: 'v_reportes', configuracion: 'v_configuracion',
}

function App() {
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pagina, setPagina] = useState('caja')
  const [ctx, setCtx] = useState(null)         // { perfil, permisos, sucursales, sucursalId } | { sinAcceso, motivo }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSesion(session)
      setCargando(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session)
    })
  }, [])

  // Al iniciar sesión: rol, permisos y sucursal con la que se trabaja
  useEffect(() => {
    if (!sesion) { setCtx(null); return }
    let vivo = true
    ;(async () => {
      const [{ data: perfil, error: e1 }, { data: sucs, error: e2 }] = await Promise.all([
        supabase.rpc('mis_permisos'),
        supabase.from('sucursales').select('id, nombre').eq('activa', true).order('created_at'),
      ])
      if (!vivo) return
      if (e1 || e2) { setCtx({ sinAcceso: true, motivo: 'No se pudo cargar tu perfil. Revisa tu conexión y recarga la página.' }); return }
      if (!perfil || !perfil.rol) {
        setCtx({ sinAcceso: true, motivo: 'Tu usuario todavía no tiene un rol asignado. Avisa al administrador.' }); return
      }
      const permisos = perfil.permisos || {}
      const lista = sucs || []
      let id = perfil.sucursal_id
      if (permisos.cambiar_sucursal) {
        const g = sucursalGuardada()
        if (g && lista.some(s => s.id === g)) id = g
      }
      if (!id || !lista.some(s => s.id === id)) id = lista[0]?.id
      setSucursalActiva(id)
      setCtx({ perfil, permisos, sucursales: lista, sucursalId: id })
      // primera pantalla permitida
      const primera = Object.keys(PERMISO_PAGINA).find(k => permisos[PERMISO_PAGINA[k]])
      if (primera) setPagina(p => (permisos[PERMISO_PAGINA[p]] ? p : primera))
    })()
    return () => { vivo = false }
  }, [sesion?.user?.id])

  if (cargando) return <p style={{ padding: '2rem' }}>Cargando...</p>
  if (!sesion) return <Login />
  if (!ctx) return <p style={{ padding: '2rem' }}>Cargando tu perfil...</p>
  if (ctx.sinAcceso) {
    return (
      <div style={{ padding: '3rem 1.5rem', maxWidth: '480px', margin: '0 auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2 style={{ color: '#1a1a2e' }}>Sin acceso</h2>
        <p style={{ color: '#555' }}>{ctx.motivo}</p>
        <button onClick={() => supabase.auth.signOut()} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}>Cerrar sesión</button>
      </div>
    )
  }

  const tiene = k => !!ctx.permisos[k]

  const cambiarSucursal = id => {
    if (id === ctx.sucursalId || !tiene('cambiar_sucursal')) return
    try {
      const hayCarrito = JSON.parse(localStorage.getItem('pos_carrito') || '[]').length > 0
      if (hayCarrito && !confirm('Hay una venta capturada en Caja. Si cambias de sucursal, sus existencias se actualizarán al nuevo lugar. ¿Cambiar de todas formas?')) return
    } catch { /* ignorar */ }
    setSucursalActiva(id)
    setCtx(c => ({ ...c, sucursalId: id }))
  }

  const paginas = {
    caja:          <Caja />,
    productos:     <Productos />,
    contactos:     <Contactos />,
    clientes:      <Clientes />,
    reportes:      <Reportes />,
    ventas:        <Ventas />,
    cotizaciones:  <Cotizaciones irA={setPagina} />,
    configuracion: <Configuracion />,
  }

  const permitida = tiene(PERMISO_PAGINA[pagina])

  return (
    <SesionContext.Provider value={{ ...ctx, tiene, cambiarSucursal }}>
      <Layout sesion={sesion} pagina={pagina} setPagina={setPagina}>
        {permitida
          // al cambiar de sucursal la pantalla se vuelve a cargar con la nueva
          ? <Fragment key={`${ctx.sucursalId}-${pagina}`}>{paginas[pagina]}</Fragment>
          : <p style={{ color: '#888' }}>No tienes acceso a esta pantalla.</p>}
      </Layout>
    </SesionContext.Provider>
  )
}

export default App
