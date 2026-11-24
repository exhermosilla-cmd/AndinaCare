
/*
 * ANDINACARE - NAVEGACIÓN INFERIOR MÓVIL
 *
 * Facilita el acceso a los módulos principales desde
 * teléfonos Android.
 *
 * Los accesos se filtran según los permisos del usuario.
 */

import { NavLink } from "react-router";

import {
  LayoutDashboard,
  Factory,
  ClipboardList,
  Package,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { ACTIONS, hasPermission } from "../../services/auth";

// Módulos disponibles en la navegación inferior.
const mobileItems = [
  {
    label: "Inicio",
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
    label: "Órdenes",
    path: "/work-orders",
    module: "work-orders",
    icon: ClipboardList,
  },
  {
    label: "Inventario",
    path: "/inventory",
    module: "inventory",
    icon: Package,
  },
];

function MobileNavigation() {
  // Obtiene el usuario autenticado.
  const { user } = useAuth();

  // Conserva únicamente los accesos autorizados.
  const accessibleItems = mobileItems.filter((item) => {
    return (
      user &&
      hasPermission(user.role, item.module, ACTIONS.READ)
    );
  });

  return (
    <nav
      className="mobile-navigation"
      aria-label="Navegación móvil"
    >
      {accessibleItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `mobile-navigation__link ${
                isActive
                  ? "mobile-navigation__link--active"
                  : ""
              }`
            }
          >
            <Icon size={21} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default MobileNavigation;
