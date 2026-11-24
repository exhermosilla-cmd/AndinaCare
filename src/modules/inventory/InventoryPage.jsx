
/*
 * ANDINACARE - PANTALLA DE BODEGA E INVENTARIO
 *
 * Funciones:
 * - Catálogo y búsqueda de repuestos.
 * - Stock físico, reservado y disponible.
 * - Alertas de stock bajo.
 * - Registro de repuestos y entradas.
 * - Reservas para órdenes aprobadas.
 * - Entrega total o parcial de reservas.
 * - Cancelación de reservas.
 * - Historial de movimientos.
 *
 * REGLAS:
 * - Reservar no descuenta stock físico.
 * - Entregar descuenta stock físico y libera reserva.
 * - Cancelar libera la reserva sin modificar stock físico.
 */

import { useCallback, useEffect, useState } from "react";

import {
  Search,
  Package,
  Plus,
  ArrowDownToLine,
  RefreshCw,
  AlertTriangle,
  Boxes,
  X,
  History,
  ClipboardList,
  CheckCircle,
  Ban,
} from "lucide-react";

import { getCurrentUser } from "../../services/auth/authService";

import {
  ACTIONS,
  hasPermission,
} from "../../services/auth/permissions";

import {
  db,
  openDatabase,
} from "../../services/database/db";

import {
  getSpareParts,
  getLowStockParts,
  createSparePart,
  registerInventoryEntry,
  getInventoryMovements,
  reserveSparePart,
  deliverReservation,
  cancelReservation,
} from "./inventoryService";

import "./inventory.css";

const EMPTY_PART_FORM = {
  code: "",
  name: "",
  description: "",
  location: "",
  category: "GENERAL",
  stock: "0",
  minStock: "0",
};

function InventoryPage() {
  const [parts, setParts] = useState([]);
  const [allParts, setAllParts] = useState([]);
  const [lowStockParts, setLowStockParts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [approvedWorkOrders, setApprovedWorkOrders] = useState([]);
  const [reservations, setReservations] = useState([]);

  const [currentUser, setCurrentUser] = useState(null);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [showPartForm, setShowPartForm] = useState(false);
  const [entryPart, setEntryPart] = useState(null);
  const [reservationPart, setReservationPart] = useState(null);
  const [deliveryReservation, setDeliveryReservation] = useState(null);

  const [partForm, setPartForm] = useState(EMPTY_PART_FORM);

  const [entryQuantity, setEntryQuantity] = useState("");
  const [entryDescription, setEntryDescription] = useState("");

  const [reservationForm, setReservationForm] = useState({
    workOrderId: "",
    quantity: "",
  });

  const [deliveryQuantity, setDeliveryQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canCreate = currentUser
    ? hasPermission(currentUser.role, "inventory", ACTIONS.CREATE)
    : false;

  const canUpdate = currentUser
    ? hasPermission(currentUser.role, "inventory", ACTIONS.UPDATE)
    : false;

  /*
   * CARGAR INFORMACIÓN DEL INVENTARIO
   */
  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const user = await getCurrentUser();
      setCurrentUser(user);

      await openDatabase();

      const [
        partsData,
        allPartsData,
        lowStockData,
        movementsData,
        workOrdersData,
        reservationsData,
      ] = await Promise.all([
        getSpareParts({
          search,
          onlyActive: !showInactive,
        }),
        db.spareParts.toArray(),
        getLowStockParts(),
        getInventoryMovements(),
        db.workOrders.toArray(),
        db.inventoryReservations.toArray(),
      ]);

      const approvedOrders = workOrdersData.filter((order) => {
        const approved =
          order.approvalStatus === "APROBADA" ||
          order.approved === true;

        const status = String(order.status || "").toUpperCase();

        return (
          approved &&
          status !== "CANCELADA" &&
          status !== "COMPLETADA"
        );
      });

      setParts(partsData);
      setAllParts(allPartsData);
      setLowStockParts(lowStockData);
      setMovements(movementsData.slice(0, 8));
      setApprovedWorkOrders(approvedOrders);

      
      setReservations(
        reservationsData
          .filter((reservation) =>
            ["ACTIVA", "PARCIAL"].includes(
              String(reservation.status || "").toUpperCase()
            )
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt) - new Date(a.createdAt)
          )
      );
    } catch (err) {
      setError(
        err.message || "No fue posible cargar el inventario."
      );
    } finally {
      setLoading(false);
    }
  }, [search, showInactive]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  /*
   * MANEJAR FORMULARIO DE REPUESTO
   */
  function handlePartFormChange(event) {
    const { name, value } = event.target;

    setPartForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  /*
   * CREAR REPUESTO
   */
  async function handleCreatePart(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    try {
      setSaving(true);

      await createSparePart({
        ...partForm,
        stock: Number(partForm.stock),
        minStock: Number(partForm.minStock),
      });

      setPartForm(EMPTY_PART_FORM);
      setShowPartForm(false);

      setSuccess("El repuesto se registró correctamente.");

      await loadInventory();
    } catch (err) {
      setError(err.message || "No se pudo registrar el repuesto.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * REGISTRAR ENTRADA DE INVENTARIO
   */
  async function handleRegisterEntry(event) {
    event.preventDefault();

    if (!entryPart) return;

    setError("");
    setSuccess("");

    try {
      setSaving(true);

      await registerInventoryEntry({
        sparePartId: entryPart.id,
        quantity: Number(entryQuantity),
        description:
          entryDescription.trim() || "Entrada de inventario.",
      });

      setEntryPart(null);
      setEntryQuantity("");
      setEntryDescription("");

      setSuccess("La entrada de inventario se registró correctamente.");

      await loadInventory();
    } catch (err) {
      setError(err.message || "No se pudo registrar la entrada.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * ABRIR FORMULARIO DE RESERVA
   */
  function openReservationForm(part) {
    setError("");
    setSuccess("");

    setEntryPart(null);
    setDeliveryReservation(null);
    setShowPartForm(false);

    setReservationPart(part);
    setReservationForm({
      workOrderId: "",
      quantity: "",
    });
  }

  /*
   * RESERVAR REPUESTO
   */
  async function handleReservePart(event) {
    event.preventDefault();

    if (!reservationPart) return;

    setError("");
    setSuccess("");

    try {
      setSaving(true);

      if (!reservationForm.workOrderId) {
        throw new Error("Debes seleccionar una orden de trabajo.");
      }

      const quantity = Number(reservationForm.quantity);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Ingresa una cantidad entera mayor que cero.");
      }

      await reserveSparePart({
        sparePartId: reservationPart.id,
        workOrderId: reservationForm.workOrderId,
        quantity,
      });

      setReservationPart(null);

      setReservationForm({
        workOrderId: "",
        quantity: "",
      });

      setSuccess("La reserva se registró correctamente.");

      await loadInventory();
    } catch (err) {
      setError(err.message || "No se pudo registrar la reserva.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * ABRIR FORMULARIO DE ENTREGA
   */
  function openDeliveryForm(reservation) {
    const pending =
      Number(reservation.quantity || 0) -
      Number(reservation.deliveredQuantity || 0);

    setError("");
    setSuccess("");

    setReservationPart(null);
    setDeliveryReservation(reservation);
    setDeliveryQuantity(String(pending));
  }

  /*
   * CONFIRMAR ENTREGA TOTAL O PARCIAL
   */
  async function handleDeliverReservation(event) {
    event.preventDefault();

    if (!deliveryReservation) return;

    setError("");
    setSuccess("");

    try {
      setSaving(true);

      const quantity = Number(deliveryQuantity);

      const pending =
        Number(deliveryReservation.quantity || 0) -
        Number(deliveryReservation.deliveredQuantity || 0);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Ingresa una cantidad entera mayor que cero.");
      }

      if (quantity > pending) {
        throw new Error(
          "La cantidad no puede superar las unidades pendientes."
        );
      }

      await deliverReservation({
        reservationId: deliveryReservation.id,
        quantity,
        description: "Entrega de repuesto para orden de trabajo.",
      });

      setDeliveryReservation(null);
      setDeliveryQuantity("");

      setSuccess("La entrega se registró correctamente.");

      await loadInventory();
    } catch (err) {
      setError(err.message || "No se pudo confirmar la entrega.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * CANCELAR RESERVA
   */
  async function handleCancelReservation(reservation) {
    const confirmed = window.confirm(
      "¿Deseas cancelar esta reserva? Las unidades reservadas volverán a estar disponibles."
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      setSaving(true);

      await cancelReservation(reservation.id);

      setSuccess("La reserva se canceló correctamente.");

      await loadInventory();
    } catch (err) {
      setError(err.message || "No se pudo cancelar la reserva.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * RESUMEN DE EXISTENCIAS
   *
   * Se utilizan todos los repuestos registrados,
   * independientemente de la búsqueda o los filtros.
   */
  const totalPhysicalStock = allParts.reduce(
    (total, part) => total + Number(part.stock || 0),
    0
  );

  const totalReservedStock = allParts.reduce(
    (total, part) => total + Number(part.reservedStock || 0),
    0
  );

  const totalAvailableStock = allParts.reduce(
    (total, part) =>
      total +
      Number(
        part.availableStock ??
          (Number(part.stock || 0) -
            Number(part.reservedStock || 0))
      ),
    0
  );

  return (
    <section className="module-page inventory-page">

      {/* ENCABEZADO */}

      <div className="page-heading">
        <div className="page-heading__main">
          <div className="page-heading__icon">
            <Package size={27} />
          </div>

          <div>
            <span className="page-heading__eyebrow">
              MANTENIMIENTO INDUSTRIAL
            </span>

            <h1>Bodega e Inventario</h1>

            <p>
              Administración de repuestos, existencias y movimientos.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="inventory-button inventory-button--secondary"
          onClick={loadInventory}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* MENSAJES */}

      {error && (
        <div className="inventory-alert inventory-alert--error">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div className="inventory-alert inventory-alert--success">
          {success}

          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Cerrar mensaje"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ALERTA DE STOCK BAJO */}

      {lowStockParts.length > 0 && (
        <div className="inventory-alert inventory-alert--warning">
          <AlertTriangle size={20} />

          <div>
            <strong>Alerta de stock bajo</strong>
            <p>
              Hay {lowStockParts.length} repuesto(s) con existencias
              disponibles iguales o inferiores al mínimo establecido.
            </p>
          </div>
        </div>
      )}

      {/* RESUMEN */}

      <div className="inventory-summary">
        <article className="inventory-summary__card">
          <div className="inventory-summary__icon">
            <Package size={21} />
          </div>
          <span>Repuestos registrados</span>
          <strong>{allParts.length}</strong>
        </article>

        <article className="inventory-summary__card">
          <div className="inventory-summary__icon">
            <Boxes size={21} />
          </div>
          <span>Stock físico</span>
          <strong>{totalPhysicalStock}</strong>
        </article>

        <article className="inventory-summary__card">
          <div className="inventory-summary__icon">
            <History size={21} />
          </div>
          <span>Stock reservado</span>
          <strong>{totalReservedStock}</strong>
        </article>

        <article className="inventory-summary__card">
          <div className="inventory-summary__icon">
            <Package size={21} />
          </div>
          <span>Stock disponible</span>
          <strong>{totalAvailableStock}</strong>
        </article>
      </div>

      {/* NUEVO REPUESTO */}

      {canCreate && (
        <div className="inventory-toolbar">
          <button
            type="button"
            className="inventory-button inventory-button--primary"
            onClick={() => {
              setShowPartForm((previous) => !previous);
              setEntryPart(null);
              setReservationPart(null);
              setDeliveryReservation(null);
              setError("");
            }}
          >
            <Plus size={17} />
            Nuevo repuesto
          </button>
        </div>
      )}

      {/* FORMULARIO DE REPUESTO */}

      {showPartForm && (
        <form className="inventory-form" onSubmit={handleCreatePart}>
          <div className="inventory-form__heading">
            <div>
              <h2>Registrar repuesto</h2>
              <p>Completa los datos del nuevo elemento.</p>
            </div>

            <button
              type="button"
              className="inventory-icon-button"
              onClick={() => setShowPartForm(false)}
              aria-label="Cerrar formulario"
            >
              <X size={19} />
            </button>
          </div>

          <div className="inventory-form__grid">
            <label>
              Código *
              <input
                name="code"
                value={partForm.code}
                onChange={handlePartFormChange}
                placeholder="Ej. REP-001"
                required
              />
            </label>

            <label>
              Nombre *
              <input
                name="name"
                value={partForm.name}
                onChange={handlePartFormChange}
                placeholder="Nombre del repuesto"
                required
              />
            </label>

            <label>
              Categoría
              <input
                name="category"
                value={partForm.category}
                onChange={handlePartFormChange}
                placeholder="Ej. Mecánico"
              />
            </label>

            <label>
              Ubicación
              <input
                name="location"
                value={partForm.location}
                onChange={handlePartFormChange}
                placeholder="Ej. Estante A-01"
              />
            </label>

            <label>
              Stock inicial
              <input
                type="number"
                name="stock"
                min="0"
                step="1"
                value={partForm.stock}
                onChange={handlePartFormChange}
                required
              />
            </label>

            <label>
              Stock mínimo
              <input
                type="number"
                name="minStock"
                min="0"
                step="1"
                value={partForm.minStock}
                onChange={handlePartFormChange}
                required
              />
            </label>

            <label className="inventory-form__full">
              Descripción
              <textarea
                name="description"
                value={partForm.description}
                onChange={handlePartFormChange}
                rows="3"
                placeholder="Descripción del repuesto."
              />
            </label>
          </div>

          <div className="inventory-form__actions">
            <button
              type="button"
              className="inventory-button inventory-button--secondary"
              onClick={() => setShowPartForm(false)}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="inventory-button inventory-button--primary"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar repuesto"}
            </button>
          </div>
        </form>
      )}

      {/* FORMULARIO DE ENTRADA */}

      {entryPart && (
        <form className="inventory-form" onSubmit={handleRegisterEntry}>
          <div className="inventory-form__heading">
            <div>
              <h2>Registrar entrada</h2>
              <p>{entryPart.code} — {entryPart.name}</p>
            </div>

            <button
              type="button"
              className="inventory-icon-button"
              onClick={() => setEntryPart(null)}
              aria-label="Cerrar formulario"
            >
              <X size={19} />
            </button>
          </div>

          <label>
            Cantidad que ingresa *
            <input
              type="number"
              min="1"
              step="1"
              value={entryQuantity}
              onChange={(event) => setEntryQuantity(event.target.value)}
              placeholder="Ej. 10"
              required
            />
          </label>

          <label>
            Descripción del movimiento
            <textarea
              value={entryDescription}
              onChange={(event) => setEntryDescription(event.target.value)}
              rows="2"
              placeholder="Ej. Recepción de compra o reposición."
            />
          </label>

          <div className="inventory-form__actions">
            <button
              type="button"
              className="inventory-button inventory-button--secondary"
              onClick={() => setEntryPart(null)}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="inventory-button inventory-button--primary"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Confirmar entrada"}
            </button>
          </div>
        </form>
      )}

      {/* FORMULARIO DE RESERVA */}

      {reservationPart && (
        <form className="inventory-form" onSubmit={handleReservePart}>
          <div className="inventory-form__heading">
            <div>
              <h2>Reservar repuesto</h2>
              <p>{reservationPart.code} — {reservationPart.name}</p>
            </div>

            <button
              type="button"
              className="inventory-icon-button"
              onClick={() => setReservationPart(null)}
              aria-label="Cerrar formulario"
            >
              <X size={19} />
            </button>
          </div>

          <div className="inventory-alert inventory-alert--warning">
            <ClipboardList size={18} />
            <div>
              <strong>Reserva para orden aprobada</strong>
              <p>
                La reserva no descuenta el stock físico.
                Solamente reduce las unidades disponibles.
              </p>
            </div>
          </div>

          <div className="inventory-reservation-stock">
            <span>
              Stock físico: <strong>{reservationPart.stock}</strong>
            </span>
            <span>
              Reservado: <strong>{reservationPart.reservedStock || 0}</strong>
            </span>
            <span>
              Disponible: <strong>{reservationPart.availableStock}</strong>
            </span>
          </div>

          {approvedWorkOrders.length === 0 ? (
            <div className="inventory-empty">
              <AlertTriangle size={25} />
              <strong>No hay órdenes aprobadas disponibles</strong>
              <p>
                Necesitas una orden aprobada y activa para reservar.
              </p>
            </div>
          ) : (
            <>
              <label>
                Orden de trabajo *
                <select
                  value={reservationForm.workOrderId}
                  onChange={(event) =>
                    setReservationForm((previous) => ({
                      ...previous,
                      workOrderId: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Selecciona una orden aprobada</option>

                  {approvedWorkOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.id} — {order.title || order.description || "Orden de trabajo"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cantidad a reservar *
                <input
                  type="number"
                  min="1"
                  max={Math.max(
                    0,
                    Number(reservationPart.availableStock || 0)
                  )}
                  step="1"
                  value={reservationForm.quantity}
                  onChange={(event) =>
                    setReservationForm((previous) => ({
                      ...previous,
                      quantity: event.target.value,
                    }))
                  }
                  placeholder="Ej. 5"
                  required
                />
              </label>

              <div className="inventory-form__actions">
                <button
                  type="button"
                  className="inventory-button inventory-button--secondary"
                  onClick={() => setReservationPart(null)}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="inventory-button inventory-button--primary"
                  disabled={
                    saving ||
                    Number(reservationPart.availableStock || 0) <= 0
                  }
                >
                  {saving ? "Reservando..." : "Confirmar reserva"}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* FORMULARIO DE ENTREGA */}

      {deliveryReservation && (
        <form
          className="inventory-form"
          onSubmit={handleDeliverReservation}
        >
          <div className="inventory-form__heading">
            <div>
              <h2>Confirmar entrega</h2>
              <p>Orden: {deliveryReservation.workOrderId}</p>
            </div>

            <button
              type="button"
              className="inventory-icon-button"
              onClick={() => setDeliveryReservation(null)}
              aria-label="Cerrar formulario"
            >
              <X size={19} />
            </button>
          </div>

          <div className="inventory-alert inventory-alert--warning">
            <Package size={18} />
            <div>
              <strong>Entrega de repuesto</strong>
              <p>
                Al confirmar, se descontará la cantidad entregada
                del stock físico y se liberará la reserva correspondiente.
              </p>
            </div>
          </div>

          <p>
            Cantidad reservada:{" "}
            <strong>{deliveryReservation.quantity}</strong>
          </p>

          <p>
            Ya entregada:{" "}
            <strong>{deliveryReservation.deliveredQuantity || 0}</strong>
          </p>

          <label>
            Cantidad a entregar *
            <input
              type="number"
              min="1"
              max={
                Number(deliveryReservation.quantity || 0) -
                Number(deliveryReservation.deliveredQuantity || 0)
              }
              step="1"
              value={deliveryQuantity}
              onChange={(event) => setDeliveryQuantity(event.target.value)}
              required
            />
          </label>

          <div className="inventory-form__actions">
            <button
              type="button"
              className="inventory-button inventory-button--secondary"
              onClick={() => setDeliveryReservation(null)}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="inventory-button inventory-button--primary"
              disabled={saving}
            >
              {saving ? "Procesando..." : "Confirmar entrega"}
            </button>
          </div>
        </form>
      )}

      {/* CATÁLOGO */}

      <div className="inventory-section-heading">
        <div>
          <h2>Catálogo de repuestos</h2>
          <p>Consulta las existencias registradas en bodega.</p>
        </div>

        <label className="inventory-inactive-filter">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          Mostrar inactivos
        </label>
      </div>

      <div className="inventory-search">
        <Search size={19} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por código, nombre o ubicación..."
        />
      </div>

      {loading ? (
        <div className="inventory-empty">
          Cargando inventario...
        </div>
      ) : parts.length === 0 ? (
        <div className="inventory-empty">
          <Package size={30} />
          <strong>No hay repuestos registrados</strong>
          <p>
            {search
              ? "No se encontraron repuestos con esa búsqueda."
              : "Cuando registres repuestos, aparecerán en este catálogo."}
          </p>
        </div>
      ) : (
        <div className="inventory-table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Repuesto</th>
                <th>Ubicación</th>
                <th>Stock físico</th>
                <th>Reservado</th>
                <th>Disponible</th>
                <th>Estado</th>
                {canUpdate && <th>Acciones</th>}
              </tr>
            </thead>

            <tbody>
              {parts.map((part) => {
                const isLow =
                  Number(part.availableStock || 0) <=
                  Number(part.minStock || 0);

                return (
                  <tr key={part.id}>
                    <td>
                      <div className="inventory-part-name">
                        <strong>{part.name}</strong>
                        <span>{part.code}</span>
                        {part.description && (
                          <small>{part.description}</small>
                        )}
                      </div>
                    </td>

                    <td>{part.location || "Sin ubicación"}</td>
                    <td>{part.stock}</td>
                    <td>{part.reservedStock || 0}</td>

                    <td>
                      <strong>{part.availableStock}</strong>
                    </td>

                    <td>
                      {part.active === false ? (
                        <span className="inventory-status inventory-status--inactive">
                          Inactivo
                        </span>
                      ) : isLow ? (
                        <span className="inventory-status inventory-status--low">
                          Stock bajo
                        </span>
                      ) : (
                        <span className="inventory-status inventory-status--ok">
                          Normal
                        </span>
                      )}
                    </td>

                    {canUpdate && (
                      <td>
                        {part.active !== false && (
                          <div className="inventory-row-actions">
                            <button
                              type="button"
                              className="inventory-button inventory-button--small"
                              onClick={() => {
                                setEntryPart(part);
                                setReservationPart(null);
                                setDeliveryReservation(null);
                                setShowPartForm(false);
                                setEntryQuantity("");
                                setEntryDescription("");
                                setError("");
                              }}
                            >
                              <ArrowDownToLine size={15} />
                              Entrada
                            </button>

                            {canCreate && (
                              <button
                                type="button"
                                className="inventory-button inventory-button--small inventory-button--primary"
                                onClick={() => openReservationForm(part)}
                              >
                                <ClipboardList size={15} />
                                Reservar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* RESERVAS ACTIVAS */}

      <section className="inventory-movements">
        <div className="inventory-section-heading">
          <div>
            <h2>Reservas pendientes de entrega</h2>
            <p>Repuestos reservados para órdenes de trabajo aprobadas.</p>
          </div>
        </div>

        {reservations.length === 0 ? (
          <div className="inventory-empty inventory-empty--compact">
            No hay reservas pendientes de entrega.
          </div>
        ) : (
          <div className="inventory-table-wrapper">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Orden de trabajo</th>
                  <th>Repuesto</th>
                  <th>Reservado</th>
                  <th>Entregado</th>
                  <th>Pendiente</th>
                  {canUpdate && <th>Acciones</th>}
                </tr>
              </thead>

              <tbody>
                {reservations.map((reservation) => {
                  const part = allParts.find(
                    (item) => item.id === reservation.sparePartId
                  );

                  const pending =
                    Number(reservation.quantity || 0) -
                    Number(reservation.deliveredQuantity || 0);

                  return (
                    <tr key={reservation.id}>
                      <td>{reservation.workOrderId}</td>

                      <td>
                        {part
                          ? `${part.code} — ${part.name}`
                          : "Repuesto"}
                      </td>

                      <td>{reservation.quantity}</td>
                      <td>{reservation.deliveredQuantity || 0}</td>
                      <td><strong>{pending}</strong></td>

                      {canUpdate && (
                        <td>
                          <div className="inventory-row-actions">
                            <button
                              type="button"
                              className="inventory-button inventory-button--small inventory-button--primary"
                              onClick={() => openDeliveryForm(reservation)}
                              disabled={saving || pending <= 0}
                            >
                              <CheckCircle size={15} />
                              Entregar
                            </button>

                            <button
                              type="button"
                              className="inventory-button inventory-button--small"
                              onClick={() =>
                                handleCancelReservation(reservation)
                              }
                              disabled={saving}
                            >
                              <Ban size={15} />
                              Cancelar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MOVIMIENTOS RECIENTES */}

      <section className="inventory-movements">
        <div className="inventory-section-heading">
          <div>
            <h2>Movimientos recientes</h2>
            <p>Últimas operaciones registradas en bodega.</p>
          </div>
        </div>

        {movements.length === 0 ? (
          <div className="inventory-empty inventory-empty--compact">
            Todavía no hay movimientos registrados.
          </div>
        ) : (
          <div className="inventory-movement-list">
            {movements.map((movement) => {
              const part = allParts.find(
                (item) => item.id === movement.sparePartId
              );

              return (
                <article
                  className="inventory-movement"
                  key={movement.id}
                >
                  <div className="inventory-movement__icon">
                    {movement.type === "ENTRADA" ? (
                      <ArrowDownToLine size={18} />
                    ) : (
                      <History size={18} />
                    )}
                  </div>

                  <div className="inventory-movement__info">
                    <strong>
                      {String(movement.type || "").replaceAll("_", " ")}
                    </strong>

                    <span>
                      {part?.name || "Repuesto"}
                      {movement.workOrderId
                        ? ` · ${movement.workOrderId}`
                        : ""}
                    </span>

                    <small>
                      {movement.createdByName || "Usuario"} ·{" "}
                      {new Date(movement.createdAt).toLocaleString("es-CL")}
                    </small>
                  </div>

                  <strong className="inventory-movement__quantity">
                    {movement.quantity} un.
                  </strong>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

export default InventoryPage;
