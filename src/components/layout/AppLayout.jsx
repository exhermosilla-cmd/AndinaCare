
/*
 * ANDINACARE - ESTRUCTURA GENERAL DE LA APLICACIÓN
 *
 * AppLayout es el contenedor visual compartido.
 *
 * Administra:
 * - Navegación lateral y móvil.
 * - Encabezado superior.
 * - Contenido de las rutas.
 * - Ciclo de vida de la sincronización offline-first.
 */

import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileNavigation from "./MobileNavigation";

import {
  startSynchronization,
  stopSynchronization,
  subscribeSyncStatus,
  retryFailedOperations,
} from "../../services/synchronization";

function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [syncSummary, setSyncSummary] = useState({
    PENDIENTE: 0,
    ENVIANDO: 0,
    SINCRONIZADO: 0,
    ERROR: 0,
    CONFLICTO: 0,
    pending: 0,
    retryable: 0,
  });

  const [isRetrying, setIsRetrying] = useState(false);

  // Evita reintentos simultáneos incluso antes del siguiente render.
  const retryInProgress = useRef(false);

  function openMobileMenu() {
    setMobileMenuOpen(true);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  /*
   * Inicialización y limpieza de sincronización.
   *
   * La variable active evita actualizar el estado
   * después de desmontar el componente.
   *
   * El servicio controla internamente las inicializaciones
   * concurrentes y el ciclo de vida de sus eventos.
   */
  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeSyncStatus((summary) => {
      if (active) {
        setSyncSummary(summary);
      }
    });

    startSynchronization().catch((error) => {
      if (active) {
        console.error(
          "No fue posible iniciar la sincronización de AndinaCare:",
          error
        );
      }
    });

    return () => {
      active = false;

      unsubscribe();
      stopSynchronization();
    };
  }, []);

  /*
   * Reintento manual de operaciones pendientes.
   *
   * El bloqueo mediante ref evita que dos solicitudes
   * se ejecuten simultáneamente.
   */
  async function handleRetrySync() {
    if (retryInProgress.current) {
      return;
    }

    retryInProgress.current = true;
    setIsRetrying(true);

    try {
      await retryFailedOperations();
    } catch (error) {
      console.error(
        "No fue posible reintentar las operaciones:",
        error
      );
    } finally {
      retryInProgress.current = false;
      setIsRetrying(false);
    }
  }

  return (
    <div className="app-layout">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
      />

      <div className="app-layout__main">
        <Topbar
          onMenuClick={openMobileMenu}
          syncSummary={syncSummary}
          onRetrySync={handleRetrySync}
          isRetrying={isRetrying}
        />

        <main className="app-content">
          <Outlet />
        </main>

        <MobileNavigation />
      </div>
    </div>
  );
}

export default AppLayout;
