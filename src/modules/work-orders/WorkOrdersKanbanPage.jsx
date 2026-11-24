
/*
 * ANDINACARE - TABLERO KANBAN DE ÓRDENES
 *
 * Organiza las órdenes de trabajo por estado.
 *
 * FUNCIONES:
 * - Cuatro columnas de estados operativos.
 * - Filtros por técnico, especialidad, prioridad y activo.
 * - Identificación visual de prioridades altas y urgentes.
 * - Asignación y reasignación de técnicos.
 * - Aprobación y rechazo de órdenes.
 * - Inicio de trabajos con checklist AST/LOTO.
 * - Cierre de órdenes con observaciones.
 * - Acceso a fotografías.
 * - Actualización automática mediante Dexie liveQuery.
 *
 * No utiliza arrastrar y soltar. Las acciones se realizan
 * mediante botones para mantener una interfaz sencilla.
 */

import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";

import {
  ClipboardList,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Wrench,
  XCircle,
  Play,
  Camera,
  UserRound,
  Filter,
} from "lucide-react";

import Card from "../../components/common/Card";

import { getCurrentUser } from "../../services/auth/authService";

import {
  ACTIONS,
  ROLES,
  hasPermission,
} from "../../services/auth/permissions";

import {
  getAllAssets,
} from "../../services/assets/assetService";

import {
  getAllWorkOrders,
  getAvailableTechnicians,
  assignWorkOrderTechnician,
  approveWorkOrder,
  rejectWorkOrder,
  startWorkOrder,
  completeWorkOrder,
  cancelWorkOrder,
  WORK_ORDER_STATUSES,
  WORK_ORDER_APPROVAL_STATUSES,
  WORK_ORDER_PRIORITIES,
} from "./workOrderService";

import SafetyChecklist from "../safety/SafetyChecklist";
import WorkOrderPhotos from "./WorkOrderPhotos";
import WorkOrderTimer from "./WorkOrderTimer";

import "./work-orders-kanban.css";

/* ==================================================
   TEXTOS Y CONFIGURACIÓN
================================================== */

const columns = [
  {
    status: WORK_ORDER_STATUSES.PENDING,
    title: "Pendientes",
    description: "Esperan aprobación o inicio.",
    icon: Clock,
  },
  {
    status: WORK_ORDER_STATUSES.IN_PROGRESS,
    title: "En ejecución",
    description: "Trabajos actualmente activos.",
    icon: Wrench,
  },
  {
    status: WORK_ORDER_STATUSES.COMPLETED,
    title: "Completadas",
    description: "Trabajos finalizados.",
    icon: CheckCircle,
  },
  {
    status: WORK_ORDER_STATUSES.CANCELLED,
    title: "Canceladas",
    description: "Órdenes que fueron canceladas.",
    icon: XCircle,
  },
];

const priorityLabels = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

const approvalLabels = {
  PENDIENTE: "Pendiente de aprobación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

/* ==================================================
   COMPONENTE PRINCIPAL
================================================== */

function WorkOrdersKanbanPage() {
  const [orders, setOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* Filtros del tablero. */

  const [technicianFilter, setTechnicianFilter] = useState("TODOS");
  const [specialtyFilter, setSpecialtyFilter] = useState("TODAS");
  const [priorityFilter, setPriorityFilter] = useState("TODAS");
  const [assetFilter, setAssetFilter] = useState("TODOS");
  const [search, setSearch] = useState("");

  /* Asignaciones seleccionadas en cada tarjeta. */

  const [assignmentSelections, setAssignmentSelections] = useState({});

  /* Orden seleccionada para el checklist AST/LOTO. */

  const [safetyOrder, setSafetyOrder] = useState(null);
  const [startingSafety, setStartingSafety] = useState(false);

  /* Orden seleccionada para registrar el cierre. */

  const [completionOrder, setCompletionOrder] = useState(null);
  const [completionNotes, setCompletionNotes] = useState("");

  /* Orden seleccionada para consultar fotografías. */

  const [photoOrder, setPhotoOrder] = useState(null);

  /* ==================================================
     PERMISOS
  ================================================== */

  const canUpdate = hasPermission(
    currentUser?.role,
    "work-orders",
    ACTIONS.UPDATE
  );

  const canApprove =
    currentUser?.role === ROLES.MAINTENANCE_MANAGER ||
    currentUser?.role === ROLES.ADMIN_AUDITOR;

  const canAssign =
    currentUser?.role === ROLES.MAINTENANCE_MANAGER ||
    currentUser?.role === ROLES.ADMIN_AUDITOR;

  /* ==================================================
     CARGA REACTIVA DESDE INDEXEDDB
  ================================================== */

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    /* Obtener el usuario autenticado. */

    getCurrentUser()
      .then((user) => {
        if (!active) return;

        if (!user) {
          throw new Error("No existe una sesión activa.");
        }

        setCurrentUser(user);
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "No se pudo obtener la sesión.");
          setLoading(false);
        }
      });

    /*
     * liveQuery observa las tablas consultadas.
     * Cuando Dexie detecta cambios, vuelve a ejecutar
     * estas consultas y actualiza el tablero.
     */
    const subscription = liveQuery(async () => {
      const [
        orderRecords,
        assetRecords,
        technicianRecords,
      ] = await Promise.all([
        getAllWorkOrders(),
        getAllAssets(),
        getAvailableTechnicians(),
      ]);

      return {
        orders: orderRecords,
        assets: assetRecords,
        technicians: technicianRecords,
      };
    }).subscribe({
      next: (data) => {
        if (!active) return;

        setOrders(data.orders);
        setAssets(data.assets);
        setTechnicians(data.technicians);
        setLoading(false);
      },

      error: (err) => {
        if (!active) return;

        setError(
          err.message || "No se pudo actualizar el tablero."
        );

        setLoading(false);
      },
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshKey]);

  /* ==================================================
     DATOS AUXILIARES
  ================================================== */

  const assetsById = useMemo(() => {
    return new Map(
      assets.map((asset) => [asset.id, asset])
    );
  }, [assets]);

  const techniciansById = useMemo(() => {
    return new Map(
      technicians.map((technician) => [
        technician.id,
        technician,
      ])
    );
  }, [technicians]);

  const specialties = useMemo(() => {
    return [
      ...new Set(
        technicians.map(
          (technician) =>
            technician.specialty || "Sin especialidad"
        )
      ),
    ].sort((a, b) => a.localeCompare(b, "es"));
  }, [technicians]);

  /* ==================================================
     FILTRAR ÓRDENES
  ================================================== */

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const asset = assetsById.get(order.assetId);

      const technician = techniciansById.get(
        order.assignedTo
      );

      const matchesSearch =
        !term ||
        String(order.code || "").toLowerCase().includes(term) ||
        String(order.title || "").toLowerCase().includes(term) ||
        String(asset?.name || "").toLowerCase().includes(term) ||
        String(asset?.code || "").toLowerCase().includes(term);

      const matchesTechnician =
        technicianFilter === "TODOS" ||
        order.assignedTo === technicianFilter;

      const matchesSpecialty =
        specialtyFilter === "TODAS" ||
        technician?.specialty === specialtyFilter;

      const matchesPriority =
        priorityFilter === "TODAS" ||
        order.priority === priorityFilter;

      const matchesAsset =
        assetFilter === "TODOS" ||
        order.assetId === assetFilter;

      return (
        matchesSearch &&
        matchesTechnician &&
        matchesSpecialty &&
        matchesPriority &&
        matchesAsset
      );
    });
  }, [
    orders,
    assetsById,
    techniciansById,
    search,
    technicianFilter,
    specialtyFilter,
    priorityFilter,
    assetFilter,
  ]);

  /* ==================================================
     FUNCIONES AUXILIARES
  ================================================== */

  function getAssetName(assetId) {
    const asset = assetsById.get(assetId);

    return asset
      ? `${asset.code} - ${asset.name}`
      : "Activo no disponible";
  }

  function getTechnicianName(technicianId) {
    if (!technicianId) return "Sin asignar";

    const technician = techniciansById.get(technicianId);

    return technician?.name || "Técnico no disponible";
  }

  function getApprovalStatus(order) {
    return (
      order.approvalStatus ||
      WORK_ORDER_APPROVAL_STATUSES.PENDING
    );
  }

  function showSuccess(message) {
    setError("");
    setSuccess(message);
  }

  /* ==================================================
     ASIGNAR O REASIGNAR TÉCNICO
  ================================================== */

  async function handleAssignTechnician(order) {
    const technicianId =
      assignmentSelections[order.id] ??
      order.assignedTo ??
      "";

    if (!technicianId) {
      setError("Selecciona un técnico antes de asignar.");
      return;
    }

    if (technicianId === order.assignedTo) {
      setError("Selecciona un técnico diferente al actual.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await assignWorkOrderTechnician(
        order.id,
        technicianId
      );

      showSuccess(
        `Se asignó ${getTechnicianName(technicianId)} a ${order.code}.`
      );
    } catch (err) {
      setError(err.message || "No se pudo asignar el técnico.");
    } finally {
      setSaving(false);
    }
  }

  /* ==================================================
     APROBAR ORDEN
  ================================================== */

  async function handleApprove(order) {
    if (
      !window.confirm(
        `¿Confirmas la aprobación de ${order.code}?`
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await approveWorkOrder(order.id);

      showSuccess(`${order.code} fue aprobada correctamente.`);
    } catch (err) {
      setError(err.message || "No se pudo aprobar la orden.");
    } finally {
      setSaving(false);
    }
  }

  /* ==================================================
     RECHAZAR ORDEN
  ================================================== */

  async function handleReject(order) {
    const reason = window.prompt(
      `Indica el motivo del rechazo de ${order.code}:`
    );

    if (reason === null) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await rejectWorkOrder(order.id, reason);

      showSuccess(`${order.code} fue rechazada.`);
    } catch (err) {
      setError(err.message || "No se pudo rechazar la orden.");
    } finally {
      setSaving(false);
    }
  }

  /* ==================================================
     INICIAR ORDEN Y ABRIR AST/LOTO
  ================================================== */

  function handleStart(order) {
    if (order.status !== WORK_ORDER_STATUSES.PENDING) {
      setError("Solo se pueden iniciar órdenes pendientes.");
      return;
    }

    if (
      getApprovalStatus(order) !==
      WORK_ORDER_APPROVAL_STATUSES.APPROVED
    ) {
      setError("La orden debe estar aprobada antes de iniciar.");
      return;
    }

    if (
      !window.confirm(
        `Para iniciar ${order.code} debes completar el checklist AST/LOTO. ¿Continuar?`
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setSafetyOrder(order);
  }

  async function handleSafetyConfirmed() {
    if (!safetyOrder || startingSafety) return;

    try {
      setStartingSafety(true);
      setError("");
      setSuccess("");

      await startWorkOrder(safetyOrder.id);

      showSuccess(
        `${safetyOrder.code} comenzó correctamente. AST/LOTO quedó asociado a la orden.`
      );

      setSafetyOrder(null);
    } catch (err) {
      setError(
        err.message ||
        "No se pudo iniciar la orden. Verifica el registro AST/LOTO."
      );

      throw err;
    } finally {
      setStartingSafety(false);
    }
  }

  function handleCloseSafety() {
    if (startingSafety) return;

    setSafetyOrder(null);
  }

  /* ==================================================
     COMPLETAR ORDEN
  ================================================== */

  async function handleComplete(event) {
    event.preventDefault();

    if (!completionOrder) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await completeWorkOrder(
        completionOrder.id,
        completionNotes
      );

      showSuccess(
        `${completionOrder.code} se completó correctamente.`
      );

      setCompletionOrder(null);
      setCompletionNotes("");
    } catch (err) {
      setError(err.message || "No se pudo completar la orden.");
    } finally {
      setSaving(false);
    }
  }

  /* ==================================================
     CANCELAR ORDEN
  ================================================== */

  async function handleCancel(order) {
    if (
      !window.confirm(
        `¿Confirmas la cancelación de ${order.code}?`
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await cancelWorkOrder(order.id);

      showSuccess(`${order.code} fue cancelada.`);
    } catch (err) {
      setError(err.message || "No se pudo cancelar la orden.");
    } finally {
      setSaving(false);
    }
  }

  /* ==================================================
     FOTOGRAFÍAS
  ================================================== */

  function handleOpenPhotos(order) {
    setPhotoOrder(order);
    setError("");
    setSuccess("");
  }

  /* ==================================================
     PANTALLA DE CARGA
  ================================================== */

  if (loading) {
    return (
      <section className="kanban-page">
        <div className="kanban-loading">
          <RefreshCw size={22} />
          <p>Cargando tablero de órdenes...</p>
        </div>
      </section>
    );
  }

  /* ==================================================
     INTERFAZ PRINCIPAL
  ================================================== */

  return (
    <section className="kanban-page">

      {/* ENCABEZADO */}

      <header className="kanban-heading">
        <div className="kanban-heading__title">
          <div className="kanban-heading__icon">
            <ClipboardList size={27} />
          </div>

          <div>
            <span>MANTENIMIENTO INDUSTRIAL</span>
            <h1>Tablero Kanban</h1>
            <p>Seguimiento visual de las órdenes de trabajo.</p>
          </div>
        </div>

        <button
          type="button"
          className="kanban-button kanban-button--secondary"
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </header>

      {/* MENSAJES */}

      {error && (
        <div className="kanban-message kanban-message--error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div className="kanban-message kanban-message--success">
          <CheckCircle size={18} />
          {success}
        </div>
      )}

      {/* CHECKLIST AST/LOTO */}

      {safetyOrder && (
        <SafetyChecklist
          workOrder={safetyOrder}
          onClose={handleCloseSafety}
          onConfirmed={handleSafetyConfirmed}
        />
      )}

      {/* PANEL DE FOTOGRAFÍAS */}

      {photoOrder && (
        <Card>
          <div className="kanban-panel-heading">
            <div>
              <h2>Fotografías de la orden</h2>
              <p>{photoOrder.code} - {photoOrder.title}</p>
            </div>

            <button
              type="button"
              className="kanban-close-button"
              onClick={() => setPhotoOrder(null)}
              aria-label="Cerrar fotografías"
            >
              <XCircle size={21} />
            </button>
          </div>

          <WorkOrderPhotos
            workOrderId={photoOrder.id}
            orderStatus={photoOrder.status}
            readOnly={
              photoOrder.status !==
              WORK_ORDER_STATUSES.IN_PROGRESS
            }
          />
        </Card>
      )}

      {/* RESUMEN */}

      <div className="kanban-summary">
        {columns.map((column) => {
          const Icon = column.icon;

          const count = filteredOrders.filter(
            (order) => order.status === column.status
          ).length;

          return (
            <Card key={column.status}>
              <div className="kanban-summary__item">
                <Icon size={21} />
                <div>
                  <span>{column.title}</span>
                  <strong>{count}</strong>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* FILTROS */}

      <Card>
        <div className="kanban-filters-heading">
          <Filter size={18} />
          <strong>Filtros del tablero</strong>
        </div>

        <div className="kanban-filters">

          <label>
            Buscar
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código, título o activo..."
            />
          </label>

          <label>
            Técnico
            <select
              value={technicianFilter}
              onChange={(event) =>
                setTechnicianFilter(event.target.value)
              }
            >
              <option value="TODOS">Todos los técnicos</option>

              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Especialidad
            <select
              value={specialtyFilter}
              onChange={(event) =>
                setSpecialtyFilter(event.target.value)
              }
            >
              <option value="TODAS">Todas las especialidades</option>

              {specialties.map((specialty) => (
                <option key={specialty} value={specialty}>
                  {specialty}
                </option>
              ))}
            </select>
          </label>

          <label>
            Prioridad
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value)
              }
            >
              <option value="TODAS">Todas las prioridades</option>

              {Object.values(WORK_ORDER_PRIORITIES).map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabels[priority]}
                </option>
              ))}
            </select>
          </label>

          <label>
            Activo
            <select
              value={assetFilter}
              onChange={(event) =>
                setAssetFilter(event.target.value)
              }
            >
              <option value="TODOS">Todos los activos</option>

              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.code} - {asset.name}
                </option>
              ))}
            </select>
          </label>

        </div>

        <div className="kanban-filter-footer">
          <span>
            {filteredOrders.length} órdenes encontradas
          </span>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setTechnicianFilter("TODOS");
              setSpecialtyFilter("TODAS");
              setPriorityFilter("TODAS");
              setAssetFilter("TODOS");
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </Card>

      {/* TABLERO */}

      <div className="kanban-board">

        {columns.map((column) => {
          const Icon = column.icon;

          const columnOrders = filteredOrders.filter(
            (order) => order.status === column.status
          );

          return (
            <section
              className="kanban-column"
              key={column.status}
            >

              <header className="kanban-column__header">
                <div>
                  <h2>
                    <Icon size={19} />
                    {column.title}
                  </h2>

                  <p>{column.description}</p>
                </div>

                <span className="kanban-column__count">
                  {columnOrders.length}
                </span>
              </header>

              <div className="kanban-column__cards">

                {columnOrders.length === 0 ? (
                  <div className="kanban-empty">
                    No hay órdenes en esta columna.
                  </div>
                ) : (
                  columnOrders.map((order) => {
                    const approvalStatus =
                      getApprovalStatus(order);

                    const isUrgent =
                      order.priority ===
                      WORK_ORDER_PRIORITIES.URGENT;

                    const isHigh =
                      order.priority ===
                      WORK_ORDER_PRIORITIES.HIGH;

                    const canReview =
                      canApprove &&
                      order.status ===
                        WORK_ORDER_STATUSES.PENDING &&
                      approvalStatus ===
                        WORK_ORDER_APPROVAL_STATUSES.PENDING;

                    const selectedTechnician =
                      assignmentSelections[order.id] ??
                      order.assignedTo ??
                      "";

                    return (
                      <article
                        className={`kanban-order ${
                          isUrgent
                            ? "kanban-order--urgent"
                            : isHigh
                              ? "kanban-order--high"
                              : ""
                        }`}
                        key={order.id}
                      >

                        {/* CÓDIGO Y PRIORIDAD */}

                        <div className="kanban-order__top">
                          <span className="kanban-order__code">
                            {order.code}
                          </span>

                          <span
                            className={`kanban-priority kanban-priority--${String(
                              order.priority
                            ).toLowerCase()}`}
                          >
                            {priorityLabels[order.priority] ||
                              order.priority}
                          </span>
                        </div>

                        {/* INFORMACIÓN PRINCIPAL */}

                        <h3>{order.title}</h3>

                        <p className="kanban-order__asset">
                          {getAssetName(order.assetId)}
                        </p>

                        <div className="kanban-order__details">
                          <span>
                            <UserRound size={15} />
                            {getTechnicianName(order.assignedTo)}
                          </span>

                          {order.assignedTo &&
                            techniciansById.get(order.assignedTo)
                              ?.specialty && (
                              <span>
                                Especialidad:{" "}
                                {
                                  techniciansById.get(
                                    order.assignedTo
                                  ).specialty
                                }
                              </span>
                            )}

                          <span>
                            Aprobación:{" "}
                            {approvalLabels[approvalStatus] ||
                              approvalStatus}
                          </span>
                        </div>

                        {/* ASIGNACIÓN */}

                        <WorkOrderTimer
                          startedAt={order.startedAt}
                          completedAt={order.completedAt}
                          status={order.status}
                        />

                        {canAssign &&
                          (order.status ===
                            WORK_ORDER_STATUSES.PENDING ||
                            order.status ===
                              WORK_ORDER_STATUSES.IN_PROGRESS) && (
                            <div className="kanban-assignment">
                              <label>
                                Técnico responsable

                                <select
                                  value={selectedTechnician}
                                  onChange={(event) =>
                                    setAssignmentSelections(
                                      (previous) => ({
                                        ...previous,
                                        [order.id]: event.target.value,
                                      })
                                    )
                                  }
                                  disabled={saving}
                                >
                                  <option value="">
                                    Seleccionar técnico
                                  </option>

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

                              <button
                                type="button"
                                className="kanban-button kanban-button--small"
                                onClick={() =>
                                  handleAssignTechnician(order)
                                }
                                disabled={
                                  saving ||
                                  !selectedTechnician ||
                                  selectedTechnician ===
                                    order.assignedTo
                                }
                              >
                                Asignar
                              </button>
                            </div>
                          )}

                        {/* ACCIONES */}

                        <div className="kanban-order__actions">

                          {canReview && (
                            <>
                              <button
                                type="button"
                                className="kanban-button"
                                onClick={() => handleApprove(order)}
                                disabled={saving}
                              >
                                <CheckCircle size={15} />
                                Aprobar
                              </button>

                              <button
                                type="button"
                                className="kanban-button kanban-button--danger"
                                onClick={() => handleReject(order)}
                                disabled={saving}
                              >
                                <XCircle size={15} />
                                Rechazar
                              </button>
                            </>
                          )}

                          {canUpdate &&
                            order.status ===
                              WORK_ORDER_STATUSES.PENDING &&
                            approvalStatus ===
                              WORK_ORDER_APPROVAL_STATUSES.APPROVED && (
                              <button
                                type="button"
                                className="kanban-button"
                                onClick={() => handleStart(order)}
                                disabled={startingSafety || saving}
                              >
                                <Play size={15} />
                                Iniciar
                              </button>
                            )}

                          {canUpdate &&
                            order.status ===
                              WORK_ORDER_STATUSES.IN_PROGRESS && (
                              <>
                                <button
                                  type="button"
                                  className="kanban-button"
                                  onClick={() =>
                                    setCompletionOrder(order)
                                  }
                                  disabled={saving}
                                >
                                  <CheckCircle size={15} />
                                  Completar
                                </button>

                                <button
                                  type="button"
                                  className="kanban-button kanban-button--secondary"
                                  onClick={() => handleOpenPhotos(order)}
                                >
                                  <Camera size={15} />
                                  Fotografías
                                </button>
                              </>
                            )}

                          {order.status ===
                            WORK_ORDER_STATUSES.COMPLETED && (
                            <button
                              type="button"
                              className="kanban-button kanban-button--secondary"
                              onClick={() => handleOpenPhotos(order)}
                            >
                              <Camera size={15} />
                              Ver fotografías
                            </button>
                          )}

                          {canUpdate &&
                            (order.status ===
                              WORK_ORDER_STATUSES.PENDING ||
                              order.status ===
                                WORK_ORDER_STATUSES.IN_PROGRESS) && (
                              <button
                                type="button"
                                className="kanban-button kanban-button--danger"
                                onClick={() => handleCancel(order)}
                                disabled={saving}
                              >
                                <XCircle size={15} />
                                Cancelar
                              </button>
                            )}

                        </div>

                      </article>
                    );
                  })
                )}

              </div>
            </section>
          );
        })}

      </div>

      {/* FORMULARIO DE CIERRE */}

      {completionOrder && (
        <Card>
          <form
            className="kanban-completion-form"
            onSubmit={handleComplete}
          >
            <div className="kanban-panel-heading">
              <div>
                <h2>Completar {completionOrder.code}</h2>
                <p>{completionOrder.title}</p>
              </div>

              <button
                type="button"
                className="kanban-close-button"
                onClick={() => setCompletionOrder(null)}
                aria-label="Cerrar formulario"
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
                placeholder="Describe las actividades realizadas y sus resultados..."
              />
            </label>

            <div className="kanban-form-actions">
              <button
                type="button"
                className="kanban-button kanban-button--secondary"
                onClick={() => setCompletionOrder(null)}
              >
                Volver
              </button>

              <button
                type="submit"
                className="kanban-button"
                disabled={saving}
              >
                {saving ? "Guardando..." : "Confirmar cierre"}
              </button>
            </div>
          </form>
        </Card>
      )}

    </section>
  );
}

export default WorkOrdersKanbanPage;
