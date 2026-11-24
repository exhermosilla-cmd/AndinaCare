
/*
 * ANDINACARE - SERVICIO DE ACTIVOS INDUSTRIALES
 *
 * Administra los activos industriales y sus operaciones.
 *
 * FUNCIONES:
 * 1. Registrar activos.
 * 2. Consultar fichas técnicas.
 * 3. Modificar y eliminar activos.
 * 4. Buscar y filtrar equipos sin conexión.
 * 5. Consultar activos mediante QR.
 * 6. Asignar QR a activos antiguos.
 * 7. Consultar las últimas cinco intervenciones.
 * 8. Consultar responsables y fotografías de mantenimiento.
 */

import { db, openDatabase } from "../database/db";
import { generateUUID } from "../../utils/uuid";
import { getCurrentUser } from "../auth/authService";

import {
  ACTIONS,
  assertPermission,
} from "../auth/permissions";

import { recordAuditEvent } from "../audit/auditService";

/*
 * TIPOS DE ACTIVOS
 */

export const ASSET_TYPES = {
  EXTRUDER: "EXTRUSORA",
  INJECTION: "INYECTORA",
  COMPRESSOR: "COMPRESOR",
  BOILER: "CALDERA",
  CONVEYOR: "CINTA_TRANSPORTADORA",
  MOLD: "MOLDE",
};

/*
 * NIVELES DE CRITICIDAD
 */

export const ASSET_CRITICALITIES = {
  LOW: "BAJA",
  MEDIUM: "MEDIA",
  HIGH: "ALTA",
  CRITICAL: "CRITICA",
};

/*
 * ESTADOS OPERACIONALES
 */

export const ASSET_STATUSES = {
  OPERATIONAL: "OPERATIVO",
  MAINTENANCE: "EN_MANTENIMIENTO",
  STOPPED: "DETENIDO",
  OUT_OF_SERVICE: "FUERA_DE_SERVICIO",
};

/*
 * AUTENTICACIÓN Y PERMISOS
 */

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

async function requireAssetPermission(action) {
  const currentUser = await requireAuthenticatedUser();

  assertPermission(
    currentUser.role,
    "assets",
    action
  );

  return currentUser;
}

/*
 * AUDITORÍA
 */


async function registerAssetAudit({
  action,
  assetId,
  details,
  actor,
  beforeData = null,
  afterData = null,
}) {
  try {
    await recordAuditEvent({
      action,
      entityType: "assets",
      entityId: assetId,
      module: "assets",
      details,
      actor,
      beforeData,
      afterData,
    });
  } catch (error) {
    console.error(
      "No se pudo registrar la auditoría del activo:",
      error
    );
  }
}


/*
 * VALIDACIÓN DE DATOS
 */

function validateAssetData(assetData) {
  if (!assetData || typeof assetData !== "object") {
    throw new Error(
      "Debes proporcionar los datos del activo."
    );
  }

  const requiredFields = [
    "code",
    "name",
    "type",
    "criticality",
    "status",
    "location",
  ];

  for (const field of requiredFields) {
    if (
      typeof assetData[field] !== "string" ||
      !assetData[field].trim()
    ) {
      throw new Error(
        `El campo ${field} es obligatorio.`
      );
    }
  }

  const validTypes = Object.values(ASSET_TYPES);
  const validCriticalities = Object.values(ASSET_CRITICALITIES);
  const validStatuses = Object.values(ASSET_STATUSES);

  if (!validTypes.includes(assetData.type)) {
    throw new Error("El tipo de activo no es válido.");
  }

  if (!validCriticalities.includes(assetData.criticality)) {
    throw new Error("El nivel de criticidad no es válido.");
  }

  if (!validStatuses.includes(assetData.status)) {
    throw new Error("El estado operacional no es válido.");
  }

  if (
    assetData.manufactureYear !== undefined &&
    assetData.manufactureYear !== null &&
    assetData.manufactureYear !== ""
  ) {
    const year = Number(assetData.manufactureYear);

    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > new Date().getFullYear()
    ) {
      throw new Error(
        "El año de fabricación no es válido."
      );
    }
  }

  return {
    code: assetData.code.trim().toUpperCase(),
    name: assetData.name.trim(),
    type: assetData.type,
    criticality: assetData.criticality,
    status: assetData.status,
    location: assetData.location.trim(),

    manufacturer: assetData.manufacturer?.trim() || "",
    model: assetData.model?.trim() || "",
    serialNumber: assetData.serialNumber?.trim() || "",

    manufactureYear:
      assetData.manufactureYear
        ? Number(assetData.manufactureYear)
        : null,

    acquisitionDate: assetData.acquisitionDate || null,
    installationDate: assetData.installationDate || null,

    power: assetData.power?.trim() || "",
    description: assetData.description?.trim() || "",
  };
}

/*
 * VALIDAR CÓDIGO ÚNICO
 */

async function validateUniqueCode(
  code,
  excludedAssetId = null
) {
  const existingAsset = await db.assets
    .where("code")
    .equals(code)
    .first();

  if (
    existingAsset &&
    existingAsset.id !== excludedAssetId
  ) {
    throw new Error(
      "Ya existe un activo registrado con ese código."
    );
  }
}

/*
 * CONSULTAR ACTIVO EXISTENTE
 */

async function requireExistingAsset(assetId) {
  if (
    typeof assetId !== "string" ||
    !assetId.trim()
  ) {
    throw new Error(
      "Debes proporcionar un identificador válido."
    );
  }

  const asset = await db.assets.get(assetId);

  if (!asset) {
    throw new Error(
      "El activo solicitado no existe."
    );
  }

  return asset;
}

/*
 * ASIGNAR QR A ACTIVOS ANTIGUOS
 */

async function ensureAssetQRCode(asset) {
  if (!asset) {
    throw new Error(
      "No se puede asignar un QR a un activo inexistente."
    );
  }

  if (
    typeof asset.qrCode === "string" &&
    asset.qrCode.trim()
  ) {
    return asset;
  }

  const qrCode = `ANDINACARE-ASSET:${asset.id}`;

  await db.assets.update(asset.id, {
    qrCode,
  });

  return {
    ...asset,
    qrCode,
  };
}

/*
 * CONSULTAR TODOS LOS ACTIVOS
 */

export async function getAllAssets() {
  await requireAssetPermission(ACTIONS.READ);

  const assets = await db.assets.toArray();

  const assetsWithQR = await Promise.all(
    assets.map((asset) => ensureAssetQRCode(asset))
  );

  return assetsWithQR.sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/*
 * CONSULTAR FICHA TÉCNICA
 */

export async function getAssetById(assetId) {
  await requireAssetPermission(ACTIONS.READ);

  const asset = await requireExistingAsset(assetId);

  return ensureAssetQRCode(asset);
}

/*
 * BUSCAR ACTIVOS
 */

export async function searchAssets(searchTerm) {
  await requireAssetPermission(ACTIONS.READ);

  const normalizedTerm = String(searchTerm || "")
    .trim()
    .toLowerCase();

  const assets = await db.assets.toArray();

  const matchingAssets = normalizedTerm
    ? assets.filter((asset) => {
        const code = String(asset.code || "").toLowerCase();
        const name = String(asset.name || "").toLowerCase();

        return (
          code.includes(normalizedTerm) ||
          name.includes(normalizedTerm)
        );
      })
    : assets;

  const assetsWithQR = await Promise.all(
    matchingAssets.map((asset) => ensureAssetQRCode(asset))
  );

  return assetsWithQR.sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/*
 * FILTRAR ACTIVOS
 */

export async function filterAssets({
  type = null,
  criticality = null,
  status = null,
} = {}) {
  await requireAssetPermission(ACTIONS.READ);

  const assets = await db.assets.toArray();

  const filteredAssets = assets.filter((asset) => {
    const matchesType = !type || asset.type === type;

    const matchesCriticality =
      !criticality || asset.criticality === criticality;

    const matchesStatus =
      !status || asset.status === status;

    return (
      matchesType &&
      matchesCriticality &&
      matchesStatus
    );
  });

  return Promise.all(
    filteredAssets.map((asset) => ensureAssetQRCode(asset))
  );
}

/*
 * CONSULTAR ACTIVO MEDIANTE QR
 */

export async function getAssetByQRCode(qrCode) {
  await requireAssetPermission(ACTIONS.READ);

  if (
    typeof qrCode !== "string" ||
    !qrCode.trim()
  ) {
    throw new Error("El código QR no es válido.");
  }

  const asset = await db.assets
    .where("qrCode")
    .equals(qrCode.trim())
    .first();

  if (!asset) {
    throw new Error(
      "No se encontró un activo asociado a este QR."
    );
  }

  return ensureAssetQRCode(asset);
}

/*
 * CREAR ACTIVO
 */

export async function createAsset(assetData) {
  const currentUser = await requireAssetPermission(
    ACTIONS.CREATE
  );

  const validatedData = validateAssetData(assetData);

  await validateUniqueCode(validatedData.code);

  const assetId = generateUUID();

  const newAsset = {
    id: assetId,
    ...validatedData,

    qrCode: `ANDINACARE-ASSET:${assetId}`,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.assets.add(newAsset);

  await registerAssetAudit({
    action: "CREATE",
    assetId,
    actor: currentUser,
    details: `El usuario ${currentUser.name} registró el activo ${newAsset.code}.`,
    afterData: { ...newAsset },
  });

  return newAsset;
}

/*
 * ACTUALIZAR ACTIVO
 */

export async function updateAsset(assetId, assetData) {
  const currentUser = await requireAssetPermission(
    ACTIONS.UPDATE
  );

  const validatedData = validateAssetData(assetData);

  let existingAsset;

  await db.transaction("rw", db.assets, async () => {
    existingAsset = await requireExistingAsset(assetId);

    await validateUniqueCode(
      validatedData.code,
      assetId
    );

    await db.assets.update(assetId, {
      ...validatedData,

      qrCode:
        existingAsset.qrCode ||
        `ANDINACARE-ASSET:${existingAsset.id}`,

      updatedAt: new Date().toISOString(),
    });
  });

  const updatedAsset = await db.assets.get(assetId);


  await registerAssetAudit({
    action: "UPDATE",
    assetId,
    actor: currentUser,
    details: `El usuario ${currentUser.name} modificó el activo ${existingAsset.code}.`,
    beforeData: { ...existingAsset },
    afterData: { ...updatedAsset },
  });


  return updatedAsset;
}

/*
 * ELIMINAR ACTIVO
 */

export async function deleteAsset(assetId) {
  const currentUser = await requireAssetPermission(
    ACTIONS.DELETE
  );

  let existingAsset;

  await db.transaction(
    "rw",
    db.assets,
    db.workOrders,
    db.interventions,
    db.photos,
    db.manuals,
    async () => {
      existingAsset = await requireExistingAsset(assetId);

      const [
        workOrders,
        interventions,
        photos,
        manuals,
      ] = await Promise.all([
        db.workOrders.where("assetId").equals(assetId).count(),
        db.interventions.where("assetId").equals(assetId).count(),
        db.photos.where("assetId").equals(assetId).count(),
        db.manuals.where("assetId").equals(assetId).count(),
      ]);

      if (
        workOrders > 0 ||
        interventions > 0 ||
        photos > 0 ||
        manuals > 0
      ) {
        throw new Error(
          "No se puede eliminar este activo porque tiene historial o registros asociados."
        );
      }

      await db.assets.delete(assetId);
    }
  );

  await registerAssetAudit({
    action: "DELETE",
    assetId,
    actor: currentUser,
    details: `El usuario ${currentUser.name} eliminó el activo ${existingAsset.code}.`,
    beforeData: { ...existingAsset },
  });

  return true;
}

/*
 * CONSULTAR HISTORIAL DE MANTENIMIENTO
 *
 * Devuelve las cinco intervenciones más recientes
 * asociadas a un activo.
 *
 * Cada intervención incluye:
 * - Datos de la orden de trabajo.
 * - Nombre del técnico responsable.
 * - Descripción del trabajo realizado.
 * - Fotografías ANTES y DESPUÉS.
 *
 * Las fotografías se recuperan desde IndexedDB.
 * No se duplican ni se modifican sus registros.
 */

export async function getAssetMaintenanceHistory(assetId) {
  await requireAssetPermission(ACTIONS.READ);

  // Comprobar que el activo exista.
  await requireExistingAsset(assetId);

  // Consultar todas las intervenciones del activo.
  const interventions = await db.interventions
    .where("assetId")
    .equals(assetId)
    .toArray();

  // Ordenar desde la intervención más reciente.
  const sortedInterventions = interventions.sort((a, b) => {
    const dateA = new Date(
      a.completedAt || a.startedAt || 0
    ).getTime();

    const dateB = new Date(
      b.completedAt || b.startedAt || 0
    ).getTime();

    return dateB - dateA;
  });

  // Limitar a las últimas cinco intervenciones.
  const latestInterventions = sortedInterventions.slice(0, 5);

  // Enriquecer cada intervención con sus datos relacionados.
  const enrichedHistory = await Promise.all(
    latestInterventions.map(async (intervention) => {
      // Recuperar la orden de trabajo.
      const workOrder = intervention.workOrderId
        ? await db.workOrders.get(intervention.workOrderId)
        : null;

      // Recuperar los datos del técnico.
      const technician = intervention.technicianId
        ? await db.users.get(intervention.technicianId)
        : null;

      // Recuperar fotografías asociadas a la orden.
      const photos = intervention.workOrderId
        ? await db.photos
            .where("workOrderId")
            .equals(intervention.workOrderId)
            .toArray()
        : [];

      // Ordenar fotografías por fecha de registro.
      const sortedPhotos = photos.sort((a, b) => {
        return (
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
        );
      });

      // Separar fotografías ANTES y DESPUÉS.
      const beforePhotos = sortedPhotos.filter(
        (photo) => photo.category === "ANTES"
      );

      const afterPhotos = sortedPhotos.filter(
        (photo) => photo.category === "DESPUES"
      );

      // Preparar descripción del mantenimiento.
      const workDescription =
        intervention.workPerformed ||
        intervention.description ||
        intervention.notes ||
        workOrder?.completionNotes ||
        workOrder?.description ||
        "";

      return {
        ...intervention,

        // Datos de la orden.
        workOrderCode: workOrder?.code || "Sin código",
        workOrderTitle: workOrder?.title || "Sin título",

        // Responsable.
        technicianName:
          technician?.name ||
          intervention.technicianName ||
          "Responsable no identificado",

        // Descripción.
        workDescription,

        // Fotografías.
        photos: sortedPhotos,
        beforePhotos,
        afterPhotos,

        // Cantidades.
        photoCount: sortedPhotos.length,
        beforePhotoCount: beforePhotos.length,
        afterPhotoCount: afterPhotos.length,
      };
    })
  );

  return enrichedHistory;
}
