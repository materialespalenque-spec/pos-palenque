import { createContext, useContext } from 'react'

// Datos de quien inició sesión: rol, permisos y sucursal activa (los llena App.jsx)
export const SesionContext = createContext({
  perfil: null, permisos: {}, sucursales: [], sucursalId: null,
  tiene: () => false, cambiarSucursal: () => {},
})

export const useSesion = () => useContext(SesionContext)
