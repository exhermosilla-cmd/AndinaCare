
/*
 * ANDINACARE - MENÚ LATERAL
 *
 * Muestra únicamente los módulos a los que el usuario
 * autenticado tiene permiso de lectura.
 *
 * Incluye el acceso al tablero Kanban de órdenes.
 */

import { NavLink } from "react-router";

import {
  LayoutDashboard,
  Factory,
  ClipboardList,
  ShieldCheck,
  Package,
  Users,
  ChartNoAxesCombined,
  History,
  X,
  Columns3,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { ACTIONS, hasPermission } from "../../services/auth";

// Configuración centralizada de las secciones.
const navigationItems = [
  {
    label: "Dashboard",
    path: "/dashboard",
    module: "dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Activos",
    path: "/assets",
    module: "assets",
    icon: Factory,
  },
  {
    label: "Órdenes de trabajo",
    path: "/work-orders",
    module: "work-orders",
    icon: ClipboardList,
  },
  {
    label: "Tablero Kanban",
    path: "/work-orders-kanban",
    module: "work-orders",
    icon: Columns3,
  },
  {
    label: "Seguridad",
    path: "/safety",
    module: "safety",
    icon: ShieldCheck,
  },
  {
    label: "Inventario",
    path: "/inventory",
    module: "inventory",
    icon: Package,
  },
  {
    label: "Usuarios",
    path: "/users",
    module: "users",
    icon: Users,
  },
  {
    label: "Reportes",
    path: "/reports",
    module: "reports",
    icon: ChartNoAxesCombined,
  },
  {
    label: "Auditoría",
    path: "/audit",
    module: "audit",
    icon: History,
  },
];

function Sidebar({ mobileOpen, onClose }) {
  // Obtiene el usuario que inició sesión.
  const { user } = useAuth();

  // Filtra las secciones según el rol del usuario.
  const accessibleItems = navigationItems.filter((item) => {
    return (
      user &&
      hasPermission(user.role, item.module, ACTIONS.READ)
    );
  });

  return (
    <>
      {/* Fondo oscuro para cerrar el menú móvil. */}
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={onClose}
        />
      )}

      <aside
        className={`sidebar ${
          mobileOpen ? "sidebar--open" : ""
        }`}
      >
        <div className="sidebar__brand">
          <div className="sidebar__brand-icon">
            <Factory size={25} />
          </div>

          <div className="sidebar__brand-text">
            <strong>AndinaCare</strong>
            <span>Mantenimiento industrial</span>
          </div>

          <button
            className="sidebar__close"
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>

        <div className="sidebar__section-label">
          MENÚ PRINCIPAL
        </div>

        <nav
          className="sidebar__navigation"
          aria-label="Navegación principal"
        >
          {accessibleItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `sidebar__link ${
                    isActive ? "sidebar__link--active" : ""
                  }`
                }
              >
                <Icon size={20} strokeWidth={1.9} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__footer-mark">
            <Factory size={17} />
          </div>

          <div>
            <strong>Manufacturas Andina</strong>
            <span>Proyecto académico</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
