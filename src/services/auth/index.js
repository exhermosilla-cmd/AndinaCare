
/*
 * ANDINACARE - EXPORTACIONES DE AUTENTICACIÓN
 *
 * Centraliza las funciones y constantes del módulo de acceso.
 */

export {
  ensureDemoUsers,
  getDemoUsers,
  loginAsDemoUser,
  logoutDemoUser,
  restoreSession,
} from "./authService";

export {
  ACTIONS,
  ROLES,
  hasPermission,
  canAccessModule,
  getAccessibleModules,
  assertPermission,
} from "./permissions";
