
/*
 * ANDINACARE - RUTA PROTEGIDA
 *
 * Comprueba dos condiciones antes de permitir el acceso:
 *
 * 1. Que exista un usuario autenticado.
 * 2. Que el rol del usuario tenga permiso de lectura
 *    sobre el módulo solicitado.
 *
 * El tablero Kanban utiliza los mismos permisos
 * del módulo de órdenes de trabajo.
 */

import { Navigate, Outlet, useLocation } from "react-router";

import { useAuth } from "../../context/AuthContext";

import {
  ACTIONS,
  hasPermission,
} from "../../services/auth";

function ProtectedRoute() {
  const { user, isAuthenticated, loading } = useAuth();

  // Obtenemos la ubicación que el usuario intenta visitar.
  const location = useLocation();

  // Mientras se recupera la sesión, esperamos.
  if (loading) {
    return (
      <main className="auth-loading">
        <p>Preparando AndinaCare...</p>
      </main>
    );
  }

  // Si no existe una sesión, enviamos al inicio de sesión.
  if (!isAuthenticated || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  // Obtenemos el nombre del módulo desde la URL.
  // Ejemplo: /work-orders -> work-orders.
  const section = location.pathname
    .split("/")
    .filter(Boolean)[0];

  /*
   * El tablero Kanban pertenece al módulo de órdenes
   * de trabajo, por lo que reutiliza sus permisos.
   */
  const permissionModule =
    section === "work-orders-kanban"
      ? "work-orders"
      : section;

  // Comprobamos si el rol tiene permiso de lectura.
  const hasAccess = hasPermission(
    user.role,
    permissionModule,
    ACTIONS.READ
  );

  // Si no tiene autorización, lo enviamos al Dashboard.
  if (!hasAccess) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{ accessDenied: true }}
      />
    );
  }

  // Si está autenticado y tiene permiso, mostramos la ruta.
  return <Outlet />;
}

export default ProtectedRoute;
