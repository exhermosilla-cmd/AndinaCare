
/*
 * ANDINACARE - PRUEBAS DE PERMISOS
 *
 * Este archivo permite comprobar que los roles
 * respetan los permisos configurados en AndinaCare.
 *
 * Son pruebas temporales de desarrollo.
 */

import {
  getCurrentUser,
} from "./authService";

import {
  ACTIONS,
  hasPermission,
} from "./permissions";

import {
  getAllRecords,
  createRecord,
  updateRecord,
} from "../database/operations";


export async function runPermissionTests() {

  console.clear();

  console.log("==================================");
  console.log("ANDINACARE - PRUEBAS DE PERMISOS");
  console.log("==================================");

  // Recuperamos el usuario autenticado.
  const user = await getCurrentUser();

  if (!user) {
    console.error("Debes iniciar sesión antes de ejecutar las pruebas.");
    return;
  }

  console.log("Usuario:", user.name);
  console.log("Rol:", user.role);


  // PRUEBA 1: Consultar activos.

  try {

    await getAllRecords("assets");

    console.log("PRUEBA 1: Consulta de activos: PERMITIDA");

  } catch (error) {

    console.error("PRUEBA 1: Consulta de activos: RECHAZADA", error);

  }


  // PRUEBA 2: Crear una orden de trabajo.
  //
  // Utilizamos datos ficticios y no guardamos
  // ningún registro durante esta prueba.

  console.log(
    "PRUEBA 2: Permiso para crear órdenes:",
    hasPermission(
      user.role,
      "work-orders",
      ACTIONS.CREATE
    ) ? "PERMITIDO" : "RECHAZADO"
  );


  // PRUEBA 3: Modificar activos.
  //
  // Comprobamos el permiso sin modificar
  // ningún registro real.

  console.log(
    "PRUEBA 3: Permiso para modificar activos:",
    hasPermission(
      user.role,
      "assets",
      ACTIONS.UPDATE
    ) ? "PERMITIDO" : "RECHAZADO"
  );


  // PRUEBA 4: Crear usuarios.

  console.log(
    "PRUEBA 4: Permiso para crear usuarios:",
    hasPermission(
      user.role,
      "users",
      ACTIONS.CREATE
    ) ? "PERMITIDO" : "RECHAZADO"
  );


  // PRUEBA 5: Intentar acceder a la cola interna.

  try {

    await getAllRecords("syncQueue");

    console.error("PRUEBA 5: ERROR. Se permitió acceder a syncQueue.");

  } catch (error) {

    if (error.name === "PermissionDeniedError") {
      console.log("PRUEBA 5: Acceso a syncQueue: BLOQUEADO CORRECTAMENTE");
    } else {
      console.error("PRUEBA 5: Error inesperado:", error);
    }

  }

  console.log("==================================");
  console.log("PRUEBAS FINALIZADAS");
  console.log("==================================");
}
