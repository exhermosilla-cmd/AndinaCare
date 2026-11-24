
/*
 * ANDINACARE - FORMULARIO AST/LOTO
 *
 * Este formulario permite:
 * 1. Identificar la orden de trabajo.
 * 2. Ingresar el RUT del técnico responsable.
 * 3. Confirmar los controles obligatorios de seguridad.
 * 4. Validar los datos antes de guardar.
 * 5. Guardar el registro AST/LOTO en IndexedDB.
 * 6. Avisar a WorkOrdersPage cuando el registro esté guardado.
 *
 * El inicio de la orden se ejecutará desde el componente padre.
 */

import { useState } from "react";

import {
  SAFETY_CHECKLIST,
  confirmSafetyChecklist,
} from "./safetyService";

import "./safety-checklist.css";

export default function SafetyChecklist({
  workOrder,
  onClose,
  onConfirmed,
}) {
  // RUT DEL TÉCNICO
  const [rut, setRut] = useState("");

  // CONTROLES CONFIRMADOS
  const [checklist, setChecklist] = useState({});

  // ESTADOS DEL FORMULARIO
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // CONTAR CONTROLES CONFIRMADOS
  const completedCount = SAFETY_CHECKLIST.filter(
    (item) => checklist[item.id] === true
  ).length;

  const allCompleted =
    SAFETY_CHECKLIST.length > 0 &&
    completedCount === SAFETY_CHECKLIST.length;

  // ACTUALIZAR UN CONTROL
  function handleChecklistChange(controlId, checked) {
    setChecklist((previous) => ({
      ...previous,
      [controlId]: checked,
    }));

    setError("");
  }

  // FORMATEAR RUT
  function handleRutChange(value) {
    const cleaned = value
      .replace(/[^0-9kK.-]/g, "")
      .toUpperCase();

    setRut(cleaned);
    setError("");
  }

  // CERRAR FORMULARIO
  function handleClose() {
    if (loading) return;

    if (typeof onClose === "function") {
      onClose();
    }
  }

  // GUARDAR Y CONFIRMAR AST/LOTO
  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    if (!workOrder?.id) {
      setError("No se encontró una orden de trabajo válida.");
      return;
    }

    if (!rut.trim()) {
      setError("Debes ingresar el RUT del técnico responsable.");
      return;
    }

    if (!allCompleted) {
      setError(
        "Debes confirmar todos los controles obligatorios."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      /*
       * Guardar el registro AST/LOTO.
       * La validación de identidad, permisos y orden
       * corresponde al servicio de seguridad.
       */

      const safetyRecord = await confirmSafetyChecklist({
        workOrderId: workOrder.id,
        rut: rut.trim(),
        checklist,
      });

      if (!safetyRecord) {
        throw new Error(
          "No se recibió el registro de seguridad guardado."
        );
      }

      /*
       * Informar al componente padre.
       * El componente padre será responsable de iniciar la OT.
       */

      if (typeof onConfirmed === "function") {
        await onConfirmed(safetyRecord);
      }
    } catch (err) {
      console.error(
        "Error en formulario AST/LOTO:",
        err
      );

      setError(
        err?.message ||
          "No se pudo confirmar el checklist de seguridad."
      );
    } finally {
      setLoading(false);
    }
  }

  // INTERFAZ
  return (
    <div
      className="safety-modal-overlay"
      role="presentation"
    >
      <section
        className="safety-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-modal-title"
      >
        {/* ENCABEZADO */}

        <header className="safety-modal-header">
          <div className="safety-header-icon">
            <span>⚠</span>
          </div>

          <div className="safety-header-text">
            <span className="safety-eyebrow">
              SEGURIDAD INDUSTRIAL
            </span>

            <h2 id="safety-modal-title">
              Checklist AST / LOTO
            </h2>

            <p>
              Verificación obligatoria antes de iniciar el trabajo.
            </p>
          </div>

          <button
            type="button"
            className="safety-close-button"
            onClick={handleClose}
            disabled={loading}
            aria-label="Cerrar formulario"
          >
            ×
          </button>
        </header>

        {/* CONTENIDO */}

        <form
          className="safety-form"
          onSubmit={handleSubmit}
        >
          {/* INFORMACIÓN DE LA ORDEN */}

          <section className="safety-order-info">
            <div>
              <span>Orden de trabajo</span>

              <strong>
                {workOrder?.code || "Sin código"}
              </strong>
            </div>

            <div>
              <span>Trabajo</span>

              <strong>
                {workOrder?.title || "Sin título"}
              </strong>
            </div>
          </section>

          {/* IDENTIFICACIÓN DEL TÉCNICO */}

          <section className="safety-section">
            <div className="safety-section-heading">
              <h3>Identificación del responsable</h3>

              <span className="safety-required">
                Obligatorio
              </span>
            </div>

            <label
              className="safety-field-label"
              htmlFor="safety-rut"
            >
              RUT del técnico responsable
            </label>

            <input
              id="safety-rut"
              type="text"
              value={rut}
              onChange={(event) =>
                handleRutChange(event.target.value)
              }
              placeholder="Ejemplo: 12345678-5"
              autoComplete="off"
              disabled={loading}
              maxLength={12}
              required
            />

            <p className="safety-field-help">
              Se registrará junto con el usuario autenticado
              y la fecha de confirmación.
            </p>
          </section>

          {/* CHECKLIST */}

          <section className="safety-section">
            <div className="safety-section-heading">
              <div>
                <h3>Verificación de seguridad</h3>

                <p>
                  Confirma cada control después de verificarlo
                  físicamente.
                </p>
              </div>
            </div>

            <div className="safety-progress">
              <div className="safety-progress-label">
                <span>Controles confirmados</span>

                <strong>
                  {completedCount}/{SAFETY_CHECKLIST.length}
                </strong>
              </div>

              <div className="safety-progress-track">
                <div
                  className="safety-progress-fill"
                  style={{
                    width: `${
                      SAFETY_CHECKLIST.length > 0
                        ? (completedCount /
                            SAFETY_CHECKLIST.length) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="safety-checklist-items">
              {SAFETY_CHECKLIST.map((item, index) => (
                <label
                  key={item.id}
                  className={`safety-check-item ${
                    checklist[item.id]
                      ? "safety-check-item-completed"
                      : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checklist[item.id] === true}
                    onChange={(event) =>
                      handleChecklistChange(
                        item.id,
                        event.target.checked
                      )
                    }
                    disabled={loading}
                  />

                  <span className="safety-check-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="safety-check-content">
                    <strong>{item.title}</strong>

                    <small>{item.description}</small>
                  </span>

                  <span className="safety-check-status">
                    {checklist[item.id] ? "✓" : "○"}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* ADVERTENCIA */}

          <div className="safety-warning">
            <strong>
              Importante: seguridad operacional
            </strong>

            <p>
              No confirmes un control que no hayas verificado.
              El registro digital no reemplaza la instalación
              física de candados y tarjetas ni la comprobación
              de energía cero conforme al procedimiento
              de seguridad aplicable.
            </p>
          </div>

          {/* MENSAJE DE ERROR */}

          {error && (
            <div
              className="safety-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* ACCIONES */}

          <footer className="safety-form-actions">
            <button
              type="button"
              className="safety-button-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="safety-button-primary"
              disabled={
                loading ||
                !allCompleted ||
                !rut.trim()
              }
            >
              {loading
                ? "Guardando registro..."
                : "Confirmar seguridad"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
