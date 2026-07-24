import { useState } from 'react'
import { supabase } from '../lib/supabase'

const menu = [
  { id: 'caja',          label: 'Caja',          icono: '🛒' },
  { id: 'ventas',        label: 'Ventas',         icono: '🧾' },
  { id: 'productos',     label: 'Productos',      icono: '📦' },
  { id: 'contactos',     label: 'Entregas',       icono: '📍' },
  { id: 'clientes',      label: 'Clientes',       icono: '👥' },
  { id: 'reportes',      label: 'Reportes',       icono: '📊' },
  { id: 'configuracion', label: 'Configuración',  icono: '⚙️' },
]

export default function Layout({ sesion, pagina, setPagina, children }) {
  const [menuAbierto, setMenuAbierto] = useState(false)

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
        <div style={{ padding: '1.5rem 1rem', borderBottom: '1px solid #2a2a4e' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Materiales</p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#f97316' }}>
            Palenque POS
          </p>
        </div>

        {/* Menú */}
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {menu.map(item => (
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
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#888' }}>Sesión activa</p>
          <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#ddd', wordBreak: 'break-all' }}>
            {sesion.user.email}
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
          <span style={{ fontWeight: '700', color: '#f97316' }}>Palenque POS</span>
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
            {menu.map(item => (
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