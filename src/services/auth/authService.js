
/*
 * ANDINACARE - SERVICIO DE AUTENTICACIÓN
 *
 * Este archivo administra los usuarios de demostración
 * y la sesión iniciada dentro de la aplicación.
 *
 * IMPORTANTE:
 * La autenticación utiliza perfiles de demostración.
 * No utiliza contraseñas ni representa autenticación
 * segura de un sistema de producción.
 */

import { db, openDatabase } from "../database/db";
import { generateUUID } from "../../utils/uuid";

// --------------------------------------------------
// CONFIGURACIÓN DE SESIÓN
// --------------------------------------------------

// Clave utilizada para guardar el ID del usuario
// que inició sesión en la pestaña actual.
const SESSION_KEY = "andinacare_session_user_id";

// --------------------------------------------------
// USUARIOS DE DEMOSTRACIÓN
// --------------------------------------------------

// Perfiles iniciales que se crean automáticamente
// cuando la aplicación se ejecuta por primera vez.
//
// Si un usuario ya existe, no se modifica su estado.
// Esto permite que un administrador pueda desactivarlo
// sin que la aplicación lo reactive automáticamente.

const DEMO_USERS = [
  {
    email: "tecnico@andinacare.cl",
    name: "Técnico de demostración",
    role: "TECHNICIAN",
  },
  {
    email: "jefatura@andinacare.cl",
    name: "Jefe de mantenimiento",
    role: "MAINTENANCE_MANAGER",
  },
  {
    email: "bodega@andinacare.cl",
    name: "Encargado de bodega",
    role: "WAREHOUSE_MANAGER",
  },
  {
    email: "operador@andinacare.cl",
    name: "Operador de planta",
    role: "PLANT_OPERATOR",
  },
  {
    email: "admin@andinacare.cl",
    name: "Administrador / Auditor",
    role: "ADMIN_AUDITOR",
  },
];

// --------------------------------------------------
// INICIALIZACIÓN DE USUARIOS DE DEMOSTRACIÓN
// --------------------------------------------------

/**
 * Comprueba que existan los usuarios iniciales.
 *
 * Si un usuario no existe, lo crea.
 *
 * Si ya existe, lo conserva sin modificarlo.
 *
 * Esta función es idempotente: puede ejecutarse
 * varias veces sin duplicar los usuarios.
 */
export async function ensureDemoUsers() {
  await openDatabase();

  await db.transaction("rw", db.users, async () => {
    for (const demoUser of DEMO_USERS) {
      const existingUser = await db.users
        .where("email")
        .equals(demoUser.email)
        .first();

      // Solamente crea el usuario si todavía no existe.
      if (!existingUser) {
        const newUser = {
          id: generateUUID(),
          ...demoUser,
          active: true,
          createdAt: new Date().toISOString(),
        };

        await db.users.add(newUser);
      }

      // IMPORTANTE:
      // No reactivamos usuarios existentes.
      // Si un administrador desactiva una cuenta,
      // ese estado debe mantenerse.
    }
  });
}

// --------------------------------------------------
// OBTENER USUARIOS DISPONIBLES PARA INICIAR SESIÓN
// --------------------------------------------------

/**
 * Devuelve únicamente los usuarios activos.
 *
 * Los usuarios inactivos no aparecen en la pantalla
 * de selección de perfiles.
 */
export async function getDemoUsers() {
  await ensureDemoUsers();

  const users = await db.users.toArray();

  return users.filter((user) => user.active === true);
}

// --------------------------------------------------
// INICIAR SESIÓN
// --------------------------------------------------

/**
 * Inicia sesión utilizando el perfil seleccionado.
 *
 * Recibe el ID del usuario y comprueba que exista
 * y que su cuenta esté activa.
 */
export async function loginAsDemoUser(userId) {
  await openDatabase();

  const user = await db.users.get(userId);

  if (!user) {
    throw new Error("El usuario seleccionado no existe.");
  }

  if (user.active !== true) {
    throw new Error("Este usuario se encuentra desactivado.");
  }

  // Guardamos el ID del usuario en la sesión actual.
  sessionStorage.setItem(SESSION_KEY, user.id);

  return user;
}

// --------------------------------------------------
// CERRAR SESIÓN
// --------------------------------------------------

/**
 * Elimina la sesión del usuario actual.
 */
export function logoutDemoUser() {
  sessionStorage.removeItem(SESSION_KEY);
}

// --------------------------------------------------
// RESTAURAR SESIÓN
// --------------------------------------------------

/**
 * Comprueba si existe una sesión anterior.
 *
 * Si el usuario todavía existe y está activo,
 * devuelve sus datos.
 *
 * Si no existe o está desactivado, elimina la sesión.
 */
export async function restoreSession() {
  await openDatabase();

  const userId = sessionStorage.getItem(SESSION_KEY);

  if (!userId) {
    return null;
  }

  const user = await db.users.get(userId);

  if (!user || user.active !== true) {
    logoutDemoUser();
    return null;
  }

  return user;
}

// --------------------------------------------------
// OBTENER USUARIO AUTENTICADO
// --------------------------------------------------

/**
 * Devuelve el usuario correspondiente a la sesión actual.
 *
 * Si no existe una sesión válida, devuelve null.
 *
 * Esta función también comprueba que el usuario
 * continúe activo.
 */
export async function getCurrentUser() {
  await openDatabase();

  const userId = sessionStorage.getItem(SESSION_KEY);

  if (!userId) {
    return null;
  }

  const user = await db.users.get(userId);

  if (!user || user.active !== true) {
    logoutDemoUser();
    return null;
  }

  return user;
}
