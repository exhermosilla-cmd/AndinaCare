
/*
 * ANDINACARE - EXPORTACIONES DEL SERVICIO DE SINCRONIZACIÓN
 *
 * Centraliza las funciones y constantes del módulo.
 * Así evitamos importar directamente desde varios archivos.
 */

// Estados disponibles.
export { SYNC_STATUS } from "./syncService";

// Administración de la cola.
export {
  enqueueOperation,
  getSyncSummary,
  subscribeSyncStatus,
} from "./syncService";

// Procesamiento y reintentos.
export {
  processPendingOperations,
  retryFailedOperations,
} from "./syncService";

// Inicio y detención del servicio.
export {
  startSynchronization,
  stopSynchronization,
} from "./syncService";

// Adaptador simulado.
export { sendOperation } from "./syncAdapter";
