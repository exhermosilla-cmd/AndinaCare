
/*
 * ANDINACARE - PANTALLA DE AUDITORÍA
 *
 * Consulta y visualización de los eventos registrados
 * por el servicio central de auditoría.
 *
 * FUNCIONES:
 * 1. Consultar el historial de auditoría.
 * 2. Resolver nombres de usuarios históricos.
 * 3. Unificar nombres de módulos.
 * 4. Filtrar por usuario.
 * 5. Filtrar por módulo.
 * 6. Filtrar por fecha.
 * 7. Buscar operaciones e identificadores.
 * 8. Consultar datos anteriores y posteriores.
 *
 * IMPORTANTE:
 * Los registros originales son de solo lectura.
 * No se modifican ni eliminan eventos históricos.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getAuditLogs } from "../../services/audit/auditService";
import { getAllUsers } from "../../services/auth/userManagementService";

import Card from "../../components/common/Card";
import StatusBadge from "../../components/common/StatusBadge";

// --------------------------------------------------
// MAPEO DE ENTIDADES
// --------------------------------------------------

const MODULE_BY_ENTITY = {
  workOrders: "workOrders",
  safetyRecords: "safety",
  spareParts: "inventory",
  inventoryMovements: "inventory",
  inventoryReservations: "inventory",
  assets: "assets",
  users: "users",
  syncQueue: "synchronization",
  photos: "photos",
  navigation: "navigation",
  session: "authentication",
};

// --------------------------------------------------
// NORMALIZACIÓN DE MÓDULOS
// --------------------------------------------------

function normalizeAuditModule(module) {
  const aliases = {
    "work-orders": "workOrders",
    "work-orders-kanban": "workOrders",
    workOrders: "workOrders",
    dashboard: "dashboard",
    assets: "assets",
    safety: "safety",
    inventory: "inventory",
    users: "users",
    reports: "reports",
    audit: "audit",
    authentication: "authentication",
    navigation: "navigation",
    synchronization: "synchronization",
    photos: "photos",
  };

  return aliases[module] || module || "—";
}

// --------------------------------------------------
// NOMBRES VISIBLES DE LOS MÓDULOS
// --------------------------------------------------

const MODULE_LABELS = {
  dashboard: "Dashboard",
  assets: "Activos",
  workOrders: "Órdenes de trabajo",
  safety: "Seguridad AST/LOTO",
  inventory: "Inventario",
  users: "Usuarios",
  reports: "Reportes",
  audit: "Auditoría",
  authentication: "Autenticación",
  navigation: "Navegación",
  synchronization: "Sincronización",
  photos: "Fotografías",
};

// --------------------------------------------------
// RESOLVER MÓDULO DEL EVENTO
// --------------------------------------------------

function resolveAuditModule(log) {
  if (log.module) {
    return normalizeAuditModule(log.module);
  }

  if (
    log.entityType === "navigation" &&
    log.afterData?.section
  ) {
    return normalizeAuditModule(log.afterData.section);
  }

  if (log.entityType) {
    return normalizeAuditModule(
      MODULE_BY_ENTITY[log.entityType] ||
      log.entityType
    );
  }

  return "—";
}

function getModuleLabel(module) {
  return MODULE_LABELS[module] || module || "—";
}

// --------------------------------------------------
// FORMATEAR FECHAS
// --------------------------------------------------

function formatDate(date) {
  if (!date) {
    return "Sin fecha";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Fecha no válida";
  }

  return parsedDate.toLocaleString("es-CL");
}

function getLocalDate(date) {
  if (!date) {
    return "";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const year = parsedDate.getFullYear();
  const month = String(
    parsedDate.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    parsedDate.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// --------------------------------------------------
// FORMATEAR INFORMACIÓN
// --------------------------------------------------

function formatData(data) {
  if (data === null || data === undefined) {
    return "Sin información registrada";
  }

  if (typeof data === "string") {
    return data;
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "No fue posible mostrar esta información.";
  }
}

function searchableText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return formatData(value);
  }

  return String(value);
}

// --------------------------------------------------
// COLOR SEGÚN OPERACIÓN
// --------------------------------------------------

function getActionTone(action) {
  const normalizedAction = String(
    action || ""
  ).toUpperCase();

  if (
    normalizedAction.includes("CREATE") ||
    normalizedAction.includes("CREATED") ||
    normalizedAction.includes("CONFIRMED") ||
    normalizedAction.includes("ENQUEUED") ||
    normalizedAction.includes("LOGIN") ||
    normalizedAction.includes("START") ||
    normalizedAction.includes("COMPLETE") ||
    normalizedAction.includes("APPROVE") ||
    normalizedAction.includes("DELIVERED")
  ) {
    return "success";
  }

  if (
    normalizedAction.includes("UPDATE") ||
    normalizedAction.includes("ASSIGN") ||
    normalizedAction.includes("RETRY") ||
    normalizedAction.includes("MODULE_ACCESS") ||
    normalizedAction.includes("REJECT")
  ) {
    return "info";
  }

  if (
    normalizedAction.includes("DELETE") ||
    normalizedAction.includes("CANCEL") ||
    normalizedAction.includes("DEACTIVATE") ||
    normalizedAction.includes("LOGOUT")
  ) {
    return "danger";
  }

  return "neutral";
}

// --------------------------------------------------
// COMPONENTE PRINCIPAL
// --------------------------------------------------

function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [userDirectory, setUserDirectory] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros.
  const [userFilter, setUserFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  // ------------------------------------------------
  // CARGAR HISTORIAL
  // ------------------------------------------------

  const loadAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const records = await getAuditLogs({
        limit: 500,
        reverse: true,
      });

      setLogs(
        Array.isArray(records) ? records : []
      );

      // El directorio solo complementa nombres históricos.
      // Si falla, los eventos siguen mostrándose.

      try {
        const registeredUsers = await getAllUsers();

        setUserDirectory(
          Array.isArray(registeredUsers)
            ? registeredUsers
            : []
        );
      } catch (userError) {
        console.warn(
          "No fue posible recuperar el directorio de usuarios:",
          userError
        );

        setUserDirectory([]);
      }
    } catch (err) {
      console.error(
        "Error al cargar el historial de auditoría:",
        err
      );

      setError(
        "No fue posible cargar el historial de auditoría."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  // ------------------------------------------------
  // ÍNDICE DE USUARIOS
  // ------------------------------------------------

  const usersById = useMemo(() => {
    return new Map(
      userDirectory
        .filter((user) => user.id)
        .map((user) => [
          user.id,
          user.name || user.email || user.id,
        ])
    );
  }, [userDirectory]);

  // ------------------------------------------------
  // PREPARAR EVENTOS PARA VISUALIZACIÓN
  // ------------------------------------------------

  const displayLogs = useMemo(() => {
    return logs.map((log) => ({
      ...log,

      resolvedUserName:
        log.userName ||
        usersById.get(log.userId) ||
        "Usuario desconocido",

      resolvedModule: resolveAuditModule(log),
    }));
  }, [logs, usersById]);

  // ------------------------------------------------
  // OPCIONES DE USUARIOS
  // ------------------------------------------------

  const users = useMemo(() => {
    return [
      ...new Map(
        displayLogs
          .filter((log) => log.userId)
          .map((log) => [
            log.userId,
            {
              id: log.userId,
              name: log.resolvedUserName,
            },
          ])
      ).values(),
    ].sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );
  }, [displayLogs]);

  // ------------------------------------------------
  // OPCIONES DE MÓDULOS
  // ------------------------------------------------

  const modules = useMemo(() => {
    return [
      ...new Set(
        displayLogs
          .map((log) => log.resolvedModule)
          .filter((module) => module && module !== "—")
      ),
    ].sort((a, b) =>
      getModuleLabel(a).localeCompare(
        getModuleLabel(b),
        "es"
      )
    );
  }, [displayLogs]);

  // ------------------------------------------------
  // APLICAR FILTROS
  // ------------------------------------------------

  const filteredLogs = useMemo(() => {
    const searchText = searchFilter
      .trim()
      .toLowerCase();

    return displayLogs.filter((log) => {
      const matchesUser =
        !userFilter ||
        log.userId === userFilter;

      const matchesModule =
        !moduleFilter ||
        log.resolvedModule === moduleFilter;

      const matchesDate =
        !dateFilter ||
        getLocalDate(log.createdAt) === dateFilter;

      const searchableValues = [
        log.action,
        log.entityType,
        log.entityId,
        log.resolvedUserName,
        log.userId,
        log.userRole,
        log.resolvedModule,
        log.details,
        log.beforeData,
        log.afterData,
      ];

      const matchesSearch =
        !searchText ||
        searchableValues
          .map(searchableText)
          .join(" ")
          .toLowerCase()
          .includes(searchText);

      return (
        matchesUser &&
        matchesModule &&
        matchesDate &&
        matchesSearch
      );
    });
  }, [
    displayLogs,
    userFilter,
    moduleFilter,
    dateFilter,
    searchFilter,
  ]);

  // ------------------------------------------------
  // LIMPIAR FILTROS
  // ------------------------------------------------

  function clearFilters() {
    setUserFilter("");
    setModuleFilter("");
    setDateFilter("");
    setSearchFilter("");
  }

  // ------------------------------------------------
  // INTERFAZ
  // ------------------------------------------------

  return (
    <section className="audit-page">

      {/* ENCABEZADO */}

      <div className="page-heading">
        <div className="page-heading__main">
          <div>
            <span className="page-heading__eyebrow">
              CONTROL Y TRAZABILIDAD
            </span>

            <h1>Historial de auditoría</h1>

            <p>
              Registro de las operaciones realizadas en AndinaCare.
            </p>
          </div>
        </div>
      </div>

      {/* RESUMEN */}

      <Card className="audit-summary-card">
        <div>
          <span>Eventos recuperados</span>
          <h2>{logs.length}</h2>
        </div>

        <div>
          <span>Eventos encontrados</span>
          <h2>{filteredLogs.length}</h2>
        </div>
      </Card>

      {/* FILTROS */}

      <Card className="audit-filters-card">
        <h2>Filtros de auditoría</h2>

        <p>
          Utiliza estos filtros para encontrar operaciones específicas.
        </p>

        <div className="audit-filters-grid">

          <div className="audit-filter">
            <label htmlFor="audit-user-filter">
              Usuario responsable
            </label>

            <select
              id="audit-user-filter"
              value={userFilter}
              onChange={(event) =>
                setUserFilter(event.target.value)
              }
            >
              <option value="">
                Todos los usuarios
              </option>

              {users.map((user) => (
                <option
                  key={user.id}
                  value={user.id}
                >
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="audit-filter">
            <label htmlFor="audit-module-filter">
              Módulo
            </label>

            <select
              id="audit-module-filter"
              value={moduleFilter}
              onChange={(event) =>
                setModuleFilter(event.target.value)
              }
            >
              <option value="">
                Todos los módulos
              </option>

              {modules.map((module) => (
                <option
                  key={module}
                  value={module}
                >
                  {getModuleLabel(module)}
                </option>
              ))}
            </select>
          </div>

          <div className="audit-filter">
            <label htmlFor="audit-date-filter">
              Fecha
            </label>

            <input
              id="audit-date-filter"
              type="date"
              value={dateFilter}
              onChange={(event) =>
                setDateFilter(event.target.value)
              }
            />
          </div>

          <div className="audit-filter">
            <label htmlFor="audit-search-filter">
              Buscar operación o registro
            </label>

            <input
              id="audit-search-filter"
              type="text"
              placeholder="Ejemplo: UPDATE, EXT-001, técnico..."
              value={searchFilter}
              onChange={(event) =>
                setSearchFilter(event.target.value)
              }
            />
          </div>

        </div>

        <div className="audit-filter-actions">
          <button
            type="button"
            onClick={clearFilters}
          >
            Limpiar filtros
          </button>

          <button
            type="button"
            onClick={loadAuditLogs}
            disabled={loading}
          >
            {loading
              ? "Actualizando..."
              : "Actualizar historial"}
          </button>
        </div>
      </Card>

      {/* HISTORIAL */}

      <Card className="audit-table-card">
        <h2>Registro de actividades</h2>

        <p>
          Eventos almacenados en la base de datos local.
        </p>

        {loading && (
          <p>Cargando historial de auditoría...</p>
        )}

        {!loading && error && (
          <p role="alert">{error}</p>
        )}

        {!loading && !error && logs.length === 0 && (
          <p>
            Todavía no existen eventos registrados.
          </p>
        )}

        {!loading &&
          !error &&
          logs.length > 0 &&
          filteredLogs.length === 0 && (
            <p>
              No se encontraron eventos que coincidan con los filtros.
            </p>
          )}

        {!loading &&
          !error &&
          filteredLogs.length > 0 && (
            <div className="audit-table-container">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Módulo</th>
                    <th>Entidad</th>
                    <th>Identificador</th>
                    <th>Usuario responsable</th>
                    <th>Fecha y hora</th>
                    <th>Detalles e historial</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <StatusBadge
                          tone={getActionTone(log.action)}
                        >
                          {log.action || "SIN ACCIÓN"}
                        </StatusBadge>
                      </td>

                      <td>
                        {getModuleLabel(log.resolvedModule)}
                      </td>

                      <td>
                        {log.entityType || "—"}
                      </td>

                      <td>
                        <span className="audit-id">
                          {log.entityId || "—"}
                        </span>
                      </td>

                      <td>
                        <div>
                          <strong>
                            {log.resolvedUserName}
                          </strong>
                        </div>

                        <span className="audit-id">
                          {log.userRole
                            ? `Rol: ${log.userRole}`
                            : log.userId || "Sin identificador"}
                        </span>
                      </td>

                      <td>
                        {formatDate(log.createdAt)}
                      </td>

                      <td>
                        <details className="audit-details">
                          <summary>
                            Consultar detalles
                          </summary>

                          <div className="audit-details-content">
                            <p>
                              <strong>Descripción:</strong>
                            </p>

                            <p>
                              {typeof log.details === "string"
                                ? log.details
                                : formatData(log.details)}
                            </p>

                            <div>
                              <strong>Datos anteriores</strong>

                              <pre>
                                {formatData(log.beforeData)}
                              </pre>
                            </div>

                            <div>
                              <strong>Datos posteriores</strong>

                              <pre>
                                {formatData(log.afterData)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </section>
  );
}

export default AuditPage;
