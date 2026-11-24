
/*
 * ANDINACARE - OPERACIONES CRUD
 *
 * Este archivo contiene funciones reutilizables para:
 * - Crear registros.
 * - Consultar registros.
 * - Modificar registros.
 * - Eliminar registros.
 * - Contar registros.
 *
 * Además, comprueba los permisos del usuario autenticado
 * antes de permitir cualquier operación.
 */

import { db } from "./db";
import { DATABASE_SCHEMA } from "./schema";
import { generateUUID, isValidUUID } from "../../utils/uuid";
import { recordAuditEvent } from "../audit/auditService";

// Consultamos la sesión y los permisos del usuario.
import { getCurrentUser } from "../auth/authService";
import {
  ACTIONS,
  assertPermission,
} from "../auth/permissions";



/*
 * RELACIÓN ENTRE TABLAS Y MÓDULOS
 *
 * Cada tabla queda asociada al módulo que controla
 * sus permisos de lectura, creación, modificación
 * y eliminación.
 *
 * syncQueue se excluye porque es una tabla interna
 * administrada por el servicio de sincronización.
 */

const TABLE_MODULE_MAP = {
  users: "users",
  assets: "assets",
  workOrders: "work-orders",
  safetyRecords: "safety",
  spareParts: "inventory",
  inventoryMovements: "inventory",
  photos: "work-orders",
  interventions: "work-orders",
  manuals: "assets",
  auditLogs: "audit",
};


/*
 * ERROR PERSONALIZADO DE OPERACIONES
 *
 * Conservamos el error original para facilitar
 * el diagnóstico de problemas con IndexedDB o Dexie.
 */

export class DatabaseOperationError extends Error {
  constructor(message, originalError = null) {
    super(message);

    this.name = "DatabaseOperationError";
    this.originalError = originalError;
  }
}


/*
 * COMPROBACIÓN DE PERMISOS
 *
 * Antes de ejecutar una operación CRUD:
 *
 * 1. Comprobamos que la tabla esté autorizada.
 * 2. Comprobamos que exista una sesión activa.
 * 3. Consultamos el usuario actual en IndexedDB.
 * 4. Verificamos que su rol tenga el permiso solicitado.
 *
 * Si alguna comprobación falla, se bloquea la operación.
 */

async function authorizeTableOperation(tableName, action) {

  // Las tablas internas no admiten CRUD general.
  const moduleName = TABLE_MODULE_MAP[tableName];

  if (!moduleName || tableName === "syncQueue") {

    const error = new Error(
      `La tabla "${tableName}" es interna o no admite operaciones CRUD generales.`
    );

    error.name = "PermissionDeniedError";

    throw error;
  }

  // Recuperamos el usuario que tiene la sesión activa.
  const user = await getCurrentUser();

  // Sin usuario autenticado no se permite operar.
  if (!user) {

    const error = new Error(
      "Debes iniciar sesión para realizar esta operación."
    );

    error.name = "PermissionDeniedError";

    throw error;
  }

  // Comprobamos el permiso del rol para el módulo.
  assertPermission(
    user.role,
    moduleName,
    action
  );
}


/*
 * VALIDACIÓN DE TABLAS
 *
 * Evita trabajar con tablas que no existen
 * en el esquema de AndinaCareDB.
 */

function getTable(tableName) {

  if (
    !Object.prototype.hasOwnProperty.call(
      DATABASE_SCHEMA,
      tableName
    )
  ) {
    throw new DatabaseOperationError(
      `La tabla "${tableName}" no existe en AndinaCareDB.`
    );
  }

  return db.table(tableName);
}


/*
 * VALIDACIÓN DE DATOS
 *
 * Los registros deben ser objetos válidos.
 */

function validateRecordData(data) {

  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new DatabaseOperationError(
      "Los datos proporcionados deben ser un objeto válido."
    );
  }
}


/*
 * COMPROBACIÓN DE ERRORES
 *
 * Los errores de permisos deben conservar su nombre
 * y no convertirse en errores genéricos de base de datos.
 */

function isProtectedError(error) {

  return (
    error instanceof DatabaseOperationError ||
    error?.name === "PermissionDeniedError"
  );
}

/*
 * REGISTRAR AUDITORÍA SIN INTERRUMPIR EL CRUD
 *
 * Si ocurre un problema al guardar la auditoría,
 * no declaramos fallida una operación que ya se
 * completó correctamente en la base de datos.
 */

async function registerOperationAudit({
  action,
  entityType,
  entityId,
  details,
}) {
  try {
    await recordAuditEvent({
      action,
      entityType,
      entityId,
      details,
    });
  } catch (error) {
    console.error(
      "La operación se completó, pero no se pudo registrar su auditoría:",
      error
    );
  }
}


/*
 * CREATE: CREAR REGISTRO
 *
 * Comprueba el permiso CREATE antes de guardar.
 */

export async function createRecord(tableName, data) {

  try {

    const table = getTable(tableName);

    // Comprobamos los permisos antes de escribir.
    await authorizeTableOperation(
      tableName,
      ACTIONS.CREATE
    );

    validateRecordData(data);

    // Copiamos los datos para no modificar el objeto original.
    const record = { ...data };

    // Generamos un identificador si no existe.
    if (!record.id) {
      record.id = generateUUID();
    }

    // Validamos el formato UUID.
    if (!isValidUUID(record.id)) {
      throw new DatabaseOperationError(
        "El identificador del registro no tiene formato UUID válido."
      );
    }

    const currentTime = new Date().toISOString();

    record.createdAt = record.createdAt || currentTime;
    record.updatedAt = record.updatedAt || currentTime;

    // add() evita reemplazar registros existentes.
    await table.add(record);

      // Registrar la creación en el historial de auditoría.
  await registerOperationAudit({
    action: "CREATE",
    entityType: tableName,
    entityId: record.id,
    details: `Se creó un registro en ${tableName}.`,
  });

    return record;

  } catch (error) {

    console.error(
      `Error al crear un registro en ${tableName}:`,
      error
    );

    if (isProtectedError(error)) {
      throw error;
    }

    throw new DatabaseOperationError(
      `No fue posible crear el registro en "${tableName}". Puede existir un duplicado o haber ocurrido un error de almacenamiento.`,
      error
    );
  }
}


/*
 * READ: CONSULTAR REGISTRO POR UUID
 *
 * Comprueba el permiso READ antes de consultar.
 */

export async function getRecordById(tableName, id) {

  try {

    const table = getTable(tableName);

    await authorizeTableOperation(
      tableName,
      ACTIONS.READ
    );

    if (!isValidUUID(id)) {
      throw new DatabaseOperationError(
        "El identificador proporcionado no es un UUID válido."
      );
    }

    return await table.get(id);

  } catch (error) {

    console.error(
      `Error al consultar un registro en ${tableName}:`,
      error
    );

    if (isProtectedError(error)) {
      throw error;
    }

    throw new DatabaseOperationError(
      `No fue posible consultar el registro en "${tableName}".`,
      error
    );
  }
}


/*
 * READ: CONSULTAR TODOS LOS REGISTROS
 *
 * Permite:
 * - Ordenar por un índice.
 * - Filtrar por un índice.
 * - Limitar resultados.
 * - Invertir el orden.
 */

export async function getAllRecords(
  tableName,
  {
    index = null,
    equals = undefined,
    limit = undefined,
    reverse = false,
  } = {}
) {

  try {

    const table = getTable(tableName);

    await authorizeTableOperation(
      tableName,
      ACTIONS.READ
    );

    let collection;

    // Búsqueda por índice y valor.
    if (index !== null && equals !== undefined) {

      collection = table.where(index).equals(equals);

    }

    // Ordenamiento por índice.
    else if (index !== null) {

      collection = table.orderBy(index);

    }

    // Consulta completa.
    else {

      collection = table.toCollection();

    }

    // Invertimos el orden si corresponde.
    if (reverse) {
      collection = collection.reverse();
    }

    // Validamos el límite de resultados.
    if (limit !== undefined) {

      if (!Number.isInteger(limit) || limit < 0) {

        throw new DatabaseOperationError(
          "El límite de resultados debe ser un entero mayor o igual a cero."
        );

      }

      collection = collection.limit(limit);
    }

    return await collection.toArray();

  } catch (error) {

    console.error(
      `Error al consultar la tabla ${tableName}:`,
      error
    );

    if (isProtectedError(error)) {
      throw error;
    }

    throw new DatabaseOperationError(
      `No fue posible obtener los registros de "${tableName}".`,
      error
    );
  }
}


/*
 * READ: BUSCAR REGISTRO POR ÍNDICE
 *
 * Ejemplo:
 * findRecordByIndex(
 *   "users",
 *   "email",
 *   "tecnico@andinacare.cl"
 * )
 */

export async function findRecordByIndex(
  tableName,
  index,
  value
) {

  try {

    const table = getTable(tableName);

    await authorizeTableOperation(
      tableName,
      ACTIONS.READ
    );

    return await table
      .where(index)
      .equals(value)
      .first();

  } catch (error) {

    console.error(
      "Error al buscar por índice:",
      error
    );

    if (isProtectedError(error)) {
      throw error;
    }

    throw new DatabaseOperationError(
      `No fue posible realizar la búsqueda en "${tableName}".`,
      error
    );
  }
}


/*
 * UPDATE: MODIFICAR REGISTRO
 *
 * Conserva el ID y la fecha de creación.
 * Actualiza automáticamente updatedAt.
 */

export async function updateRecord(
  tableName,
  id,
  changes
) {

  try {

    const table = getTable(tableName);

    await authorizeTableOperation(
      tableName,
      ACTIONS.UPDATE
    );

    if (!isValidUUID(id)) {
      throw new DatabaseOperationError(
        "El identificador proporcionado no es un UUID válido."
      );
    }

    validateRecordData(changes);

    // No permitimos modificar identificadores ni fechas originales.
    if (
      Object.prototype.hasOwnProperty.call(changes, "id") ||
      Object.prototype.hasOwnProperty.call(changes, "createdAt")
    ) {

      throw new DatabaseOperationError(
        "No está permitido modificar el ID ni la fecha de creación."
      );

    }

    // Comprobamos que el registro exista.
    const existingRecord = await table.get(id);

    if (!existingRecord) {

      throw new DatabaseOperationError(
        `No existe un registro con el ID ${id}.`
      );

    }

    // Preparamos los cambios.
    const changesToApply = {
      ...changes,
      updatedAt: new Date().toISOString(),
    };

    const updatedCount = await table.update(
      id,
      changesToApply
    );

    

    if (updatedCount === 0) {

      throw new DatabaseOperationError(
        "No se pudo actualizar el registro."
      );

    }
    // Recuperar el registro después de modificarlo.
    const updatedRecord = await table.get(id);

    // Registrar la modificación en el historial de auditoría.
    await registerOperationAudit({
      action: "UPDATE",
      entityType: tableName,
      entityId: id,
      details: `Se modificó un registro en ${tableName}.`,
    });

    return updatedRecord;


  } catch (error) {

    console.error(
      `Error al actualizar un registro en ${tableName}:`,
      error
    );

    if (isProtectedError(error)) {
      throw error;
    }

    throw new DatabaseOperationError(
      `No fue posible actualizar el registro en "${tableName}".`,
      error
    );
  }
}


/*
 * DELETE: ELIMINAR REGISTRO
 *
 * Comprueba el permiso DELETE antes de eliminar.
 *
 * La eliminación es física.
 */

export async function deleteRecord(tableName, id) {

  try {

    const table = getTable(tableName);

    await authorizeTableOperation(
      tableName,
      ACTIONS.DELETE
    );

    if (!isValidUUID(id)) {
      throw new DatabaseOperationError(
        "El identificador proporcionado no es un UUID válido."
      );
    }

    const existingRecord = await table.get(id);

    if (!existingRecord) {
      return false;
    }

  await table.delete(id);

  // Registrar la eliminación en el historial de auditoría.
  await registerOperationAudit({
    action: "DELETE",
    entityType: tableName,
    entityId: id,
    details: `Se eliminó un registro de ${tableName}.`,
  });

  return true;

  } catch (error) {

    console.error(
      `Error al eliminar un registro en ${tableName}:`,
      error
    );

    if (isProtectedError(error)) {
      throw error;
    }

    throw new DatabaseOperationError(
      `No fue posible eliminar el registro en "${tableName}".`,
      error
    );
  }
}


/*
 * COUNT: CONTAR REGISTROS
 *
 * También requiere permiso READ.
 */

export async function countRecords(tableName) {

  try {

    const table = getTable(tableName);

    await authorizeTableOperation(
      tableName,
      ACTIONS.READ
    );

    return await table.count();

  } catch (error) {

    console.error(
      `Error al contar registros en ${tableName}:`,
      error
    );

    if (isProtectedError(error)) {
      throw error;
    }

    throw new DatabaseOperationError(
      `No fue posible contar los registros de "${tableName}".`,
      error
    );
  }
}
