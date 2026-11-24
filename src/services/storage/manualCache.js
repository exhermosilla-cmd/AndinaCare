
/*
 * ANDINACARE - PRECARGA DE MANUALES TÉCNICOS
 *
 * Permite descargar manuales PDF seleccionados para que
 * Workbox pueda almacenarlos en su caché offline.
 *
 * Los documentos se descargan mediante fetch().
 * El Service Worker intercepta estas solicitudes y aplica
 * la estrategia CacheFirst configurada en vite.config.js.
 */

import { OFFLINE_MANUALS } from "../../data/offlineManuals";

/*
 * Descarga un manual individual.
 *
 * La función comprueba:
 * - Que la dirección pertenezca a nuestra aplicación.
 * - Que el archivo esté dentro de /manuals/.
 * - Que sea un documento PDF.
 * - Que la descarga haya finalizado correctamente.
 */
export async function cacheManualForOffline(manualPath) {

  if (!("serviceWorker" in navigator)) {
    throw new Error(
      "Este navegador no admite Service Workers."
    );
  }

  // Convertimos la dirección relativa en una URL completa.
  const manualUrl = new URL(
    manualPath,
    window.location.origin
  );

  // Solo permitimos archivos de nuestra propia aplicación.
  if (manualUrl.origin !== window.location.origin) {
    throw new Error(
      "El manual debe pertenecer al mismo dominio de AndinaCare."
    );
  }

  // Validamos que el documento esté dentro de la carpeta permitida.
  if (
    !manualUrl.pathname.startsWith("/manuals/") ||
    !manualUrl.pathname.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error(
      "La dirección indicada no corresponde a un PDF de manuals."
    );
  }

  // Esperamos a que exista un Service Worker registrado.
  await navigator.serviceWorker.ready;

  // Para asegurar que Workbox intercepte la solicitud,
  // la página debe estar controlada por el Service Worker.
  if (!navigator.serviceWorker.controller) {
    throw new Error(
      "Recarga AndinaCare para activar el almacenamiento offline."
    );
  }

  // La solicitud será interceptada por Workbox.
  // Si el PDF no está almacenado, se descargará de internet.
  // Si ya existe en caché, se utilizará la copia local.
  const response = await fetch(manualUrl.href);

  if (!response.ok) {
    throw new Error(
      `No se pudo descargar el manual. Estado HTTP: ${response.status}`
    );
  }

  // Comprobamos que la respuesta corresponda a un PDF.
  const contentType = response.headers.get("content-type") || "";

  if (
    !contentType.toLowerCase().includes("pdf") &&
    !contentType.toLowerCase().includes("octet-stream")
  ) {
    throw new Error(
      "El recurso recibido no parece ser un documento PDF."
    );
  }

  return {
    success: true,
    message: "Manual disponible para uso offline.",
    url: manualUrl.pathname
  };
}

/*
 * Precarga todos los manuales registrados en offlineManuals.js.
 *
 * Se ejecutan de forma secuencial para evitar descargar
 * varios documentos pesados simultáneamente.
 */
export async function precacheSelectedManuals() {

  const results = [];

  for (const manualPath of OFFLINE_MANUALS) {

    try {

      const result = await cacheManualForOffline(manualPath);

      results.push(result);

    } catch (error) {

      results.push({
        success: false,
        url: manualPath,
        message: error.message
      });

    }

  }

  return results;
}
