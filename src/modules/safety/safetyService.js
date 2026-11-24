
/*
 * ANDINACARE - SERVICIO DE SEGURIDAD INDUSTRIAL AST/LOTO
 *
 * Administra los controles de seguridad previos
 * al inicio de una orden de trabajo.
 *
 * FUNCIONES:
 * 1. Definir controles obligatorios AST/LOTO.
 * 2. Validar el RUT chileno.
 * 3. Verificar todos los controles.
 * 4. Comprobar la identidad del técnico mediante su RUT.
 * 5. Guardar el registro en IndexedDB.
 * 6. Asociar el registro con una orden de trabajo.
 * 7. Consultar registros de seguridad.
 * 8. Impedir el inicio de una OT sin validación.
 * 9. Registrar eventos de auditoría.
 *
 * IMPORTANTE:
 * Este servicio es parte de un prototipo académico.
 * No reemplaza el bloqueo físico, etiquetado ni
 * los procedimientos reales de seguridad industrial.
 */

import { db, openDatabase } from "../../services/database/db";
import { generateUUID } from "../../utils/uuid";
import { getCurrentUser } from "../../services/auth/authService";

import {
  ACTIONS,
  assertPermission,
} from "../../services/auth/permissions";

import { recordAuditEvent } from "../../services/audit/auditService";

/* ==================================================
   CONTROLES OBLIGATORIOS AST/LOTO
================================================== */

export const SAFETY_CHECKLIST = [
  {
    id: "energy_isolation",
    title: "Identificación y aislamiento de energías",
    description:
      "Identificar todas las fuentes de energía y aislarlas antes de intervenir el equipo.",
    required: true,
  },
  {
    id: "electrical_lockout",
    title: "Bloqueo de fuentes eléctricas",
    description:
      "Confirmar el bloqueo de las fuentes de alimentación eléctrica correspondientes.",
    required: true,
  },
  {
    id: "mechanical_lockout",
    title: "Bloqueo de fuentes mecánicas",
    description:
      "Confirmar el bloqueo de componentes móviles y mecanismos.",
    required: true,
  },
  {
    id: "residual_energy",
    title: "Control de energía residual",
    description:
      "Liberar o controlar la energía residual almacenada en el equipo.",
    required: true,
  },
  {
    id: "zero_energy_verification",
    title: "Verificación de energía cero",
    description:
      "Comprobar mediante el procedimiento correspondiente que no existe energía peligrosa.",
    required: true,
  },
  {
    id: "absence_confirmation",
    title: "Confirmación final de condiciones seguras",
    description:
      "Confirmar que el área y el equipo están en condiciones seguras para iniciar el trabajo.",
    required: true,
  },
];

/* ==================================================
   NORMALIZAR RUT
================================================== */

function normalizeRut(value) {
  return String(value || "")
    .replace(/\./g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .toUpperCase();
}

/* ==================================================
   VALIDAR RUT CHILENO
================================================== */

export function validateChileanRut(value) {
  const rut = normalizeRut(value);

  if (!/^\d{7,8}[0-9K]$/.test(rut)) {
    return false;
  }

  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;

    multiplier = multiplier === 7
      ? 2
      : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);

  let expectedVerifier;

  if (remainder === 11) {
    expectedVerifier = "0";
  } else if (remainder === 10) {
    expectedVerifier = "K";
  } else {
    expectedVerifier = String(remainder);
  }

  return verifier === expectedVerifier;
}

/* ==================================================
   VALIDAR IDENTIDAD DEL TÉCNICO
================================================== */

/*
 * Comprueba que el RUT ingresado corresponda
 * al RUT registrado en la cuenta del técnico.
 *
 * No permite utilizar el RUT de otro usuario.
 */

function validateTechnicianIdentity(currentUser, rut) {
  // La comprobación de identidad registrada se aplica
  // a los usuarios con rol de técnico.
  if (currentUser.role !== "TECHNICIAN") {
    return;
  }

  const registeredRut = normalizeRut(currentUser.rut);
  const enteredRut = normalizeRut(rut);

  if (!registeredRut || !validateChileanRut(registeredRut)) {
    throw new Error(
      "Tu cuenta de técnico no tiene un RUT válido registrado. Solicita al administrador que actualice tu información."
    );
  }

  if (enteredRut !== registeredRut) {
    throw new Error(
      "El RUT ingresado no coincide con el RUT registrado en tu cuenta. No puedes confirmar AST/LOTO con la identificación de otro usuario."
    );
  }
}

/* ==================================================
   VALIDAR CHECKLIST COMPLETO
================================================== */

export function isSafetyChecklistComplete(checklist) {
  if (
    !checklist ||
    typeof checklist !== "object" ||
    Array.isArray(checklist)
  ) {
    return false;
  }

  return SAFETY_CHECKLIST
    .filter((item) => item.required)
    .every((item) => checklist[item.id] === true);
}

/* ==================================================
   VALIDAR PERMISOS
================================================== */

async function requireSafetyPermission(action) {
  await openDatabase();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error(
      "Debes iniciar sesión para continuar."
    );
  }

  assertPermission(
    currentUser.role,
    "safety",
    action
  );

  return currentUser;
}

/* ==================================================
   COPIA DE DATOS PARA AUDITORÍA
================================================== */

function createAuditSnapshot(data) {
  if (data === null || data === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(data));
}

/* ==================================================
   AUDITORÍA DE SEGURIDAD
================================================== */

async function registerSafetyAudit({
  action,
  safetyRecord,
  details,
  actor,
  beforeData = null,
  afterData = null,
}) {
  try {
    await recordAuditEvent({
      action,
      module: "safety",
      entityType: "safetyRecords",
      entityId: safetyRecord.id,
      details,
      beforeData: createAuditSnapshot(beforeData),
      afterData: createAuditSnapshot(afterData),

      actor: actor
        ? {
            id: actor.id,
            name:
              actor.name ||
              actor.fullName ||
              actor.username ||
              "Usuario",
            role: actor.role || null,
          }
        : null,
    });
  } catch (error) {
    console.error(
      "Error al registrar auditoría de seguridad:",
      error
    );
  }
}

/* ==================================================
   CONFIRMAR Y GUARDAR CHECKLIST
================================================== */

/*
 * Confirma los controles AST/LOTO y crea un registro
 * de seguridad asociado a una orden de trabajo.
 *
 * La orden debe:
 * - Existir.
 * - Estar pendiente de ejecución.
 * - Estar previamente aprobada.
 *
 * Para técnicos:
 * - El RUT debe estar registrado en su cuenta.
 * - El RUT ingresado debe coincidir con el registrado.
 *
 * El registro incluye:
 * - Usuario responsable.
 * - RUT validado.
 * - Controles confirmados.
 * - Fecha de confirmación.
 * - Versión del checklist.
 */

export async function confirmSafetyChecklist({
  workOrderId,
  rut,
  checklist,
}) {
  const currentUser = await requireSafetyPermission(
    ACTIONS.CREATE
  );

  if (!workOrderId) {
    throw new Error(
      "No se recibió una orden de trabajo válida."
    );
  }

  const normalizedRut = normalizeRut(rut);

  if (!validateChileanRut(normalizedRut)) {
    throw new Error(
      "El RUT ingresado no es válido. Revisa el dígito verificador."
    );
  }

  // Verificar identidad del técnico autenticado.
  validateTechnicianIdentity(currentUser, normalizedRut);

  if (!isSafetyChecklistComplete(checklist)) {
    throw new Error(
      "Debes confirmar todos los controles obligatorios AST/LOTO."
    );
  }

  /*
   * Verificar que la orden exista.
   */

  const order = await db.workOrders.get(workOrderId);

  if (!order) {
    throw new Error(
      "La orden de trabajo no existe."
    );
  }

  /*
   * Solo se permite confirmar el checklist
   * para órdenes pendientes de ejecución.
   */

  if (order.status !== "PENDIENTE") {
    throw new Error(
      "El checklist solo puede confirmarse para una orden pendiente."
    );
  }

  /*
   * PROTECCIÓN DE APROBACIÓN:
   *
   * Las órdenes antiguas sin approvalStatus se consideran
   * pendientes de aprobación.
   *
   * Solo una orden explícitamente APROBADA puede guardar
   * un registro AST/LOTO.
   */

  const approvalStatus =
    order.approvalStatus || "PENDIENTE";

  if (approvalStatus !== "APROBADA") {
    throw new Error(
      "No puedes confirmar el checklist AST/LOTO. La orden debe estar aprobada previamente."
    );
  }

  /*
   * Crear una copia validada de los controles.
   */

  const validatedChecklist = {};

  for (const item of SAFETY_CHECKLIST) {
    validatedChecklist[item.id] =
      checklist[item.id] === true;
  }

  const now = new Date().toISOString();

  const safetyRecord = {
    id: generateUUID(),

    workOrderId,

    userId: currentUser.id,

    userName: currentUser.name || "Usuario sin nombre",

    rut: normalizedRut,

    status: "CONFIRMADO",

    checklist: validatedChecklist,

    checklistVersion: 1,

    createdAt: now,

    confirmedAt: now,
  };

  /*
   * Persistir el registro en IndexedDB.
   */

  await db.safetyRecords.add(safetyRecord);

  /*
   * Registrar el evento de auditoría.
   */

  await registerSafetyAudit({
    action: "SAFETY_CHECKLIST_CONFIRMED",

    safetyRecord,

    actor: currentUser,

    details:
      `El usuario ${safetyRecord.userName} confirmó los controles AST/LOTO de la orden ${order.code || workOrderId}.`,

    beforeData: null,

    afterData: safetyRecord,
  });

  return safetyRecord;
}

/* ==================================================
   CONSULTAR REGISTRO DE SEGURIDAD
================================================== */

export async function getSafetyRecordForWorkOrder(
  workOrderId
) {
  await requireSafetyPermission(ACTIONS.READ);

  if (!workOrderId) {
    return null;
  }

  const records = await db.safetyRecords
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();

  const confirmedRecords = records
    .filter((record) => record.status === "CONFIRMADO")
    .sort((a, b) => {
      return (
        new Date(b.confirmedAt || b.createdAt) -
        new Date(a.confirmedAt || a.createdAt)
      );
    });

  return confirmedRecords[0] || null;
}

/* ==================================================
   VALIDAR REGISTRO ANTES DE INICIAR LA OT
================================================== */

/*
 * Comprueba que exista un registro AST/LOTO válido.
 *
 * CONDICIONES:
 * 1. Debe pertenecer a la orden solicitada.
 * 2. Debe estar confirmado.
 * 3. Debe pertenecer al usuario que inicia el trabajo.
 * 4. Debe contener un RUT válido.
 * 5. Para técnicos, el RUT debe coincidir con el perfil.
 * 6. Debe tener todos los controles confirmados.
 * 7. Debe tener fecha de confirmación.
 *
 * Si no cumple todas las condiciones, se impide
 * el inicio de la orden.
 */

export async function requireValidSafetyRecord(
  workOrderId,
  currentUserId
) {
  await openDatabase();

  if (!workOrderId || !currentUserId) {
    throw new Error(
      "No se pudo verificar el registro AST/LOTO."
    );
  }

  // Recuperar el usuario que intenta iniciar la OT.
  const currentUser = await db.users.get(currentUserId);

  if (!currentUser || currentUser.active !== true) {
    throw new Error(
      "No se pudo verificar la identidad del usuario que intenta iniciar la orden."
    );
  }

  /*
   * Comprobar nuevamente el RUT registrado del técnico.
   * Esto evita iniciar una OT con un registro que ya
   * no coincide con la identidad actualmente almacenada.
   */

  if (currentUser.role === "TECHNICIAN") {
    const registeredRut = normalizeRut(currentUser.rut);

    if (!validateChileanRut(registeredRut)) {
      throw new Error(
        "Tu cuenta no tiene un RUT válido registrado. Solicita al administrador que actualice tu información."
      );
    }
  }

  const records = await db.safetyRecords
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();

  const validRecord = records
    .filter((record) => {
      const rutMatches =
        currentUser.role !== "TECHNICIAN" ||
        normalizeRut(record.rut) === normalizeRut(currentUser.rut);

      return (
        record.status === "CONFIRMADO" &&
        record.workOrderId === workOrderId &&
        record.userId === currentUserId &&
        validateChileanRut(record.rut) &&
        rutMatches &&
        isSafetyChecklistComplete(record.checklist) &&
        Boolean(record.confirmedAt)
      );
    })
    .sort((a, b) => {
      return (
        new Date(b.confirmedAt) -
        new Date(a.confirmedAt)
      );
    })[0];

  if (!validRecord) {
    throw new Error(
      "No puedes iniciar esta orden. Primero debes completar y confirmar el checklist AST/LOTO con tu identificación registrada."
    );
  }

  return validRecord;
}

/* ==================================================
   CONSULTAR TODOS LOS REGISTROS AST/LOTO
================================================== */

/*
 * Recupera los registros de seguridad confirmados.
 *
 * Se utiliza en la pantalla principal de Seguridad.
 *
 * Los registros se devuelven ordenados desde
 * el más reciente al más antiguo.
 *
 * Esta función es únicamente de consulta:
 * no modifica ni elimina información.
 */

export async function getSafetyRecords() {
  await requireSafetyPermission(ACTIONS.READ);

  const records = await db.safetyRecords.toArray();

  return records
    .filter((record) => record.status === "CONFIRMADO")
    .sort((a, b) => {
      return (
        new Date(b.confirmedAt || b.createdAt) -
        new Date(a.confirmedAt || a.createdAt)
      );
    });
}
