import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Los usuarios sin correo real entran con su "usuario" (ej. miguel);
// internamente se convierte en usuario@palenque.pos
const DOMINIO_INTERNO = 'palenque.pos'

function aCorreo(texto) {
  const t = texto.trim().toLowerCase()
  return t.includes('@') ? t : `${t}@${DOMINIO_INTERNO}`
}

function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setCargando(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email: aCorreo(usuario), password })

    if (error) {
      setError('Usuario o contraseña incorrectos')
      setCargando(false)
    }
  }

  const estiloInput = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    boxSizing: 'border-box'
  }
  const estiloLabel = { fontSize: '13px', color: '#555', display: 'block', marginBottom: '6px' }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '380px',
        border: '1px solid #e0e0e0'
      }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '20px' }}>POS Palenque</h2>
        <p style={{ margin: '0 0 1.5rem', color: '#888', fontSize: '14px' }}>
          Inicia sesión para continuar
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={estiloLabel}>Usuario o correo</label>
            <input
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              required
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              style={estiloInput}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={estiloLabel}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={estiloInput}
            />
          </div>

          {error && (
            <p style={{
              color: '#c0392b',
              fontSize: '13px',
              marginBottom: '1rem',
              background: '#fdecea',
              padding: '10px 12px',
              borderRadius: '8px'
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            style={{
              width: '100%',
              padding: '11px',
              background: cargando ? '#aaa' : '#1a1a2e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: cargando ? 'not-allowed' : 'pointer'
            }}
          >
            {cargando ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
