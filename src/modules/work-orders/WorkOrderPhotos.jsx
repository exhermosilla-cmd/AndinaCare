
/*
 * ANDINACARE - FOTOGRAFÍAS DE ÓRDENES DE TRABAJO
 *
 * Permite:
 * - Capturar fotografías con la cámara.
 * - Seleccionar fotografías desde la galería.
 * - Clasificar imágenes como ANTES o DESPUÉS.
 * - Comprimir y guardar imágenes en IndexedDB.
 * - Consultar fotografías guardadas sin Internet.
 * - Liberar las URL temporales al desmontar el componente.
 */

import { useEffect, useState } from "react";

import {
  getWorkOrderPhotos,
  saveWorkOrderPhoto,
  PHOTO_CATEGORIES,
} from "./photoService";

import "./work-order-photos.css";

function formatDate(value) {
  if (!value) return "Fecha no disponible";

  return new Date(value).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatSize(bytes) {
  if (!bytes) return "0 KB";

  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function WorkOrderPhotos({
  workOrderId,
  orderStatus,
  readOnly = false,
}) {
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});

  const [category, setCategory] = useState(
    PHOTO_CATEGORIES.BEFORE
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canEdit = !readOnly && orderStatus === "EN_PROGRESO";

  /*
   * CARGAR FOTOGRAFÍAS
   *
   * Consulta IndexedDB y recupera las imágenes
   * asociadas a la orden de trabajo.
   */
  async function loadPhotos() {
    if (!workOrderId) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getWorkOrderPhotos(workOrderId);

      setPhotos(result);
    } catch (err) {
      setError(
        err.message || "No fue posible cargar las fotografías."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * CARGAR AL ABRIR EL COMPONENTE
   */
  useEffect(() => {
    loadPhotos();
  }, [workOrderId]);

  /*
   * CREAR URL TEMPORAL DE CADA FOTOGRAFÍA
   *
   * Permite visualizar los Blob recuperados de IndexedDB.
   * Las URL se liberan cuando cambian las fotografías
   * o cuando el componente se desmonta.
   */
  useEffect(() => {
    const urls = {};

    photos.forEach((photo) => {
      if (photo.blob) {
        urls[photo.id] = URL.createObjectURL(photo.blob);
      }
    });

    setPhotoUrls(urls);

    return () => {
      Object.values(urls).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [photos]);

  /*
   * GUARDAR FOTOGRAFÍA
   *
   * Recibe la imagen seleccionada desde la cámara
   * o desde la galería.
   */
  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    // Permite volver a seleccionar el mismo archivo.
    event.target.value = "";

    if (!file) return;

    if (!canEdit) {
      setError(
        "Solo puedes adjuntar fotografías mientras la orden está en ejecución."
      );
      return;
    }

    setError("");
    setSuccess("");
    setSaving(true);

    try {
      await saveWorkOrderPhoto({
        workOrderId,
        category,
        file,
      });

      setSuccess(
        `Fotografía ${category} guardada correctamente.`
      );

      await loadPhotos();
    } catch (err) {
      setError(
        err.message || "No fue posible guardar la fotografía."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * SEPARAR FOTOGRAFÍAS POR CATEGORÍA
   */
  const beforePhotos = photos.filter(
    (photo) => photo.category === PHOTO_CATEGORIES.BEFORE
  );

  const afterPhotos = photos.filter(
    (photo) => photo.category === PHOTO_CATEGORIES.AFTER
  );

  const visiblePhotos =
    category === PHOTO_CATEGORIES.BEFORE
      ? beforePhotos
      : afterPhotos;

  return (
    <section className="work-order-photos">

      {/* ENCABEZADO */}
      <div className="work-order-photos__header">
        <div>
          <h3>Registro fotográfico</h3>

          <p>
            Evidencia visual del mantenimiento realizado.
          </p>
        </div>

        <span className="work-order-photos__total">
          {photos.length} foto(s)
        </span>
      </div>

      {/* CATEGORÍAS */}
      <div className="work-order-photos__categories">
        <button
          type="button"
          className={
            category === PHOTO_CATEGORIES.BEFORE
              ? "active"
              : ""
          }
          onClick={() => {
            setCategory(PHOTO_CATEGORIES.BEFORE);
            setError("");
            setSuccess("");
          }}
        >
          ANTES ({beforePhotos.length})
        </button>

        <button
          type="button"
          className={
            category === PHOTO_CATEGORIES.AFTER
              ? "active"
              : ""
          }
          onClick={() => {
            setCategory(PHOTO_CATEGORIES.AFTER);
            setError("");
            setSuccess("");
          }}
        >
          DESPUÉS ({afterPhotos.length})
        </button>
      </div>

      {/* CÁMARA Y GALERÍA */}
      {canEdit && (
        <div className="work-order-photos__capture">

          <p>
            Fotografía seleccionada:{" "}
            <strong>{category}</strong>
          </p>

          <label
            className={`work-order-photos__button ${
              saving ? "disabled" : ""
            }`}
          >
            <span>📷</span>

            {saving
              ? "Guardando..."
              : "Tomar fotografía"}

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={saving}
              aria-label="Tomar fotografía con la cámara"
            />
          </label>

          <label
            className={`work-order-photos__button secondary ${
              saving ? "disabled" : ""
            }`}
          >
            <span>🖼️</span>

            Seleccionar desde galería

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={saving}
              aria-label="Seleccionar fotografía desde la galería"
            />
          </label>

          <small>
            Formatos permitidos: JPG, PNG y WEBP.
            Tamaño original máximo: 10 MB.
          </small>

        </div>
      )}

      {/* MODO SOLO LECTURA */}
      {!canEdit && (
        <p className="work-order-photos__readonly">
          Esta orden no permite adjuntar nuevas fotografías.
          Puedes consultar las imágenes registradas.
        </p>
      )}

      {/* MENSAJES */}
      {error && (
        <div
          className="work-order-photos__message error"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="work-order-photos__message success"
          role="status"
        >
          {success}
        </div>
      )}

      {/* GALERÍA */}
      <div className="work-order-photos__gallery">

        <h4>
          Fotografías {category}
        </h4>

        {loading && (
          <p className="work-order-photos__empty">
            Cargando fotografías...
          </p>
        )}

        {!loading && visiblePhotos.length === 0 && (
          <p className="work-order-photos__empty">
            Todavía no hay fotografías registradas en esta categoría.
          </p>
        )}

        {!loading && visiblePhotos.length > 0 && (
          <div className="work-order-photos__grid">

            {visiblePhotos.map((photo) => (
              <article
                className="work-order-photos__card"
                key={photo.id}
              >

                {photoUrls[photo.id] && (
                  <img
                    src={photoUrls[photo.id]}
                    alt={`Fotografía ${photo.category} de la orden`}
                    loading="lazy"
                  />
                )}

                <div className="work-order-photos__details">

                  <strong>
                    {photo.category}
                  </strong>

                  <span>
                    {formatDate(photo.createdAt)}
                  </span>

                  <span>
                    Tamaño: {formatSize(photo.size)}
                  </span>

                  <span>
                    Resolución: {photo.width} × {photo.height}
                  </span>

                </div>

              </article>
            ))}

          </div>
        )}

      </div>

    </section>
  );
}
