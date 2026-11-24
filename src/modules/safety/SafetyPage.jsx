
/*
 * ANDINACARE - PANTALLA DE SEGURIDAD
 *
 * Consulta de registros AST/LOTO.
 *
 * FUNCIONES:
 * 1. Consultar registros de seguridad.
 * 2. Buscar por orden, técnico o RUT.
 * 3. Filtrar por técnico responsable.
 * 4. Filtrar por fecha de confirmación.
 * 5. Filtrar por orden de trabajo.
 * 6. Combinar todos los filtros.
 * 7. Revisar los seis controles de seguridad.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { db } from "../../services/database/db";
import { getSafetyRecords } from "./safetyService";

import Card from "../../components/common/Card";

const CHECKLIST_LABELS = {
  energy_isolation: "Aislamiento de energías",
  electrical_lockout: "Bloqueo eléctrico",
  mechanical_lockout: "Bloqueo mecánico",
  residual_energy: "Liberación de energías residuales",
  zero_energy_verification: "Verificación de energía cero",
  absence_confirmation: "Confirmación de ausencia de energía",
};

function formatDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return date.toLocaleString("es-CL");
}

function getLocalDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWorkOrderCode(order) {
  if (!order) return "OT no encontrada";

  return (
    order.code ||
    order.orderNumber ||
    order.workOrderNumber ||
    order.id ||
    "Sin código"
  );
}

function getTechnicianName(record) {
  return (
    record.userName ||
    record.technicianName ||
    "Usuario no identificado"
  );
}

function getTechnicianFilterValue(record) {
  return String(record.userId || getTechnicianName(record));
}

function getRut(record) {
  return record.rut || "No registrado";
}

function isChecklistComplete(checklist) {
  if (!checklist) return false;

  return Object.keys(CHECKLIST_LABELS).every(
    (key) => checklist[key] === true
  );
}

function SummaryCard({ title, value, description }) {
  return (
    <Card>
      <div className="p-4">
        <p className="text-sm text-muted">{title}</p>

        <p className="mt-2 text-2xl font-bold">
          {value}
        </p>

        <p className="mt-1 text-xs text-muted">
          {description}
        </p>
      </div>
    </Card>
  );
}

export default function SafetyPage() {
  const [records, setRecords] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);

  const [search, setSearch] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [workOrderFilter, setWorkOrderFilter] = useState("");

  const [expandedRecord, setExpandedRecord] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [safetyData, ordersData] = await Promise.all([
        getSafetyRecords(),
        db.workOrders.toArray(),
      ]);

      setRecords(safetyData);
      setWorkOrders(ordersData);
    } catch (err) {
      console.error(
        "Error al cargar registros de seguridad:",
        err
      );

      setError(
        err.message ||
        "No fue posible cargar los registros de seguridad."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ordersById = useMemo(() => {
    return new Map(
      workOrders.map((order) => [order.id, order])
    );
  }, [workOrders]);

  // Técnicos presentes en los registros.
  const technicians = useMemo(() => {
    const uniqueTechnicians = new Map();

    records.forEach((record) => {
      const value = getTechnicianFilterValue(record);

      if (!uniqueTechnicians.has(value)) {
        uniqueTechnicians.set(value, getTechnicianName(record));
      }
    });

    return Array.from(uniqueTechnicians.entries())
      .map(([value, name]) => ({ value, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [records]);

  // Órdenes que tienen registros AST/LOTO.
  const availableOrders = useMemo(() => {
    const uniqueOrders = new Map();

    records.forEach((record) => {
      if (!record.workOrderId) return;

      const order = ordersById.get(record.workOrderId);

      uniqueOrders.set(
        record.workOrderId,
        getWorkOrderCode(order)
      );
    });

    return Array.from(uniqueOrders.entries())
      .map(([value, code]) => ({ value, code }))
      .sort((a, b) => a.code.localeCompare(b.code, "es"));
  }, [records, ordersById]);

  // Aplicación combinada de búsqueda y filtros.
  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      const order = ordersById.get(record.workOrderId);

      const searchableText = [
        getWorkOrderCode(order),
        getTechnicianName(record),
        getRut(record),
        record.workOrderId,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !term || searchableText.includes(term);

      const matchesTechnician =
        !technicianFilter ||
        getTechnicianFilterValue(record) === technicianFilter;

      const recordDate = getLocalDate(
        record.confirmedAt || record.createdAt
      );

      const matchesDate =
        !dateFilter || recordDate === dateFilter;

      const matchesWorkOrder =
        !workOrderFilter ||
        String(record.workOrderId) === workOrderFilter;

      return (
        matchesSearch &&
        matchesTechnician &&
        matchesDate &&
        matchesWorkOrder
      );
    });
  }, [
    records,
    search,
    technicianFilter,
    dateFilter,
    workOrderFilter,
    ordersById,
  ]);

  const completedChecklists = useMemo(() => {
    return records.filter((record) =>
      isChecklistComplete(record.checklist)
    ).length;
  }, [records]);

  const hasActiveFilters =
    search.trim() !== "" ||
    technicianFilter !== "" ||
    dateFilter !== "" ||
    workOrderFilter !== "";

  function clearFilters() {
    setSearch("");
    setTechnicianFilter("");
    setDateFilter("");
    setWorkOrderFilter("");
  }

  return (
    <div className="space-y-6">

      {/* ENCABEZADO */}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Seguridad industrial
          </h1>

          <p className="text-sm text-muted mt-1">
            Consulta de registros AST/LOTO y controles de seguridad.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-light disabled:opacity-50"
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* RESUMEN */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

        <SummaryCard
          title="Registros confirmados"
          value={records.length}
          description="Total de registros AST/LOTO"
        />

        <SummaryCard
          title="Listas completas"
          value={completedChecklists}
          description="Registros con los seis controles marcados"
        />

        <SummaryCard
          title="Órdenes relacionadas"
          value={
            new Set(
              records.map((record) => record.workOrderId)
            ).size
          }
          description="Órdenes con registros de seguridad"
        />

      </div>

      {/* BÚSQUEDA Y FILTROS */}

      <Card>
        <div className="p-4 space-y-4">

          <div>
            <h2 className="font-semibold">
              Buscar y filtrar registros
            </h2>

            <p className="text-sm text-muted mt-1">
              Combina la búsqueda con los filtros para localizar
              registros AST/LOTO.
            </p>
          </div>

          {/* BÚSQUEDA GENERAL */}

          <div>
            <label className="block text-sm font-medium mb-2">
              Búsqueda general
            </label>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Código de OT, nombre del técnico o RUT..."
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm"
            />
          </div>

          {/* FILTROS */}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">

            <div>
              <label className="block text-sm font-medium mb-2">
                Técnico responsable
              </label>

              <select
                value={technicianFilter}
                onChange={(event) =>
                  setTechnicianFilter(event.target.value)
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
              >
                <option value="">
                  Todos los técnicos
                </option>

                {technicians.map((technician) => (
                  <option
                    key={technician.value}
                    value={technician.value}
                  >
                    {technician.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Fecha de confirmación
              </label>

              <input
                type="date"
                value={dateFilter}
                onChange={(event) =>
                  setDateFilter(event.target.value)
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Orden de trabajo
              </label>

              <select
                value={workOrderFilter}
                onChange={(event) =>
                  setWorkOrderFilter(event.target.value)
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
              >
                <option value="">
                  Todas las órdenes
                </option>

                {availableOrders.map((order) => (
                  <option
                    key={order.value}
                    value={order.value}
                  >
                    {order.code}
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* RESULTADOS Y LIMPIEZA */}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">

            <p className="text-xs text-muted">
              Mostrando {filteredRecords.length} de {records.length} registros.
            </p>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            )}

          </div>

        </div>
      </Card>

      {/* ERRORES */}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* CONTENIDO */}

      {loading ? (
        <Card>
          <div className="p-8 text-center text-muted">
            Cargando registros de seguridad...
          </div>
        </Card>
      ) : filteredRecords.length === 0 ? (
        <Card>
          <div className="p-8 text-center space-y-2">

            <h3 className="font-semibold">
              {records.length === 0
                ? "Aún no hay registros AST/LOTO"
                : "No se encontraron resultados"}
            </h3>

            <p className="text-sm text-muted">
              {records.length === 0
                ? "Para generar un registro, ingresa a Órdenes de trabajo y pulsa Iniciar en una orden pendiente."
                : "Prueba con otros criterios de búsqueda o limpia los filtros."}
            </p>

            {records.length > 0 && hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-sm font-semibold text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            )}

          </div>
        </Card>
      ) : (

        <div className="space-y-4">

          {filteredRecords.map((record) => {
            const order = ordersById.get(record.workOrderId);

            const expanded = expandedRecord === record.id;

            const checklist = record.checklist || {};

            const complete = isChecklistComplete(checklist);

            return (
              <Card key={record.id}>
                <div className="p-4 space-y-4">

                  {/* INFORMACIÓN PRINCIPAL */}

                  <div className="flex flex-wrap items-start justify-between gap-3">

                    <div>
                      <p className="text-xs text-muted">
                        ORDEN DE TRABAJO
                      </p>

                      <h3 className="text-lg font-bold mt-1">
                        {getWorkOrderCode(order)}
                      </h3>

                      <p className="text-sm text-muted mt-1">
                        {getTechnicianName(record)}
                      </p>
                    </div>

                    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
                      {record.status || "CONFIRMADO"}
                    </span>

                  </div>

                  {/* DATOS DEL REGISTRO */}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">

                    <div>
                      <p className="text-xs text-muted">
                        RUT responsable
                      </p>

                      <p className="text-sm font-medium mt-1">
                        {getRut(record)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted">
                        Fecha de confirmación
                      </p>

                      <p className="text-sm font-medium mt-1">
                        {formatDate(
                          record.confirmedAt || record.createdAt
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted">
                        Controles de seguridad
                      </p>

                      <p className="text-sm font-medium mt-1">
                        {complete
                          ? "6 de 6 completados"
                          : "Revisar registro"}
                      </p>
                    </div>

                  </div>

                  {/* DETALLE */}

                  <div className="border-t border-border pt-3">

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRecord(
                          expanded ? null : record.id
                        )
                      }
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {expanded
                        ? "Ocultar controles"
                        : "Ver controles AST/LOTO"}
                    </button>

                    {expanded && (
                      <div className="mt-4 space-y-3">

                        <h4 className="font-semibold text-sm">
                          Lista de verificación de seguridad
                        </h4>

                        {Object.entries(CHECKLIST_LABELS).map(
                          ([key, label]) => {
                            const checked = checklist[key] === true;

                            return (
                              <div
                                key={key}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                              >
                                <span className="text-sm">
                                  {label}
                                </span>

                                <span
                                  className={
                                    checked
                                      ? "text-sm font-semibold text-green-400"
                                      : "text-sm font-semibold text-red-400"
                                  }
                                >
                                  {checked
                                    ? "Cumplido"
                                    : "No registrado"}
                                </span>
                              </div>
                            );
                          }
                        )}

                        <div className="rounded-lg bg-surface-light p-3">
                          <p className="text-xs text-muted">
                            Identificador del registro
                          </p>

                          <p className="text-xs font-mono mt-1 break-all">
                            {record.id}
                          </p>
                        </div>

                      </div>
                    )}

                  </div>

                </div>
              </Card>
            );
          })}

        </div>
      )}

    </div>
  );
}
