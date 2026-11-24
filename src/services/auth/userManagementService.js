
/*
 * ANDINACARE - SERVICIO DE ADMINISTRACIÓN DE USUARIOS
 *
 * Administra usuarios, roles, especialidades y RUT.
 */

import { db, openDatabase } from "../database/db";
import { generateUUID } from "../../utils/uuid";
import { getCurrentUser } from "./authService";
import { ACTIONS, assertPermission } from "./permissions";
import { recordAuditEvent } from "../audit/auditService";

const ADMIN_ROLE = "ADMIN_AUDITOR";

const ALLOWED_ROLES = [
  "TECHNICIAN",
  "MAINTENANCE_MANAGER",
  "WAREHOUSE_MANAGER",
  "PLANT_OPERATOR",
  ADMIN_ROLE,
];

export const TECHNICIAN_SPECIALTIES = [
  "Mecánica",
  "Electricidad",
  "Instrumentación y control",
  "Automatización",
  "Lubricación",
  "Soldadura",
  "Mantenimiento general",
];

// --------------------------------------------------
// VALIDACIÓN Y NORMALIZACIÓN DE RUT
// --------------------------------------------------

export function normalizeChileanRut(value) {
  return String(value || "")
    .replace(/\./g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .toUpperCase();
}

export function validateChileanRut(value) {
  const rut = normalizeChileanRut(value);

  if (!/^\d{7,8}[0-9K]$/.test(rut)) {
    return false;
  }

  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);

  const expectedVerifier =
    remainder === 11
      ? "0"
      : remainder === 10
        ? "K"
        : String(remainder);

  return verifier === expectedVerifier;
}

// --------------------------------------------------
// AUTENTICACIÓN Y PERMISOS
// --------------------------------------------------

async function requireAuthenticatedUser() {
  await openDatabase();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error(
      "Debes iniciar sesión para realizar esta operación."
    );
  }

  return currentUser;
}

async function requireUserPermission(action) {
  const currentUser = await requireAuthenticatedUser();

  assertPermission(currentUser.role, "users", action);

  return currentUser;
}

// --------------------------------------------------
// VALIDACIÓN DE DATOS
// --------------------------------------------------

function validateUserData(userData) {
  if (!userData || typeof userData !== "object") {
    throw new Error("Debes proporcionar los datos del usuario.");
  }

  if (
    typeof userData.name !== "string" ||
    !userData.name.trim()
  ) {
    throw new Error("El nombre del usuario es obligatorio.");
  }

  if (
    typeof userData.email !== "string" ||
    !userData.email.trim()
  ) {
    throw new Error("El correo electrónico es obligatorio.");
  }

  const email = userData.email.trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    throw new Error("El correo electrónico no tiene un formato válido.");
  }

  if (!ALLOWED_ROLES.includes(userData.role)) {
    throw new Error("El rol seleccionado no es válido.");
  }

  let specialty = "";
  let rut = "";

  if (userData.role === "TECHNICIAN") {
    if (
      typeof userData.specialty !== "string" ||
      !userData.specialty.trim()
    ) {
      throw new Error(
        "Debes seleccionar una especialidad para el técnico."
      );
    }

    specialty = userData.specialty.trim();

    if (!TECHNICIAN_SPECIALTIES.includes(specialty)) {
      throw new Error("La especialidad seleccionada no es válida.");
    }

    rut = normalizeChileanRut(userData.rut);

    if (!validateChileanRut(rut)) {
      throw new Error(
        "Debes ingresar un RUT chileno válido para el técnico."
      );
    }
  }

  return {
    name: userData.name.trim(),
    email,
    role: userData.role,
    specialty,
    rut,
  };
}

// --------------------------------------------------
// INTEGRIDAD
// --------------------------------------------------

async function validateUniqueEmail(email, excludedUserId = null) {
  const existingUser = await db.users
    .where("email")
    .equals(email)
    .first();

  if (existingUser && existingUser.id !== excludedUserId) {
    throw new Error(
      "Ya existe un usuario registrado con ese correo."
    );
  }
}

async function validateUniqueRut(rut, excludedUserId = null) {
  if (!rut) return;

  const users = await db.users.toArray();

  const duplicate = users.find(
    (user) =>
      user.id !== excludedUserId &&
      user.role === "TECHNICIAN" &&
      normalizeChileanRut(user.rut) === rut
  );

  if (duplicate) {
    throw new Error(
      "Este RUT ya está registrado en otro técnico."
    );
  }
}

async function ensureAnotherActiveAdministrator(excludedUserId) {
  const users = await db.users.toArray();

  const otherActiveAdministrators = users.filter(
    (user) =>
      user.id !== excludedUserId &&
      user.role === ADMIN_ROLE &&
      user.active === true
  );

  if (otherActiveAdministrators.length === 0) {
    throw new Error(
      "No puedes realizar esta operación porque dejarías al sistema sin un administrador activo."
    );
  }
}

// --------------------------------------------------
// AUDITORÍA
// --------------------------------------------------

async function registerUserAudit({
  action,
  entityId,
  details,
  actor,
  beforeData = null,
  afterData = null,
}) {
  try {
    await recordAuditEvent({
      action,
      entityType: "users",
      entityId,
      module: "users",
      details,
      actor,
      beforeData,
      afterData,
    });
  } catch (error) {
    console.error(
      "La operación de usuario se completó, pero no se pudo registrar su auditoría:",
      error
    );
  }
}

// --------------------------------------------------
// CONSULTAR USUARIOS
// --------------------------------------------------

export async function getAllUsers() {
  await requireUserPermission(ACTIONS.READ);

  const users = await db.users.toArray();

  return users.sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

export async function getTechniciansWithSpecialty() {
  await requireUserPermission(ACTIONS.READ);

  const users = await db.users.toArray();

  return users
    .filter(
      (user) =>
        user.role === "TECHNICIAN" &&
        user.active === true
    )
    .map((user) => ({
      id: user.id,
      name: user.name,
      specialty: user.specialty || "Sin especialidad",
      active: user.active,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );
}

// --------------------------------------------------
// CREAR USUARIO
// --------------------------------------------------

export async function createUser(userData) {
  const currentUser = await requireUserPermission(ACTIONS.CREATE);

  const validatedData = validateUserData(userData);

  await validateUniqueEmail(validatedData.email);
  await validateUniqueRut(validatedData.rut);

  const newUser = {
    id: generateUUID(),
    name: validatedData.name,
    email: validatedData.email,
    role: validatedData.role,
    specialty: validatedData.specialty,
    rut: validatedData.rut,
    active: true,
    createdAt: new Date().toISOString(),
  };

  await db.users.add(newUser);

  await registerUserAudit({
    action: "CREATE",
    entityId: newUser.id,
    actor: currentUser,
    details: `El usuario ${currentUser.name} creó la cuenta de ${newUser.name}.`,
    afterData: { ...newUser },
  });

  return newUser;
}

// --------------------------------------------------
// MODIFICAR USUARIO
// --------------------------------------------------

export async function updateUser(userId, userData) {
  const currentUser = await requireUserPermission(ACTIONS.UPDATE);

  const validatedData = validateUserData(userData);

  let existingUser;

  await db.transaction("rw", db.users, async () => {
    existingUser = await db.users.get(userId);

    if (!existingUser) {
      throw new Error(
        "El usuario que intentas modificar no existe."
      );
    }

    if (
      userId === currentUser.id &&
      validatedData.role !== existingUser.role
    ) {
      throw new Error("No puedes cambiar tu propio rol de usuario.");
    }

    if (
      existingUser.role === ADMIN_ROLE &&
      existingUser.active === true &&
      validatedData.role !== ADMIN_ROLE
    ) {
      await ensureAnotherActiveAdministrator(userId);
    }

    const duplicateUser = await db.users
      .where("email")
      .equals(validatedData.email)
      .first();

    if (duplicateUser && duplicateUser.id !== userId) {
      throw new Error(
        "Ya existe un usuario registrado con ese correo."
      );
    }

    await validateUniqueRut(validatedData.rut, userId);

    await db.users.update(userId, {
      name: validatedData.name,
      email: validatedData.email,
      role: validatedData.role,
      specialty: validatedData.specialty,
      rut: validatedData.rut,
    });
  });

  const updatedUser = await db.users.get(userId);

  await registerUserAudit({
    action: "UPDATE",
    entityId: userId,
    actor: currentUser,
    details: `El usuario ${currentUser.name} modificó la cuenta de ${existingUser.name}.`,
    beforeData: { ...existingUser },
    afterData: { ...updatedUser },
  });

  return updatedUser;
}

// --------------------------------------------------
// ACTIVAR O DESACTIVAR USUARIO
// --------------------------------------------------

export async function setUserActive(userId, active) {
  const currentUser = await requireUserPermission(ACTIONS.UPDATE);

  if (typeof active !== "boolean") {
    throw new Error(
      "El estado del usuario debe ser verdadero o falso."
    );
  }

  let existingUser;

  await db.transaction("rw", db.users, async () => {
    existingUser = await db.users.get(userId);

    if (!existingUser) {
      throw new Error(
        "El usuario que intentas modificar no existe."
      );
    }

    if (userId === currentUser.id && active === false) {
      throw new Error("No puedes desactivar tu propia cuenta.");
    }

    if (
      existingUser.role === ADMIN_ROLE &&
      existingUser.active === true &&
      active === false
    ) {
      await ensureAnotherActiveAdministrator(userId);
    }

    if (existingUser.active === active) {
      return;
    }

    await db.users.update(userId, { active });
  });

  const updatedUser = await db.users.get(userId);

  if (existingUser.active === active) {
    return updatedUser;
  }

  await registerUserAudit({
    action: active ? "ACTIVATE" : "DEACTIVATE",
    entityId: userId,
    actor: currentUser,
    details: `El usuario ${currentUser.name} ${active ? "activó" : "desactivó"} la cuenta de ${existingUser.name}.`,
    beforeData: { ...existingUser },
    afterData: { ...updatedUser },
  });

  return updatedUser;
}
