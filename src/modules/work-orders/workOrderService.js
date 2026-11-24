
/*
 * ANDINACARE - SERVICIO DE ÓRDENES DE TRABAJO
 *
 * Administra las órdenes de mantenimiento industrial.
 *
 * FUNCIONES:
 * 1. Consultar órdenes.
 * 2. Registrar órdenes.
 * 3. Modificar órdenes pendientes.
 * 4. Asignar y reasignar técnicos.
 * 5. Aprobar y rechazar órdenes.
 * 6. Iniciar trabajos con validación de aprobación y AST/LOTO.
 * 7. Completar trabajos con validación fotográfica.
 * 8. Cancelar y eliminar órdenes.
 * 9. Registrar intervenciones.
 * 10. Encolar operaciones para sincronización offline.
 * 11. Identificar al usuario responsable de cada operación.
 * 12. Liberar reservas de inventario al cancelar una OT.
 *
 * REGLAS IMPORTANTES:
 *
 * - Solo Jefatura de Mantenimiento y Administrador/Auditor
 *   pueden asignar o reasignar técnicos.
 * - Cambiar el técnico asignado no reinicia la aprobación.
 * - Una orden debe estar aprobada antes de comenzar.
 * - Una orden requiere un registro AST/LOTO válido
 *   antes de pasar a ejecución.
 * - Las órdenes nuevas requieren fotografías ANTES y DESPUÉS
 *   para poder completarse.
 * - Las órdenes antiguas conservan su comportamiento anterior.
 * - No se permiten transiciones arbitrarias de estados.
 * - Al cancelar una OT se liberan sus reservas pendientes.
 * - Las unidades ya entregadas no se devuelven automáticamente.
 * - No se elimina una OT que tenga historial de reservas.
 */

import { db, openDatabase } from "../../services/database/db";
import { generateUUID } from "../../utils/uuid";
import { getCurrentUser } from "../../services/auth/authService";

import {
  ACTIONS,
  ROLES,
  assertPermission,
} from "../../services/auth/permissions";

import { recordAuditEvent } from "../../services/audit/auditService";

import {
  requireValidSafetyRecord,
} from "../safety/safetyService";

import {
  releaseWorkOrderReservationsInTransaction,
  registerWorkOrderReservationReleaseAudits,
} from "../inventory/inventoryService";

/* ==================================================
   ESTADOS OPERATIVOS
================================================== */

export const WORK_ORDER_STATUSES = {
  PENDING: "PENDIENTE",
  IN_PROGRESS: "EN_PROGRESO",
  COMPLETED: "COMPLETADA",
  CANCELLED: "CANCELADA",
};

/* ==================================================
   ESTADOS DE APROBACIÓN
================================================== */

export const WORK_ORDER_APPROVAL_STATUSES = {
  PENDING: "PENDIENTE",
  APPROVED: "APROBADA",
  REJECTED: "RECHAZADA",
};

/* ==================================================
   PRIORIDADES
================================================== */

export const WORK_ORDER_PRIORITIES = {
  LOW: "BAJA",
  MEDIUM: "MEDIA",
  HIGH: "ALTA",
  URGENT: "URGENTE",
};

/* ==================================================
   TIPOS DE MANTENIMIENTO
================================================== */

export const WORK_ORDER_TYPES = {
  CORRECTIVE: "CORRECTIVO",
  PREVENTIVE: "PREVENTIVO",
  INSPECTION: "INSPECCION",
};

/* ==================================================
   CATEGORÍAS FOTOGRÁFICAS
================================================== */

const WORK_ORDER_PHOTO_CATEGORIES = {
  BEFORE: "ANTES",
  AFTER: "DESPUES",
};

/* ==================================================
   AUTENTICACIÓN Y PERMISOS
================================================== */

async function requireWorkOrderPermission(action) {
  await openDatabase();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error("Debes iniciar sesión para continuar.");
  }

  assertPermission(
    currentUser.role,
    "work-orders",
    action
  );

  return currentUser;
}

function requireApprovalRole(currentUser) {
  const allowedRoles = [
    ROLES.MAINTENANCE_MANAGER,
    ROLES.ADMIN_AUDITOR,
  ];

  if (!allowedRoles.includes(currentUser.role)) {
    throw new Error(
      "No tienes autorización para aprobar o rechazar órdenes."
    );
  }
}

function requireTechnicianAssignmentRole(currentUser) {
  const allowedRoles = [
    ROLES.MAINTENANCE_MANAGER,
    ROLES.ADMIN_AUDITOR,
  ];

  if (!allowedRoles.includes(currentUser.role)) {
    throw new Error(
      "No tienes autorización para asignar o reasignar técnicos."
    );
  }
}

/* ==================================================
   PERMISOS DE EJECUCIÓN Y CANCELACIÓN
================================================== */

function requireWorkOrderExecutionAccess(
  currentUser,
  order
) {
  const managementRoles = [
    ROLES.MAINTENANCE_MANAGER,
    ROLES.ADMIN_AUDITOR,
  ];

  // Jefatura y Administración pueden ejecutar órdenes.
  if (managementRoles.includes(currentUser.role)) {
    return;
  }

  // El técnico solo puede ejecutar órdenes asignadas a él.
  if (currentUser.role === ROLES.TECHNICIAN) {
    if (!order.assignedTo) {
      throw new Error(
        "Esta orden todavía no tiene un técnico asignado. Solicita su asignación a Jefatura de Mantenimiento."
      );
    }

    if (order.assignedTo !== currentUser.id) {
      throw new Error(
        "No puedes ejecutar esta orden porque está asignada a otro técnico."
      );
    }

    return;
  }

  throw new Error(
    "No tienes autorización para ejecutar esta orden."
  );
}

function requireWorkOrderCancellationRole(currentUser) {
  const allowedRoles = [
    ROLES.MAINTENANCE_MANAGER,
    ROLES.ADMIN_AUDITOR,
  ];

  if (!allowedRoles.includes(currentUser.role)) {
    throw new Error(
      "Solo Jefatura de Mantenimiento y Administrador/Auditor pueden cancelar órdenes."
    );
  }
}

/* ==================================================
   IDENTIFICACIÓN DEL RESPONSABLE
================================================== */

function createActorSnapshot(user) {
  if (!user || !user.id) {
    return null;
  }

  return {
    id: user.id,
    name:
      user.name ||
      user.fullName ||
      user.username ||
      "Usuario",
    role: user.role || null,
  };
}

/* ==================================================
   AUDITORÍA
================================================== */

function createAuditSnapshot(data) {
  if (data === null || data === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(data));
}

async function registerWorkOrderAudit({
  action,
  workOrderId,
  details,
  beforeData = null,
  afterData = null,
}) {
  try {
    await recordAuditEvent({
      action,
      module: "workOrders",
      entityType: "workOrders",
      entityId: workOrderId,
      details,
      beforeData: createAuditSnapshot(beforeData),
      afterData: createAuditSnapshot(afterData),
    });
  } catch (error) {
    console.error(
      "Error al registrar auditoría de la orden:",
      error
    );
  }
}

/* ==================================================
   SINCRONIZACIÓN OFFLINE
================================================== */

async function enqueueWorkOrderOperation({
  operation,
  workOrder,
  actor,
}) {
  try {
    const { enqueueOperation } = await import(
      "../../services/synchronization/index.js"
    );

    await enqueueOperation({
      entityType: "workOrders",
      entityId: workOrder.id,
      operation,
      payload: createAuditSnapshot(workOrder),
      actor: createActorSnapshot(actor),
    });
  } catch (error) {
    console.error(
      "No se pudo encolar la orden para sincronización:",
      error
    );
  }
}

/* ==================================================
   VALIDACIONES GENERALES
================================================== */

async function requireExistingWorkOrder(workOrderId) {
  const workOrder = await db.workOrders.get(workOrderId);

  if (!workOrder) {
    throw new Error("La orden de trabajo no existe.");
  }

  return workOrder;
}

async function requireValidTechnician(technicianId) {
  if (!technicianId) {
    return null;
  }

  const technician = await db.users.get(technicianId);

  if (
    !technician ||
    technician.active === false ||
    technician.role !== ROLES.TECHNICIAN
  ) {
    throw new Error(
      "El técnico seleccionado no existe, está inactivo o no tiene el rol de técnico."
    );
  }

  return technician;
}

function validateWorkOrderData(data) {
  if (!data || typeof data !== "object") {
    throw new Error(
      "Debes proporcionar los datos de la orden."
    );
  }

  if (!data.assetId) {
    throw new Error("Debes seleccionar un activo.");
  }

  if (!data.title?.trim()) {
    throw new Error("El título de la orden es obligatorio.");
  }

  if (!data.description?.trim()) {
    throw new Error(
      "La descripción del trabajo es obligatoria."
    );
  }

  if (!Object.values(WORK_ORDER_TYPES).includes(data.type)) {
    throw new Error(
      "El tipo de mantenimiento no es válido."
    );
  }

  if (
    !Object.values(WORK_ORDER_PRIORITIES).includes(data.priority)
  ) {
    throw new Error(
      "La prioridad seleccionada no es válida."
    );
  }

  if (
    data.dueDate &&
    Number.isNaN(Date.parse(data.dueDate))
  ) {
    throw new Error(
      "La fecha programada no es válida."
    );
  }

  return {
    assetId: data.assetId,
    title: data.title.trim(),
    description: data.description.trim(),
    type: data.type,
    priority: data.priority,
    assignedTo: data.assignedTo || null,
    dueDate: data.dueDate || null,
  };
}

/* ==================================================
   GENERAR CÓDIGO ÚNICO
================================================== */

async function generateWorkOrderCode() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  let code;

  do {
    const suffix = generateUUID()
      .replaceAll("-", "")
      .slice(0, 6)
      .toUpperCase();

    code = `OT-${year}${month}${day}-${suffix}`;
  } while (
    await db.workOrders
      .where("code")
      .equals(code)
      .first()
  );

  return code;
}

/* ==================================================
   CONSULTAR TODAS LAS ÓRDENES
================================================== */

export async function getAllWorkOrders() {
  await requireWorkOrderPermission(ACTIONS.READ);

  const orders = await db.workOrders.toArray();

  return orders.sort((a, b) => {
    return (
      new Date(b.createdAt) -
      new Date(a.createdAt)
    );
  });
}

/* ==================================================
   CONSULTAR UNA ORDEN
================================================== */

export async function getWorkOrderById(workOrderId) {
  await requireWorkOrderPermission(ACTIONS.READ);

  return requireExistingWorkOrder(workOrderId);
}

/* ==================================================
   CONSULTAR TÉCNICOS DISPONIBLES
================================================== */

export async function getAvailableTechnicians() {
  await requireWorkOrderPermission(ACTIONS.READ);

  const users = await db.users.toArray();

  return users
    .filter(
      (user) =>
        user.active !== false &&
        user.role === ROLES.TECHNICIAN
    )
    .map((user) => ({
      ...user,
      specialty: user.specialty || "Sin especialidad",
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );
}

/* ==================================================
   BUSCAR ÓRDENES
================================================== */

export async function searchWorkOrders(searchTerm = "") {
  await requireWorkOrderPermission(ACTIONS.READ);

  const term = String(searchTerm)
    .trim()
    .toLowerCase();

  const orders = await db.workOrders.toArray();

  if (!term) {
    return orders;
  }

  return orders.filter((order) => {
    return (
      String(order.code || "").toLowerCase().includes(term) ||
      String(order.title || "").toLowerCase().includes(term) ||
      String(order.description || "").toLowerCase().includes(term)
    );
  });
}

/* ==================================================
   REGISTRAR UNA ORDEN
================================================== */

export async function createWorkOrder(data) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.CREATE
  );

  const validated = validateWorkOrderData(data);

  const asset = await db.assets.get(validated.assetId);

  if (!asset) {
    throw new Error(
      "El activo seleccionado no existe."
    );
  }

  if (validated.assignedTo) {
    requireTechnicianAssignmentRole(currentUser);

    await requireValidTechnician(validated.assignedTo);
  }

  const now = new Date().toISOString();

  const newOrder = {
    id: generateUUID(),

    code: await generateWorkOrderCode(),

    ...validated,

    status: WORK_ORDER_STATUSES.PENDING,

    approvalStatus: WORK_ORDER_APPROVAL_STATUSES.PENDING,

    approvedBy: null,
    approvedByName: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedByName: null,
    rejectedAt: null,
    rejectionReason: "",

    createdBy: currentUser.id,
    createdAt: now,
    updatedAt: now,

    startedAt: null,
    completedAt: null,
    completionNotes: "",

    safetyRecordId: null,

    // Las órdenes nuevas deben tener fotografías ANTES y DESPUÉS.
    requiresBeforeAfterPhotos: true,
  };

  await db.workOrders.add(newOrder);

  await enqueueWorkOrderOperation({
    operation: "CREATE",
    workOrder: newOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "CREATE",
    workOrderId: newOrder.id,
    details: `Se registró la orden ${newOrder.code}.`,
    beforeData: null,
    afterData: newOrder,
  });

  if (validated.assignedTo) {
    const technician = await db.users.get(
      validated.assignedTo
    );

    await registerWorkOrderAudit({
      action: "ASSIGN_TECHNICIAN",
      workOrderId: newOrder.id,
      details: `Se asignó inicialmente la orden ${newOrder.code} al técnico ${technician?.name || validated.assignedTo}.`,
      beforeData: {
        assignedTo: null,
      },
      afterData: {
        assignedTo: validated.assignedTo,
        technicianName: technician?.name || null,
      },
    });
  }

  return newOrder;
}

/* ==================================================
   MODIFICAR UNA ORDEN PENDIENTE
================================================== */

export async function updateWorkOrder(
  workOrderId,
  data
) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.UPDATE
  );

  // Solo Jefatura y Administrador pueden editar órdenes.
  const allowedRoles = [
    ROLES.MAINTENANCE_MANAGER,
    ROLES.ADMIN_AUDITOR,
  ];

  if (!allowedRoles.includes(currentUser.role)) {
    throw new Error(
      "Solo Jefatura de Mantenimiento y Administrador/Auditor pueden modificar órdenes de trabajo."
    );
  }

  const existingOrder = await requireExistingWorkOrder(
    workOrderId
  );

  if (
    existingOrder.status !==
    WORK_ORDER_STATUSES.PENDING
  ) {
    throw new Error(
      "Solo se pueden modificar órdenes pendientes."
    );
  }

  const validated = validateWorkOrderData(data);

  const asset = await db.assets.get(validated.assetId);

  if (!asset) {
    throw new Error(
      "El activo seleccionado no existe."
    );
  }

  const assignedTo =
    data.assignedTo === undefined
      ? existingOrder.assignedTo || null
      : validated.assignedTo;

  if (
    assignedTo !==
    (existingOrder.assignedTo || null)
  ) {
    requireTechnicianAssignmentRole(currentUser);
  }

  if (assignedTo) {
    await requireValidTechnician(assignedTo);
  }

  const updatedOrder = {
    ...existingOrder,

    ...validated,

    assignedTo,

    approvalStatus: WORK_ORDER_APPROVAL_STATUSES.PENDING,

    approvedBy: null,
    approvedByName: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedByName: null,
    rejectedAt: null,
    rejectionReason: "",

    updatedAt: new Date().toISOString(),
  };

  await db.workOrders.put(updatedOrder);

  await enqueueWorkOrderOperation({
    operation: "UPDATE",
    workOrder: updatedOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "UPDATE",
    workOrderId,
    details: `El usuario ${currentUser.name} modificó la orden ${existingOrder.code}. La aprobación volvió a quedar pendiente.`,
    beforeData: existingOrder,
    afterData: updatedOrder,
  });

  return updatedOrder;
}

/* ==================================================
   ASIGNAR O REASIGNAR UN TÉCNICO
================================================== */

export async function assignWorkOrderTechnician(
  workOrderId,
  technicianId
) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.UPDATE
  );

  requireTechnicianAssignmentRole(currentUser);

  let updatedOrder;
  let originalOrder;
  let technician = null;

  await db.transaction(
    "rw",
    db.workOrders,
    db.users,
    db.interventions,
    async () => {
      const order = await requireExistingWorkOrder(
        workOrderId
      );

      originalOrder = order;

      const allowedStatuses = [
        WORK_ORDER_STATUSES.PENDING,
        WORK_ORDER_STATUSES.IN_PROGRESS,
      ];

      if (!allowedStatuses.includes(order.status)) {
        throw new Error(
          "Solo se pueden asignar técnicos a órdenes pendientes o en ejecución."
        );
      }

      if (
        !technicianId &&
        order.status === WORK_ORDER_STATUSES.IN_PROGRESS
      ) {
        throw new Error(
          "No se puede retirar el técnico de una orden que está en ejecución."
        );
      }

      if (technicianId) {
        technician = await requireValidTechnician(
          technicianId
        );
      }

      const now = new Date().toISOString();

      updatedOrder = {
        ...order,

        assignedTo: technicianId || null,

        updatedAt: now,
      };

      await db.workOrders.put(updatedOrder);

      if (
        order.status === WORK_ORDER_STATUSES.IN_PROGRESS
      ) {
        const interventions = await db.interventions
          .where("workOrderId")
          .equals(workOrderId)
          .toArray();

        for (const intervention of interventions) {
          if (!intervention.completedAt) {
            await db.interventions.update(
              intervention.id,
              {
                technicianId: technicianId || null,
              }
            );
          }
        }
      }
    }
  );

  const technicianName = technician
    ? technician.name
    : "Sin asignar";

  await enqueueWorkOrderOperation({
    operation: "UPDATE",
    workOrder: updatedOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "ASSIGN_TECHNICIAN",
    workOrderId,
    details: `El usuario ${currentUser.name} asignó la orden ${updatedOrder.code} al técnico ${technicianName}.`,
    beforeData: {
      assignedTo: originalOrder.assignedTo || null,
    },
    afterData: {
      assignedTo: updatedOrder.assignedTo,
      technicianName,
    },
  });

  return updatedOrder;
}

/* ==================================================
   APROBAR UNA ORDEN
================================================== */

export async function approveWorkOrder(workOrderId) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.UPDATE
  );

  requireApprovalRole(currentUser);

  let updatedOrder;
  let originalOrder;

  await db.transaction(
    "rw",
    db.workOrders,
    async () => {
      const order = await requireExistingWorkOrder(
        workOrderId
      );

      originalOrder = order;

      if (
        order.status !== WORK_ORDER_STATUSES.PENDING
      ) {
        throw new Error(
          "Solo se pueden aprobar órdenes pendientes."
        );
      }

      const currentApprovalStatus =
        order.approvalStatus ||
        WORK_ORDER_APPROVAL_STATUSES.PENDING;

      if (
        currentApprovalStatus !==
        WORK_ORDER_APPROVAL_STATUSES.PENDING
      ) {
        throw new Error(
          "Esta orden ya fue aprobada o rechazada."
        );
      }

      const now = new Date().toISOString();

      updatedOrder = {
        ...order,

        approvalStatus: WORK_ORDER_APPROVAL_STATUSES.APPROVED,

        approvedBy: currentUser.id,
        approvedByName: currentUser.name || "Usuario",
        approvedAt: now,

        rejectedBy: null,
        rejectedByName: null,
        rejectedAt: null,
        rejectionReason: "",

        updatedAt: now,
      };

      await db.workOrders.put(updatedOrder);
    }
  );

  await enqueueWorkOrderOperation({
    operation: "UPDATE",
    workOrder: updatedOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "APPROVE",
    workOrderId,
    details: `El usuario ${currentUser.name} aprobó la orden ${updatedOrder.code}.`,
    beforeData: originalOrder,
    afterData: updatedOrder,
  });

  return updatedOrder;
}

/* ==================================================
   RECHAZAR UNA ORDEN
================================================== */

export async function rejectWorkOrder(
  workOrderId,
  reason = ""
) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.UPDATE
  );

  requireApprovalRole(currentUser);

  const cleanReason = String(reason).trim();

  if (cleanReason.length > 500) {
    throw new Error(
      "El motivo del rechazo no puede superar los 500 caracteres."
    );
  }

  let updatedOrder;
  let originalOrder;

  await db.transaction(
    "rw",
    db.workOrders,
    async () => {
      const order = await requireExistingWorkOrder(
        workOrderId
      );

      originalOrder = order;

      if (
        order.status !== WORK_ORDER_STATUSES.PENDING
      ) {
        throw new Error(
          "Solo se pueden rechazar órdenes pendientes."
        );
      }

      const currentApprovalStatus =
        order.approvalStatus ||
        WORK_ORDER_APPROVAL_STATUSES.PENDING;

      if (
        currentApprovalStatus !==
        WORK_ORDER_APPROVAL_STATUSES.PENDING
      ) {
        throw new Error(
          "Esta orden ya fue aprobada o rechazada."
        );
      }

      const now = new Date().toISOString();

      updatedOrder = {
        ...order,

        approvalStatus: WORK_ORDER_APPROVAL_STATUSES.REJECTED,

        rejectedBy: currentUser.id,
        rejectedByName: currentUser.name || "Usuario",
        rejectedAt: now,
        rejectionReason: cleanReason,

        approvedBy: null,
        approvedByName: null,
        approvedAt: null,

        updatedAt: now,
      };

      await db.workOrders.put(updatedOrder);
    }
  );

  await enqueueWorkOrderOperation({
    operation: "UPDATE",
    workOrder: updatedOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "REJECT",
    workOrderId,
    details: `El usuario ${currentUser.name} rechazó la orden ${updatedOrder.code}. Motivo: ${cleanReason || "No especificado"}.`,
    beforeData: originalOrder,
    afterData: updatedOrder,
  });

  return updatedOrder;
}

/* ==================================================
   INICIAR UNA ORDEN CON AST/LOTO
================================================== */

export async function startWorkOrder(workOrderId) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.UPDATE
  );

  let updatedOrder;
  let originalOrder;

  await db.transaction(
    "rw",
    db.workOrders,
    db.users,
    db.interventions,
    db.safetyRecords,
    async () => {
      const order = await requireExistingWorkOrder(
        workOrderId
      );

      originalOrder = order;

      if (
        order.status !== WORK_ORDER_STATUSES.PENDING
      ) {
        throw new Error(
          "Solo se pueden iniciar órdenes pendientes."
        );
      }

      requireWorkOrderExecutionAccess(
        currentUser,
        order
      );

      if (!order.assignedTo) {
        throw new Error(
          "No puedes iniciar una orden sin un técnico asignado."
        );
      }

      // Validar que el técnico exista y esté activo.
      await requireValidTechnician(order.assignedTo);

      if (
        order.approvalStatus !==
        WORK_ORDER_APPROVAL_STATUSES.APPROVED
      ) {
        throw new Error(
          "La orden debe estar aprobada antes de iniciar el trabajo."
        );
      }

      // Validar el registro AST/LOTO.
      const safetyRecord = await requireValidSafetyRecord(
        workOrderId,
        currentUser.id
      );

      const now = new Date().toISOString();

      updatedOrder = {
        ...order,

        status: WORK_ORDER_STATUSES.IN_PROGRESS,

        startedAt: now,
        updatedAt: now,

        safetyRecordId: safetyRecord.id,
      };

      await db.workOrders.put(updatedOrder);

      // Registrar intervención de mantenimiento.
      await db.interventions.add({
        id: generateUUID(),

        workOrderId: order.id,
        assetId: order.assetId,

        technicianId: order.assignedTo,

        type: order.type,

        startedAt: now,
        completedAt: null,

        notes: "",

        safetyRecordId: safetyRecord.id,
      });
    }
  );

  await enqueueWorkOrderOperation({
    operation: "UPDATE",
    workOrder: updatedOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "START",
    workOrderId,
    details: `Se inició la orden ${updatedOrder.code} después de validar su aprobación y AST/LOTO.`,
    beforeData: originalOrder,
    afterData: updatedOrder,
  });

  return updatedOrder;
}

/* ==================================================
   VALIDAR FOTOGRAFÍAS PARA COMPLETAR UNA OT
================================================== */

async function requireBeforeAndAfterPhotos(workOrderId) {
  const photos = await db.photos
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();

  const hasBeforePhoto = photos.some(
    (photo) =>
      photo.category === WORK_ORDER_PHOTO_CATEGORIES.BEFORE
  );

  const hasAfterPhoto = photos.some(
    (photo) =>
      photo.category === WORK_ORDER_PHOTO_CATEGORIES.AFTER
  );

  if (!hasBeforePhoto && !hasAfterPhoto) {
    throw new Error(
      "No puedes completar esta orden. Debes registrar al menos una fotografía ANTES y una fotografía DESPUÉS del trabajo."
    );
  }

  if (!hasBeforePhoto) {
    throw new Error(
      "No puedes completar esta orden. Falta registrar al menos una fotografía ANTES del trabajo."
    );
  }

  if (!hasAfterPhoto) {
    throw new Error(
      "No puedes completar esta orden. Falta registrar al menos una fotografía DESPUÉS del trabajo."
    );
  }
}

/* ==================================================
   COMPLETAR UNA ORDEN
================================================== */

export async function completeWorkOrder(
  workOrderId,
  completionNotes = ""
) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.UPDATE
  );

  const cleanNotes = String(completionNotes).trim();

  let updatedOrder;
  let originalOrder;

  await db.transaction(
    "rw",
    db.workOrders,
    db.interventions,
    db.photos,
    async () => {
      const order = await requireExistingWorkOrder(
        workOrderId
      );

      originalOrder = order;

      if (
        order.status !== WORK_ORDER_STATUSES.IN_PROGRESS
      ) {
        throw new Error(
          "La orden debe estar en ejecución para poder completarse."
        );
      }

      requireWorkOrderExecutionAccess(
        currentUser,
        order
      );

      /*
       * Las órdenes nuevas tienen el indicador
       * requiresBeforeAfterPhotos en true.
       *
       * Las órdenes históricas que no tienen ese indicador
       * conservan el comportamiento anterior.
       *
       * La consulta se realiza dentro de la transacción
       * para comprobar las fotografías antes del cierre.
       */

      if (order.requiresBeforeAfterPhotos === true) {
        await requireBeforeAndAfterPhotos(workOrderId);
      }

      const now = new Date().toISOString();

      updatedOrder = {
        ...order,

        status: WORK_ORDER_STATUSES.COMPLETED,

        completedAt: now,

        completionNotes: cleanNotes,

        updatedAt: now,
      };

      await db.workOrders.put(updatedOrder);

      const intervention = await db.interventions
        .where("workOrderId")
        .equals(workOrderId)
        .first();

      if (intervention) {
        await db.interventions.update(
          intervention.id,
          {
            completedAt: now,
            notes: cleanNotes,
          }
        );
      } else {
        await db.interventions.add({
          id: generateUUID(),

          workOrderId: order.id,
          assetId: order.assetId,

          technicianId:
            order.assignedTo || currentUser.id,

          type: order.type,

          startedAt: order.startedAt || now,
          completedAt: now,

          notes: cleanNotes,

          safetyRecordId: order.safetyRecordId || null,
        });
      }
    }
  );

  await enqueueWorkOrderOperation({
    operation: "UPDATE",
    workOrder: updatedOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "COMPLETE",
    workOrderId,
    details: `Se completó la orden ${updatedOrder.code}.`,
    beforeData: originalOrder,
    afterData: updatedOrder,
  });

  return updatedOrder;
}

/* ==================================================
   CANCELAR UNA ORDEN Y LIBERAR SUS RESERVAS
================================================== */

/**
 * Cancela una OT y libera las unidades pendientes
 * de todas sus reservas activas o parciales.
 *
 * La cancelación de la OT y la liberación del inventario
 * se realizan en una única transacción Dexie.
 *
 * El usuario necesita permiso para actualizar órdenes,
 * pero no necesita permiso general para administrar inventario.
 *
 * Las unidades previamente entregadas permanecen como
 * salidas físicas y no se devuelven automáticamente.
 */
export async function cancelWorkOrder(workOrderId) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.UPDATE
  );

  requireWorkOrderCancellationRole(currentUser);

  let updatedOrder;
  let originalOrder;
  let reservationAuditEntries = [];

  await db.transaction(
    "rw",
    db.workOrders,
    db.spareParts,
    db.inventoryReservations,
    db.inventoryMovements,
    async () => {
      const order = await requireExistingWorkOrder(
        workOrderId
      );

      originalOrder = order;

      if (
        order.status === WORK_ORDER_STATUSES.COMPLETED ||
        order.status === WORK_ORDER_STATUSES.CANCELLED
      ) {
        throw new Error(
          "Esta orden ya no se puede cancelar."
        );
      }

      /*
       * Libera las reservas pendientes dentro de esta
       * misma transacción.
       */
      reservationAuditEntries =
        await releaseWorkOrderReservationsInTransaction(
          workOrderId,
          currentUser
        );

      const now = new Date().toISOString();

      updatedOrder = {
        ...order,

        status: WORK_ORDER_STATUSES.CANCELLED,

        updatedAt: now,
      };

      await db.workOrders.put(updatedOrder);
    }
  );

  /*
   * La transacción ya fue confirmada.
   * A continuación se registran los eventos externos
   * de auditoría y sincronización.
   */

  await registerWorkOrderReservationReleaseAudits(
    reservationAuditEntries
  );

  await enqueueWorkOrderOperation({
    operation: "UPDATE",
    workOrder: updatedOrder,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "CANCEL",
    workOrderId,
    details: `El usuario ${currentUser.name} canceló la orden ${originalOrder.code}. Se liberaron las reservas pendientes asociadas.`,
    beforeData: originalOrder,
    afterData: updatedOrder,
  });

  return updatedOrder;
}

/* ==================================================
   ELIMINAR UNA ORDEN PENDIENTE
================================================== */

/**
 * Elimina únicamente órdenes pendientes que no tengan
 * intervenciones ni historial de reservas.
 *
 * Se conserva esta protección para no perder la trazabilidad
 * de movimientos y reservas del inventario.
 */
export async function deleteWorkOrder(workOrderId) {
  const currentUser = await requireWorkOrderPermission(
    ACTIONS.DELETE
  );

  let order;

  await db.transaction(
    "rw",
    db.workOrders,
    db.interventions,
    db.inventoryReservations,
    async () => {
      order = await requireExistingWorkOrder(
        workOrderId
      );

      if (
        order.status !== WORK_ORDER_STATUSES.PENDING
      ) {
        throw new Error(
          "Solo se pueden eliminar órdenes pendientes."
        );
      }

      const interventionCount = await db.interventions
        .where("workOrderId")
        .equals(workOrderId)
        .count();

      if (interventionCount > 0) {
        throw new Error(
          "No se puede eliminar una orden que ya tiene intervenciones."
        );
      }

      const reservationCount = await db.inventoryReservations
        .where("workOrderId")
        .equals(workOrderId)
        .count();

      if (reservationCount > 0) {
        throw new Error(
          "No se puede eliminar una orden que tiene historial de reservas de inventario. Cancela la orden para conservar su trazabilidad."
        );
      }

      await db.workOrders.delete(workOrderId);
    }
  );

  /*
   * Se registra la eliminación en la cola.
   * El payload conserva la información de la orden
   * eliminada para que un futuro backend pueda conocer
   * qué registro debe eliminar.
   */

  await enqueueWorkOrderOperation({
    operation: "DELETE",
    workOrder: order,
    actor: currentUser,
  });

  await registerWorkOrderAudit({
    action: "DELETE",
    workOrderId,
    details: `El usuario ${currentUser.name} eliminó la orden ${order.code}.`,
    beforeData: order,
    afterData: null,
  });

  return true;
}
