
/*
 * ANDINACARE - CONTEXTO DE AUTENTICACIÓN
 *
 * Comparte el estado de autenticación con toda la aplicación.
 *
 * Registra:
 * - Inicio de sesión.
 * - Cierre de sesión.
 * - Recuperación de sesiones existentes sin duplicar LOGIN.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  ensureDemoUsers,
  loginAsDemoUser,
  logoutDemoUser,
  restoreSession,
} from "../services/auth";

import { recordAuditEvent } from "../services/audit/auditService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initializeAuthentication() {
      try {
        await ensureDemoUsers();

        const restoredUser = await restoreSession();

        if (mounted) {
          setUser(restoredUser);
        }
      } catch (error) {
        console.error(
          "No se pudo inicializar la autenticación:",
          error
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initializeAuthentication();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * INICIAR SESIÓN
   *
   * Registra el acceso después de autenticar al usuario.
   */
  async function login(userId) {
    const authenticatedUser = await loginAsDemoUser(userId);

    setUser(authenticatedUser);

    try {
      await recordAuditEvent({
        action: "LOGIN",
        entityType: "session",
        entityId: authenticatedUser.id,
        module: "authentication",
        details: `${authenticatedUser.name} inició sesión en AndinaCare.`,
        afterData: {
          userId: authenticatedUser.id,
          userName: authenticatedUser.name,
          role: authenticatedUser.role,
        },
        actor: authenticatedUser,
      });
    } catch (error) {
      console.error(
        "No se pudo registrar el inicio de sesión:",
        error
      );
    }

    return authenticatedUser;
  }

  /*
   * CERRAR SESIÓN
   *
   * Registra el evento antes de eliminar la sesión,
   * conservando la identificación del usuario responsable.
   */
  async function logout() {
    const closingUser = user;

    if (closingUser) {
      try {
        await recordAuditEvent({
          action: "LOGOUT",
          entityType: "session",
          entityId: closingUser.id,
          module: "authentication",
          details: `${closingUser.name} cerró sesión en AndinaCare.`,
          beforeData: {
            userId: closingUser.id,
            userName: closingUser.name,
            role: closingUser.role,
          },
          actor: closingUser,
        });
      } catch (error) {
        console.error(
          "No se pudo registrar el cierre de sesión:",
          error
        );
      }
    }

    logoutDemoUser();
    setUser(null);
  }

  const contextValue = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider."
    );
  }

  return context;
}
