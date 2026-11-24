
/*
 * ANDINACARE - PANTALLA BASE DE LOS MÓDULOS
 *
 * Conecta las pantallas funcionales y registra
 * los accesos a cada módulo en Auditoría.
 */

import { useEffect } from "react";
import { useParams } from "react-router";

import {
  LayoutDashboard,
  Factory,
  ClipboardList,
  ShieldCheck,
  Package,
  Users,
  ChartNoAxesCombined,
  History,
  Construction,
  Columns3,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { recordAuditEvent } from "../services/audit/auditService";

import Card from "../components/common/Card";
import StatusBadge from "../components/common/StatusBadge";

import AuditPage from "./audit/AuditPage";
import UsersPage from "./users/UsersPage";
import AssetsPage from "./assets/AssetsPage";
import WorkOrdersPage from "./work-orders/WorkOrdersPage";
import WorkOrdersKanbanPage from "./work-orders/WorkOrdersKanbanPage";
import InventoryPage from "./inventory/InventoryPage";
import DashboardPage from "./dashboard/DashboardPage";
import ReportsPage from "./reports/ReportsPage";
import SafetyPage from "./safety/SafetyPage";

// --------------------------------------------------
// CONFIGURACIÓN DE MÓDULOS
// --------------------------------------------------

const modules = {
  dashboard: {
    title: "Dashboard",
    description: "Vista general del mantenimiento industrial.",
    detail: "Aquí se visualizarán indicadores, alertas y el estado general de las operaciones de mantenimiento.",
    icon: LayoutDashboard,
    auditModule: "dashboard",
  },

  assets: {
    title: "Activos",
    description: "Administración de equipos y maquinaria industrial.",
    detail: "Aquí se podrán consultar las fichas técnicas, identificar equipos mediante QR y revisar su historial de mantenimiento.",
    icon: Factory,
    auditModule: "assets",
  },

  "work-orders": {
    title: "Órdenes de trabajo",
    description: "Gestión y seguimiento de las intervenciones.",
    detail: "Aquí se organizarán las órdenes de trabajo, sus prioridades, responsables y estados de ejecución.",
    icon: ClipboardList,
    auditModule: "workOrders",
  },

  "work-orders-kanban": {
    title: "Tablero Kanban",
    description: "Seguimiento visual de las órdenes de trabajo.",
    detail: "Visualización de las órdenes por estado, prioridad, técnico y especialidad.",
    icon: Columns3,
    auditModule: "workOrders",
  },

  safety: {
    title: "Seguridad",
    description: "Procedimientos de seguridad antes de intervenir equipos.",
    detail: "Aquí se administran las listas de verificación de seguridad y los registros asociados a los trabajos.",
    icon: ShieldCheck,
    auditModule: "safety",
  },

  inventory: {
    title: "Inventario",
    description: "Control de repuestos y materiales.",
    detail: "Aquí se administrarán las existencias, reservas, entregas y movimientos de repuestos.",
    icon: Package,
    auditModule: "inventory",
  },

  users: {
    title: "Usuarios",
    description: "Administración de usuarios y perfiles.",
    detail: "Aquí se gestionarán los usuarios, roles y permisos de acceso.",
    icon: Users,
    auditModule: "users",
  },

  reports: {
    title: "Reportes",
    description: "Indicadores y análisis del mantenimiento.",
    detail: "Aquí se presentarán métricas como MTTR, MTBF y tiempos de indisponibilidad.",
    icon: ChartNoAxesCombined,
    auditModule: "reports",
  },

  audit: {
    title: "Auditoría",
    description: "Trazabilidad de las acciones realizadas.",
    detail: "Aquí se consultará el historial de eventos y modificaciones registrados por el sistema.",
    icon: History,
    auditModule: "audit",
  },
};

// --------------------------------------------------
// COMPONENTE PRINCIPAL
// --------------------------------------------------

function ModulePage() {
  const { section } = useParams();
  const { user } = useAuth();

  const currentModule = modules[section];

  // ------------------------------------------------
  // REGISTRO DE NAVEGACIÓN
  // ------------------------------------------------

  useEffect(() => {
    if (!user || !currentModule) return;

    let cancelled = false;

    async function registerNavigation() {
      try {
        await recordAuditEvent({
          action: "MODULE_ACCESS",
          entityType: "navigation",
          entityId: section,
          module: currentModule.auditModule,
          details: `${user.name} ingresó al módulo ${currentModule.title}.`,
          afterData: {
            section,
            moduleName: currentModule.title,
            path: window.location.pathname,
            accessType: "MODULE_ENTRY",
          },
          actor: user,
        });
      } catch (error) {
        if (!cancelled) {
          console.error(
            "No se pudo registrar el acceso al módulo:",
            error
          );
        }
      }
    }

    registerNavigation();

    return () => {
      cancelled = true;
    };
  }, [section, user, currentModule]);

  // ------------------------------------------------
  // VALIDACIÓN DE MÓDULO
  // ------------------------------------------------

  if (!currentModule) {
    return (
      <section className="module-page">
        <h1>404 - Página no encontrada</h1>
        <p>La sección solicitada no existe en AndinaCare.</p>
      </section>
    );
  }

  // ------------------------------------------------
  // PANTALLAS FUNCIONALES
  // ------------------------------------------------

  if (section === "dashboard") return <DashboardPage />;
  if (section === "reports") return <ReportsPage />;
  if (section === "audit") return <AuditPage />;
  if (section === "users") return <UsersPage />;
  if (section === "assets") return <AssetsPage />;
  if (section === "work-orders") return <WorkOrdersPage />;
  if (section === "work-orders-kanban") return <WorkOrdersKanbanPage />;
  if (section === "inventory") return <InventoryPage />;
  if (section === "safety") return <SafetyPage />;

  // ------------------------------------------------
  // MÓDULO EN PREPARACIÓN
  // ------------------------------------------------

  const Icon = currentModule.icon;

  return (
    <section className="module-page">
      <div className="page-heading">
        <div className="page-heading__main">
          <div className="page-heading__icon">
            <Icon size={27} />
          </div>

          <div>
            <span className="page-heading__eyebrow">
              MÓDULO ANDINACARE
            </span>

            <h1>{currentModule.title}</h1>
            <p>{currentModule.description}</p>
          </div>
        </div>

        <StatusBadge tone="info">
          En preparación
        </StatusBadge>
      </div>

      <Card className="module-intro-card">
        <div className="module-intro">
          <div className="module-intro__icon">
            <Construction size={30} />
          </div>

          <div>
            <h2>Espacio de trabajo del módulo</h2>
            <p>{currentModule.detail}</p>

            <span>
              Esta sección se implementará en su etapa de desarrollo correspondiente.
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}

export default ModulePage;
