
/*
 * ANDINACARE - SERVICIO DE AUDITORÍA
 *
 * Registra las acciones realizadas por los usuarios
 * dentro de la aplicación.
 *
 * Los registros se almacenan en auditLogs mediante Dexie.
 *
 * FUNCIONES:
 * 1. Registrar eventos de auditoría.
 * 2. Identificar al usuario responsable.
 * 3. Identificar el módulo afectado.
 * 4. Guardar información anterior y posterior.
 * 5. Consultar eventos con filtros.
 *
 * IMPORTANTE:
 * Los eventos se agregan mediante este servicio.
 * No se ofrecen funciones para editar o eliminar registros.
 */

import { db, openDatabase } from "../database/db";
import { getCurrentUser } from "../auth/authService";
import { generateUUID } from "../../utils/uuid";

/*
 * IDENTIFICACIÓN DE MÓDULOS
 *
 * Relaciona los tipos de entidad con sus módulos.
 * Si se proporciona module explícitamente al registrar
 * un evento, se utiliza ese valor.
 */

const MODULE_BY_ENTITY = {
  workOrders: "workOrders",
  safetyRecords: "safety",
  spareParts: "inventory",
  inventoryMovements: "inventory",
  inventoryReservations: "inventory",
  assets: "assets",
  users: "users",
  syncQueue: "synchronization",
};

function resolveModule(entityType, module) {
  if (typeof module === "string" && module.trim()) {
    return module.trim();
  }

  return MODULE_BY_ENTITY[entityType] || entityType;
}

/*
 * RESOLVER USUARIO RESPONSABLE
 *
 * actor permite indicar quién originó una operación.
 *
 * Es especialmente importante para procesos automáticos
 * como la sincronización en segundo plano.
 *
 * Si no se proporciona actor, utilizamos el usuario
 * autenticado actualmente.
 */

async function resolveAuditUser(actor = null) {
  const user = actor || await getCurrentUser();

  if (!user || !user.id) {
    throw new Error(
      "No se puede registrar auditoría sin identificar al usuario responsable."
    );
  }

  return {
    id: user.id,

    name:
      user.name ||
      user.fullName ||
      user.username ||
      user.email ||
      "Usuario sin nombre",

    role: user.role || "SIN_ROL",
  };
}

/*
 * REGISTRAR EVENTO DE AUDITORÍA
 *
 * Guarda quién realizó una acción, qué hizo,
 * en qué módulo, sobre qué registro y cuándo ocurrió.
 *
 * actor: usuario responsable opcional.
 * beforeData: información anterior al cambio.
 * afterData: información posterior al cambio.
 *
 * Si actor no se proporciona, se utiliza la sesión actual.
 */

export async function recordAuditEvent({
  action,
  entityType,
  entityId = null,
  module = null,
  details = null,
  beforeData = null,
  afterData = null,
  actor = null,
}) {
  try {
    await openDatabase();

    // Validamos los datos obligatorios.
    if (
      typeof action !== "string" ||
      !action.trim() ||
      typeof entityType !== "string" ||
      !entityType.trim()
    ) {
      throw new Error(
        "La acción y el tipo de entidad son obligatorios."
      );
    }

    /*
     * Resolvemos el responsable.
     *
     * Si se proporciona actor, se respeta ese usuario.
     * De lo contrario, se consulta la sesión actual.
     */
    const user = await resolveAuditUser(actor);

    const normalizedEntityType = entityType.trim();

    // Construimos el registro.
    const auditRecord = {
      id: generateUUID(),

      userId: user.id,

      userName: user.name,

      userRole: user.role,

      action: action.trim().toUpperCase(),

      module: resolveModule(
        normalizedEntityType,
        module
      ),

      entityType: normalizedEntityType,

      entityId,

      details,

      beforeData,

      afterData,

      createdAt: new Date().toISOString(),
    };

    // Guardamos directamente en la tabla de auditoría.
    await db.auditLogs.add(auditRecord);

    console.info(
      "AndinaCare: evento de auditoría registrado.",
      auditRecord
    );

    return auditRecord;

  } catch (error) {
    console.error(
      "AndinaCare: no fue posible registrar el evento de auditoría:",
      error
    );

    throw error;
  }
}

/*
 * CONSULTAR REGISTROS DE AUDITORÍA
 *
 * Permite filtrar por:
 * - Usuario.
 * - Módulo.
 * - Acción.
 * - Tipo de entidad.
 * - Fecha inicial.
 * - Fecha final.
 *
 * Se mantiene la validación de permisos de lectura.
 */

export async function getAuditLogs({
  limit = 100,
  reverse = true,
  userId = null,
  module = null,
  action = null,
  entityType = null,
  from = null,
  to = null,
} = {}) {
  try {
    await openDatabase();

    const user = await getCurrentUser();

    if (!user) {
      throw new Error(
        "Debes iniciar sesión para consultar la auditoría."
      );
    }

    // Solo los perfiles autorizados pueden consultar.
    const { hasPermission, ACTIONS } = await import(
      "../auth/permissions"
    );

    if (
      !hasPermission(
        user.role,
        "audit",
        ACTIONS.READ
      )
    ) {
      const error = new Error(
        "No tienes permisos para consultar los registros de auditoría."
      );

      error.name = "PermissionDeniedError";

      throw error;
    }

    // Validamos el límite.
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(
        "El límite debe ser un entero mayor o igual a cero."
      );
    }

    if (limit === 0) {
      return [];
    }

    // Validamos las fechas, cuando se proporcionan.
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new Error("La fecha inicial no es válida.");
    }

    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new Error("La fecha final no es válida.");
    }

    if (
      fromDate &&
      toDate &&
      fromDate.getTime() > toDate.getTime()
    ) {
      throw new Error(
        "La fecha inicial no puede ser posterior a la fecha final."
      );
    }

    // Consultamos los registros ordenados por fecha.
    let collection = db.auditLogs.orderBy("createdAt");

    if (reverse) {
      collection = collection.reverse();
    }

    // Obtenemos los registros para aplicar los filtros.
    let logs = await collection.toArray();

    // Filtro por usuario.
    if (userId) {
      logs = logs.filter(
        (log) => log.userId === userId
      );
    }

    // Filtro por módulo.
    if (module) {
      logs = logs.filter(
        (log) => log.module === module
      );
    }

    // Filtro por acción.
    if (action) {
      const normalizedAction = action.trim().toUpperCase();

      logs = logs.filter(
        (log) => log.action === normalizedAction
      );
    }

    // Filtro por tipo de entidad.
    if (entityType) {
      logs = logs.filter(
        (log) => log.entityType === entityType
      );
    }

    // Filtro por fecha inicial.
    if (fromDate) {
      logs = logs.filter(
        (log) =>
          new Date(log.createdAt).getTime() >=
          fromDate.getTime()
      );
    }

    // Filtro por fecha final.
    if (toDate) {
      logs = logs.filter(
        (log) =>
          new Date(log.createdAt).getTime() <=
          toDate.getTime()
      );
    }

    // Aplicamos el límite después de filtrar.
    return logs.slice(0, limit);

  } catch (error) {
    console.error(
      "AndinaCare: error al consultar auditoría:",
      error
    );

    throw error;
  }
}
