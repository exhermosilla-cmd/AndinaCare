/*
 * ANDINACARE - MÉTRICAS Y REPORTES
 *
 * Todos los indicadores se calculan desde IndexedDB.
 * No se modifican órdenes, intervenciones ni movimientos.
 *
 * CRITERIOS:
 * - MTTR: promedio de duración de intervenciones completadas.
 * - MTBF: requiere horas de operación del activo; no se infiere
 *   a partir de fechas de órdenes.
 * - Downtime: requiere eventos explícitos de detención y retorno;
 *   no se confunde duración de reparación con indisponibilidad.
 * - Fallas: órdenes correctivas válidas.
 * - Resolución: desde creación de la OT hasta su finalización.
 * - Repuestos: salidas (SALIDA) de inventario asociadas a OT.
 * - Rendimiento: órdenes completadas / órdenes válidas creadas
 *   en el período. Es una tasa de cierre, no productividad laboral.
 */

import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import {
  Activity, AlertTriangle, BarChart3, Clock3, Factory,
  Gauge, Package, RefreshCw, Wrench,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { db, openDatabase } from "../../services/database/db";
import { useAuth } from "../../context/AuthContext";
import "./reports.css";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const STATUS_DONE = "COMPLETADA";
const STATUS_CANCELLED = "CANCELADA";

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function elapsedHours(start, end) {
  const a = validDate(start);
  const b = validDate(end);
  if (!a || !b || b <= a) return null;
  return (b.getTime() - a.getTime()) / HOUR;
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function formatHours(value) {
  if (value === null || !Number.isFinite(value)) return "Sin datos";
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} días`;
}

function formatNumber(value, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "Sin datos";
  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: digits,
  }).format(value);
}

function withinPeriod(dateValue, period, now) {
  const date = validDate(dateValue);
  if (!date) return false;
  if (period === "all") return true;
  const days = Number(period);
  const from = new Date(now.getTime() - days * DAY);
  return date >= from && date <= now;
}

function MetricCard({ icon: Icon, label, value, detail, tone = "" }) {
  return (
    <article className={`reports-metric ${tone}`}>
      <div className="reports-metric__top">
        <span>{label}</span>
        <span className="reports-metric__icon"><Icon size={19} /></span>
      </div>
      <strong className="reports-metric__value">{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="reports-panel">
      <div className="reports-panel__heading">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function ReportsPage() {
  const { user } = useAuth();
  const [dataset, setDataset] = useState({
    assets: [], workOrders: [], interventions: [], movements: [], spareParts: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("30");
  const [assetId, setAssetId] = useState("all");
  const [now] = useState(() => new Date());

  useEffect(() => {
    let subscription;
    let active = true;

    async function connect() {
      try {
        await openDatabase();
        subscription = liveQuery(() => Promise.all([
          db.assets.toArray(),
          db.workOrders.toArray(),
          db.interventions.toArray(),
          db.inventoryMovements.toArray(),
          db.spareParts.toArray(),
        ])).subscribe({
          next: ([assets, workOrders, interventions, movements, spareParts]) => {
            if (!active) return;
            setDataset({ assets, workOrders, interventions, movements, spareParts });
            setLoading(false);
            setError("");
          },
          error: (err) => {
            if (!active) return;
            setError(err?.message || "No fue posible consultar los datos.");
            setLoading(false);
          },
        });
      } catch (err) {
        if (active) {
          setError(err?.message || "No fue posible abrir la base de datos.");
          setLoading(false);
        }
      }
    }

    connect();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const report = useMemo(() => {
    const { assets, workOrders, interventions, movements, spareParts } = dataset;
    const selectedOrders = workOrders.filter((order) =>
      withinPeriod(order.createdAt, period, now) &&
      (assetId === "all" || order.assetId === assetId) &&
      validDate(order.createdAt)
    );
    const orderById = new Map(workOrders.map((order) => [order.id, order]));
    const validOrders = selectedOrders.filter((order) =>
      order.id && order.assetId && validDate(order.createdAt) &&
      [ "CORRECTIVO", "PREVENTIVO", "INSPECCION" ].includes(normalize(order.type))
    );
    const validOrderIds = new Set(validOrders.map((order) => order.id));
    const selectedInterventions = interventions.filter((item) => {
      const linkedOrder = orderById.get(item.workOrderId);
      const date = item.completedAt || item.startedAt || linkedOrder?.createdAt;
      return validOrderIds.has(item.workOrderId) &&
        (assetId === "all" || linkedOrder?.assetId === assetId) &&
        withinPeriod(date, period, now);
    });

    const validRepairs = selectedInterventions
      .map((item) => ({ item, hours: elapsedHours(item.startedAt, item.completedAt) }))
      .filter(({ item, hours }) =>
        hours !== null &&
        item.workOrderId &&
        orderById.has(item.workOrderId) &&
        normalize(orderById.get(item.workOrderId).type) === "CORRECTIVO" &&
        normalize(orderById.get(item.workOrderId).status) === STATUS_DONE
      );

    const mttr = validRepairs.length
      ? validRepairs.reduce((sum, row) => sum + row.hours, 0) / validRepairs.length
      : null;

    const completedOrders = validOrders.filter((order) =>
      normalize(order.status) === STATUS_DONE &&
      validDate(order.createdAt) &&
      validDate(order.completedAt) &&
      validDate(order.completedAt) > validDate(order.createdAt)
    );

    const resolutionValues = completedOrders
      .map((order) => elapsedHours(order.createdAt, order.completedAt))
      .filter((value) => value !== null);
    const averageResolution = resolutionValues.length
      ? resolutionValues.reduce((sum, value) => sum + value, 0) / resolutionValues.length
      : null;

    const corrective = validOrders.filter((order) => normalize(order.type) === "CORRECTIVO");
    const preventive = validOrders.filter((order) => normalize(order.type) === "PREVENTIVO");
    const failureCount = corrective.length;
    const closureDenominator = validOrders.filter((order) =>
      normalize(order.status) !== STATUS_CANCELLED
    ).length;
    const performance = closureDenominator
      ? (completedOrders.filter((order) => normalize(order.type) !== "INSPECCION" ||
          validOrders.some((valid) => valid.id === order.id)).length / closureDenominator) * 100
      : null;

    const selectedMovements = movements.filter((movement) =>
      normalize(movement.type) === "SALIDA" &&
      movement.workOrderId &&
      validOrderIds.has(movement.workOrderId) &&
      (assetId === "all" || orderById.get(movement.workOrderId)?.assetId === assetId) &&
      Number.isFinite(Number(movement.quantity)) &&
      Number(movement.quantity) > 0
    );
    const consumed = selectedMovements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    const partsById = new Map(spareParts.map((part) => [part.id, part]));
    const consumptionByPart = new Map();
    selectedMovements.forEach((movement) => {
      const part = partsById.get(movement.sparePartId);
      const name = part?.name || "Repuesto sin nombre";
      const previous = consumptionByPart.get(movement.sparePartId) || { name, quantity: 0 };
      previous.quantity += Number(movement.quantity);
      consumptionByPart.set(movement.sparePartId, previous);
    });

    const failuresByAsset = new Map();
    corrective.forEach((order) => {
      const asset = assets.find((item) => item.id === order.assetId);
      const name = asset?.name || "Activo no identificado";
      failuresByAsset.set(order.assetId, {
        name, code: asset?.code || "—",
        count: (failuresByAsset.get(order.assetId)?.count || 0) + 1,
      });
    });

    const typeChart = [
      { name: "Correctivas", value: corrective.length },
      { name: "Preventivas", value: preventive.length },
      { name: "Inspección", value: validOrders.filter((o) => normalize(o.type) === "INSPECCION").length },
    ].filter((item) => item.value > 0);

    const orderStatusChart = [
      { name: "Completadas", value: selectedOrders.filter((o) => normalize(o.status) === STATUS_DONE).length },
      { name: "En ejecución", value: selectedOrders.filter((o) => normalize(o.status) === "EN_PROGRESO").length },
      { name: "Pendientes", value: selectedOrders.filter((o) => normalize(o.status) === "PENDIENTE").length },
      { name: "Canceladas", value: selectedOrders.filter((o) => normalize(o.status) === STATUS_CANCELLED).length },
    ].filter((item) => item.value > 0);

    const downtimeHours = null;
    const mtbfHours = null;

    return {
      selectedOrders, validOrders, validRepairs, mttr, averageResolution,
      corrective, preventive, failureCount, performance, consumed,
      consumptionRows: [...consumptionByPart.values()].sort((a, b) => b.quantity - a.quantity),
      failuresRows: [...failuresByAsset.values()].sort((a, b) => b.count - a.count),
      typeChart, orderStatusChart, downtimeHours, mtbfHours,
      invalidOrders: selectedOrders.length - validOrders.length,
      repairCount: validRepairs.length,
      completedCount: completedOrders.length,
    };
  }, [dataset, period, assetId, now]);

  const assetName = assetId === "all"
    ? "Todos los activos"
    : dataset.assets.find((asset) => asset.id === assetId)?.name || "Activo seleccionado";

  if (loading) {
    return <section className="reports-page"><p className="reports-state">Cargando métricas desde la base de datos…</p></section>;
  }

  if (error) {
    return <section className="reports-page"><p className="reports-error">{error}</p></section>;
  }

  return (
    <main className="reports-page">
      <header className="reports-header">
        <div>
          <span className="reports-eyebrow">ANÁLISIS DE MANTENIMIENTO</span>
          <h1>Métricas y reportes</h1>
          <p>Indicadores calculados con órdenes, intervenciones y movimientos reales de AndinaCare.</p>
          <small className="reports-user">Vista de: {user?.name || "Usuario"}</small>
        </div>
        <div className="reports-filters">
          <label>Período
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="all">Todo el período</option>
            </select>
          </label>
          <label>Activo
            <select value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="all">Todos los activos</option>
              {dataset.assets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.code} · {asset.name}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="reports-context">
        <span><Factory size={16} /> {assetName}</span>
        <span><RefreshCw size={15} /> Actualización automática al cambiar IndexedDB</span>
        <span>{report.selectedOrders.length} órdenes encontradas</span>
      </div>

      <section className="reports-metrics-grid">
        <MetricCard icon={Clock3} label="MTTR" value={formatHours(report.mttr)} detail={`${report.repairCount} intervenciones válidas completadas`} />
        <MetricCard icon={Activity} label="MTBF" value="Sin datos suficientes" detail="Faltan horas de operación y eventos de falla fechados" tone="muted" />
        <MetricCard icon={AlertTriangle} label="Downtime" value="Sin datos suficientes" detail="No se registran intervalos explícitos de detención" tone="muted" />
        <MetricCard icon={Wrench} label="Fallas registradas" value={formatNumber(report.failureCount, 0)} detail="Órdenes correctivas válidas" />
        <MetricCard icon={Clock3} label="Resolución promedio" value={formatHours(report.averageResolution)} detail={`${report.completedCount} órdenes con fechas válidas`} />
        <MetricCard icon={Package} label="Repuestos consumidos" value={formatNumber(report.consumed, 0)} detail={`${selectedMovementLabel(report.consumed)} en salidas de inventario`} />
        <MetricCard icon={Gauge} label="Rendimiento de cierre" value={report.performance === null ? "Sin datos" : `${formatNumber(report.performance)}%`} detail="Órdenes completadas / órdenes válidas no canceladas" tone="success" />
        <MetricCard icon={BarChart3} label="Órdenes preventivas" value={formatNumber(report.preventive.length, 0)} detail={`${report.corrective.length} órdenes correctivas`} />
      </section>

      <section className="reports-charts-grid">
        <Panel title="Órdenes por tipo" subtitle="Distribución de órdenes válidas en el período.">
          {report.typeChart.length ? (
            <div className="reports-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={report.typeChart} dataKey="value" nameKey="name" outerRadius={100} label>
                    {report.typeChart.map((entry, index) => <Cell key={entry.name} fill={["#4da3ff", "#36c98f", "#e6b85c"][index % 3]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="reports-empty">Sin datos para el período seleccionado.</p>}
        </Panel>

        <Panel title="Órdenes por estado" subtitle="Incluye los estados de las órdenes encontradas.">
          {report.orderStatusChart.length ? (
            <div className="reports-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.orderStatusChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Órdenes" fill="#4da3ff" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="reports-empty">Sin datos para el período seleccionado.</p>}
        </Panel>
      </section>

      <Panel title="Fallas por activo" subtitle="Cantidad de órdenes correctivas válidas asociadas a cada equipo.">
        {report.failuresRows.length ? (
          <div className="reports-table-wrap"><table className="reports-table">
            <thead><tr><th>Activo</th><th>Código</th><th>Fallas registradas</th></tr></thead>
            <tbody>{report.failuresRows.map((row) => <tr key={`${row.code}-${row.name}`}><td>{row.name}</td><td>{row.code}</td><td>{row.count}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="reports-empty">Sin fallas correctivas válidas para este filtro.</p>}
      </Panel>

      <Panel title="Repuestos consumidos" subtitle="Suma de movimientos SALIDA vinculados a órdenes del filtro. Las reservas no se cuentan como consumo.">
        {report.consumptionRows.length ? (
          <div className="reports-table-wrap"><table className="reports-table">
            <thead><tr><th>Repuesto</th><th>Cantidad consumida</th></tr></thead>
            <tbody>{report.consumptionRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{formatNumber(row.quantity, 0)} unidades</td></tr>)}</tbody>
          </table></div>
        ) : <p className="reports-empty">Sin movimientos de salida válidos asociados a las órdenes filtradas.</p>}
      </Panel>

      <Panel title="Detalle de órdenes por equipo" subtitle="Consulta individual de las órdenes incluidas en el análisis.">
        {report.selectedOrders.length ? (
          <div className="reports-table-wrap"><table className="reports-table">
            <thead><tr><th>Orden</th><th>Activo</th><th>Tipo</th><th>Estado</th><th>Creación</th><th>Resolución</th></tr></thead>
            <tbody>{report.selectedOrders.map((order) => {
              const asset = dataset.assets.find((item) => item.id === order.assetId);
              const duration = normalize(order.status) === STATUS_DONE
                ? elapsedHours(order.createdAt, order.completedAt) : null;
              return <tr key={order.id}>
                <td>{order.code || order.id}</td><td>{asset?.name || "Activo no identificado"}</td>
                <td>{order.type || "Sin tipo"}</td><td>{order.status || "Sin estado"}</td>
                <td>{validDate(order.createdAt)?.toLocaleDateString("es-CL") || "Fecha inválida"}</td>
                <td>{formatHours(duration)}</td>
              </tr>;
            })}</tbody>
          </table></div>
        ) : <p className="reports-empty">No hay órdenes para el período y activo seleccionados.</p>}
      </Panel>

      <Panel title="Metodología y fórmulas" subtitle="Definiciones para interpretación y defensa académica.">
        <div className="reports-method-grid">
          <article><h3>MTTR · Tiempo medio de reparación</h3><p><strong>MTTR = Σ (fecha de término − fecha de inicio) / cantidad de intervenciones válidas.</strong> Se usan intervenciones correctivas completadas, relacionadas con una OT correctiva completada, con ambas fechas válidas y término posterior al inicio. Se expresa en horas.</p></article>
          <article><h3>MTBF · Tiempo medio entre fallas</h3><p><strong>MTBF = horas de operación acumuladas / número de intervalos entre fallas.</strong> No se calcula porque la base actual no registra horómetros ni períodos de operación por activo. Las fechas de creación de OT no sustituyen esos datos.</p></article>
          <article><h3>Downtime · Indisponibilidad</h3><p><strong>Downtime = Σ (fecha de retorno − fecha de detención).</strong> No se calcula porque no existe un historial específico de detenciones y retornos del activo. El tiempo de intervención se informa como MTTR, no como downtime.</p></article>
          <article><h3>Fallas por activo</h3><p>Conteo de órdenes válidas de tipo CORRECTIVO por activo. Es un indicador basado en órdenes correctivas registradas; no representa necesariamente todas las fallas físicas ocurridas.</p></article>
          <article><h3>Correctivas y preventivas</h3><p>Conteo de órdenes válidas según su campo <code>type</code>. Las inspecciones se muestran aparte y no se suman a correctivas ni preventivas.</p></article>
          <article><h3>Tiempo promedio de resolución</h3><p><strong>Promedio = Σ (completedAt − createdAt) / cantidad de órdenes completadas válidas.</strong> Mide el ciclo completo desde la creación hasta el cierre de la OT; puede incluir espera y planificación, no solo reparación.</p></article>
          <article><h3>Repuestos consumidos</h3><p>Suma de <code>quantity</code> en movimientos de inventario tipo SALIDA vinculados a órdenes incluidas. Las reservas, liberaciones y entradas no se consideran consumo.</p></article>
          <article><h3>Rendimiento de mantenimiento</h3><p><strong>Tasa de cierre = órdenes completadas / órdenes válidas no canceladas × 100.</strong> Es una tasa de cierre del período, no mide eficiencia individual ni calidad técnica del mantenimiento.</p></article>
        </div>
        <p className="reports-assumptions"><strong>Reglas de calidad:</strong> se excluyen fechas ausentes o inválidas, intervalos de duración cero/negativa, órdenes sin activo o tipo reconocido y movimientos con cantidades no positivas. Cuando no hay observaciones válidas se muestra «Sin datos»; no se reemplaza por cero. Los filtros de período se aplican a la fecha de creación de las órdenes y a la fecha de cierre/inicio de las intervenciones.</p>
        {report.invalidOrders > 0 && <p className="reports-warning">Se excluyeron {report.invalidOrders} órdenes por datos incompletos o tipo no reconocido.</p>}
      </Panel>
    </main>
  );
}

function selectedMovementLabel(total) {
  return total === 1 ? "1 unidad registrada" : "unidades registradas";
}

export default ReportsPage;
