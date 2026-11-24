
/*
 * ANDINACARE - EXPORTACIONES DE LA BASE DE DATOS
 *
 * Este archivo centraliza las funciones y elementos
 * disponibles del servicio de persistencia.
 *
 * Facilita las importaciones desde otros módulos.
 */

// Instancia y administración de la base de datos.
export {
  db,
  openDatabase,
  closeDatabase,
  isDatabaseOpen,
} from "./db";

// Operaciones CRUD.
export {
  createRecord,
  getRecordById,
  getAllRecords,
  findRecordByIndex,
  updateRecord,
  deleteRecord,
  countRecords,
  DatabaseOperationError,
} from "./operations";

// Carga de datos iniciales.
export { seedDemoData } from "./seed";

// Esquema y nombre de la base de datos.
export {
  DATABASE_NAME,
  DATABASE_SCHEMA,
} from "./schema";

// Generación y validación de UUID.
export {
  generateUUID,
  isValidUUID,
} from "../../utils/uuid";
