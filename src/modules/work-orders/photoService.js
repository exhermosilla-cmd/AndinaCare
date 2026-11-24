
/*
 * ANDINACARE - SERVICIO DE FOTOGRAFÍAS
 *
 * Responsabilidades:
 * 1. Validar imágenes seleccionadas.
 * 2. Comprimir fotografías mediante HTML5 Canvas.
 * 3. Redimensionar a un máximo de 800 x 600 píxeles.
 * 4. Guardar solamente la imagen comprimida.
 * 5. Asociar fotografías a una OT y a un activo.
 * 6. Consultar fotografías desde IndexedDB sin Internet.
 * 7. Registrar las fotografías en Auditoría con trazabilidad.
 */

import { db, openDatabase } from "../../services/database/db";
import { generateUUID } from "../../utils/uuid";
import { getCurrentUser } from "../../services/auth/authService";

import {
  ACTIONS,
  assertPermission,
} from "../../services/auth/permissions";

import { recordAuditEvent } from "../../services/audit/auditService";

/* CONFIGURACIÓN */

const MAX_ORIGINAL_SIZE = 10 * 1024 * 1024;
const MAX_COMPRESSED_SIZE = 2 * 1024 * 1024;

const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;

const IMAGE_QUALITY = 0.78;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const PHOTO_CATEGORIES = {
  BEFORE: "ANTES",
  AFTER: "DESPUES",
};

/* AUTENTICACIÓN Y PERMISOS */

async function requirePhotoPermission(action) {
  await openDatabase();

  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesión.");
  }

  assertPermission(
    user.role,
    "work-orders",
    action
  );

  return user;
}

/* VALIDAR ARCHIVO */

function validateImageFile(file) {
  if (!file) {
    throw new Error("No se seleccionó ninguna imagen.");
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      "Formato no permitido. Utiliza JPG, PNG o WEBP."
    );
  }

  if (file.size <= 0) {
    throw new Error("La imagen está vacía.");
  }

  if (file.size > MAX_ORIGINAL_SIZE) {
    throw new Error(
      "La imagen original supera el límite de 10 MB."
    );
  }
}

/* CARGAR IMAGEN */

async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);

    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();

      element.onload = () => resolve(element);

      element.onerror = () => {
        reject(
          new Error("No fue posible leer la imagen.")
        );
      };

      element.src = objectUrl;
    });

    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/* COMPRIMIR IMAGEN */

async function compressImage(file) {
  validateImageFile(file);

  let loadedImage;

  try {
    loadedImage = await loadImage(file);

    const { image, width, height } = loadedImage;

    if (!width || !height) {
      throw new Error(
        "La imagen no tiene dimensiones válidas."
      );
    }

    const scale = Math.min(
      MAX_WIDTH / width,
      MAX_HEIGHT / height,
      1
    );

    const newWidth = Math.max(
      1,
      Math.round(width * scale)
    );

    const newHeight = Math.max(
      1,
      Math.round(height * scale)
    );

    const canvas = document.createElement("canvas");

    canvas.width = newWidth;
    canvas.height = newHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "No fue posible preparar el compresor de imágenes."
      );
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      image,
      0,
      0,
      newWidth,
      newHeight
    );

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(
              new Error("No fue posible comprimir la imagen.")
            );
            return;
          }

          resolve(result);
        },
        "image/jpeg",
        IMAGE_QUALITY
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    if (blob.size > MAX_COMPRESSED_SIZE) {
      throw new Error(
        "La imagen comprimida supera los 2 MB permitidos."
      );
    }

    return {
      blob,
      width: newWidth,
      height: newHeight,
      mimeType: "image/jpeg",
      size: blob.size,
      quality: IMAGE_QUALITY,
    };
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error;
    }

    throw new Error(
      "Ocurrió un error al procesar la fotografía."
    );
  } finally {
    loadedImage?.cleanup();
  }
}

/* COMPROBAR ESPACIO DISPONIBLE */

async function validateAvailableStorage(requiredBytes) {
  if (!navigator.storage?.estimate) {
    return;
  }

  try {
    const estimate = await navigator.storage.estimate();

    if (
      typeof estimate.quota === "number" &&
      typeof estimate.usage === "number"
    ) {
      const available =
        estimate.quota - estimate.usage;

      const safetyMargin = 1024 * 1024;

      if (available < requiredBytes + safetyMargin) {
        throw new Error(
          "No hay suficiente espacio disponible para guardar la fotografía."
        );
      }
    }
  } catch (error) {
    if (error.message?.includes("suficiente espacio")) {
      throw error;
    }

    console.warn(
      "No se pudo consultar el almacenamiento disponible:",
      error
    );
  }
}

/* REGISTRAR FOTOGRAFÍA */

export async function saveWorkOrderPhoto({
  workOrderId,
  category,
  file,
}) {
  const user = await requirePhotoPermission(
    ACTIONS.UPDATE
  );

  if (
    !Object.values(PHOTO_CATEGORIES).includes(category)
  ) {
    throw new Error(
      "La categoría de fotografía no es válida."
    );
  }

  if (!workOrderId) {
    throw new Error(
      "No se indicó una orden de trabajo."
    );
  }

  const order = await db.workOrders.get(workOrderId);

  if (!order) {
    throw new Error(
      "La orden de trabajo no existe."
    );
  }

  if (order.status !== "EN_PROGRESO") {
    throw new Error(
      "Solo puedes adjuntar fotografías a órdenes en ejecución."
    );
  }

  if (!order.assetId) {
    throw new Error(
      "La orden no tiene un activo asociado."
    );
  }

  /*
   * Primero se comprime la imagen.
   * Nunca se guarda el archivo original.
   */

  const compressed = await compressImage(file);

  await validateAvailableStorage(compressed.size);

  const now = new Date().toISOString();

  const photo = {
    id: generateUUID(),

    workOrderId: order.id,
    assetId: order.assetId,

    category,

    blob: compressed.blob,
    mimeType: compressed.mimeType,

    size: compressed.size,
    width: compressed.width,
    height: compressed.height,
    quality: compressed.quality,

    originalName: String(file.name || "fotografia")
      .slice(0, 150),

    createdBy: user.id,
    createdAt: now,
  };

  try {
    await db.photos.add(photo);
  } catch (error) {
    if (
      error?.name === "QuotaExceededError" ||
      error?.name === "UnknownError"
    ) {
      throw new Error(
        "No hay espacio suficiente para guardar la fotografía en el dispositivo."
      );
    }

    throw new Error(
      error.message ||
      "No fue posible guardar la fotografía."
    );
  }

  /*
   * AUDITORÍA
   *
   * La fotografía se guarda en IndexedDB.
   * Auditoría conserva únicamente sus metadatos.
   *
   * No se incluye photo.blob ni ningún contenido
   * binario de la imagen en beforeData o afterData.
   *
   * Si falla la auditoría, la fotografía permanece
   * guardada y disponible en la aplicación.
   */

  const auditPhotoData = {
    id: photo.id,
    workOrderId: photo.workOrderId,
    workOrderCode: order.code || null,
    assetId: photo.assetId,
    category: photo.category,
    mimeType: photo.mimeType,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    quality: photo.quality,
    originalName: photo.originalName,
    createdBy: photo.createdBy,
    createdAt: photo.createdAt,
  };

  try {
    await recordAuditEvent({
      action: "CREATE",
      module: "workOrders",
      entityType: "photos",
      entityId: photo.id,

      details:
        `Fotografía ${category} asociada a la orden ${order.code || order.id}.`,

      beforeData: null,
      afterData: auditPhotoData,

      actor: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(
      "No se pudo registrar la auditoría de la fotografía:",
      error
    );
  }

  return photo;
}

/* CONSULTAR FOTOGRAFÍAS DE UNA ORDEN */

export async function getWorkOrderPhotos(workOrderId) {
  await requirePhotoPermission(ACTIONS.READ);

  if (!workOrderId) {
    throw new Error(
      "Debes indicar una orden de trabajo."
    );
  }

  const photos = await db.photos
    .where("workOrderId")
    .equals(workOrderId)
    .toArray();

  return photos.sort((a, b) =>
    new Date(b.createdAt).getTime() -
    new Date(a.createdAt).getTime()
  );
}

/* CONSULTAR FOTOGRAFÍAS DE UN ACTIVO */

export async function getAssetPhotos(assetId) {
  await requirePhotoPermission(ACTIONS.READ);

  if (!assetId) {
    throw new Error(
      "Debes indicar un activo."
    );
  }

  const photos = await db.photos
    .where("assetId")
    .equals(assetId)
    .toArray();

  return photos.sort((a, b) =>
    new Date(b.createdAt).getTime() -
    new Date(a.createdAt).getTime()
  );
}
