
/*
 * ANDINACARE - CONFIGURACIÓN PRINCIPAL DE RUTAS
 *
 * Organiza las rutas públicas y privadas de la aplicación.
 *
 * Rutas públicas:
 * - /welcome: pantalla de bienvenida.
 * - /login: selección de usuario de demostración.
 *
 * Rutas privadas:
 * - /dashboard
 * - /assets
 * - /work-orders
 * - /safety
 * - /inventory
 * - /users
 * - /reports
 * - /audit
 *
 * Todas las rutas privadas requieren una sesión activa.
 */

import { Routes, Route, Navigate } from "react-router";

import Welcome from "./pages/Welcome";
import Login from "./pages/Login";
import AppLayout from "./components/layout/AppLayout";
import ModulePage from "./modules/ModulePage";
import ProtectedRoute from "./components/auth/ProtectedRoute";

function App() {
  return (
    <Routes>

      {/* Pantalla pública de bienvenida. */}
      <Route path="/welcome" element={<Welcome />} />

      {/* Inicio de sesión académico. */}
      <Route path="/login" element={<Login />} />

      {/* La ruta raíz dirige al Dashboard. */}
      <Route
        path="/"
        element={<Navigate to="/dashboard" replace />}
      />

      {/*
       * ProtectedRoute comprueba que exista una sesión.
       * Si no existe, redirige automáticamente a /login.
       */}
      <Route element={<ProtectedRoute />}>

        {/*
         * AppLayout conserva la estructura visual compartida:
         * Sidebar, Topbar y navegación móvil.
         */}
        <Route element={<AppLayout />}>

          {/* Las secciones internas utilizan ModulePage. */}
          <Route
            path="/:section"
            element={<ModulePage />}
          />

        </Route>
      </Route>

      {/* Cualquier dirección desconocida vuelve al Dashboard. */}
      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />

    </Routes>
  );
}

export default App;
