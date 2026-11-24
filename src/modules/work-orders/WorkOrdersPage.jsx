
/*
 * ANDINACARE - GESTIÓN DE ÓRDENES DE TRABAJO
 *
 * Pantalla principal del módulo de mantenimiento.
 *
 * INTEGRACIONES:
 * - Gestión de órdenes de trabajo.
 * - Asignación y edición de técnicos.
 * - Aprobación y rechazo de órdenes.
 * - Checklist de seguridad AST/LOTO obligatorio.
 * - Registro fotográfico ANTES y DESPUÉS.
 * - Consulta de fotografías de órdenes completadas.
 */

import { useEffect, useMemo, useState } from "react";

import {
  ClipboardList,
  Plus,
  Search,
  Play,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  Clock,
  Wrench,
  AlertCircle,
  RefreshCw,
  Camera,
} from "lucide-react";

import Card from "../../components/common/Card";
import { getCurrentUser } from "../../services/auth/authService";

import {
  ACTIONS,
  ROLES,
  hasPermission,
} from "../../services/auth/permissions";

import { getAllAssets } from "../../services/assets/assetService";

import {
  createWorkOrder,
  updateWorkOrder,
  getAllWorkOrders,
  getAvailableTechnicians,
  startWorkOrder,
  completeWorkOrder,
  cancelWorkOrder,
  deleteWorkOrder,
  approveWorkOrder,
  rejectWorkOrder,
  WORK_ORDER_STATUSES,
  WORK_ORDER_APPROVAL_STATUSES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_TYPES,
} from "./workOrderService";

import SafetyChecklist from "../safety/SafetyChecklist";
import WorkOrderPhotos from "./WorkOrderPhotos";
import WorkOrderTimer from "./WorkOrderTimer";
import "./work-orders.css";

const statusLabels = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En ejecución",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

const approvalLabels = {
  PENDIENTE: "Pendiente de aprobación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const priorityLabels = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

const typeLabels = {
  CORRECTIVO: "Correctivo",
  PREVENTIVO: "Preventivo",
  INSPECCION: "Inspección",
};

const emptyForm = {
  assetId: "",
  title: "",
  description: "",
  type: WORK_ORDER_TYPES.CORRECTIVE,
  priority: WORK_ORDER_PRIORITIES.MEDIUM,
  assignedTo: "",
  dueDate: "",
};

function formatDate(value) {
  if (!value) return "No definida";
  return new Date(value).toLocaleDateString("es-CL");
}

function formatDateTime(value) {
  if (!value) return "No registrada";
  return new Date(value).toLocaleString("es-CL");
}

function WorkOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [completionOrder, setCompletionOrder] = useState(null);
  const [completionNotes, setCompletionNotes] = useState("");

  const [safetyOrder, setSafetyOrder] = useState(null);
  const [startingSafety, setStartingSafety] = useState(false);

  const [photoOrder, setPhotoOrder] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canCreate = hasPermission(
    currentUser?.role,
    "work-orders",
    ACTIONS.CREATE
  );

  const canUpdate = hasPermission(
    currentUser?.role,
    "work-orders",
    ACTIONS.UPDATE
  );

  const canDelete = hasPermission(
    currentUser?.role,
    "work-orders",
    ACTIONS.DELETE
  );

  const canApprove =
    currentUser?.role === ROLES.MAINTENANCE_MANAGER ||
    currentUser?.role === ROLES.ADMIN_AUDITOR;

  // Solo Jefatura y Administrador pueden gestionar órdenes.
  const canManageWorkOrders =
    currentUser?.role === ROLES.MAINTENANCE_MANAGER ||
    currentUser?.role === ROLES.ADMIN_AUDITOR;

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const user = await getCurrentUser();

      if (!user) {
        throw new Error("No existe una sesión activa.");
      }

      const [
        orderRecords,
        assetRecords,
        technicianRecords,
      ] = await Promise.all([
        getAllWorkOrders(),
        getAllAssets(),
        getAvailableTechnicians(),
      ]);

      setCurrentUser(user);
      setOrders(orderRecords);
      setAssets(assetRecords);
      setTechnicians(technicianRecords);
    } catch (err) {
      setError(err.message || "No se pudo cargar el módulo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const asset = assets.find(
        (item) => item.id === order.assetId
      );

      const matchesSearch =
        !term ||
        String(order.code || "").toLowerCase().includes(term) ||
        String(order.title || "").toLowerCase().includes(term) ||
        String(asset?.name || "").toLowerCase().includes(term) ||
        String(asset?.code || "").toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "TODAS" ||
        order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, assets, search, statusFilter]);

  const summary = useMemo(() => ({
    total: orders.length,

    pending: orders.filter(
      (order) => order.status === WORK_ORDER_STATUSES.PENDING
    ).length,

    inProgress: orders.filter(
      (order) => order.status === WORK_ORDER_STATUSES.IN_PROGRESS
    ).length,

    completed: orders.filter(
      (order) => order.status === WORK_ORDER_STATUSES.COMPLETED
    ).length,
  }), [orders]);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function openCreateForm() {
    setEditingOrder(null);

    setFormData({
      ...emptyForm,
      assetId: assets[0]?.id || "",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(order) {
    setEditingOrder(order);

    setFormData({
      assetId: order.assetId || "",
      title: order.title || "",
      description: order.description || "",
      type: order.type || WORK_ORDER_TYPES.CORRECTIVE,
      priority: order.priority || WORK_ORDER_PRIORITIES.MEDIUM,
      assignedTo: order.assignedTo || "",
      dueDate: order.dueDate || "",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (editingOrder) {
        await updateWorkOrder(editingOrder.id, formData);

        setSuccess(
          "La orden se actualizó correctamente. Si corresponde, deberá ser aprobada nuevamente."
        );
      } else {
        await createWorkOrder(formData);

        setSuccess(
          "La orden se registró correctamente y quedó pendiente de aprobación."
        );
      }

      setShowForm(false);
      setEditingOrder(null);
      setFormData(emptyForm);

      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo guardar la orden.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(order) {
    if (!window.confirm(
      `¿Confirmas la aprobación de la orden ${order.code}?`
    )) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await approveWorkOrder(order.id);

      setSuccess(
        `La orden ${order.code} fue aprobada correctamente.`
      );

      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo aprobar la orden.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject(order) {
    const reason = window.prompt(
      `Indica el motivo del rechazo de la orden ${order.code}:`
    );

    if (reason === null) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await rejectWorkOrder(order.id, reason);

      setSuccess(`La orden ${order.code} fue rechazada.`);

      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo rechazar la orden.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * INICIAR ORDEN
   *
   * La aprobación se verifica antes de abrir AST/LOTO.
   */

  async function handleStart(order) {
    if (order.status !== WORK_ORDER_STATUSES.PENDING) {
      setError("Solo se pueden iniciar órdenes pendientes.");
      return;
    }

    const approvalStatus =
      order.approvalStatus ||
      WORK_ORDER_APPROVAL_STATUSES.PENDING;

    if (
      approvalStatus !==
      WORK_ORDER_APPROVAL_STATUSES.APPROVED
    ) {
      setError(
        "No puedes iniciar esta orden. Primero debe ser aprobada por Jefatura de Mantenimiento."
      );
      return;
    }

    if (!window.confirm(
      `Para iniciar ${order.code} debes completar el checklist AST/LOTO. ¿Continuar?`
    )) {
      return;
    }

    setError("");
    setSuccess("");
    setSafetyOrder(order);
  }

  /*
   * CONFIRMACIÓN DEL CHECKLIST AST/LOTO
   */

  async function handleSafetyConfirmed() {
    if (!safetyOrder) {
      throw new Error(
        "No hay una orden seleccionada para iniciar."
      );
    }

    if (startingSafety) {
      return;
    }

    try {
      setStartingSafety(true);
      setError("");
      setSuccess("");

      await startWorkOrder(safetyOrder.id);

      setSuccess(
        `La orden ${safetyOrder.code} comenzó correctamente. El registro AST/LOTO quedó asociado a la orden.`
      );

      setSafetyOrder(null);

      await loadData();
    } catch (err) {
      setError(
        err.message ||
        "No se pudo iniciar la orden. Verifica el registro de seguridad."
      );

      throw err;
    } finally {
      setStartingSafety(false);
    }
  }

  function handleCloseSafety() {
    if (startingSafety) {
      return;
    }

    setSafetyOrder(null);
    setError("");
  }

  function handleOpenPhotos(order) {
    setError("");
    setSuccess("");
    setPhotoOrder(order);
  }

  function handleClosePhotos() {
    setPhotoOrder(null);
  }

  async function handleComplete(event) {
    event.preventDefault();

    if (!completionOrder) return;

    try {
      setSaving(true);
      setError("");

      await completeWorkOrder(
        completionOrder.id,
        completionNotes
      );

      setCompletionOrder(null);
      setCompletionNotes("");

      setSuccess("La orden se completó correctamente.");

      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo completar la orden.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(order) {
    if (!window.confirm(`¿Cancelar la orden ${order.code}?`)) {
      return;
    }

    try {
      setError("");
      setSuccess("");

      await cancelWorkOrder(order.id);

      setSuccess("La orden fue cancelada.");

      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo cancelar la orden.");
    }
  }

  async function handleDelete(order) {
    if (!window.confirm(
      `¿Eliminar definitivamente la orden ${order.code}?`
    )) {
      return;
    }

    try {
      setError("");
      setSuccess("");

      await deleteWorkOrder(order.id);

      setSuccess("La orden fue eliminada.");

      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la orden.");
    }
  }

  function getAssetName(assetId) {
    const asset = assets.find((item) => item.id === assetId);

    return asset
      ? `${asset.code} - ${asset.name}`
      : "Activo no disponible";
  }

  function getTechnicianName(technicianId) {
    if (!technicianId) return "Sin asignar";

    const technician = technicians.find(
      (item) => item.id === technicianId
    );

    return technician?.name || "Técnico no disponible";
  }

  if (loading) {
    return (
      <section className="work-orders-page">
        <div className="wo-loading">
          <RefreshCw size={22} />
          <p>Cargando órdenes de trabajo...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="work-orders-page">

      <header className="wo-heading">
        <div className="wo-heading__title">
          <div className="wo-heading__icon">
            <ClipboardList size={28} />
          </div>

          <div>
            <span className="wo-eyebrow">
              MANTENIMIENTO INDUSTRIAL
            </span>

            <h1>Órdenes de trabajo</h1>

            <p>
              Planificación, aprobación y seguimiento
              de intervenciones.
            </p>
          </div>
        </div>

        <button
          className="wo-primary-button"
          onClick={openCreateForm}
          disabled={!canCreate || assets.length === 0}
        >
          <Plus size={18} />
          Nueva orden
        </button>
      </header>

      {error && (
        <div className="wo-message wo-message--error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div className="wo-message wo-message--success">
          <CheckCircle size={18} />
          {success}
        </div>
      )}

      {safetyOrder && (
        <SafetyChecklist
          workOrder={safetyOrder}
          onClose={handleCloseSafety}
          onConfirmed={handleSafetyConfirmed}
        />
      )}

      {photoOrder && (
        <Card>
          <div className="wo-form__heading">
            <div>
              <h2>Fotografías de la orden</h2>

              <p>
                {photoOrder.code} - {photoOrder.title}
              </p>
            </div>

            <button
              type="button"
              className="wo-icon-button"
              onClick={handleClosePhotos}
              aria-label="Cerrar fotografías"
            >
              <XCircle size={21} />
            </button>
          </div>

          <WorkOrderPhotos
            workOrderId={photoOrder.id}
            orderStatus={photoOrder.status}
            readOnly={
              photoOrder.status !== WORK_ORDER_STATUSES.IN_PROGRESS
            }
          />
        </Card>
      )}

      <div className="wo-summary">
        <Card>
          <div className="wo-stat">
            <span>Total de órdenes</span>
            <strong>{summary.total}</strong>
            <ClipboardList size={22} />
          </div>
        </Card>

        <Card>
          <div className="wo-stat">
            <span>Pendientes</span>
            <strong>{summary.pending}</strong>
            <Clock size={22} />
          </div>
        </Card>

        <Card>
          <div className="wo-stat">
            <span>En ejecución</span>
            <strong>{summary.inProgress}</strong>
            <Wrench size={22} />
          </div>
        </Card>

        <Card>
          <div className="wo-stat">
            <span>Completadas</span>
            <strong>{summary.completed}</strong>
            <CheckCircle size={22} />
          </div>
        </Card>
      </div>

      {showForm && (
        <Card>
          <form className="wo-form" onSubmit={handleSubmit}>
            <div className="wo-form__heading">
              <h2>
                {editingOrder
                  ? "Editar orden de trabajo"
                  : "Registrar nueva orden"}
              </h2>

              <button
                type="button"
                className="wo-icon-button"
                onClick={() => setShowForm(false)}
                aria-label="Cerrar formulario"
              >
                <XCircle size={21} />
              </button>
            </div>

            <div className="wo-form-grid">
              <label>
                Activo industrial *
                <select
                  name="assetId"
                  value={formData.assetId}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccionar activo</option>

                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.code} - {asset.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Título del trabajo *
                <input
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Ej. Mantención de motor principal"
                  maxLength={100}
                  required
                />
              </label>

              <label>
                Tipo de mantenimiento *
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                >
                  {Object.values(WORK_ORDER_TYPES).map((type) => (
                    <option key={type} value={type}>
                      {typeLabels[type]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Prioridad *
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  required
                >
                  {Object.values(WORK_ORDER_PRIORITIES).map(
                    (priority) => (
                      <option key={priority} value={priority}>
                        {priorityLabels[priority]}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Técnico responsable
                <select
                  name="assignedTo"
                  value={formData.assignedTo}
                  onChange={handleChange}
                >
                  <option value="">Sin asignar</option>

                  {technicians.map((technician) => (
                    <option
                      key={technician.id}
                      value={technician.id}
                    >
                      {technician.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Fecha programada
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleChange}
                />
              </label>

              <label className="wo-form__full">
                Descripción del trabajo *
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe la falla, actividad o inspección requerida..."
                  rows={4}
                  maxLength={2000}
                  required
                />
              </label>
            </div>

            <div className="wo-form__actions">
              <button
                type="button"
                className="wo-secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="wo-primary-button"
                disabled={saving}
              >
                {saving
                  ? "Guardando..."
                  : editingOrder
                    ? "Guardar cambios"
                    : "Registrar orden"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {completionOrder && (
        <Card>
          <form className="wo-form" onSubmit={handleComplete}>
            <div className="wo-form__heading">
              <h2>Completar {completionOrder.code}</h2>

              <button
                type="button"
                className="wo-icon-button"
                onClick={() => setCompletionOrder(null)}
                aria-label="Cerrar"
              >
                <XCircle size={21} />
              </button>
            </div>

            <label>
              Observaciones del trabajo realizado
              <textarea
                value={completionNotes}
                onChange={(event) =>
                  setCompletionNotes(event.target.value)
                }
                rows={4}
                maxLength={2000}
                placeholder="Describe las actividades realizadas y resultados..."
              />
            </label>

            <div className="wo-form__actions">
              <button
                type="button"
                className="wo-secondary-button"
                onClick={() => setCompletionOrder(null)}
              >
                Volver
              </button>

              <button
                type="submit"
                className="wo-primary-button"
                disabled={saving}
              >
                {saving ? "Guardando..." : "Confirmar cierre"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="wo-toolbar">
          <div className="wo-search">
            <Search size={19} />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, título o activo..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
            aria-label="Filtrar por estado"
          >
            <option value="TODAS">Todos los estados</option>

            {Object.values(WORK_ORDER_STATUSES).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="wo-secondary-button"
            onClick={loadData}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </Card>

      <div className="wo-list-heading">
        <h2>Registro de órdenes</h2>
        <span>{filteredOrders.length} resultados</span>
      </div>

      {filteredOrders.length === 0 ? (
        <Card>
          <div className="wo-empty">
            <ClipboardList size={38} />
            <h3>No hay órdenes para mostrar</h3>
            <p>
              Registra una nueva orden o modifica los filtros
              de búsqueda.
            </p>
          </div>
        </Card>
      ) : (
        <div className="wo-order-list">
          {filteredOrders.map((order) => {
            const approvalStatus =
              order.approvalStatus ||
              WORK_ORDER_APPROVAL_STATUSES.PENDING;

            const canReviewOrder =
              canApprove &&
              order.status === WORK_ORDER_STATUSES.PENDING &&
              approvalStatus ===
                WORK_ORDER_APPROVAL_STATUSES.PENDING;

            // El técnico solo puede ejecutar órdenes asignadas a su usuario.
            const isAssignedTechnician =
              currentUser?.role === ROLES.TECHNICIAN &&
              order.assignedTo === currentUser?.id;

            // Jefatura y Administrador pueden ejecutar órdenes asignadas.
            const canExecuteOrder =
              canManageWorkOrders || isAssignedTechnician;

            // Jefatura y Administrador pueden editar cualquier orden pendiente,
            // incluso si todavía no tiene técnico asignado.
            const canEditOrder =
              canManageWorkOrders &&
              canUpdate &&
              order.status === WORK_ORDER_STATUSES.PENDING;

            return (
              <Card key={order.id}>
                <article className="wo-order">
                  <div className="wo-order__top">
                    <div>
                      <span className="wo-order__code">
                        {order.code}
                      </span>

                      <h3>{order.title}</h3>
                      <p>{getAssetName(order.assetId)}</p>
                    </div>

                    <span
                      className={`wo-status wo-status--${order.status.toLowerCase()}`}
                    >
                      {statusLabels[order.status] || order.status}
                    </span>
                  </div>

                  <p className="wo-order__description">
                    {order.description}
                  </p>

                  <WorkOrderTimer
                    startedAt={order.startedAt}
                    completedAt={order.completedAt}
                    status={order.status}
                  />

                  <div className="wo-order__details">
                    <span>
                      <strong>Tipo:</strong>{" "}
                      {typeLabels[order.type] || order.type}
                    </span>

                    <span>
                      <strong>Prioridad:</strong>{" "}
                      <span
                        className={`wo-priority wo-priority--${order.priority.toLowerCase()}`}
                      >
                        {priorityLabels[order.priority] || order.priority}
                      </span>
                    </span>

                    <span>
                      <strong>Técnico:</strong>{" "}
                      {getTechnicianName(order.assignedTo)}
                    </span>

                    <span>
                      <strong>Programada:</strong>{" "}
                      {formatDate(order.dueDate)}
                    </span>

                    <span>
                      <strong>Creada:</strong>{" "}
                      {formatDate(order.createdAt)}
                    </span>
                  </div>

                  <div className="wo-order__details">
                    <span>
                      <strong>Aprobación:</strong>{" "}
                      {approvalLabels[approvalStatus] || approvalStatus}
                    </span>

                    {approvalStatus ===
                      WORK_ORDER_APPROVAL_STATUSES.APPROVED && (
                      <>
                        <span>
                          <strong>Aprobada por:</strong>{" "}
                          {order.approvedByName || "No registrado"}
                        </span>

                        <span>
                          <strong>Fecha de aprobación:</strong>{" "}
                          {formatDateTime(order.approvedAt)}
                        </span>
                      </>
                    )}

                    {approvalStatus ===
                      WORK_ORDER_APPROVAL_STATUSES.REJECTED && (
                      <>
                        <span>
                          <strong>Rechazada por:</strong>{" "}
                          {order.rejectedByName || "No registrado"}
                        </span>

                        <span>
                          <strong>Fecha de rechazo:</strong>{" "}
                          {formatDateTime(order.rejectedAt)}
                        </span>

                        {order.rejectionReason && (
                          <span>
                            <strong>Motivo:</strong>{" "}
                            {order.rejectionReason}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="wo-order__actions">

                    {canReviewOrder && (
                      <>
                        <button
                          type="button"
                          className="wo-primary-button"
                          onClick={() => handleApprove(order)}
                          disabled={saving}
                        >
                          <CheckCircle size={16} />
                          Aprobar
                        </button>

                        <button
                          type="button"
                          className="wo-secondary-button wo-danger-button"
                          onClick={() => handleReject(order)}
                          disabled={saving}
                        >
                          <XCircle size={16} />
                          Rechazar
                        </button>
                      </>
                    )}

                    {/* EDITAR: ahora aparece aunque la orden no tenga técnico. */}
                    {canEditOrder && (
                      <button
                        type="button"
                        className="wo-secondary-button"
                        onClick={() => openEditForm(order)}
                      >
                        <Pencil size={16} />
                        Editar / Asignar técnico
                      </button>
                    )}

                    {order.status === WORK_ORDER_STATUSES.IN_PROGRESS && (
                      <button
                        type="button"
                        className="wo-secondary-button"
                        onClick={() => handleOpenPhotos(order)}
                      >
                        <Camera size={16} />
                        Fotografías
                      </button>
                    )}

                    {order.status === WORK_ORDER_STATUSES.COMPLETED && (
                      <button
                        type="button"
                        className="wo-secondary-button"
                        onClick={() => handleOpenPhotos(order)}
                      >
                        <Camera size={16} />
                        Ver fotografías
                      </button>
                    )}

                    {canUpdate &&
                      canExecuteOrder &&
                      Boolean(order.assignedTo) &&
                      order.status === WORK_ORDER_STATUSES.PENDING && (
                        <button
                          type="button"
                          className="wo-primary-button"
                          onClick={() => handleStart(order)}
                          disabled={startingSafety}
                        >
                          <Play size={16} />
                          Iniciar
                        </button>
                    )}

                    {canUpdate &&
                      canExecuteOrder &&
                      order.status === WORK_ORDER_STATUSES.IN_PROGRESS && (
                        <button
                          type="button"
                          className="wo-primary-button"
                          onClick={() => {
                            setCompletionOrder(order);
                            setCompletionNotes("");
                          }}
                        >
                          <CheckCircle size={16} />
                          Completar
                        </button>
                    )}

                    {canManageWorkOrders &&
                      order.status !== WORK_ORDER_STATUSES.COMPLETED &&
                      order.status !== WORK_ORDER_STATUSES.CANCELLED && (
                      <button
                        type="button"
                        className="wo-secondary-button wo-danger-button"
                        onClick={() => handleCancel(order)}
                      >
                        <XCircle size={16} />
                        Cancelar orden
                      </button>
                    )}

                    {canDelete &&
                      order.status === WORK_ORDER_STATUSES.PENDING && (
                      <button
                        type="button"
                        className="wo-secondary-button wo-danger-button"
                        onClick={() => handleDelete(order)}
                      >
                        <Trash2 size={16} />
                        Eliminar
                      </button>
                    )}
                  </div>
                </article>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default WorkOrdersPage;
