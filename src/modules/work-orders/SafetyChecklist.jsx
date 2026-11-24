
/*
 * ANDINACARE - CHECKLIST AST/LOTO
 *
 * Presenta los controles de seguridad obligatorios
 * antes de permitir el inicio de una orden de trabajo.
 */

import { useState } from "react";
import { ShieldCheck, AlertTriangle, XCircle } from "lucide-react";

import {
  SAFETY_CHECKLIST,
  confirmSafetyChecklist,
} from "../../services/safety/safetyService";

import "./safety-checklist.css";

function SafetyChecklist({ order, onConfirmed, onCancel }) {
  const [rut, setRut] = useState("");
  const [checks, setChecks] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /*
   * Actualiza la confirmación de un control.
   */
  function handleCheckChange(id, checked) {
    setChecks((previous) => ({
      ...previous,
      [id]: checked,
    }));
  }

  /*
   * Envía las respuestas al servicio de seguridad.
   * El servicio vuelve a validar todos los controles.
   */
  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    try {
      setSaving(true);

      const record = await confirmSafetyChecklist({
        workOrderId: order.id,
        rut,
        checklist: checks,
      });

      onConfirmed(record);
    } catch (err) {
      setError(err.message || "No se pudo confirmar el checklist.");
    } finally {
      setSaving(false);
    }
  }

  const completedCount = SAFETY_CHECKLIST.filter(
    (item) => checks[item.id] === true
  ).length;

  const allCompleted =
    completedCount === SAFETY_CHECKLIST.length;

  return (
    <div className="safety-overlay">
      <section
        className="safety-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-title"
      >
        <header className="safety-header">
          <div className="safety-header__icon">
            <ShieldCheck size={28} />
          </div>

          <div>
            <span className="safety-eyebrow">
              SEGURIDAD INDUSTRIAL
            </span>

            <h2 id="safety-title">
              Verificación AST / LOTO
            </h2>

            <p>
              Orden: <strong>{order.code}</strong>
            </p>
          </div>

          <button
            type="button"
            className="safety-close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cerrar checklist"
          >
            <XCircle size={22} />
          </button>
        </header>

        <div className="safety-warning">
          <AlertTriangle size={20} />

          <p>
            Antes de intervenir el equipo, verifica físicamente
            los aislamientos, bloqueos y ausencia de energía
            conforme al procedimiento autorizado de la planta.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="safety-progress">
            <strong>
              Controles confirmados: {completedCount} de{" "}
              {SAFETY_CHECKLIST.length}
            </strong>

            <div className="safety-progress__track">
              <div
                className="safety-progress__value"
                style={{
                  width: `${
                    (completedCount / SAFETY_CHECKLIST.length) * 100
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="safety-checklist">
            {SAFETY_CHECKLIST.map((item, index) => (
              <label
                key={item.id}
                className="safety-check"
              >
                <input
                  type="checkbox"
                  checked={checks[item.id] === true}
                  onChange={(event) =>
                    handleCheckChange(
                      item.id,
                      event.target.checked
                    )
                  }
                />

                <span className="safety-check__number">
                  {index + 1}
                </span>

                <span className="safety-check__label">
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <div className="safety-rut">
            <label htmlFor="safety-rut">
              RUT del técnico que confirma *
            </label>

            <input
              id="safety-rut"
              type="text"
              value={rut}
              onChange={(event) => setRut(event.target.value)}
              placeholder="Ej. 12345678-5"
              maxLength={12}
              required
            />

            <small>
              Se registrará como RUT declarado en esta
              confirmación. No constituye verificación
              de identidad.
            </small>
          </div>

          {error && (
            <div className="safety-error" role="alert">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          <div className="safety-footer">
            <button
              type="button"
              className="safety-button safety-button--secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Volver
            </button>

            <button
              type="submit"
              className="safety-button safety-button--primary"
              disabled={saving || !allCompleted || !rut.trim()}
            >
              <ShieldCheck size={18} />

              {saving
                ? "Guardando confirmación..."
                : "Confirmar seguridad"}
            </button>
          </div>

          <p className="safety-disclaimer">
            Prototipo académico. La confirmación digital no
            reemplaza la ejecución ni la comprobación física
            del procedimiento de bloqueo y etiquetado.
          </p>
        </form>
      </section>
    </div>
  );
}

export default SafetyChecklist;
