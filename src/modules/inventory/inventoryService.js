
/*
 * ANDINACARE - SERVICIO DE BODEGA E INVENTARIO
 *
 * Este archivo administra el catálogo de repuestos,
 * las existencias, las reservas y las entregas.
 *
 * Todas las operaciones se almacenan en IndexedDB
 * mediante Dexie.
 *
 * =====================================================
 * REGLAS DE NEGOCIO DEL INVENTARIO
 * =====================================================
 *
 * 1. STOCK FÍSICO:
 *    Representa las unidades que existen físicamente
 *    en la bodega.
 *
 * 2. STOCK RESERVADO:
 *    Representa las unidades comprometidas para
 *    órdenes de trabajo aprobadas.
 *
 * 3. STOCK DISPONIBLE:
 *    Se calcula mediante:
 *
 *    stock - reservedStock
 *
 * 4. RESERVAR:
 *    Aumenta reservedStock.
 *    No modifica stock.
 *
 * 5. ENTREGAR:
 *    Descuenta stock físico.
 *    Libera la reserva correspondiente.
 *
 * 6. CANCELAR RESERVA:
 *    Libera las unidades reservadas.
 *    No modifica el stock físico.
 *
 * 7. STOCK NEGATIVO:
 *    Nunca se permite stock físico o reservado negativo.
 *
 * 8. TRAZABILIDAD:
 *    Cada movimiento registra el repuesto, el usuario,
 *    la fecha, el tipo de operación y la OT relacionada.
 *
 * 9. CONSISTENCIA:
 *    Las reservas, entregas, entradas y movimientos
 *    se ejecutan mediante transacciones Dexie.
 *
 * 10. AUDITORÍA:
 *     Las operaciones importantes generan eventos
 *     en auditLogs con información anterior y posterior.
 */

// =====================================================
// IMPORTACIONES
// =====================================================

import { db, openDatabase } from "../../services/database/db";

import { generateUUID } from "../../utils/uuid";

import { getCurrentUser } from "../../services/auth/authService";

import {
  ACTIONS,
  assertPermission,
} from "../../services/auth/permissions";

import { recordAuditEvent } from "../../services/audit/auditService";

// =====================================================
// CONSTANTES
// =====================================================

export const INVENTORY_MOVEMENT_TYPES = {
  ENTRY: "ENTRADA",
  EXIT: "SALIDA",
  RESERVATION: "RESERVA",
  RESERVATION_RELEASE: "LIBERACION_RESERVA",
};

export const INVENTORY_RESERVATION_STATUS = {
  ACTIVE: "ACTIVA",
  PARTIAL: "PARCIAL",
  DELIVERED: "ENTREGADA",
  CANCELLED: "CANCELADA",
};

// =====================================================
// FUNCIONES INTERNAS DE VALIDACIÓN
// =====================================================

/**
 * Comprueba que el usuario esté autenticado
 * y tenga permisos para trabajar con inventario.
 *
 * @param {string} action Acción requerida.
 * @returns {Promise<object>} Usuario autenticado.
 */
async function requireInventoryPermission(action) {
  await openDatabase();

  const user = await getCurrentUser();

  if (!user) {
    throw new Error(
      "Debes iniciar sesión para realizar esta operación."
    );
  }

  assertPermission(
    user.role,
    "inventory",
    action
  );

  return user;
}

/**
 * Valida que una cantidad sea un número entero positivo.
 *
 * @param {number} quantity Cantidad que se desea validar.
 */
function validatePositiveQuantity(quantity) {
  if (
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      "La cantidad debe ser un número entero mayor que cero."
    );
  }
}

/**
 * Valida un texto obligatorio.
 *
 * @param {string} value Texto que se desea validar.
 * @param {string} fieldName Nombre del campo.
 */
function validateRequiredText(value, fieldName) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `El campo ${fieldName} es obligatorio.`
    );
  }
}

/**
 * Crea una copia independiente de los datos.
 *
 * Se utiliza para conservar el estado anterior
 * y posterior de una operación en la auditoría.
 *
 * @param {object|null} data Información original.
 * @returns {object|null} Copia de la información.
 */
function createAuditSnapshot(data) {
  if (data === null || data === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(data));
}

/**
 * Registra un evento de auditoría del inventario.
 *
 * La auditoría se ejecuta después de confirmar
 * la transacción de inventario.
 *
 * Si ocurre un error, no se revierte la operación
 * de inventario que ya fue guardada.
 *
 * @param {object} data Información del evento.
 */
async function registerInventoryAudit({
  action,
  entityType,
  entityId,
  details,
  beforeData = null,
  afterData = null,
}) {
  try {
    const actor = await getCurrentUser();

    await recordAuditEvent({
      action,
      module: "inventory",
      entityType,
      entityId,
      details,
      beforeData: createAuditSnapshot(beforeData),
      afterData: createAuditSnapshot(afterData),
      actor,
    });
  } catch (error) {
    console.error(
      "Error al registrar auditoría de inventario:",
      error
    );
  }
}

/**
 * Calcula el stock disponible.
 *
 * El stock disponible no se almacena directamente.
 * Se calcula a partir del stock físico y reservado.
 *
 * @param {object} sparePart Repuesto.
 * @returns {number} Stock disponible.
 */
export function calculateAvailableStock(sparePart) {
  const physicalStock = Number(sparePart.stock || 0);
  const reservedStock = Number(sparePart.reservedStock || 0);

  return physicalStock - reservedStock;
}

/**
 * Valida la integridad de las existencias.
 *
 * @param {object} sparePart Repuesto.
 */
function validateStockIntegrity(sparePart) {
  const stock = Number(sparePart.stock);
  const reservedStock = Number(sparePart.reservedStock || 0);

  if (
    !Number.isFinite(stock) ||
    !Number.isFinite(reservedStock) ||
    stock < 0 ||
    reservedStock < 0 ||
    reservedStock > stock
  ) {
    throw new Error(
      "El inventario presenta cantidades inconsistentes."
    );
  }
}

/**
 * Comprueba que una OT esté aprobada para reservar.
 *
 * El modelo actual de órdenes de trabajo no tiene
 * un campo de aprobación definido en su esquema.
 *
 * Por eso, se acepta una aprobación explícita mediante
 * approvalStatus = APROBADA o approved = true.
 *
 * No se considera que una OT esté aprobada solamente
 * porque esté pendiente o en ejecución.
 *
 * @param {object} workOrder Orden de trabajo.
 */
function validateApprovedWorkOrder(workOrder) {
  const isApproved =
    workOrder.approvalStatus === "APROBADA" ||
    workOrder.approved === true;

  if (!isApproved) {
    throw new Error(
      "No se pueden reservar repuestos: la orden de trabajo no está aprobada."
    );
  }

  if (
    workOrder.status === "CANCELADA" ||
    workOrder.status === "COMPLETADA"
  ) {
    throw new Error(
      "No se pueden reservar repuestos para una OT cancelada o completada."
    );
  }
}

/**
 * Registra un movimiento dentro de una transacción.
 *
 * Esta función no inicia una transacción propia.
 * Debe ejecutarse dentro de una transacción Dexie
 * que incluya la tabla inventoryMovements.
 *
 * @param {object} data Datos del movimiento.
 * @param {object} user Usuario responsable.
 * @returns {Promise<object>} Movimiento registrado.
 */
async function createMovement(data, user) {
  const movement = {
    id: generateUUID(),

    sparePartId: data.sparePartId,

    workOrderId: data.workOrderId || null,

    reservationId: data.reservationId || null,

    type: data.type,

    quantity: data.quantity,

    stockBefore: data.stockBefore ?? null,

    stockAfter: data.stockAfter ?? null,

    reservedBefore: data.reservedBefore ?? null,

    reservedAfter: data.reservedAfter ?? null,

    description: data.description || "",

    createdBy: user.id,

    createdByName: user.name || "Usuario sin nombre",

    createdAt: new Date().toISOString(),
  };

  await db.inventoryMovements.add(movement);

  return movement;
}

// =====================================================
// 1. CATÁLOGO DE REPUESTOS
// =====================================================

/**
 * Registra un nuevo repuesto en el catálogo.
 *
 * Si se registra una existencia inicial, también se
 * crea un movimiento de entrada.
 *
 * @param {object} data Datos del repuesto.
 * @returns {Promise<object>} Repuesto registrado.
 */
export async function createSparePart(data) {
  const user = await requireInventoryPermission(ACTIONS.CREATE);

  const code = String(data.code || "").trim().toUpperCase();

  const name = String(data.name || "").trim();

  const description = String(data.description || "").trim();

  const location = String(data.location || "").trim();

  const category = String(data.category || "GENERAL").trim();

  const initialStock = Number(data.stock ?? 0);

  const minStock = Number(data.minStock ?? 0);

  validateRequiredText(code, "código");
  validateRequiredText(name, "nombre");

  if (
    !Number.isInteger(initialStock) ||
    initialStock < 0
  ) {
    throw new Error(
      "El stock inicial debe ser un número entero igual o mayor que cero."
    );
  }

  if (
    !Number.isInteger(minStock) ||
    minStock < 0
  ) {
    throw new Error(
      "El stock mínimo debe ser un número entero igual o mayor que cero."
    );
  }

  const now = new Date().toISOString();

  const sparePart = {
    id: generateUUID(),

    code,
    name,
    description,
    location,
    category,

    stock: initialStock,

    reservedStock: 0,

    minStock,

    active: true,

    createdAt: now,

    updatedAt: now,
  };

  let initialMovement = null;

  await db.transaction(
    "rw",
    db.spareParts,
    db.inventoryMovements,
    async () => {
      const existing = await db.spareParts
        .where("code")
        .equals(code)
        .first();

      if (existing) {
        throw new Error(
          "Ya existe un repuesto registrado con ese código."
        );
      }

      await db.spareParts.add(sparePart);

      if (initialStock > 0) {
        initialMovement = await createMovement(
          {
            sparePartId: sparePart.id,
            type: INVENTORY_MOVEMENT_TYPES.ENTRY,
            quantity: initialStock,
            stockBefore: 0,
            stockAfter: initialStock,
            reservedBefore: 0,
            reservedAfter: 0,
            description: "Stock inicial del repuesto.",
          },
          user
        );
      }
    }
  );

  await registerInventoryAudit({
    action: "SPARE_PART_CREATED",
    entityType: "spareParts",
    entityId: sparePart.id,
    details: `Se creó el repuesto ${sparePart.code} - ${sparePart.name}.`,
    beforeData: null,
    afterData: {
      sparePart,
      initialMovement,
    },
  });

  return sparePart;
}

/**
 * Obtiene un repuesto por su identificador.
 *
 * @param {string} sparePartId Identificador del repuesto.
 */
export async function getSparePartById(sparePartId) {
  await requireInventoryPermission(ACTIONS.READ);

  const sparePart = await db.spareParts.get(sparePartId);

  if (!sparePart) {
    throw new Error("No se encontró el repuesto solicitado.");
  }

  validateStockIntegrity(sparePart);

  return {
    ...sparePart,
    availableStock: calculateAvailableStock(sparePart),
  };
}

/**
 * Obtiene el catálogo completo de repuestos.
 *
 * @param {object} options Filtros opcionales.
 */
export async function getSpareParts(options = {}) {
  await requireInventoryPermission(ACTIONS.READ);

  const {
    search = "",
    onlyActive = true,
    lowStockOnly = false,
  } = options;

  let parts = await db.spareParts.toArray();

  if (onlyActive) {
    parts = parts.filter((part) => part.active !== false);
  }

  const searchText = String(search).trim().toLowerCase();

  if (searchText) {
    parts = parts.filter((part) =>
      [
        part.code,
        part.name,
        part.description,
        part.category,
        part.location,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText)
    );
  }

  parts = parts.map((part) => {
    validateStockIntegrity(part);

    return {
      ...part,
      availableStock: calculateAvailableStock(part),
    };
  });

  if (lowStockOnly) {
    parts = parts.filter(
      (part) => part.availableStock <= Number(part.minStock || 0)
    );
  }

  return parts.sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/**
 * Actualiza los datos descriptivos de un repuesto.
 *
 * Esta función no modifica directamente las existencias.
 * Para modificar stock se deben utilizar las operaciones
 * de entrada, reserva y entrega.
 *
 * @param {string} sparePartId Identificador del repuesto.
 * @param {object} changes Cambios.
 */
export async function updateSparePart(sparePartId, changes) {
  await requireInventoryPermission(ACTIONS.UPDATE);

  const allowedFields = [
    "code",
    "name",
    "description",
    "location",
    "category",
    "minStock",
    "active",
  ];

  const updateData = {};

  for (const field of allowedFields) {
    if (changes?.[field] !== undefined) {
      updateData[field] = changes[field];
    }
  }

  const originalPart = await db.spareParts.get(sparePartId);

  if (!originalPart) {
    throw new Error("No se encontró el repuesto para actualizar.");
  }

  if (updateData.code !== undefined) {
    updateData.code = String(updateData.code).trim().toUpperCase();
    validateRequiredText(updateData.code, "código");

    const duplicate = await db.spareParts
      .where("code")
      .equals(updateData.code)
      .first();

    if (duplicate && duplicate.id !== sparePartId) {
      throw new Error(
        "Ya existe otro repuesto con ese código."
      );
    }
  }

  if (updateData.name !== undefined) {
    updateData.name = String(updateData.name).trim();
    validateRequiredText(updateData.name, "nombre");
  }

  if (updateData.minStock !== undefined) {
    if (
      !Number.isInteger(updateData.minStock) ||
      updateData.minStock < 0
    ) {
      throw new Error(
        "El stock mínimo debe ser un número entero no negativo."
      );
    }
  }

  updateData.updatedAt = new Date().toISOString();

  const updated = await db.spareParts.update(
    sparePartId,
    updateData
  );

  if (!updated) {
    throw new Error("No se encontró el repuesto para actualizar.");
  }

  const updatedPart = await db.spareParts.get(sparePartId);

  await registerInventoryAudit({
    action: "SPARE_PART_UPDATED",
    entityType: "spareParts",
    entityId: sparePartId,
    details: `Se modificaron los datos del repuesto ${updatedPart.code} - ${updatedPart.name}.`,
    beforeData: originalPart,
    afterData: updatedPart,
  });

  return {
    ...updatedPart,
    availableStock: calculateAvailableStock(updatedPart),
  };
}

/**
 * Desactiva un repuesto.
 *
 * Se conserva el historial y los movimientos.
 * No se elimina físicamente el registro.
 *
 * @param {string} sparePartId Identificador del repuesto.
 */
export async function deactivateSparePart(sparePartId) {
  return updateSparePart(sparePartId, {
    active: false,
  });
}

// =====================================================
// 2. ALERTAS DE STOCK BAJO
// =====================================================

/**
 * Obtiene los repuestos cuyo stock disponible
 * es igual o inferior al stock mínimo.
 *
 * @returns {Promise<Array>} Repuestos con alerta.
 */
export async function getLowStockParts() {
  return getSpareParts({
    onlyActive: true,
    lowStockOnly: true,
  });
}

// =====================================================
// 3. ENTRADAS DE INVENTARIO
// =====================================================

/**
 * Registra una entrada de repuestos a la bodega.
 *
 * Aumenta el stock físico.
 * No modifica las reservas existentes.
 *
 * @param {object} data Datos de la entrada.
 */
export async function registerInventoryEntry(data) {
  const user = await requireInventoryPermission(ACTIONS.CREATE);

  const {
    sparePartId,
    quantity,
    description = "Entrada de inventario.",
  } = data;

  validatePositiveQuantity(quantity);

  let updatedPart = null;
  let originalPart = null;
  let movement = null;

  await db.transaction(
    "rw",
    db.spareParts,
    db.inventoryMovements,
    async () => {
      const sparePart = await db.spareParts.get(sparePartId);

      if (!sparePart) {
        throw new Error("El repuesto no existe.");
      }

      validateStockIntegrity(sparePart);

      if (sparePart.active === false) {
        throw new Error("El repuesto está desactivado.");
      }

      originalPart = createAuditSnapshot(sparePart);

      const stockBefore = sparePart.stock;

      const stockAfter = stockBefore + quantity;

      await db.spareParts.update(sparePartId, {
        stock: stockAfter,
        updatedAt: new Date().toISOString(),
      });

      movement = await createMovement(
        {
          sparePartId,
          type: INVENTORY_MOVEMENT_TYPES.ENTRY,
          quantity,
          stockBefore,
          stockAfter,
          reservedBefore: sparePart.reservedStock || 0,
          reservedAfter: sparePart.reservedStock || 0,
          description,
        },
        user
      );

      updatedPart = {
        ...sparePart,
        stock: stockAfter,
      };
    }
  );

  await registerInventoryAudit({
    action: "INVENTORY_ENTRY_REGISTERED",
    entityType: "inventoryMovements",
    entityId: movement.id,
    details: `Entrada de ${quantity} unidades del repuesto ${updatedPart.code}.`,
    beforeData: {
      sparePart: originalPart,
    },
    afterData: {
      sparePart: updatedPart,
      movement,
    },
  });

  return {
    ...updatedPart,
    availableStock: calculateAvailableStock(updatedPart),
  };
}

// =====================================================
// 4. RESERVAS PARA ÓRDENES DE TRABAJO
// =====================================================

/**
 * Reserva unidades de un repuesto para una OT aprobada.
 *
 * IMPORTANTE:
 *
 * Esta operación NO descuenta el stock físico.
 *
 * Solamente aumenta reservedStock y disminuye
 * el stock disponible calculado.
 *
 * @param {object} data Datos de la reserva.
 */
export async function reserveSparePart(data) {
  const user = await requireInventoryPermission(ACTIONS.CREATE);

  const {
    sparePartId,
    workOrderId,
    quantity,
  } = data;

  validatePositiveQuantity(quantity);

  validateRequiredText(sparePartId, "repuesto");
  validateRequiredText(workOrderId, "orden de trabajo");

  let result = null;
  let originalPart = null;
  let updatedPart = null;
  let reservation = null;
  let movement = null;

  await db.transaction(
    "rw",
    db.spareParts,
    db.workOrders,
    db.inventoryReservations,
    db.inventoryMovements,
    async () => {
      const workOrder = await db.workOrders.get(workOrderId);

      if (!workOrder) {
        throw new Error("La orden de trabajo no existe.");
      }

      validateApprovedWorkOrder(workOrder);

      const sparePart = await db.spareParts.get(sparePartId);

      if (!sparePart) {
        throw new Error("El repuesto no existe.");
      }

      if (sparePart.active === false) {
        throw new Error("El repuesto está desactivado.");
      }

      validateStockIntegrity(sparePart);

      const availableStock = calculateAvailableStock(sparePart);

      if (quantity > availableStock) {
        throw new Error(
          `Stock insuficiente. Disponible: ${availableStock} unidades.`
        );
      }

      originalPart = createAuditSnapshot(sparePart);

      const now = new Date().toISOString();

      const reservedBefore = sparePart.reservedStock || 0;
      const reservedAfter = reservedBefore + quantity;

      // El stock físico NO se modifica.
      await db.spareParts.update(sparePartId, {
        reservedStock: reservedAfter,
        updatedAt: now,
      });

      reservation = {
        id: generateUUID(),

        sparePartId,

        workOrderId,

        quantity,

        deliveredQuantity: 0,

        createdBy: user.id,

        createdByName: user.name || "Usuario sin nombre",

        status: INVENTORY_RESERVATION_STATUS.ACTIVE,

        createdAt: now,

        updatedAt: now,
      };

      await db.inventoryReservations.add(reservation);

      movement = await createMovement(
        {
          sparePartId,
          workOrderId,
          reservationId: reservation.id,
          type: INVENTORY_MOVEMENT_TYPES.RESERVATION,
          quantity,
          stockBefore: sparePart.stock,
          stockAfter: sparePart.stock,
          reservedBefore,
          reservedAfter,
          description: "Reserva de repuestos para orden de trabajo.",
        },
        user
      );

      updatedPart = {
        ...sparePart,
        reservedStock: reservedAfter,
      };

      result = {
        reservation,
        stock: sparePart.stock,
        reservedStock: reservedAfter,
        availableStock: sparePart.stock - reservedAfter,
      };
    }
  );

  await registerInventoryAudit({
    action: "SPARE_PART_RESERVED",
    entityType: "inventoryReservations",
    entityId: reservation.id,
    details: `Se reservaron ${quantity} unidades del repuesto ${sparePartId} para la OT ${workOrderId}.`,
    beforeData: {
      sparePart: originalPart,
      reservation: null,
    },
    afterData: {
      sparePart: updatedPart,
      reservation,
      movement,
    },
  });

  return result;
}

/**
 * Obtiene las reservas asociadas a una OT.
 *
 * @param {string} workOrderId Identificador de la OT.
 */
export async function getWorkOrderReservations(workOrderId) {
  await requireInventoryPermission(ACTIONS.READ);

  return db.inventoryReservations
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();
}

/**
 * Obtiene las reservas activas de un repuesto.
 *
 * @param {string} sparePartId Identificador del repuesto.
 */
export async function getSparePartReservations(sparePartId) {
  await requireInventoryPermission(ACTIONS.READ);

  return db.inventoryReservations
    .where("sparePartId")
    .equals(sparePartId)
    .filter((reservation) =>
      [
        INVENTORY_RESERVATION_STATUS.ACTIVE,
        INVENTORY_RESERVATION_STATUS.PARTIAL,
      ].includes(reservation.status)
    )
    .toArray();
}

// =====================================================
// 5. ENTREGA DE REPUESTOS
// =====================================================

/**
 * Confirma la entrega de unidades reservadas.
 *
 * REGLAS:
 *
 * 1. Debe existir una reserva activa o parcial.
 * 2. La cantidad entregada no puede superar
 *    las unidades pendientes de esa reserva.
 * 3. Se descuenta el stock físico.
 * 4. Se libera la reserva por la cantidad entregada.
 * 5. Se registra un movimiento de salida.
 *
 * Si la entrega es parcial, la reserva permanece
 * activa por las unidades que todavía faltan.
 *
 * @param {object} data Datos de la entrega.
 */
export async function deliverReservation(data) {
  const user = await requireInventoryPermission(ACTIONS.UPDATE);

  const {
    reservationId,
    quantity,
    description = "Entrega de repuestos para orden de trabajo.",
  } = data;

  let result = null;
  let originalReservation = null;
  let originalPart = null;
  let updatedReservation = null;
  let updatedPart = null;
  let movement = null;

  await db.transaction(
    "rw",
    db.spareParts,
    db.inventoryReservations,
    db.inventoryMovements,
    async () => {
      const reservation = await db.inventoryReservations.get(reservationId);

      if (!reservation) {
        throw new Error("La reserva no existe.");
      }

      if (
        ![
          INVENTORY_RESERVATION_STATUS.ACTIVE,
          INVENTORY_RESERVATION_STATUS.PARTIAL,
        ].includes(reservation.status)
      ) {
        throw new Error(
          "La reserva no está disponible para entrega."
        );
      }

      const pendingQuantity =
        reservation.quantity - (reservation.deliveredQuantity || 0);

      const deliveryQuantity = quantity === undefined
        ? pendingQuantity
        : quantity;

      validatePositiveQuantity(deliveryQuantity);

      if (deliveryQuantity > pendingQuantity) {
        throw new Error(
          `La cantidad supera lo pendiente de entregar: ${pendingQuantity} unidades.`
        );
      }

      const sparePart = await db.spareParts.get(
        reservation.sparePartId
      );

      if (!sparePart) {
        throw new Error("El repuesto asociado no existe.");
      }

      validateStockIntegrity(sparePart);

      if (deliveryQuantity > sparePart.stock) {
        throw new Error(
          "No existe suficiente stock físico para completar la entrega."
        );
      }

      if (deliveryQuantity > (sparePart.reservedStock || 0)) {
        throw new Error(
          "La cantidad a entregar supera el stock reservado."
        );
      }

      originalReservation = createAuditSnapshot(reservation);
      originalPart = createAuditSnapshot(sparePart);

      const stockBefore = sparePart.stock;
      const stockAfter = stockBefore - deliveryQuantity;

      const reservedBefore = sparePart.reservedStock || 0;
      const reservedAfter = reservedBefore - deliveryQuantity;

      if (stockAfter < 0 || reservedAfter < 0) {
        throw new Error(
          "La operación produciría un inventario negativo."
        );
      }

      const deliveredQuantity =
        (reservation.deliveredQuantity || 0) + deliveryQuantity;

      const isFullyDelivered =
        deliveredQuantity === reservation.quantity;

      const now = new Date().toISOString();

      // Descontamos el stock físico y liberamos la reserva.
      await db.spareParts.update(sparePart.id, {
        stock: stockAfter,
        reservedStock: reservedAfter,
        updatedAt: now,
      });

      // Actualizamos el estado de la reserva.
      await db.inventoryReservations.update(reservationId, {
        deliveredQuantity,
        status: isFullyDelivered
          ? INVENTORY_RESERVATION_STATUS.DELIVERED
          : INVENTORY_RESERVATION_STATUS.PARTIAL,
        updatedAt: now,
      });

      updatedReservation = {
        ...reservation,
        deliveredQuantity,
        status: isFullyDelivered
          ? INVENTORY_RESERVATION_STATUS.DELIVERED
          : INVENTORY_RESERVATION_STATUS.PARTIAL,
        updatedAt: now,
      };

      updatedPart = {
        ...sparePart,
        stock: stockAfter,
        reservedStock: reservedAfter,
      };

      // Registramos la salida física.
      movement = await createMovement(
        {
          sparePartId: sparePart.id,
          workOrderId: reservation.workOrderId,
          reservationId,
          type: INVENTORY_MOVEMENT_TYPES.EXIT,
          quantity: deliveryQuantity,
          stockBefore,
          stockAfter,
          reservedBefore,
          reservedAfter,
          description,
        },
        user
      );

      result = {
        reservationId,
        deliveredQuantity: deliveryQuantity,
        totalDelivered: deliveredQuantity,
        pendingQuantity: reservation.quantity - deliveredQuantity,
        stock: stockAfter,
        reservedStock: reservedAfter,
        availableStock: stockAfter - reservedAfter,
        status: isFullyDelivered
          ? INVENTORY_RESERVATION_STATUS.DELIVERED
          : INVENTORY_RESERVATION_STATUS.PARTIAL,
      };
    }
  );

  await registerInventoryAudit({
    action: "RESERVATION_DELIVERED",
    entityType: "inventoryReservations",
    entityId: reservationId,
    details: `Se entregaron ${result.deliveredQuantity} unidades de la reserva ${reservationId}.`,
    beforeData: {
      reservation: originalReservation,
      sparePart: originalPart,
    },
    afterData: {
      reservation: updatedReservation,
      sparePart: updatedPart,
      movement,
    },
  });

  return result;
}

// =====================================================
// LIBERACIÓN INTERNA DE RESERVAS POR CANCELACIÓN DE OT
// =====================================================

/**
 * Libera las unidades pendientes de las reservas de una OT.
 *
 * IMPORTANTE:
 * - Esta función NO solicita permisos generales de inventario.
 * - Solo debe invocarse desde la cancelación autorizada de una OT.
 * - Debe ejecutarse dentro de una transacción Dexie que incluya:
 *   workOrders, spareParts, inventoryReservations e inventoryMovements.
 * - No devuelve al stock físico las unidades ya entregadas.
 *
 * @param {string} workOrderId Identificador de la OT.
 * @param {object} actor Usuario que cancela la OT.
 * @returns {Promise<Array>} Datos para registrar auditoría después del commit.
 */
export async function releaseWorkOrderReservationsInTransaction(
  workOrderId,
  actor
) {
  if (!actor?.id) {
    throw new Error(
      "No se pudo identificar al usuario responsable de liberar las reservas."
    );
  }

  const reservations = await db.inventoryReservations
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();

  const auditEntries = [];

  for (const reservation of reservations) {
    if (
      ![
        INVENTORY_RESERVATION_STATUS.ACTIVE,
        INVENTORY_RESERVATION_STATUS.PARTIAL,
      ].includes(reservation.status)
    ) {
      continue;
    }

    const sparePart = await db.spareParts.get(
      reservation.sparePartId
    );

    if (!sparePart) {
      throw new Error(
        `No se puede cancelar la OT: no se encontró el repuesto asociado a la reserva ${reservation.id}.`
      );
    }

    validateStockIntegrity(sparePart);

    const quantity = Number(reservation.quantity);
    const deliveredQuantity = Number(
      reservation.deliveredQuantity || 0
    );

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isInteger(deliveredQuantity) ||
      deliveredQuantity < 0 ||
      deliveredQuantity > quantity
    ) {
      throw new Error(
        `La reserva ${reservation.id} presenta cantidades inconsistentes.`
      );
    }

    const pendingQuantity = quantity - deliveredQuantity;

    const reservedBefore = Number(
      sparePart.reservedStock || 0
    );

    if (pendingQuantity > reservedBefore) {
      throw new Error(
        `No se puede liberar la reserva ${reservation.id}: las unidades pendientes superan el stock reservado del repuesto ${sparePart.code}.`
      );
    }

    const now = new Date().toISOString();

    const originalReservation = createAuditSnapshot(
      reservation
    );

    const originalPart = createAuditSnapshot(sparePart);

    const reservedAfter =
      reservedBefore - pendingQuantity;

    let movement = null;

    // Liberamos únicamente las unidades todavía pendientes.
    // El stock físico no se modifica.
    if (pendingQuantity > 0) {
      await db.spareParts.update(sparePart.id, {
        reservedStock: reservedAfter,
        updatedAt: now,
      });

      movement = await createMovement(
        {
          sparePartId: sparePart.id,
          workOrderId,
          reservationId: reservation.id,
          type: INVENTORY_MOVEMENT_TYPES.RESERVATION_RELEASE,
          quantity: pendingQuantity,
          stockBefore: sparePart.stock,
          stockAfter: sparePart.stock,
          reservedBefore,
          reservedAfter,
          description:
            "Liberación automática de reserva por cancelación de orden de trabajo.",
        },
        actor
      );
    }

    await db.inventoryReservations.update(
      reservation.id,
      {
        status: INVENTORY_RESERVATION_STATUS.CANCELLED,
        updatedAt: now,
      }
    );

    const updatedReservation = {
      ...reservation,
      status: INVENTORY_RESERVATION_STATUS.CANCELLED,
      updatedAt: now,
    };

    const updatedPart = {
      ...sparePart,
      reservedStock: reservedAfter,
      updatedAt: pendingQuantity > 0
        ? now
        : sparePart.updatedAt,
    };

    auditEntries.push({
      reservationId: reservation.id,
      workOrderId,
      releasedQuantity: pendingQuantity,
      beforeData: {
        reservation: originalReservation,
        sparePart: originalPart,
      },
      afterData: {
        reservation: updatedReservation,
        sparePart: updatedPart,
        movement,
      },
    });
  }

  return auditEntries;
}

/**
 * Registra las auditorías de las reservas liberadas.
 *
 * Debe ejecutarse después de confirmar la transacción Dexie.
 *
 * @param {Array} auditEntries Datos devueltos por la liberación.
 */
export async function registerWorkOrderReservationReleaseAudits(
  auditEntries = []
) {
  for (const entry of auditEntries) {
    await registerInventoryAudit({
      action: "RESERVATION_CANCELLED_BY_WORK_ORDER",
      entityType: "inventoryReservations",
      entityId: entry.reservationId,
      details:
        `Se liberaron ${entry.releasedQuantity} unidades pendientes de la reserva ${entry.reservationId} por cancelación de la OT ${entry.workOrderId}.`,
      beforeData: entry.beforeData,
      afterData: entry.afterData,
    });
  }
}


// =====================================================
// 6. CANCELACIÓN DE RESERVAS
// =====================================================

/**
 * Cancela una reserva y libera las unidades pendientes.
 *
 * IMPORTANTE:
 *
 * No modifica el stock físico.
 * Solamente disminuye el stock reservado.
 *
 * Las unidades ya entregadas no se devuelven
 * automáticamente al inventario.
 *
 * @param {string} reservationId Identificador de la reserva.
 */
export async function cancelReservation(reservationId) {
  const user = await requireInventoryPermission(ACTIONS.UPDATE);

  let result = null;
  let originalReservation = null;
  let originalPart = null;
  let updatedReservation = null;
  let updatedPart = null;
  let movement = null;

  await db.transaction(
    "rw",
    db.spareParts,
    db.inventoryReservations,
    db.inventoryMovements,
    async () => {
      const reservation = await db.inventoryReservations.get(
        reservationId
      );

      if (!reservation) {
        throw new Error("La reserva no existe.");
      }

      if (
        ![
          INVENTORY_RESERVATION_STATUS.ACTIVE,
          INVENTORY_RESERVATION_STATUS.PARTIAL,
        ].includes(reservation.status)
      ) {
        throw new Error(
          "La reserva no se puede cancelar."
        );
      }

      const sparePart = await db.spareParts.get(
        reservation.sparePartId
      );

      if (!sparePart) {
        throw new Error("El repuesto asociado no existe.");
      }

      validateStockIntegrity(sparePart);

      const pendingQuantity =
        reservation.quantity - (reservation.deliveredQuantity || 0);

      const reservedBefore = sparePart.reservedStock || 0;

      if (pendingQuantity > reservedBefore) {
        throw new Error(
          "La reserva supera las unidades registradas como reservadas."
        );
      }

      originalReservation = createAuditSnapshot(reservation);
      originalPart = createAuditSnapshot(sparePart);

      const reservedAfter = reservedBefore - pendingQuantity;

      const now = new Date().toISOString();

      // Liberamos las unidades pendientes.
      // El stock físico permanece intacto.
      await db.spareParts.update(sparePart.id, {
        reservedStock: reservedAfter,
        updatedAt: now,
      });

      await db.inventoryReservations.update(reservationId, {
        status: INVENTORY_RESERVATION_STATUS.CANCELLED,
        updatedAt: now,
      });

      updatedReservation = {
        ...reservation,
        status: INVENTORY_RESERVATION_STATUS.CANCELLED,
        updatedAt: now,
      };

      updatedPart = {
        ...sparePart,
        reservedStock: reservedAfter,
      };

      movement = await createMovement(
        {
          sparePartId: sparePart.id,
          workOrderId: reservation.workOrderId,
          reservationId,
          type: INVENTORY_MOVEMENT_TYPES.RESERVATION_RELEASE,
          quantity: pendingQuantity,
          stockBefore: sparePart.stock,
          stockAfter: sparePart.stock,
          reservedBefore,
          reservedAfter,
          description: "Cancelación y liberación de reserva.",
        },
        user
      );

      result = {
        reservationId,
        releasedQuantity: pendingQuantity,
        stock: sparePart.stock,
        reservedStock: reservedAfter,
        availableStock: sparePart.stock - reservedAfter,
        status: INVENTORY_RESERVATION_STATUS.CANCELLED,
      };
    }
  );

  await registerInventoryAudit({
    action: "RESERVATION_CANCELLED",
    entityType: "inventoryReservations",
    entityId: reservationId,
    details: `Se canceló la reserva ${reservationId} y se liberaron ${result.releasedQuantity} unidades.`,
    beforeData: {
      reservation: originalReservation,
      sparePart: originalPart,
    },
    afterData: {
      reservation: updatedReservation,
      sparePart: updatedPart,
      movement,
    },
  });

  return result;
}

// =====================================================
// 7. HISTORIAL DE MOVIMIENTOS
// =====================================================

/**
 * Obtiene el historial de movimientos de un repuesto.
 *
 * @param {string} sparePartId Identificador del repuesto.
 */
export async function getSparePartMovements(sparePartId) {
  await requireInventoryPermission(ACTIONS.READ);

  const movements = await db.inventoryMovements
    .where("sparePartId")
    .equals(sparePartId)
    .toArray();

  return movements.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );
}

/**
 * Obtiene todos los movimientos del inventario.
 *
 * @param {object} options Filtros opcionales.
 */
export async function getInventoryMovements(options = {}) {
  await requireInventoryPermission(ACTIONS.READ);

  const {
    sparePartId,
    workOrderId,
    type,
  } = options;

  let movements = await db.inventoryMovements.toArray();

  if (sparePartId) {
    movements = movements.filter(
      (movement) => movement.sparePartId === sparePartId
    );
  }

  if (workOrderId) {
    movements = movements.filter(
      (movement) => movement.workOrderId === workOrderId
    );
  }

  if (type) {
    movements = movements.filter(
      (movement) => movement.type === type
    );
  }

  return movements.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );
}
