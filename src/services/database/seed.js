
/*
 * ANDINACARE - DATOS INICIALES DE DEMOSTRACIÓN
 *
 * Este archivo permite cargar información de prueba
 * en la base de datos local.
 *
 * Los datos son exclusivamente demostrativos.
 * No representan información real de una empresa.
 *
 * La carga es idempotente: ejecutar esta función varias
 * veces no debe crear duplicados de los registros semilla.
 */

import { db, openDatabase } from "./db";
import { generateUUID } from "../../utils/uuid";

/**
 * Busca un registro mediante un índice único.
 *
 * Si existe, lo devuelve.
 * Si no existe, lo crea.
 *
 * Esta función se ejecuta dentro de una transacción,
 * por lo que las operaciones forman parte de la misma
 * unidad de trabajo.
 */
async function getOrCreateByUniqueIndex(
  tableName,
  index,
  value,
  data
) {
  const table = db.table(tableName);

  // Buscamos primero si ya existe el registro.
  const existingRecord = await table
    .where(index)
    .equals(value)
    .first();

  if (existingRecord) {
    return {
      record: existingRecord,
      created: false,
    };
  }

  // Si no existe, preparamos un nuevo registro.
  const currentTime = new Date().toISOString();

  const newRecord = {
    ...data,
    id: generateUUID(),
    createdAt: data.createdAt || currentTime,
    updatedAt: data.updatedAt || currentTime,
  };

  // add() impide reemplazar registros existentes.
  await table.add(newRecord);

  return {
    record: newRecord,
    created: true,
  };
}

/**
 * Carga los registros iniciales de demostración.
 *
 * Los usuarios, activos, repuestos y órdenes se crean
 * dentro de una única transacción.
 *
 * Si alguna operación falla, Dexie revierte la transacción
 * y evita dejar una carga parcialmente aplicada.
 *
 * @returns {Promise<Object>} Resumen de la carga.
 */
export async function seedDemoData() {
  try {
    // Aseguramos que la base de datos esté abierta.
    await openDatabase();

    const results = await db.transaction(
      "rw",
      db.users,
      db.assets,
      db.spareParts,
      db.workOrders,
      async () => {

        /*
         * 1. USUARIOS DE DEMOSTRACIÓN
         *
         * El correo electrónico es único en la tabla users.
         */

        const technicianResult = await getOrCreateByUniqueIndex(
          "users",
          "email",
          "tecnico@andinacare.cl",
          {
            email: "tecnico@andinacare.cl",
            name: "Técnico de demostración",
            role: "TECHNICIAN",
            active: true,
          }
        );

        const managerResult = await getOrCreateByUniqueIndex(
          "users",
          "email",
          "jefatura@andinacare.cl",
          {
            email: "jefatura@andinacare.cl",
            name: "Jefe de mantenimiento",
            role: "MAINTENANCE_MANAGER",
            active: true,
          }
        );

        /*
         * 2. ACTIVO INDUSTRIAL DE DEMOSTRACIÓN
         *
         * El código del activo es único.
         */

        const assetResult = await getOrCreateByUniqueIndex(
          "assets",
          "code",
          "EXT-001",
          {
            code: "EXT-001",
            name: "Extrusora principal",
            type: "EXTRUSORA",
            criticality: "HIGH",
            status: "OPERATIONAL",
            location: "Planta de producción",
            description: "Equipo de demostración para AndinaCare.",
          }
        );

        /*
         * 3. REPUESTO DE DEMOSTRACIÓN
         *
         * stock representa existencias físicas.
         * minStock representa el mínimo establecido.
         */

        const sparePartResult = await getOrCreateByUniqueIndex(
          "spareParts",
          "code",
          "REP-001",
          {
            code: "REP-001",
            name: "Rodamiento industrial",
            category: "MECANICO",
            stock: 15,
            minStock: 5,
            description: "Repuesto de demostración.",
            updatedAt: new Date().toISOString(),
          }
        );

        /*
         * 4. ORDEN DE TRABAJO DE DEMOSTRACIÓN
         *
         * Se relaciona con el activo y el usuario técnico
         * mediante sus identificadores UUID.
         */

        const workOrderResult = await getOrCreateByUniqueIndex(
          "workOrders",
          "code",
          "OT-DEMO-001",
          {
            code: "OT-DEMO-001",

            assetId: assetResult.record.id,

            createdBy: managerResult.record.id,

            assignedTo: technicianResult.record.id,

            title: "Inspección de extrusora",

            description: "Orden de trabajo de demostración.",

            status: "PENDING",

            priority: "MEDIUM",

            createdAt: new Date().toISOString(),

            updatedAt: new Date().toISOString(),
          }
        );

        /*
         * Devolvemos los resultados para saber qué registros
         * fueron creados y cuáles ya existían.
         */
        return {
          technician: technicianResult,
          manager: managerResult,
          asset: assetResult,
          sparePart: sparePartResult,
          workOrder: workOrderResult,
        };
      }
    );

    // Resumen de la operación.
    const summary = Object.fromEntries(
      Object.entries(results).map(([name, result]) => [
        name,
        {
          id: result.record.id,
          created: result.created,
        },
      ])
    );

    console.info(
      "AndinaCare: datos de demostración cargados correctamente.",
      summary
    );

    return summary;

  } catch (error) {
    console.error(
      "Error al cargar los datos de demostración:",
      error
    );

    throw new Error(
      `No fue posible cargar los datos iniciales: ${error.message}`
    );
  }
}
