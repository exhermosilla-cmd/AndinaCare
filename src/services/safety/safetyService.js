
/*
 * ANDINACARE - SERVICIO DE SEGURIDAD INDUSTRIAL AST/LOTO
 *
 * Administra las confirmaciones de seguridad previas
 * al inicio de una orden de trabajo.
 *
 * IMPORTANTE:
 * Este servicio implementa controles académicos locales.
 * No verifica físicamente los aislamientos ni reemplaza
 * un procedimiento LOTO industrial real.
 */

import { db, openDatabase } from "../database/db";
import { generateUUID } from "../../utils/uuid";
import { getCurrentUser } from "../auth/authService";
import { ACTIONS, assertPermission } from "../auth/permissions";
import { recordAuditEvent } from "../audit/auditService";

/*
 * Identificadores estables de los controles obligatorios.
 * No cambiar estos identificadores después de guardar registros.
 */
export const SAFETY_CHECKLIST = [
  {
    id: "energy_isolation",
    label: "Identificación y aislamiento de todas las fuentes de energía.",
  },
  {
    id: "electrical_lockout",
    label: "Bloqueo de las fuentes de energía eléctrica.",
  },
  {
    id: "mechanical_lockout",
    label: "Bloqueo de las fuentes de energía mecánica.",
  },
  {
    id: "residual_energy",
    label: "Liberación o control de energía residual acumulada.",
  },
  {
    id: "zero_energy_verification",
    label: "Verificación de ausencia de energía mediante el procedimiento correspondiente.",
  },
  {
    id: "absence_confirmation",
    label: "Confirmación final de condición segura antes de intervenir.",
  },
];

/*
 * Comprueba el RUT chileno utilizando el algoritmo módulo 11.
 *
 * Esta validación comprueba el formato y dígito verificador.
 * No comprueba que el RUT pertenezca realmente a la persona.
 */
export function validateChileanRut(value) {
  const rut = String(value || "")
    .replace(/\./g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .toUpperCase();

  if (!/^[0-9]+[0-9K]$/.test(rut) || rut.length < 2) {
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

  const result = 11 - (sum % 11);

  let expected;

  if (result === 11) {
    expected = "0";
  } else if (result === 10) {
    expected = "K";
  } else {
    expected = String(result);
  }

  return verifier === expected;
}

/*
 * Normaliza el RUT para almacenarlo de forma uniforme.
 */
function normalizeRut(value) {
  const clean = String(value || "")
    .replace(/\./g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .toUpperCase();

  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

/*
 * Obtiene el usuario de sesión y comprueba permisos.
 */
async function requireSafetyPermission(action) {
  await openDatabase();

  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesión para continuar.");
  }

  assertPermission(user.role, "work-orders", action);

  return user;
}

/*
 * Comprueba que todos los controles obligatorios estén
 * presentes y confirmados.
 *
 * No basta con que la interfaz indique que el checklist
 * está completo: esta regla se ejecuta en el servicio.
 */
export function isSafetyChecklistComplete(checklist) {
  if (!checklist || typeof checklist !== "object") {
    return false;
  }

  return SAFETY_CHECKLIST.every(
    (item) => checklist[item.id] === true
  );
}

/*
 * Registra la confirmación AST/LOTO.
 *
 * El registro queda asociado a:
 * - La OT.
 * - El usuario de la sesión.
 * - El RUT declarado por el usuario.
 * - La fecha y hora de confirmación.
 * - Todos los controles obligatorios.
 *
 * El registro se guarda en IndexedDB.
 */
export async function confirmSafetyChecklist({
  workOrderId,
  rut,
  checklist,
}) {
  const currentUser = await requireSafetyPermission(ACTIONS.UPDATE);

  if (!workOrderId) {
    throw new Error("No se indicó una orden de trabajo.");
  }

  if (!validateChileanRut(rut)) {
    throw new Error("El RUT ingresado no es válido.");
  }

  if (!isSafetyChecklistComplete(checklist)) {
    throw new Error(
      "Debes confirmar todos los controles obligatorios AST/LOTO."
    );
  }

  let safetyRecord;

  await db.transaction(
    "rw",
    db.workOrders,
    db.safetyRecords,
    async () => {
      const order = await db.workOrders.get(workOrderId);

      if (!order) {
        throw new Error("La orden de trabajo no existe.");
      }

      if (order.status !== "PENDIENTE") {
        throw new Error(
          "El checklist solamente puede confirmarse para una OT pendiente."
        );
      }

      const now = new Date().toISOString();

      safetyRecord = {
        id: generateUUID(),
        workOrderId,
        userId: currentUser.id,
        userName: currentUser.name,
        rut: normalizeRut(rut),
        status: "CONFIRMADO",
        checklist: Object.fromEntries(
          SAFETY_CHECKLIST.map((item) => [
            item.id,
            checklist[item.id] === true,
          ])
        ),
        checklistVersion: 1,
        createdAt: now,
        confirmedAt: now,
      };

      await db.safetyRecords.add(safetyRecord);
    }
  );

  /*
   * La auditoría complementa el registro de seguridad.
   * El registro principal ya quedó guardado en IndexedDB.
   */
  try {
    await recordAuditEvent({
      action: "AST_LOTO_CONFIRMED",
      entityType: "safetyRecords",
      entityId: safetyRecord.id,
      details: `Checklist AST/LOTO confirmado para la OT ${workOrderId}. RUT declarado: ${safetyRecord.rut}.`,
    });
  } catch (error) {
    console.error("Error al registrar auditoría AST/LOTO:", error);
  }

  return safetyRecord;
}

/*
 * Obtiene la confirmación de seguridad más reciente
 * correspondiente a una orden de trabajo.
 */
export async function getSafetyRecordForWorkOrder(workOrderId) {
  await requireSafetyPermission(ACTIONS.READ);

  const records = await db.safetyRecords
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();

  return records
    .filter((record) => record.status === "CONFIRMADO")
    .sort(
      (a, b) =>
        new Date(b.confirmedAt || b.createdAt) -
        new Date(a.confirmedAt || a.createdAt)
    )[0] || null;
}

/*
 * Validación de negocio utilizada al iniciar una OT.
 *
 * No confía en el estado visual de React.
 * Consulta IndexedDB y comprueba:
 * - Existencia del registro.
 * - Estado confirmado.
 * - Integridad de los seis controles.
 * - RUT con formato válido.
 * - Usuario que confirmó el checklist.
 *
 * Se ejecuta dentro de la transacción de inicio de la OT.
 */
export async function requireValidSafetyRecord(
  workOrderId,
  currentUserId
) {
  const records = await db.safetyRecords
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();

  const validRecord = records
    .filter((record) => {
      return (
        record.status === "CONFIRMADO" &&
        record.userId === currentUserId &&
        isSafetyChecklistComplete(record.checklist) &&
        validateChileanRut(record.rut) &&
        record.confirmedAt &&
        !Number.isNaN(Date.parse(record.confirmedAt))
      );
    })
    .sort(
      (a, b) =>
        new Date(b.confirmedAt) - new Date(a.confirmedAt)
    )[0];

  if (!validRecord) {
    throw new Error(
      "No puedes iniciar esta OT: falta una confirmación AST/LOTO válida realizada por el usuario de la sesión."
    );
  }

  return validRecord;
}
