
/*
 * ANDINACARE - ENCABEZADO SUPERIOR
 *
 * Muestra:
 * - Estado de conexión ONLINE/OFFLINE.
 * - Estado de la cola de sincronización.
 * - Cantidad de operaciones pendientes.
 * - Acceso para reintentar operaciones fallidas.
 * - Nombre y perfil del usuario autenticado.
 * - Opción para cerrar sesión y cambiar de usuario.
 *
 * La sincronización de esta versión sigue siendo simulada.
 */

import {
  Menu,
  Wifi,
  WifiOff,
  GraduationCap,
  RefreshCw,
  CloudUpload,
  LogOut,
} from "lucide-react";

import { useNavigate } from "react-router";

import StatusBadge from "../common/StatusBadge";
import useNetworkStatus from "../../hooks/useNetworkStatus";
import { useAuth } from "../../context/AuthContext";

// Traduce los identificadores internos de los perfiles.
const ROLE_LABELS = {
  TECHNICIAN: "Técnico de Terreno",
  MAINTENANCE_MANAGER: "Jefe de Mantenimiento",
  WAREHOUSE_MANAGER: "Encargado de Bodega",
  PLANT_OPERATOR: "Operador de Planta",
  ADMIN_AUDITOR: "Administrador / Auditor",
};

function Topbar({
  onMenuClick,
  syncSummary,
  onRetrySync,
  isRetrying,
}) {
  const navigate = useNavigate();

  // Obtenemos el usuario activo y la función de cierre de sesión.
  const { user, logout } = useAuth();

  // Consultamos el estado de conexión del navegador.
  const isOnline = useNetworkStatus();

  // Cantidad de operaciones que todavía no están sincronizadas.
  const pendingCount = syncSummary?.pending ?? 0;

  // Cantidad de operaciones que pueden reintentarse.
  const retryableCount = syncSummary?.retryable ?? 0;

  /*
   * El botón de reintento se habilita únicamente cuando:
   * - Hay operaciones que pueden reintentarse.
   * - El navegador tiene conexión.
   * - No existe otro reintento en ejecución.
   */
  const canRetry =
    isOnline &&
    retryableCount > 0 &&
    !isRetrying;

  // Obtiene la inicial del nombre para el avatar.
  const userInitial = user?.name?.charAt(0)?.toUpperCase() || "?";

  // Obtiene el nombre descriptivo del perfil.
  const userRole =
    ROLE_LABELS[user?.role] || "Perfil no identificado";

  /*
   * Cierra la sesión y envía al usuario a la pantalla
   * donde puede seleccionar otro perfil.
   */
  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="topbar">

      <div className="topbar__left">

        <button
          type="button"
          className="topbar__menu-button"
          onClick={onMenuClick}
          aria-label="Abrir menú de navegación"
        >
          <Menu size={24} />
        </button>

        <div className="topbar__breadcrumb">
          <span>AndinaCare</span>
          <span className="topbar__separator">/</span>
          <strong>Gestión de mantenimiento</strong>
        </div>

      </div>

      <div className="topbar__right">

        {/* Indicador de conexión. */}
        <div
          className="topbar__connection"
          aria-live="polite"
          aria-atomic="true"
        >
          {isOnline ? (
            <StatusBadge tone="success">
              <Wifi size={14} />
              ONLINE
            </StatusBadge>
          ) : (
            <StatusBadge tone="danger">
              <WifiOff size={14} />
              OFFLINE
            </StatusBadge>
          )}
        </div>

        {/* Estado de la cola de sincronización. */}
        <div
          className="topbar__sync-status"
          aria-live="polite"
          aria-atomic="true"
        >
          {pendingCount === 0 ? (
            <StatusBadge tone="success">
              <CloudUpload size={14} />
              Sin pendientes
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning">
              <CloudUpload size={14} />
              {pendingCount} pendientes
            </StatusBadge>
          )}
        </div>

        {/* Reintento manual de operaciones. */}
        <button
          type="button"
          onClick={onRetrySync}
          disabled={!canRetry}
          title={
            !isOnline
              ? "Necesitas conexión para reintentar"
              : retryableCount === 0
                ? "No hay operaciones que puedan reintentarse"
                : "Reintentar operaciones pendientes y fallidas"
          }
          aria-label="Reintentar operaciones de sincronización"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
            minHeight: "48px",
            padding: "0 12px",
            borderRadius: "8px",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            background: "transparent",
            color: "inherit",
            fontSize: "13px",
            fontWeight: "600",
            cursor: canRetry ? "pointer" : "not-allowed",
            opacity: canRetry ? 1 : 0.55,
            whiteSpace: "nowrap",
          }}
        >
          <RefreshCw
            size={15}
            className={isRetrying ? "sync-button--loading" : ""}
          />

          {isRetrying ? "Reintentando..." : "Reintentar"}
        </button>

        {/* Identificación del proyecto académico. */}
        <StatusBadge tone="info">
          <GraduationCap size={14} />
          Demo académica
        </StatusBadge>

        {/* Información del usuario autenticado. */}
        <div className="topbar__user">

          <div className="topbar__avatar" aria-hidden="true">
            {userInitial}
          </div>

          <div className="topbar__user-info">
            <strong>{user?.name || "Usuario"}</strong>
            <span>{userRole}</span>
          </div>

        </div>

        {/* Acción para cambiar de perfil. */}
        <button
          type="button"
          className="topbar__logout"
          onClick={handleLogout}
          title="Cerrar sesión y cambiar de usuario"
          aria-label="Cerrar sesión y cambiar de usuario"
        >
          <LogOut size={17} />
          <span>Cambiar usuario</span>
        </button>

      </div>

    </header>
  );
}

export default Topbar;
