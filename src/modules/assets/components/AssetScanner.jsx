
/*
 * ANDINACARE - LECTOR DE CÓDIGOS QR DE ACTIVOS
 *
 * Este componente permite:
 *
 * 1. Solicitar permiso para utilizar la cámara.
 * 2. Escanear códigos QR de los activos industriales.
 * 3. Buscar el activo correspondiente en IndexedDB.
 * 4. Abrir la ficha técnica cuando el QR es válido.
 * 5. Habilitar la búsqueda manual después de 3 segundos.
 * 6. Permitir la búsqueda manual cuando no existe cámara.
 */

import { useEffect, useRef, useState } from "react";

import { Html5Qrcode } from "html5-qrcode";

import {
  Camera,
  Search,
  X,
  AlertCircle,
  CheckCircle,
  QrCode,
} from "lucide-react";

import {
  getAssetByQRCode,
  searchAssets,
} from "../../../services/assets/assetService";


function AssetScanner({ onAssetFound, onClose }) {

  // Referencia a la instancia del lector QR.
  const scannerRef = useRef(null);

  // Identifica si el lector está funcionando.
  const scannerRunningRef = useRef(false);

  // Identifica si ya se procesó un código QR.
  const qrProcessedRef = useRef(false);

  // Evita actualizar el componente después de desmontarlo.
  const mountedRef = useRef(true);

  // Controla el temporizador de 3 segundos.
  const fallbackTimerRef = useRef(null);

  // Estado de la cámara.
  const [cameraStatus, setCameraStatus] = useState("loading");

  // Estado de la búsqueda manual.
  const [manualSearch, setManualSearch] = useState(false);

  // Texto ingresado en el buscador.
  const [searchTerm, setSearchTerm] = useState("");

  // Resultados de búsqueda.
  const [searchResults, setSearchResults] = useState([]);

  // Mensajes informativos.
  const [message, setMessage] = useState(
    "Preparando el lector QR..."
  );

  // Indica si existe un error.
  const [error, setError] = useState("");

  // Identificador único para el área de escaneo.
  const scannerElementId = "andina-care-qr-reader";


  /*
   * DETENER LA CÁMARA
   *
   * Se utiliza tanto al cerrar el lector como
   * cuando se detecta un código QR.
   */
  async function stopScanner() {

    if (!scannerRef.current) {
      return;
    }

    try {

      if (scannerRunningRef.current) {

        await scannerRef.current.stop();

        scannerRunningRef.current = false;

      }

      scannerRef.current.clear();

    } catch (err) {

      console.warn(
        "AndinaCare: no fue posible detener el lector.",
        err
      );

    }

  }


  /*
   * BUSCAR ACTIVO MEDIANTE EL CÓDIGO QR
   */
  async function handleQRCodeDetected(decodedText) {

    // Evita procesar varias veces el mismo código.
    if (qrProcessedRef.current) {
      return;
    }

    qrProcessedRef.current = true;

    clearTimeout(fallbackTimerRef.current);

    if (mountedRef.current) {

      setMessage("Consultando activo en la base de datos...");

      setError("");

    }

    await stopScanner();

    try {

      const asset = await getAssetByQRCode(decodedText);

      if (!mountedRef.current) {
        return;
      }

      if (asset) {

        setCameraStatus("success");

        setMessage("Activo encontrado correctamente.");

        onAssetFound(asset);

      } else {

        qrProcessedRef.current = false;

        setCameraStatus("error");

        setError(
          "El código QR no corresponde a ningún activo registrado."
        );

        setManualSearch(true);

      }

    } catch (err) {

      if (!mountedRef.current) {
        return;
      }

      console.error("Error al consultar el código QR:", err);

      qrProcessedRef.current = false;

      setCameraStatus("error");

      setError(
        err.message || "No fue posible consultar el activo."
      );

      setManualSearch(true);

    }

  }


  /*
   * INICIAR EL LECTOR QR
   */
  async function startScanner() {

    try {

      setCameraStatus("loading");

      setMessage("Solicitando acceso a la cámara...");

      setError("");

      const scanner = new Html5Qrcode(scannerElementId);

      scannerRef.current = scanner;

      await scanner.start(

        { facingMode: "environment" },

        {
          fps: 10,
          qrbox: {
            width: 220,
            height: 220,
          },
          aspectRatio: 1,
        },

        (decodedText) => {

          handleQRCodeDetected(decodedText);

        },

        () => {
          // Los errores de lectura individuales son normales.
          // El lector seguirá buscando códigos QR.
        }

      );

      scannerRunningRef.current = true;

      if (!mountedRef.current) {

        await stopScanner();

        return;

      }

      setCameraStatus("active");

      setMessage("Apunta la cámara hacia el código QR del activo.");

      /*
       * Si pasan 3 segundos sin detectar un código QR,
       * se detiene la cámara y se habilita el buscador.
       */
      fallbackTimerRef.current = setTimeout(async () => {

        if (!mountedRef.current || qrProcessedRef.current) {
          return;
        }

        setManualSearch(true);

        setMessage(
          "Puedes continuar buscando el activo manualmente."
        );

        await stopScanner();

      }, 3000);

    } catch (err) {

      console.error("Error al iniciar la cámara:", err);

      if (!mountedRef.current) {
        return;
      }

      setCameraStatus("error");

      setManualSearch(true);

      setError(
        "No fue posible acceder a la cámara. Puedes buscar el activo manualmente."
      );

      setMessage("Búsqueda manual disponible.");

      await stopScanner();

    }

  }


  /*
   * BUSCAR ACTIVOS EN INDEXEDDB
   *
   * La búsqueda se realiza localmente mediante
   * el servicio de activos de AndinaCare.
   */
  async function handleManualSearch(event) {

    event.preventDefault();

    const term = searchTerm.trim();

    if (!term) {

      setError("Ingresa un código o nombre de activo.");

      return;

    }

    try {

      setError("");

      setMessage("Buscando activos registrados...");

      const results = await searchAssets(term);

      if (!mountedRef.current) {
        return;
      }

      setSearchResults(results);

      setMessage(
        results.length > 0
          ? "Selecciona el activo que deseas consultar."
          : "No se encontraron activos con ese criterio."
      );

      if (results.length === 0) {

        setError("No existen coincidencias para tu búsqueda.");

      }

    } catch (err) {

      if (!mountedRef.current) {
        return;
      }

      console.error("Error en la búsqueda manual:", err);

      setError(
        err.message || "No fue posible realizar la búsqueda."
      );

    }

  }


  /*
   * SELECCIONAR ACTIVO DE LOS RESULTADOS
   */
  function handleSelectAsset(asset) {

    onAssetFound(asset);

  }


  /*
   * INICIALIZACIÓN Y LIMPIEZA DEL COMPONENTE
   */
  useEffect(() => {

    mountedRef.current = true;

    startScanner();

    return () => {

      mountedRef.current = false;

      clearTimeout(fallbackTimerRef.current);

      stopScanner();

    };

  }, []);


  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">

      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* ENCABEZADO */}

        <div className="flex items-center justify-between border-b border-gray-200 p-5">

          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-blue-100 p-3">

              <QrCode className="h-6 w-6 text-blue-700" />

            </div>

            <div>

              <h2 className="text-lg font-bold text-gray-900">
                Escanear activo
              </h2>

              <p className="text-sm text-gray-500">
                Lector QR de AndinaCare
              </p>

            </div>

          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            aria-label="Cerrar lector QR"
          >

            <X className="h-5 w-5" />

          </button>

        </div>


        {/* CONTENIDO */}

        <div className="space-y-4 p-5">

          {/* ESTADO DE LA CÁMARA */}

          <div className="flex items-center gap-2 text-sm text-gray-600">

            {cameraStatus === "active" && (
              <Camera className="h-5 w-5 text-green-600" />
            )}

            {cameraStatus === "loading" && (
              <Camera className="h-5 w-5 animate-pulse text-blue-600" />
            )}

            {cameraStatus === "success" && (
              <CheckCircle className="h-5 w-5 text-green-600" />
            )}

            {cameraStatus === "error" && (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}

            <span>{message}</span>

          </div>


          {/* ÁREA DE LA CÁMARA */}

          <div
            id={scannerElementId}
            className="min-h-[100px] w-full overflow-hidden rounded-xl bg-gray-100"
          />


          {/* MENSAJES DE ERROR */}

          {error && (

            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">

              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

              <p>{error}</p>

            </div>

          )}


          {/* BÚSQUEDA MANUAL */}

          {manualSearch && (

            <div className="space-y-4 border-t border-gray-200 pt-4">

              <div>

                <h3 className="font-semibold text-gray-900">
                  Buscar activo manualmente
                </h3>

                <p className="mt-1 text-sm text-gray-500">
                  Ingresa el código o nombre del equipo.
                </p>

              </div>


              <form
                onSubmit={handleManualSearch}
                className="flex gap-2"
              >

                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Ejemplo: EXT-001"
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800"
                >

                  <Search className="h-4 w-4" />

                  Buscar

                </button>

              </form>


              {/* RESULTADOS */}

              {searchResults.length > 0 && (

                <div className="space-y-2">

                  <p className="text-sm font-medium text-gray-700">
                    Resultados encontrados:
                  </p>

                  {searchResults.map((asset) => (

                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => handleSelectAsset(asset)}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left transition hover:border-blue-400 hover:bg-blue-50"
                    >

                      <div>

                        <p className="font-semibold text-gray-900">
                          {asset.name}
                        </p>

                        <p className="text-sm text-gray-500">
                          {asset.code} · {asset.type}
                        </p>

                      </div>

                      <Search className="h-4 w-4 text-blue-700" />

                    </button>

                  ))}

                </div>

              )}

            </div>

          )}

        </div>


        {/* PIE */}

        <div className="border-t border-gray-200 bg-gray-50 p-4">

          <p className="text-center text-xs text-gray-500">
            AndinaCare · Gestión de Activos Industriales
          </p>

        </div>

      </div>

    </div>

  );

}


export default AssetScanner;
