import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'

const menu = [
  { id: 'caja',          label: 'Caja',          icono: '🛒', permiso: 'v_caja' },
  { id: 'cotizaciones',  label: 'Cotizaciones',  icono: '📋', permiso: 'v_cotizaciones' },
  { id: 'ventas',        label: 'Ventas',        icono: '🧾', permiso: 'v_ventas' },
  { id: 'productos',     label: 'Productos',     icono: '📦', permiso: 'v_productos' },
  { id: 'contactos',     label: 'Entregas',      icono: '📍', permiso: 'v_entregas' },
  { id: 'clientes',      label: 'Clientes',      icono: '👥', permiso: 'v_clientes' },
  { id: 'reportes',      label: 'Reportes',      icono: '📊', permiso: 'v_reportes' },
  { id: 'configuracion', label: 'Configuración', icono: '⚙️', permiso: 'v_configuracion' },
]

export default function Layout({ sesion, pagina, setPagina, children }) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const { perfil, sucursales, sucursalId, tiene, cambiarSucursal } = useSesion()

  const items = menu.filter(m => tiene(m.permiso))
  const sucursalNombre = sucursales.find(s => s.id === sucursalId)?.nombre || ''
  const puedeCambiar = tiene('cambiar_sucursal') && sucursales.length > 1

  const selectorSucursal = (
    puedeCambiar ? (
      <select value={sucursalId || ''} onChange={e => cambiarSucursal(e.target.value)}
        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#2a2a4e', color: 'white', fontSize: '13px', cursor: 'pointer' }}>
        {sucursales.map(s => <option key={s.id} value={s.id}>📍 {s.nombre}</option>)}
      </select>
    ) : (
      <p style={{ margin: 0, fontSize: '13px', color: '#ddd' }}>📍 {sucursalNombre}</p>
    )
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif' }}>

      {/* Sidebar escritorio */}
      <aside style={{
        width: '220px',
        background: '#1a1a2e',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '1.5rem 1rem 1rem', borderBottom: '1px solid #2a2a4e' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Materiales</p>
          <p style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: '700', color: '#f97316' }}>
            Palenque POS
          </p>
          {selectorSucursal}
        </div>

        {/* Menú */}
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => setPagina(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 1rem',
                background: pagina === item.id ? '#f97316' : 'transparent',
                color: pagina === item.id ? 'white' : '#aaa',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: pagina === item.id ? '600' : '400',
                borderRadius: pagina === item.id ? '0 8px 8px 0' : '0',
                marginRight: pagina === item.id ? '8px' : '0',
                textAlign: 'left',
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icono}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Usuario */}
        <div style={{ padding: '1rem', borderTop: '1px solid #2a2a4e' }}>
          <p style={{ margin: '0 0 2px', fontSize: '14px', color: '#fff', fontWeight: '600' }}>{perfil?.nombre || sesion.user.email}</p>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888', wordBreak: 'break-all' }}>
            {perfil?.rol}{perfil?.nombre ? ` · ${sesion.user.email}` : ''}
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              width: '100%',
              padding: '8px',
              background: 'transparent',
              border: '1px solid #444',
              color: '#aaa',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main style={{ flex: 1, background: '#f5f5f5', overflow: 'auto', minWidth: 0 }}>
        {/* Header móvil */}
        <div style={{
          background: '#1a1a2e',
          color: 'white',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: '700', color: '#f97316' }}>Palenque POS · {sucursalNombre}</span>
          <button
            onClick={() => setMenuAbierto(!menuAbierto)}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: '22px', cursor: 'pointer' }}
          >
            ☰
          </button>
        </div>

        {/* Menú móvil desplegable */}
        {menuAbierto && (
          <div style={{ background: '#1a1a2e', padding: '0.5rem 0' }}>
            {puedeCambiar && <div style={{ padding: '0.5rem 1rem' }}>{selectorSucursal}</div>}
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => { setPagina(item.id); setMenuAbierto(false) }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 1rem',
                  background: pagina === item.id ? '#f97316' : 'transparent',
                  color: pagina === item.id ? 'white' : '#aaa',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textAlign: 'left',
                }}
              >
                <span>{item.icono}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}

      {/* Página activa */}
      <div style={{ padding: pagina === 'caja' ? '0.75rem' : '1.5rem' }}>
        {pagina !== 'caja' && (
          <h2 style={{ margin: '0 0 1rem', color: '#1a1a2e' }}>
            {menu.find(m => m.id === pagina)?.icono}{' '}
            {menu.find(m => m.id === pagina)?.label}
          </h2>
        )}
        {children}
      </div>
      </main>
    </div>
  )
}
