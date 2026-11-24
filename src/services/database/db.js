
/*
 * ANDINACARE - CONEXIÓN CON INDEXEDDB
 *
 * Este archivo crea y configura la base de datos local.
 *
 * Dexie facilita el trabajo con IndexedDB y permite
 * realizar operaciones asíncronas mediante Promises.
 *
 * También administra las versiones y migraciones
 * de la estructura de nuestra base de datos.
 */

import Dexie from "dexie";

import {
  DATABASE_NAME,
  DATABASE_SCHEMA_V1,
  DATABASE_SCHEMA,
  DATABASE_SCHEMA_V3,
  DATABASE_SCHEMA_V4,
  DATABASE_SCHEMA_V5,
} from "./schema";
// Creamos una instancia de Dexie.
export const db = new Dexie(DATABASE_NAME);

/*
 * VERSIÓN 1
 *
 * Representa la estructura original de la aplicación.
 * Se conserva para reconocer los datos existentes.
 */
db.version(1).stores(DATABASE_SCHEMA_V1);

/*
 * VERSIÓN 2
 *
 * Amplía la tabla assets con información técnica,
 * índices de búsqueda y un identificador QR único.
 *
 * Dexie conserva los registros anteriores y crea
 * los nuevos índices automáticamente.
 */
db.version(2).stores(DATABASE_SCHEMA);

/*
 * VERSIÓN 3
 *
 * Incorpora las mejoras del módulo de inventario:
 *
 * - Stock reservado en los repuestos.
 * - Ubicación de almacenamiento.
 * - Nuevos índices para consultar movimientos.
 * - Nueva tabla inventoryReservations.
 *
 * MIGRACIÓN:
 *
 * Los repuestos que ya existían conservan su stock físico.
 * Se inicializa reservedStock en cero porque los registros
 * anteriores no tenían un sistema de reservas.
 *
 * No se eliminan repuestos ni movimientos anteriores.
 */
db.version(3)
  .stores(DATABASE_SCHEMA_V3)
  .upgrade(async (transaction) => {

    const sparePartsTable = transaction.table("spareParts");

    // Actualizamos los repuestos existentes.
    await sparePartsTable.toCollection().modify((part) => {

      // Las unidades físicas existentes se conservan.
      // El campo stock continúa representando el stock físico.

      // Los repuestos antiguos comienzan sin reservas.
      if (
        typeof part.reservedStock !== "number" ||
        !Number.isFinite(part.reservedStock)
      ) {
        part.reservedStock = 0;
      }

      // Evitamos valores negativos en las reservas iniciales.
      if (part.reservedStock < 0) {
        part.reservedStock = 0;
      }

      // La ubicación se inicializa si todavía no existe.
      if (typeof part.location !== "string") {
        part.location = "";
      }

      // La descripción se conserva como campo de texto.
      if (typeof part.description !== "string") {
        part.description = "";
      }
    });

    console.info(
      "AndinaCare: migración de inventario a versión 3 completada."
    );
  });

/*
 * VERSIÓN 4
 *
 * Incorpora mejoras al módulo de auditoría y trazabilidad.
 *
 * Permite consultar los eventos mediante índices de:
 *
 * - Usuario y fecha.
 * - Módulo y fecha.
 * - Acción y fecha.
 *
 * También incorpora campos para identificar el nombre
 * y el rol del usuario responsable de cada evento.
 *
 * IMPORTANTE:
 *
 * Los registros de auditoría existentes se conservan.
 * Los campos nuevos no necesitan inicializarse en los
 * registros antiguos.
 *
 * Dexie administra automáticamente la actualización
 * de los índices al abrir la base de datos.
 */
db.version(4).stores(DATABASE_SCHEMA_V4);

/*
 * VERSIÓN 5
 *
 * Corrige los índices utilizados por las consultas
 * de órdenes de trabajo y reservas de inventario.
 *
 * No modifica ni elimina registros existentes.
 */
db.version(5).stores(DATABASE_SCHEMA_V5);

/**
 * Abre la conexión con IndexedDB.
 *
 * Dexie ejecuta automáticamente las migraciones
 * necesarias al abrir una base de datos antigua.
 *
 * @returns {Promise<Dexie>} Instancia de la base de datos.
 */
export async function openDatabase() {
  try {
    await db.open();

    console.info(
      "AndinaCare: base de datos abierta correctamente."
    );

    console.info(
      `AndinaCare: versión de base de datos ${db.verno}.`
    );

    return db;

  } catch (error) {
    console.error(
      "Error al abrir la base de datos:",
      error
    );

    throw new Error(
      `No fue posible abrir la base de datos: ${error.message}`
    );
  }
}

/**
 * Cierra la conexión con IndexedDB.
 *
 * Los datos no se eliminan al cerrar la conexión.
 */
export function closeDatabase() {
  db.close();

  console.info(
    "AndinaCare: conexión con la base de datos cerrada."
  );
}

/**
 * Comprueba si la conexión está abierta.
 *
 * @returns {boolean} Estado de la conexión.
 */
export function isDatabaseOpen() {
  return db.isOpen();
}
