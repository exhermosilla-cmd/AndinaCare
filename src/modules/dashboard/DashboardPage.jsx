
/*
 * ANDINACARE - DASHBOARD PRINCIPAL
 *
 * Presenta indicadores reales obtenidos desde IndexedDB.
 * Dexie liveQuery actualiza la pantalla cuando cambian las tablas.
 * Los filtros de período afectan las métricas y gráficos de órdenes.
 *
 * FUNCIONES:
 * 1. Consultar activos, órdenes, usuarios e inventario.
 * 2. Mostrar indicadores de mantenimiento.
 * 3. Mostrar gráficos de estados y prioridades.
 * 4. Mostrar conectividad y pendientes de sincronización.
 * 5. Actualizar automáticamente los indicadores.
 * 6. Adaptar la información según el rol del usuario.
 * 7. Normalizar prioridades antiguas MEDIUM a MEDIA.
 */

import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Factory,
  Package,
  RefreshCw,
  Wifi,
  WifiOff,
  Wrench,
  Users,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { db, openDatabase } from "../../services/database/db";
import { useAuth } from "../../context/AuthContext";

import "./dashboard.css";

// --------------------------------------------------
// CONFIGURACIÓN DEL DASHBOARD
// --------------------------------------------------

const PERIODS = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "all", label: "Todo el período" },
];

const STATUS = {
  pending: "PENDIENTE",
  progress: "EN_PROGRESO",
  completed: "COMPLETADA",
  cancelled: "CANCELADA",
};

const ROLE_LABELS = {
  TECHNICIAN: "Técnico de terreno",
  MAINTENANCE_MANAGER: "Jefe de mantenimiento",
  WAREHOUSE_MANAGER: "Encargado de bodega",
  PLANT_OPERATOR: "Operador de planta",
  ADMIN_AUDITOR: "Administrador / Auditor",
};

// --------------------------------------------------
// FUNCIONES AUXILIARES
// --------------------------------------------------

/*
 * Comprueba si una fecha pertenece al período seleccionado.
 */
function isWithinPeriod(value, days) {
  if (days === "all") return true;
  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  const start = new Date();

  start.setDate(start.getDate() - Number(days));
  start.setHours(0, 0, 0, 0);

  return date >= start && date <= new Date();
}

/*
 * Normaliza prioridades antiguas.
 *
 * MEDIUM y MEDIA se consideran la misma prioridad.
 * No modifica los registros almacenados en IndexedDB.
 */
function normalizePriority(value) {
  const priority = String(value || "").trim().toUpperCase();

  return priority === "MEDIUM" ? "MEDIA" : priority;
}

/*
 * Normaliza estados para evitar diferencias
 * por espacios o uso de minúsculas.
 */
function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

// --------------------------------------------------
// COMPONENTE DE INDICADORES
// --------------------------------------------------

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}) {
  return (
    <article className={`dashboard-metric dashboard-metric--${tone}`}>
      <div className="dashboard-metric__top">
        <span>{title}</span>

        <span className="dashboard-metric__icon">
          <Icon size={20} />
        </span>
      </div>

      <strong className="dashboard-metric__value">
        {value}
      </strong>

      <span className="dashboard-metric__detail">
        {detail}
      </span>
    </article>
  );
}

// --------------------------------------------------
// DASHBOARD PRINCIPAL
// --------------------------------------------------

function DashboardPage() {
  const { user } = useAuth();

  const [period, setPeriod] = useState("30");

  const [data, setData] = useState({
    assets: [],
    workOrders: [],
    users: [],
    spareParts: [],
    syncQueue: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [online, setOnline] = useState(
    typeof navigator !== "undefined"
      ? navigator.onLine
      : false
  );

  // ------------------------------------------------
  // CONECTIVIDAD
  // ------------------------------------------------

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine);
    };

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  // ------------------------------------------------
  // CONEXIÓN CON INDEXEDDB
  // ------------------------------------------------

  /*
   * liveQuery escucha cambios en las tablas.
   * Cuando se registra o modifica información,
   * los indicadores se actualizan automáticamente.
   */

  useEffect(() => {
    let subscription;
    let active = true;

    async function connectDashboard() {
      try {
        await openDatabase();

        subscription = liveQuery(() =>
          Promise.all([
            db.assets.toArray(),
            db.workOrders.toArray(),
            db.users.toArray(),
            db.spareParts.toArray(),
            db.syncQueue.toArray(),
          ])
        ).subscribe({
          next: ([
            assets,
            workOrders,
            users,
            spareParts,
            syncQueue,
          ]) => {
            if (!active) return;

            setData({
              assets,
              workOrders,
              users,
              spareParts,
              syncQueue,
            });

            setLoading(false);
            setError("");
          },

          error: (err) => {
            console.error(
              "Error actualizando Dashboard:",
              err
            );

            if (active) {
              setError(
                err.message ||
                  "No fue posible consultar los indicadores."
              );

              setLoading(false);
            }
          },
        });
      } catch (err) {
        console.error(
          "Error conectando Dashboard:",
          err
        );

        if (active) {
          setError(
            err.message ||
              "No fue posible abrir la base de datos."
          );

          setLoading(false);
        }
      }
    }

    connectDashboard();

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  // ------------------------------------------------
  // CÁLCULO DE INDICADORES
  // ------------------------------------------------

  const metrics = useMemo(() => {
    /*
     * Los técnicos solamente consultan
     * las órdenes que tienen asignadas.
     */

    const scopedOrders =
      user?.role === "TECHNICIAN"
        ? data.workOrders.filter(
            (order) => order.assignedTo === user?.id
          )
        : data.workOrders;

    const periodOrders = scopedOrders.filter((order) =>
      isWithinPeriod(order.createdAt, period)
    );

    const activeOrders = periodOrders.filter(
      (order) =>
        normalizeStatus(order.status) !== STATUS.cancelled
    );

    const completed = periodOrders.filter(
      (order) =>
        normalizeStatus(order.status) === STATUS.completed
    ).length;

    const completionRate = activeOrders.length
      ? Math.round(
          (completed / activeOrders.length) * 100
        )
      : 0;

    // Técnicos que tienen una orden en ejecución.

    const activeAssignedIds = new Set(
      data.workOrders
        .filter(
          (order) =>
            normalizeStatus(order.status) === STATUS.progress &&
            order.assignedTo
        )
        .map((order) => order.assignedTo)
    );

    const activeTechnicians = data.users.filter(
      (person) =>
        person.active !== false &&
        person.role === "TECHNICIAN"
    );

    const availableTechnicians = activeTechnicians.filter(
      (person) => !activeAssignedIds.has(person.id)
    ).length;

    // Repuestos cuyo stock disponible está bajo el mínimo.

    const lowStock = data.spareParts.filter((part) => {
      const available =
        Number(part.stock || 0) -
        Number(part.reservedStock || 0);

      return available <= Number(part.minStock || 0);
    });

    // Registros pendientes de sincronización.

    const pendingSync = data.syncQueue.filter(
      (item) => item.status !== "SINCRONIZADO"
    ).length;

    // Máquinas detenidas o fuera de servicio.

    const outOfService = data.assets.filter((asset) =>
      [
        "DETENIDO",
        "FUERA_DE_SERVICIO",
        "FUERA DE SERVICIO",
      ].includes(normalizeStatus(asset.status))
    ).length;

    // Órdenes críticas: prioridad alta o urgente.
    // Las órdenes canceladas y completadas se excluyen.

    const critical = periodOrders.filter((order) => {
      const status = normalizeStatus(order.status);
      const priority = normalizePriority(order.priority);

      return (
        status !== STATUS.completed &&
        status !== STATUS.cancelled &&
        ["ALTA", "URGENTE"].includes(priority)
      );
    }).length;

    return {
      periodOrders,
      pending: periodOrders.filter(
        (order) =>
          normalizeStatus(order.status) === STATUS.pending
      ).length,

      inProgress: periodOrders.filter(
        (order) =>
          normalizeStatus(order.status) === STATUS.progress
      ).length,

      critical,
      completed,
      completionRate,
      lowStock,
      availableTechnicians,
      pendingSync,
      outOfService,
    };
  }, [data, period, user]);

  // ------------------------------------------------
  // DATOS PARA LOS GRÁFICOS
  // ------------------------------------------------

  const statusChart = [
    {
      name: "Pendientes",
      value: metrics.pending,
      color: "#e8a83e",
    },
    {
      name: "En ejecución",
      value: metrics.inProgress,
      color: "#57a5ed",
    },
    {
      name: "Finalizadas",
      value: metrics.completed,
      color: "#32b67a",
    },
  ];

  /*
   * Se normalizan las prioridades para que
   * MEDIUM también aparezca como MEDIA.
   */

  const priorityChart = [
    {
      name: "Baja",
      value: metrics.periodOrders.filter(
        (order) =>
          normalizePriority(order.priority) === "BAJA"
      ).length,
    },
    {
      name: "Media",
      value: metrics.periodOrders.filter(
        (order) =>
          normalizePriority(order.priority) === "MEDIA"
      ).length,
    },
    {
      name: "Alta",
      value: metrics.periodOrders.filter(
        (order) =>
          normalizePriority(order.priority) === "ALTA"
      ).length,
    },
    {
      name: "Urgente",
      value: metrics.periodOrders.filter(
        (order) =>
          normalizePriority(order.priority) === "URGENTE"
      ).length,
    },
  ];

  // ------------------------------------------------
  // PERMISOS SEGÚN ROL
  // ------------------------------------------------

  const role = user?.role;

  const isManager = [
    "MAINTENANCE_MANAGER",
    "ADMIN_AUDITOR",
  ].includes(role);

  const canSeeInventory = [
    "WAREHOUSE_MANAGER",
    "MAINTENANCE_MANAGER",
    "ADMIN_AUDITOR",
  ].includes(role);

  const canSeeTechnicians = isManager;

  const canSeeAllOrders = role !== "TECHNICIAN";

  const visibleOrders =
    role === "TECHNICIAN"
      ? metrics.periodOrders.filter(
          (order) => order.assignedTo === user?.id
        )
      : metrics.periodOrders;

  const formatRole =
    ROLE_LABELS[role] || "Usuario";

  // ------------------------------------------------
  // ESTADO DE CARGA
  // ------------------------------------------------

  if (loading) {
    return (
      <section className="dashboard-page">
        <p className="dashboard-message">
          Cargando indicadores de AndinaCare...
        </p>
      </section>
    );
  }

  // ------------------------------------------------
  // PRESENTACIÓN DEL DASHBOARD
  // ------------------------------------------------

  return (
    <section className="dashboard-page">

      {/* ENCABEZADO */}

      <header className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">
            MANUFACTURAS ANDINA S.A.
          </span>

          <h1>Dashboard de mantenimiento</h1>

          <p>
            Resumen operativo de activos, órdenes y recursos de mantenimiento.
          </p>

          <span className="dashboard-role">
            Vista: {formatRole}
          </span>
        </div>

        <label className="dashboard-period">
          <span>Período de órdenes</span>

          <select
            value={period}
            onChange={(event) =>
              setPeriod(event.target.value)
            }
          >
            {PERIODS.map((item) => (
              <option
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* MENSAJE DE ERROR */}

      {error && (
        <div
          className="dashboard-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* CONECTIVIDAD */}

      <div className="dashboard-connectivity">
        <span
          className={
            online
              ? "dashboard-online"
              : "dashboard-offline"
          }
        >
          {online ? (
            <Wifi size={17} />
          ) : (
            <WifiOff size={17} />
          )}

          {online
            ? "Con conexión"
            : "Modo sin conexión"}
        </span>

        <span>
          <RefreshCw size={16} />

          {metrics.pendingSync} registro(s) pendiente(s) de sincronización
        </span>
      </div>

      {/* TARJETAS DE INDICADORES */}

      <div className="dashboard-metrics-grid">

        <MetricCard
          title="Activos registrados"
          value={data.assets.length}
          detail="Equipos en la base local"
          icon={Factory}
        />

        <MetricCard
          title="Órdenes pendientes"
          value={metrics.pending}
          detail="Según el período seleccionado"
          icon={ClipboardList}
          tone="warning"
        />

        <MetricCard
          title="Órdenes en ejecución"
          value={metrics.inProgress}
          detail="Según el período seleccionado"
          icon={Activity}
          tone="info"
        />

        <MetricCard
          title="Órdenes críticas"
          value={metrics.critical}
          detail="Prioridad alta o urgente"
          icon={AlertTriangle}
          tone="danger"
        />

        <MetricCard
          title="Máquinas fuera de servicio"
          value={metrics.outOfService}
          detail="Activos detenidos o fuera de servicio"
          icon={Wrench}
          tone="danger"
        />

        {canSeeInventory && (
          <MetricCard
            title="Repuestos con stock bajo"
            value={metrics.lowStock.length}
            detail="Stock disponible igual o menor al mínimo"
            icon={Package}
            tone="warning"
          />
        )}

        {canSeeTechnicians && (
          <MetricCard
            title="Técnicos disponibles"
            value={metrics.availableTechnicians}
            detail="Activos y sin orden en ejecución asignada"
            icon={Users}
            tone="success"
          />
        )}

        <MetricCard
          title="Órdenes finalizadas"
          value={`${metrics.completionRate}%`}
          detail={`${metrics.completed} finalizadas en el período`}
          icon={CheckCircle2}
          tone="success"
        />

      </div>

      {/* GRÁFICOS */}

      <div className="dashboard-charts-grid">

        {/* GRÁFICO DE ESTADOS */}

        <article className="dashboard-panel">

          <div className="dashboard-panel__heading">
            <div>
              <h2>Estado de las órdenes</h2>
              <p>
                Distribución en el período seleccionado
              </p>
            </div>
          </div>

          <div className="dashboard-chart">

            {statusChart.some(
              (item) => item.value > 0
            ) ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={statusChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={94}
                    paddingAngle={3}
                  >
                    {statusChart.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                      />
                    ))}
                  </Pie>

                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="dashboard-empty">
                No hay órdenes en este período.
              </p>
            )}

          </div>

          <div className="dashboard-legend">
            {statusChart.map((item) => (
              <span key={item.name}>
                <i
                  style={{
                    background: item.color,
                  }}
                />

                {item.name}:{" "}
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>

        </article>

        {/* GRÁFICO DE PRIORIDADES */}

        <article className="dashboard-panel">

          <div className="dashboard-panel__heading">
            <div>
              <h2>Órdenes por prioridad</h2>
              <p>
                Volumen registrado en el período
              </p>
            </div>
          </div>

          <div className="dashboard-chart dashboard-chart--bar">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={priorityChart}
                margin={{
                  top: 12,
                  right: 8,
                  left: -18,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#314252"
                />

                <XAxis
                  dataKey="name"
                  tick={{
                    fill: "#aab8c6",
                    fontSize: 11,
                  }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{
                    fill: "#aab8c6",
                    fontSize: 11,
                  }}
                />

                <Tooltip
                  contentStyle={{
                    background: "#192735",
                    border: "1px solid #314252",
                    color: "#eaf0f6",
                  }}
                />

                <Bar
                  dataKey="value"
                  name="Órdenes"
                  fill="#398ce9"
                  radius={[6, 6, 0, 0]}
                />

              </BarChart>
            </ResponsiveContainer>

          </div>
        </article>

      </div>

      {/* REPUESTOS CON STOCK BAJO */}

      {canSeeInventory && (
        <article className="dashboard-panel dashboard-stock-panel">

          <div className="dashboard-panel__heading">
            <div>
              <h2>Repuestos que requieren atención</h2>
              <p>
                Stock disponible comparado con el mínimo configurado
              </p>
            </div>
          </div>

          {metrics.lowStock.length === 0 ? (
            <p className="dashboard-empty">
              No hay repuestos bajo el nivel mínimo.
            </p>
          ) : (
            <div className="dashboard-table-wrap">

              <table className="dashboard-table">

                <thead>
                  <tr>
                    <th>Repuesto</th>
                    <th>Código</th>
                    <th>Disponible</th>
                    <th>Stock mínimo</th>
                  </tr>
                </thead>

                <tbody>
                  {metrics.lowStock
                    .slice(0, 6)
                    .map((part) => (
                      <tr key={part.id}>
                        <td>{part.name}</td>
                        <td>{part.code}</td>

                        <td>
                          {Number(part.stock || 0) -
                            Number(part.reservedStock || 0)}
                        </td>

                        <td>
                          {Number(part.minStock || 0)}
                        </td>
                      </tr>
                    ))}
                </tbody>

              </table>
            </div>
          )}

        </article>
      )}

      {/* ÓRDENES RECIENTES */}

      {canSeeAllOrders && (
        <article className="dashboard-panel">

          <div className="dashboard-panel__heading">
            <div>
              <h2>Órdenes recientes</h2>
              <p>
                Registros del período seleccionado
              </p>
            </div>

            <span>
              {visibleOrders.length} orden(es)
            </span>
          </div>

          {visibleOrders.length === 0 ? (
            <p className="dashboard-empty">
              No hay órdenes para mostrar en este período.
            </p>
          ) : (
            <div className="dashboard-table-wrap">

              <table className="dashboard-table">

                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>Creación</th>
                  </tr>
                </thead>

                <tbody>
                  {[...visibleOrders]
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt) -
                        new Date(a.createdAt)
                    )
                    .slice(0, 6)
                    .map((order) => (
                      <tr key={order.id}>
                        <td>{order.code}</td>
                        <td>{order.status}</td>
                        <td>
                          {normalizePriority(order.priority)}
                        </td>
                        <td>
                          {order.createdAt
                            ? new Date(
                                order.createdAt
                              ).toLocaleDateString("es-CL")
                            : "Sin fecha"}
                        </td>
                      </tr>
                    ))}
                </tbody>

              </table>
            </div>
          )}

        </article>
      )}

      {/* VISTA DEL TÉCNICO */}

      {!canSeeAllOrders && (
        <article className="dashboard-panel">

          <div className="dashboard-panel__heading">
            <div>
              <h2>Mis órdenes asignadas</h2>
              <p>
                Órdenes vinculadas a tu usuario
              </p>
            </div>
          </div>

          <p className="dashboard-empty">
            Tienes {visibleOrders.length} orden(es) en el período seleccionado.
          </p>

        </article>
      )}

    </section>
  );
}

export default DashboardPage;
