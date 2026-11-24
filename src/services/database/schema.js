
/*
 * ANDINACARE - ESQUEMA DE LA BASE DE DATOS
 *
 * Aquí se definen las tablas y los índices de IndexedDB.
 *
 * Dexie utiliza esta estructura para crear las tablas
 * y organizar las búsquedas de información.
 *
 * Convenciones:
 *
 * id       = índice normal.
 * &campo   = índice único.
 * [a+b]    = índice compuesto.
 *
 * IMPORTANTE:
 *
 * DATABASE_SCHEMA_V1 conserva la estructura original.
 * DATABASE_SCHEMA conserva la estructura de la versión 2.
 * DATABASE_SCHEMA_V3 incorpora las mejoras de inventario.
 * DATABASE_SCHEMA_V4 incorpora mejoras de auditoría.
 *
 * Las versiones anteriores se mantienen para que Dexie
 * pueda migrar las bases de datos existentes.
 */

// Nombre de la base de datos local.
export const DATABASE_NAME = "AndinaCareDB";

/*
 * VERSIÓN 1
 *
 * Esquema original de AndinaCare.
 * No modificar: se necesita para las migraciones.
 */
export const DATABASE_SCHEMA_V1 = {

  users: `
    id,
    &email,
    name,
    role,
    active,
    createdAt
  `,

  assets: `
    id,
    &code,
    name,
    type,
    criticality,
    status,
    location,
    createdAt
  `,

  workOrders: `
    id,
    &code,
    assetId,
    createdBy,
    assignedTo,
    status,
    priority,
    createdAt,
    updatedAt,
    [assetId+createdAt],
    [status+priority]
  `,

  safetyRecords: `
    id,
    workOrderId,
    userId,
    status,
    createdAt,
    [workOrderId+createdAt]
  `,

  spareParts: `
    id,
    &code,
    name,
    category,
    stock,
    minStock,
    updatedAt
  `,

  inventoryMovements: `
    id,
    sparePartId,
    workOrderId,
    type,
    createdBy,
    createdAt,
    [sparePartId+createdAt]
  `,

  photos: `
    id,
    workOrderId,
    assetId,
    category,
    createdAt,
    [workOrderId+category],
    [assetId+createdAt]
  `,

  interventions: `
    id,
    workOrderId,
    assetId,
    technicianId,
    type,
    startedAt,
    completedAt,
    [assetId+completedAt]
  `,

  manuals: `
    id,
    assetId,
    &code,
    title,
    type,
    updatedAt
  `,

  auditLogs: `
    id,
    userId,
    action,
    entityType,
    entityId,
    createdAt,
    [entityType+entityId],
    [userId+createdAt]
  `,

  syncQueue: `
    id,
    &operationId,
    entityType,
    entityId,
    status,
    attempts,
    createdAt,
    nextAttemptAt
  `,
};

/*
 * VERSIÓN 2
 *
 * Esquema actualizado de AndinaCare.
 * Incluye información técnica de los activos.
 *
 * No modificar: se conserva para las migraciones.
 */
export const DATABASE_SCHEMA = {

  users: `
    id,
    &email,
    name,
    role,
    active,
    createdAt
  `,

  assets: `
    id,
    &code,
    &qrCode,
    name,
    type,
    criticality,
    status,
    location,
    manufacturer,
    model,
    serialNumber,
    manufactureYear,
    acquisitionDate,
    installationDate,
    power,
    description,
    createdAt,
    updatedAt,
    [type+criticality],
    [status+type]
  `,

  workOrders: `
    id,
    &code,
    assetId,
    createdBy,
    assignedTo,
    status,
    priority,
    createdAt,
    updatedAt,
    [assetId+createdAt],
    [status+priority]
  `,

  safetyRecords: `
    id,
    workOrderId,
    userId,
    status,
    createdAt,
    [workOrderId+createdAt]
  `,

  spareParts: `
    id,
    &code,
    name,
    category,
    stock,
    minStock,
    updatedAt
  `,

  inventoryMovements: `
    id,
    sparePartId,
    workOrderId,
    type,
    createdBy,
    createdAt,
    [sparePartId+createdAt]
  `,

  photos: `
    id,
    workOrderId,
    assetId,
    category,
    createdAt,
    [workOrderId+category],
    [assetId+createdAt]
  `,

  interventions: `
    id,
    workOrderId,
    assetId,
    technicianId,
    type,
    startedAt,
    completedAt,
    [assetId+completedAt]
  `,

  manuals: `
    id,
    assetId,
    &code,
    title,
    type,
    updatedAt
  `,

  auditLogs: `
    id,
    userId,
    action,
    entityType,
    entityId,
    createdAt,
    [entityType+entityId],
    [userId+createdAt]
  `,

  syncQueue: `
    id,
    &operationId,
    entityType,
    entityId,
    status,
    attempts,
    createdAt,
    nextAttemptAt
  `,
};

/*
 * VERSIÓN 3
 *
 * Mejoras del módulo de bodega e inventario.
 *
 * REGLAS DEL INVENTARIO:
 *
 * 1. stock representa las unidades físicas existentes.
 *
 * 2. reservedStock representa las unidades comprometidas
 *    para órdenes de trabajo.
 *
 * 3. stock disponible:
 *
 *    stock - reservedStock
 *
 * 4. Reservar no descuenta el stock físico.
 *
 * 5. Entregar descuenta el stock físico y libera
 *    la reserva correspondiente.
 *
 * 6. Los movimientos registran entradas y salidas.
 *
 * 7. Las reservas conservan su relación con la OT
 *    y el usuario que las creó.
 *
 * Los campos no declarados como índices pueden
 * almacenarse normalmente en IndexedDB.
 */
export const DATABASE_SCHEMA_V3 = {

  ...DATABASE_SCHEMA,

  spareParts: `
    id,
    &code,
    name,
    category,
    location,
    stock,
    reservedStock,
    minStock,
    updatedAt
  `,

  inventoryMovements: `
    id,
    sparePartId,
    workOrderId,
    type,
    createdBy,
    createdAt,
    [sparePartId+createdAt],
    [workOrderId+sparePartId],
    [type+createdAt],
    [createdBy+createdAt]
  `,

  inventoryReservations: `
    id,
    sparePartId,
    workOrderId,
    createdBy,
    status,
    createdAt,
    updatedAt,
    [workOrderId+status],
    [sparePartId+status],
    [sparePartId+createdAt]
  `,
};

/*
 * VERSIÓN 4
 *
 * Mejoras del módulo de auditoría y trazabilidad.
 *
 * OBJETIVOS:
 *
 * 1. Consultar eventos por módulo.
 * 2. Consultar eventos por usuario.
 * 3. Consultar eventos por acción.
 * 4. Consultar eventos por fecha.
 * 5. Identificar al responsable de cada operación.
 * 6. Preparar el almacenamiento de cambios anteriores
 *    y posteriores a una modificación.
 *
 * IMPORTANTE:
 *
 * Los campos userName, userRole, details,
 * beforeData y afterData son campos de datos.
 *
 * No necesitan índices para poder almacenarse.
 *
 * Los eventos antiguos se conservan.
 * Los registros existentes no se eliminan.
 */
export const DATABASE_SCHEMA_V4 = {

  ...DATABASE_SCHEMA_V3,

  /*
   * Registros de auditoría.
   *
   * module:
   * Identifica el módulo donde ocurrió la acción.
   *
   * userId:
   * Identifica al usuario responsable.
   *
   * userName y userRole:
   * Conservan los datos del responsable al momento
   * de registrar el evento.
   *
   * beforeData y afterData:
   * Permiten guardar los valores anteriores y nuevos
   * de una modificación.
   *
   * details:
   * Conserva información descriptiva del evento.
   */
  auditLogs: `
    id,
    userId,
    userName,
    userRole,
    action,
    module,
    entityType,
    entityId,
    createdAt,

    [entityType+entityId],
    [userId+createdAt],
    [module+createdAt],
    [action+createdAt]
  `,
};



/*
 * VERSIÓN 5
 *
 * Corrección de índices para consultas de órdenes
 * de trabajo e inventario.
 *
 * Se conservan los índices compuestos existentes.
 * Se agregan índices individuales utilizados por
 * los servicios de AndinaCare.
 */
export const DATABASE_SCHEMA_V5 = {
  ...DATABASE_SCHEMA_V4,

  interventions: `
    id,
    workOrderId,
    assetId,
    technicianId,
    type,
    startedAt,
    completedAt,
    [assetId+completedAt]
  `,

  inventoryReservations: `
    id,
    sparePartId,
    workOrderId,
    createdBy,
    status,
    createdAt,
    updatedAt,
    [workOrderId+status],
    [sparePartId+status],
    [sparePartId+createdAt]
  `,
};
