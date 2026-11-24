
/*
 * ANDINACARE - SERVICIO DE SINCRONIZACIÓN OFFLINE-FIRST
 *
 * Responsabilidades:
 * 1. Guardar operaciones en IndexedDB.
 * 2. Evitar operaciones duplicadas mediante operationId.
 * 3. Procesar operaciones en orden de creación.
 * 4. Administrar los estados de sincronización.
 * 5. Reintentar operaciones fallidas.
 * 6. Recuperar operaciones interrumpidas.
 * 7. Informar el estado de la cola.
 * 8. Notificar cambios a la interfaz.
 * 9. Registrar eventos de auditoría.
 * 10. Conservar el usuario responsable.
 *
 * IMPORTANTE:
 * El adaptador continúa siendo simulado.
 * No existe sincronización real entre dispositivos.
 */

import { db, openDatabase } from "../database";
import { generateUUID } from "../../utils/uuid";
import { sendOperation } from "./syncAdapter";
import { getCurrentUser } from "../auth/authService";
import { recordAuditEvent } from "../audit/auditService";

// =====================================================
// 1. ESTADOS
// =====================================================

export const SYNC_STATUS = Object.freeze({
  PENDING: "PENDIENTE",
  SENDING: "ENVIANDO",
  SYNCED: "SINCRONIZADO",
  ERROR: "ERROR",
  CONFLICT: "CONFLICTO",
});

// =====================================================
// 2. CONFIGURACIÓN
// =====================================================

const MAX_AUTOMATIC_ATTEMPTS = 5;

const INITIAL_RETRY_DELAY = 5000;

const MAX_RETRY_DELAY = 5 * 60 * 1000;

// Tiempo máximo de reserva de una operación.
// Permite recuperar operaciones abandonadas.
const OPERATION_LOCK_DURATION = 5 * 60 * 1000;

let processingPromise = null;

let startPromise = null;

let isStarted = false;

let shouldRun = false;

let retryTimer = null;

const listeners = new Set();

// =====================================================
// 3. FUNCIONES AUXILIARES
// =====================================================

function isOnline() {
  return (
    typeof navigator !== "undefined" &&
    navigator.onLine === true
  );
}

function createSnapshot(data) {
  if (data === null || data === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(data));
}

async function getActorSnapshot() {
  try {
    const user = await getCurrentUser();

    if (!user || !user.id) {
      return null;
    }

    return {
      id: user.id,

      name:
        user.name ||
        user.fullName ||
        user.username ||
        user.email ||
        "Usuario sin nombre",

      role: user.role || null,
    };
  } catch (error) {
    console.error(
      "No fue posible identificar al usuario:",
      error
    );

    return null;
  }
}

async function registerSyncAudit({
  action,
  operation = null,
  details,
  beforeData = null,
  afterData = null,
  actor = null,
}) {
  try {
    await recordAuditEvent({
      action,

      module: "synchronization",

      entityType: "syncQueue",

      entityId:
        operation?.operationId ||
        operation?.id ||
        null,

      details,

      beforeData: createSnapshot(beforeData),

      afterData: createSnapshot(afterData),

      actor: actor || operation?.actor || null,
    });
  } catch (error) {
    console.error(
      "Error al registrar auditoría de sincronización:",
      error
    );
  }
}

function calculateRetryDelay(attempts) {
  const delay =
    INITIAL_RETRY_DELAY *
    Math.pow(2, Math.max(0, attempts - 1));

  return Math.min(delay, MAX_RETRY_DELAY);
}

function isValidDate(value) {
  if (!value) {
    return false;
  }

  return !Number.isNaN(
    new Date(value).getTime()
  );
}

// =====================================================
// 4. RESUMEN DE LA COLA
// =====================================================

export async function getSyncSummary() {
  await openDatabase();

  const counts = {};

  for (const status of Object.values(SYNC_STATUS)) {
    counts[status] = await db.syncQueue
      .where("status")
      .equals(status)
      .count();
  }

  return {
    ...counts,

    pending:
      counts.PENDIENTE +
      counts.ENVIANDO +
      counts.ERROR +
      counts.CONFLICTO,

    retryable:
      counts.PENDIENTE +
      counts.ERROR,
  };
}

async function notifyListeners() {
  try {
    const summary = await getSyncSummary();

    listeners.forEach((listener) => {
      try {
        listener(summary);
      } catch (error) {
        console.error(
          "Error al notificar sincronización:",
          error
        );
      }
    });
  } catch (error) {
    console.error(
      "No fue posible actualizar el resumen:",
      error
    );
  }
}

export function subscribeSyncStatus(listener) {
  if (typeof listener !== "function") {
    throw new Error(
      "El suscriptor debe ser una función."
    );
  }

  listeners.add(listener);

  getSyncSummary()
    .then((summary) => {
      if (listeners.has(listener)) {
        listener(summary);
      }
    })
    .catch((error) => {
      console.error(
        "No fue posible obtener el estado inicial:",
        error
      );
    });

  return () => {
    listeners.delete(listener);
  };
}

// =====================================================
// 5. REGISTRO DE OPERACIONES
// =====================================================

export async function enqueueOperation(data) {
  await openDatabase();

  if (!data || typeof data !== "object") {
    throw new Error(
      "Los datos de la operación no son válidos."
    );
  }

  const {
    entityType,
    entityId,
    operation,
    payload,
  } = data;

  if (
    typeof entityType !== "string" ||
    !entityType.trim()
  ) {
    throw new Error(
      "La operación debe indicar el tipo de entidad."
    );
  }

  if (
    typeof entityId !== "string" ||
    !entityId.trim()
  ) {
    throw new Error(
      "La operación debe indicar el ID del registro."
    );
  }

  const allowedOperations = [
    "CREATE",
    "UPDATE",
    "DELETE",
  ];

  if (!allowedOperations.includes(operation)) {
    throw new Error(
      "Tipo de operación no permitido."
    );
  }

  const operationId =
    data.operationId || generateUUID();

  const existingOperation = await db.syncQueue
    .where("operationId")
    .equals(operationId)
    .first();

  if (existingOperation) {
    return existingOperation;
  }

  const now = new Date().toISOString();

  const actor =
    data.actor || await getActorSnapshot();

  const newOperation = {
    id: generateUUID(),

    operationId,

    entityType: entityType.trim(),

    entityId: entityId.trim(),

    operation,

    payload: payload ?? null,

    actor,

    status: SYNC_STATUS.PENDING,

    // Total histórico de intentos.
    attempts: 0,

    // Intentos automáticos desde el último
    // reinicio manual del contador automático.
    automaticAttempts: 0,

    createdAt: now,

    updatedAt: now,

    nextAttemptAt: now,

    lastAttemptAt: null,

    lastError: null,

    errorHistory: [],

    syncedAt: null,

    syncMode: "SIMULADO",
  };

  try {
    await db.syncQueue.add(newOperation);
  } catch (error) {
    const duplicated = await db.syncQueue
      .where("operationId")
      .equals(operationId)
      .first();

    if (duplicated) {
      return duplicated;
    }

    throw error;
  }

  await registerSyncAudit({
    action: "SYNC_OPERATION_ENQUEUED",

    operation: newOperation,

    actor,

    details:
      `Se agregó a la cola la operación ${operation} ` +
      `sobre ${entityType}, registro ${entityId}.`,

    afterData: newOperation,
  });

  await notifyListeners();

  if (isOnline()) {
    processPendingOperations().catch(console.error);
  }

  return newOperation;
}

// =====================================================
// 6. RESERVA ATÓMICA DE OPERACIONES
// =====================================================

/*
 * Reserva una operación dentro de una transacción
 * de IndexedDB.
 *
 * Dos pestañas no podrán reservar simultáneamente
 * la misma operación si ambas utilizan este servicio.
 */

async function claimOperation(operationId) {
  const now = Date.now();

  const lockToken = generateUUID();

  return db.transaction(
    "rw",
    db.syncQueue,
    async () => {
      const operation = await db.syncQueue.get(
        operationId
      );

      if (!operation) {
        return null;
      }

      const status = operation.status;

      const isEligible =
        status === SYNC_STATUS.PENDING ||
        status === SYNC_STATUS.ERROR;

      const isExpiredSending =
        status === SYNC_STATUS.SENDING &&
        (
          !isValidDate(operation.lockExpiresAt) ||
          new Date(operation.lockExpiresAt).getTime() <= now
        );

      if (!isEligible && !isExpiredSending) {
        return null;
      }

      if (
        operation.nextAttemptAt &&
        isValidDate(operation.nextAttemptAt) &&
        new Date(operation.nextAttemptAt).getTime() > now
      ) {
        return null;
      }

      const totalAttempts =
        (operation.attempts || 0) + 1;

      const automaticAttempts =
        (operation.automaticAttempts ?? operation.attempts ?? 0) + 1;

      const updatedOperation = {
        ...operation,

        status: SYNC_STATUS.SENDING,

        attempts: totalAttempts,

        automaticAttempts,

        lastAttemptAt: new Date(now).toISOString(),

        updatedAt: new Date(now).toISOString(),

        lastError: null,

        lockToken,

        lockExpiresAt: new Date(
          now + OPERATION_LOCK_DURATION
        ).toISOString(),
      };

      await db.syncQueue.update(operation.id, {
        status: updatedOperation.status,

        attempts: updatedOperation.attempts,

        automaticAttempts: updatedOperation.automaticAttempts,

        lastAttemptAt: updatedOperation.lastAttemptAt,

        updatedAt: updatedOperation.updatedAt,

        lastError: null,

        lockToken,

        lockExpiresAt: updatedOperation.lockExpiresAt,
      });

      return updatedOperation;
    }
  );
}

/*
 * Actualiza una operación solamente si conserva
 * el token de reserva correspondiente.
 */

async function updateClaimedOperation(
  operation,
  changes
) {
  return db.transaction(
    "rw",
    db.syncQueue,
    async () => {
      const current = await db.syncQueue.get(
        operation.id
      );

      if (
        !current ||
        current.status !== SYNC_STATUS.SENDING ||
        current.lockToken !== operation.lockToken
      ) {
        return null;
      }

      const updated = {
        ...changes,

        lockToken: null,

        lockExpiresAt: null,
      };

      await db.syncQueue.update(
        operation.id,
        updated
      );

      return {
        ...current,
        ...updated,
      };
    }
  );
}

// =====================================================
// 7. REGISTRO DE ERRORES
// =====================================================

async function registerSyncError(
  operation,
  error
) {
  const now = new Date().toISOString();

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const totalAttempts =
    operation.attempts || 1;

  const automaticAttempts =
    operation.automaticAttempts ??
    totalAttempts;

  const errorEntry = {
    message,

    occurredAt: now,

    attempt: totalAttempts,

    automaticAttempt: automaticAttempts,
  };

  const errorHistory = [
    ...(operation.errorHistory || []),
    errorEntry,
  ];

  const reachedLimit =
    automaticAttempts >= MAX_AUTOMATIC_ATTEMPTS;

  const nextAttemptAt = reachedLimit
    ? null
    : new Date(
        Date.now() +
        calculateRetryDelay(automaticAttempts)
      ).toISOString();

  const updatedOperation = await updateClaimedOperation(
    operation,
    {
      status: SYNC_STATUS.ERROR,

      updatedAt: now,

      lastError: message,

      errorHistory,

      nextAttemptAt,
    }
  );

  // Si otra instancia recuperó la operación,
  // no sobrescribimos su estado.
  if (!updatedOperation) {
    return;
  }

  await registerSyncAudit({
    action: "SYNC_OPERATION_ERROR",

    operation,

    details:
      `Falló la operación ${operation.operationId}. ` +
      `Intento total ${totalAttempts}. ` +
      `Intento automático ${automaticAttempts} de ` +
      `${MAX_AUTOMATIC_ATTEMPTS}. ` +
      `${reachedLimit
        ? "Se alcanzó el límite automático."
        : "Se programó un nuevo intento."} ` +
      `Motivo: ${message}`,

    beforeData: operation,

    afterData: updatedOperation,
  });

  console.error(
    `AndinaCare: error de sincronización en ${operation.operationId}:`,
    message
  );
}

// =====================================================
// 8. PROCESAMIENTO INDIVIDUAL
// =====================================================

async function processSingleOperation(operation) {
  try {
    const result = await sendOperation(operation);

    // -----------------------------------------------
    // CONFLICTO
    // -----------------------------------------------

    if (result?.conflict === true) {
      const now = new Date().toISOString();

      const updatedOperation = await updateClaimedOperation(
        operation,
        {
          status: SYNC_STATUS.CONFLICT,

          updatedAt: now,

          lastError:
            result.message ||
            "Se detectó un conflicto.",

          conflictDetails: result,

          nextAttemptAt: null,
        }
      );

      if (updatedOperation) {
        await registerSyncAudit({
          action: "SYNC_OPERATION_CONFLICT",

          operation,

          details:
            `Se detectó un conflicto en la operación ` +
            `${operation.operationId}.`,

          beforeData: operation,

          afterData: updatedOperation,
        });
      }
    }

    // -----------------------------------------------
    // CONFIRMACIÓN
    // -----------------------------------------------

    else if (result?.confirmed === true) {
      const now = new Date().toISOString();

      const syncedOperation = await updateClaimedOperation(
        operation,
        {
          status: SYNC_STATUS.SYNCED,

          updatedAt: now,

          syncedAt:
            result.confirmedAt || now,

          syncMode: result.simulated
            ? "SIMULADO"
            : "REAL",

          lastError: null,

          nextAttemptAt: null,

          adapterConfirmation: result,
        }
      );

      if (syncedOperation) {
        await registerSyncAudit({
          action: "SYNC_OPERATION_CONFIRMED",

          operation,

          details:
            `El adaptador confirmó la operación ` +
            `${operation.operationId}. ` +
            `Modalidad: ${result.simulated ? "SIMULADO" : "REAL"}.`,

          beforeData: operation,

          afterData: syncedOperation,
        });
      }
    }

    // -----------------------------------------------
    // RESPUESTA INVÁLIDA
    // -----------------------------------------------

    else {
      throw new Error(
        "El adaptador no confirmó la operación."
      );
    }
  } catch (error) {
    await registerSyncError(
      operation,
      error
    );
  }

  await notifyListeners();
}

// =====================================================
// 9. RECUPERACIÓN DE OPERACIONES INTERRUMPIDAS
// =====================================================

async function recoverInterruptedOperations() {
  const now = Date.now();

  const interruptedOperations = await db.syncQueue
    .where("status")
    .equals(SYNC_STATUS.SENDING)
    .toArray();

  let recoveredCount = 0;

  for (const operation of interruptedOperations) {
    const expired =
      !isValidDate(operation.lockExpiresAt) ||
      new Date(operation.lockExpiresAt).getTime() <= now;

    if (!expired) {
      continue;
    }

    const updated = await db.transaction(
      "rw",
      db.syncQueue,
      async () => {
        const current = await db.syncQueue.get(
          operation.id
        );

        if (
          !current ||
          current.status !== SYNC_STATUS.SENDING
        ) {
          return null;
        }

        const currentExpired =
          !isValidDate(current.lockExpiresAt) ||
          new Date(current.lockExpiresAt).getTime() <= Date.now();

        if (!currentExpired) {
          return null;
        }

        const timestamp = new Date().toISOString();

        await db.syncQueue.update(current.id, {
          status: SYNC_STATUS.PENDING,

          updatedAt: timestamp,

          nextAttemptAt: timestamp,

          lastError:
            "Proceso interrumpido. Se volverá a intentar.",

          lockToken: null,

          lockExpiresAt: null,
        });

        return {
          ...current,

          status: SYNC_STATUS.PENDING,

          updatedAt: timestamp,

          nextAttemptAt: timestamp,

          lastError:
            "Proceso interrumpido. Se volverá a intentar.",

          lockToken: null,

          lockExpiresAt: null,
        };
      }
    );

    if (!updated) {
      continue;
    }

    recoveredCount += 1;

    await registerSyncAudit({
      action: "SYNC_OPERATION_INTERRUPTED",

      operation,

      details:
        `Se recuperó la operación ${operation.operationId} ` +
        `que había quedado interrumpida.`,

      beforeData: operation,

      afterData: updated,
    });
  }

  if (recoveredCount > 0) {
    await notifyListeners();
  }

  return recoveredCount;
}

// =====================================================
// 10. PROCESAMIENTO DE LA COLA
// =====================================================

export function processPendingOperations() {
  // Evita procesamientos simultáneos en esta instancia.
  if (processingPromise) {
    return processingPromise;
  }

  processingPromise = (async () => {
    try {
      await openDatabase();

      await recoverInterruptedOperations();

      if (!isOnline()) {
        return;
      }

      const operations = await db.syncQueue
        .where("status")
        .anyOf([
          SYNC_STATUS.PENDING,
          SYNC_STATUS.ERROR,
        ])
        .toArray();

      const readyOperations = operations
        .filter((operation) => {
          if (!operation.nextAttemptAt) {
            return operation.status === SYNC_STATUS.PENDING;
          }

          if (!isValidDate(operation.nextAttemptAt)) {
            return false;
          }

          return (
            new Date(operation.nextAttemptAt).getTime() <=
            Date.now()
          );
        })
        .sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();

          return dateA - dateB;
        });

      for (const operation of readyOperations) {
        if (!isOnline()) {
          break;
        }

        const claimedOperation = await claimOperation(
          operation.id
        );

        if (!claimedOperation) {
          continue;
        }

        await notifyListeners();

        await processSingleOperation(
          claimedOperation
        );
      }
    } catch (error) {
      console.error(
        "Error general en sincronización:",
        error
      );
    } finally {
      await notifyListeners();
    }
  })().finally(() => {
    processingPromise = null;

    if (isStarted && shouldRun) {
      scheduleNextRetry();
    }
  });

  return processingPromise;
}

// =====================================================
// 11. REINTENTOS AUTOMÁTICOS
// =====================================================

async function scheduleNextRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  if (!isStarted || !shouldRun || !isOnline()) {
    return;
  }

  try {
    await openDatabase();

    const retryableOperations = await db.syncQueue
      .where("status")
      .equals(SYNC_STATUS.ERROR)
      .toArray();

    const futureDates = retryableOperations
      .filter((operation) =>
        isValidDate(operation.nextAttemptAt)
      )
      .map((operation) =>
        new Date(operation.nextAttemptAt).getTime()
      )
      .filter((date) => date > Date.now());

    if (futureDates.length === 0) {
      return;
    }

    const nextDate = Math.min(...futureDates);

    const delay = Math.max(
      0,
      nextDate - Date.now()
    );

    retryTimer = setTimeout(() => {
      processPendingOperations().catch(console.error);
    }, delay);
  } catch (error) {
    console.error(
      "No fue posible programar el reintento:",
      error
    );
  }
}

// =====================================================
// 12. REINTENTOS MANUALES
// =====================================================

export async function retryFailedOperations() {
  await openDatabase();

  const actor = await getActorSnapshot();

  const retryableOperations = await db.syncQueue
    .where("status")
    .anyOf([
      SYNC_STATUS.PENDING,
      SYNC_STATUS.ERROR,
    ])
    .toArray();

  const now = new Date().toISOString();

  let updatedCount = 0;

  for (const operation of retryableOperations) {
    const updatedOperation = await db.transaction(
      "rw",
      db.syncQueue,
      async () => {
        const current = await db.syncQueue.get(
          operation.id
        );

        if (
          !current ||
          (
            current.status !== SYNC_STATUS.PENDING &&
            current.status !== SYNC_STATUS.ERROR
          )
        ) {
          return null;
        }

        const updated = {
          status: SYNC_STATUS.PENDING,

          automaticAttempts: 0,

          updatedAt: now,

          nextAttemptAt: now,

          lastError: null,
        };

        await db.syncQueue.update(
          current.id,
          updated
        );

        return {
          ...current,
          ...updated,
        };
      }
    );

    if (!updatedOperation) {
      continue;
    }

    updatedCount += 1;

    await registerSyncAudit({
      action: "SYNC_OPERATION_MANUAL_RETRY",

      operation,

      actor,

      details:
        `El usuario solicitó reintentar manualmente ` +
        `la operación ${operation.operationId}.`,

      beforeData: operation,

      afterData: updatedOperation,
    });
  }

  await notifyListeners();

  if (isOnline()) {
    await processPendingOperations();
  }

  return updatedCount;
}

// =====================================================
// 13. REGRESO DE LA CONEXIÓN
// =====================================================

function handleOnline() {
  if (!isStarted || !shouldRun) {
    return;
  }

  console.info(
    "AndinaCare: conexión detectada. Revisando operaciones pendientes."
  );

  processPendingOperations().catch(console.error);
}

// =====================================================
// 14. INICIO DEL SERVICIO
// =====================================================

export function startSynchronization() {
  shouldRun = true;

  if (isStarted) {
    return Promise.resolve(stopSynchronization);
  }

  // Si ya existe una inicialización pendiente,
  // reutilizamos esa misma promesa.
  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    await openDatabase();

    // Si el servicio fue detenido y no volvió a iniciarse,
    // no registramos eventos ni instalamos listeners.
    if (!shouldRun) {
      return stopSynchronization;
    }

    isStarted = true;

    if (typeof window !== "undefined") {
      window.addEventListener(
        "online",
        handleOnline
      );
    }

    const actor = await getActorSnapshot();

    if (!shouldRun) {
      stopSynchronization();
      return stopSynchronization;
    }

    await registerSyncAudit({
      action: "SYNC_SERVICE_STARTED",

      actor,

      details:
        "Se inició el servicio de sincronización de AndinaCare.",

      afterData: {
        startedAt: new Date().toISOString(),

        online: isOnline(),

        mode: "SIMULADO",
      },
    });

    if (!shouldRun) {
      stopSynchronization();
      return stopSynchronization;
    }

    await notifyListeners();

    processPendingOperations().catch(console.error);

    return stopSynchronization;
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

// =====================================================
// 15. DETENCIÓN DEL SERVICIO
// =====================================================

export function stopSynchronization() {
  shouldRun = false;

  if (typeof window !== "undefined") {
    window.removeEventListener(
      "online",
      handleOnline
    );
  }

  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  isStarted = false;
}
