import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
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

function App() {
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pagina, setPagina] = useState('caja')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSesion(session)
      setCargando(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session)
    })
  }, [])

  if (cargando) return <p style={{ padding: '2rem' }}>Cargando...</p>
  if (!sesion) return <Login />

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

  return (
    <Layout sesion={sesion} pagina={pagina} setPagina={setPagina}>
      {paginas[pagina]}
    </Layout>
  )
}

export default App
