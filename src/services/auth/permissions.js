
/*
 * ANDINACARE - MATRIZ DE PERMISOS
 *
 * Define qué acciones puede realizar cada perfil dentro
 * de los módulos de la aplicación.
 *
 * Los permisos se comprueban mediante:
 * - Rol del usuario.
 * - Módulo solicitado.
 * - Acción que intenta realizar.
 *
 * IMPORTANTE:
 * Esta matriz representa el control de acceso del prototipo.
 * No sustituye la autorización de un backend real.
 */

// Acciones disponibles en el sistema.
export const ACTIONS = {
  READ: "read",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
};

// Identificadores oficiales de los perfiles.
export const ROLES = {
  TECHNICIAN: "TECHNICIAN",
  MAINTENANCE_MANAGER: "MAINTENANCE_MANAGER",
  WAREHOUSE_MANAGER: "WAREHOUSE_MANAGER",
  PLANT_OPERATOR: "PLANT_OPERATOR",
  ADMIN_AUDITOR: "ADMIN_AUDITOR",
};

// Matriz central de permisos.
//
// Cada módulo contiene las acciones autorizadas
// para cada perfil.
const PERMISSIONS = {
  TECHNICIAN: {
    dashboard: ["read"],
    assets: ["read"],
    "work-orders": ["read", "create", "update"],
    safety: ["read", "create", "update"],
    inventory: ["read"],
    reports: ["read"],
  },

  MAINTENANCE_MANAGER: {
    dashboard: ["read"],
    assets: ["read", "create", "update", "delete"],
    "work-orders": ["read", "create", "update", "delete"],

    // El jefe de mantenimiento puede gestionar
    // registros AST/LOTO al iniciar y supervisar trabajos.
    safety: ["read", "create", "update"],

    inventory: ["read"],
    users: ["read"],
    reports: ["read"],
    audit: ["read"],
  },

  WAREHOUSE_MANAGER: {
    dashboard: ["read"],
    assets: ["read"],
    "work-orders": ["read"],
    inventory: ["read", "create", "update", "delete"],
    reports: ["read"],
  },

  PLANT_OPERATOR: {
    dashboard: ["read"],
    assets: ["read"],
    "work-orders": ["read", "create"],
  },

  ADMIN_AUDITOR: {
    dashboard: ["read", "create", "update", "delete"],
    assets: ["read", "create", "update", "delete"],
    "work-orders": ["read", "create", "update", "delete"],
    safety: ["read", "create", "update", "delete"],
    inventory: ["read", "create", "update", "delete"],
    users: ["read", "create", "update", "delete"],
    reports: ["read", "create", "update", "delete"],
    audit: ["read"],
  },
};

/*
 * Comprueba si un perfil tiene permiso para realizar
 * una acción específica dentro de un módulo.
 *
 * Devuelve true si está autorizado.
 * Devuelve false si no tiene autorización.
 */
export function hasPermission(
  role,
  module,
  action = ACTIONS.READ
) {
  const rolePermissions = PERMISSIONS[role];

  if (!rolePermissions) {
    return false;
  }

  const modulePermissions = rolePermissions[module];

  if (!modulePermissions) {
    return false;
  }

  return modulePermissions.includes(action);
}

/*
 * Comprueba si el usuario puede acceder a un módulo.
 * Para entrar a una sección se exige permiso de lectura.
 */
export function canAccessModule(role, module) {
  return hasPermission(role, module, ACTIONS.READ);
}

/*
 * Obtiene los módulos visibles para un perfil.
 * Se utilizará posteriormente en los menús.
 */
export function getAccessibleModules(role) {
  const rolePermissions = PERMISSIONS[role];

  if (!rolePermissions) {
    return [];
  }

  return Object.keys(rolePermissions).filter((module) =>
    canAccessModule(role, module)
  );
}

/*
 * Valida una operación y lanza un error si el perfil
 * no tiene autorización.
 */
export function assertPermission(role, module, action) {
  if (!hasPermission(role, module, action)) {
    const error = new Error(
      `El perfil ${role} no tiene permiso para ${action} en ${module}.`
    );

    error.name = "PermissionDeniedError";

    throw error;
  }
}
