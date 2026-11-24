
/*
 * ANDINACARE - FICHA TÉCNICA DE ACTIVOS
 *
 * Permite:
 * 1. Consultar información técnica.
 * 2. Editar activos.
 * 3. Mostrar códigos QR.
 * 4. Consultar las últimas cinco intervenciones.
 * 5. Mostrar técnico responsable y trabajo realizado.
 * 6. Visualizar fotografías ANTES y DESPUÉS.
 * 7. Consultar información almacenada localmente.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import {
  X,
  Factory,
  MapPin,
  Calendar,
  Settings,
  Hash,
  Zap,
  QrCode,
  Pencil,
  Save,
  XCircle,
  FileText,
  History,
  Clock,
  Wrench,
  User,
  ClipboardList,
  Image as ImageIcon,
} from "lucide-react";

import Card from "../../../components/common/Card";
import StatusBadge from "../../../components/common/StatusBadge";

import {
  updateAsset,
  getAssetMaintenanceHistory,
  ASSET_TYPES,
  ASSET_CRITICALITIES,
  ASSET_STATUSES,
} from "../../../services/assets/assetService";

import { getCurrentUser } from "../../../services/auth/authService";

import {
  ACTIONS,
  hasPermission,
} from "../../../services/auth/permissions";

/*
 * TRADUCCIONES
 */

const TYPE_LABELS = {
  [ASSET_TYPES.EXTRUDER]: "Extrusora",
  [ASSET_TYPES.INJECTION]: "Inyectora",
  [ASSET_TYPES.COMPRESSOR]: "Compresor",
  [ASSET_TYPES.BOILER]: "Caldera",
  [ASSET_TYPES.CONVEYOR]: "Cinta transportadora",
  [ASSET_TYPES.MOLD]: "Molde industrial",
};

const CRITICALITY_LABELS = {
  [ASSET_CRITICALITIES.LOW]: "Baja",
  [ASSET_CRITICALITIES.MEDIUM]: "Media",
  [ASSET_CRITICALITIES.HIGH]: "Alta",
  [ASSET_CRITICALITIES.CRITICAL]: "Crítica",
};

const STATUS_LABELS = {
  [ASSET_STATUSES.OPERATIONAL]: "Operativo",
  [ASSET_STATUSES.MAINTENANCE]: "En mantenimiento",
  [ASSET_STATUSES.STOPPED]: "Detenido",
  [ASSET_STATUSES.OUT_OF_SERVICE]: "Fuera de servicio",
};

/*
 * PREPARAR DATOS DEL FORMULARIO
 */

function buildFormData(asset) {
  return {
    code: asset.code || "",
    name: asset.name || "",
    type: asset.type || "",
    criticality: asset.criticality || "",
    status: asset.status || ASSET_STATUSES.OPERATIONAL,
    location: asset.location || "",
    manufacturer: asset.manufacturer || "",
    model: asset.model || "",
    serialNumber: asset.serialNumber || "",
    manufactureYear: asset.manufactureYear ?? "",
    acquisitionDate: asset.acquisitionDate || "",
    installationDate: asset.installationDate || "",
    power: asset.power || "",
    description: asset.description || "",
  };
}

/*
 * FORMATEAR FECHAS
 */

function formatDate(date) {
  if (!date) {
    return "No informada";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Fecha no válida";
  }

  return parsedDate.toLocaleString("es-CL");
}

/*
 * CAMPO DE INFORMACIÓN TÉCNICA
 */

function TechnicalField({ icon: Icon, label, value }) {
  return (
    <div className="asset-detail-field">
      <div className="asset-detail-field-icon">
        <Icon size={18} />
      </div>

      <div className="asset-detail-field-content">
        <span className="asset-detail-field-label">
          {label}
        </span>

        <strong className="asset-detail-field-value">
          {value || "No informado"}
        </strong>
      </div>
    </div>
  );
}

/*
 * GALERÍA DE FOTOGRAFÍAS
 *
 * Muestra las imágenes almacenadas en IndexedDB.
 * No muestra los nombres originales de los archivos.
 */

function MaintenancePhotoGroup({
  title,
  photos,
  photoUrls,
}) {
  return (
    <div style={{ marginTop: "20px" }}>
      <h4
        style={{
          marginBottom: "12px",
          fontSize: "14px",
          fontWeight: 700,
        }}
      >
        {title} ({photos.length})
      </h4>

      {photos.length === 0 ? (
        <p
          style={{
            fontSize: "13px",
            opacity: 0.7,
            margin: 0,
          }}
        >
          No hay fotografías registradas.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: "14px",
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                minWidth: 0,
                border: "1px solid var(--border-color, #d1d5db)",
                borderRadius: "10px",
                overflow: "hidden",
                background: "var(--card-bg, #ffffff)",
                color: "#1f2937",
              }}
            >
              {photoUrls[photo.id] ? (
                <a
                  href={photoUrls[photo.id]}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir fotografía"
                  style={{
                    display: "block",
                    background: "#f3f4f6",
                  }}
                >
                  <img
                    src={photoUrls[photo.id]}
                    alt={`Fotografía ${title.toLowerCase()}`}
                    loading="lazy"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "150px",
                      objectFit: "contain",
                    }}
                  />
                </a>
              ) : (
                <div
                  style={{
                    height: "150px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#f3f4f6",
                    color: "#6b7280",
                  }}
                >
                  <ImageIcon size={28} />
                </div>
              )}

              <div
                style={{
                  padding: "9px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <strong style={{ fontSize: "12px" }}>
                  Fotografía de mantenimiento
                </strong>

                <span
                  style={{
                    fontSize: "11px",
                    opacity: 0.7,
                  }}
                >
                  {formatDate(photo.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/*
 * COMPONENTE PRINCIPAL
 */

function AssetDetail({
  asset,
  onClose,
  onAssetUpdated,
}) {
  /*
   * PERMISOS
   */

  const [canEdit, setCanEdit] = useState(false);

  /*
   * EDICIÓN
   */

  const [editing, setEditing] = useState(false);

  const [formData, setFormData] = useState(
    () => buildFormData(asset)
  );

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /*
   * CÓDIGO QR
   */

  const [qrImage, setQrImage] = useState("");
  const [qrError, setQrError] = useState("");

  /*
   * HISTORIAL DE MANTENIMIENTO
   */

  const [maintenanceHistory, setMaintenanceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  /*
   * URL TEMPORALES DE LAS FOTOGRAFÍAS
   */

  const [photoUrls, setPhotoUrls] = useState({});

  useEffect(() => {
    const generatedUrls = [];
    const urlsByPhotoId = {};

    maintenanceHistory.forEach((intervention) => {
      const photos = intervention.photos || [];

      photos.forEach((photo) => {
        if (
          photo.blob &&
          photo.id &&
          typeof URL !== "undefined" &&
          typeof URL.createObjectURL === "function"
        ) {
          try {
            const url = URL.createObjectURL(photo.blob);

            urlsByPhotoId[photo.id] = url;
            generatedUrls.push(url);
          } catch (error) {
            console.error(
              "No fue posible preparar una fotografía:",
              error
            );
          }
        }
      });
    });

    setPhotoUrls(urlsByPhotoId);

    return () => {
      generatedUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [maintenanceHistory]);

  /*
   * COMPROBAR PERMISOS DE EDICIÓN
   */

  useEffect(() => {
    let active = true;

    async function checkPermissions() {
      try {
        const user = await getCurrentUser();

        if (active) {
          setCanEdit(
            Boolean(
              user &&
              hasPermission(
                user.role,
                "assets",
                ACTIONS.UPDATE
              )
            )
          );
        }
      } catch (error) {
        console.error(
          "Error comprobando permisos:",
          error
        );

        if (active) {
          setCanEdit(false);
        }
      }
    }

    checkPermissions();

    return () => {
      active = false;
    };
  }, []);

  /*
   * ACTUALIZAR FORMULARIO CUANDO CAMBIA EL ACTIVO
   */

  useEffect(() => {
    setFormData(buildFormData(asset));
    setEditing(false);
    setError("");
    setSuccess("");
  }, [asset]);

  /*
   * GENERAR CÓDIGO QR
   */

  useEffect(() => {
    let active = true;

    async function generateAssetQRCode() {
      setQrImage("");
      setQrError("");

      if (!asset.qrCode) {
        setQrError(
          "Este activo todavía no tiene un identificador QR."
        );
        return;
      }

      try {
        const imageData = await QRCode.toDataURL(
          asset.qrCode,
          {
            width: 260,
            margin: 2,
            errorCorrectionLevel: "M",
            color: {
              dark: "#111827",
              light: "#FFFFFF",
            },
          }
        );

        if (active) {
          setQrImage(imageData);
        }
      } catch (error) {
        console.error("Error generando QR:", error);

        if (active) {
          setQrError(
            "No fue posible generar la imagen QR."
          );
        }
      }
    }

    generateAssetQRCode();

    return () => {
      active = false;
    };
  }, [asset.qrCode]);

  /*
   * CONSULTAR HISTORIAL DE MANTENIMIENTO
   */

  useEffect(() => {
    let active = true;

    async function loadMaintenanceHistory() {
      setHistoryLoading(true);
      setHistoryError("");
      setMaintenanceHistory([]);

      try {
        const history = await getAssetMaintenanceHistory(
          asset.id
        );

        if (active) {
          setMaintenanceHistory(
            Array.isArray(history) ? history : []
          );
        }
      } catch (error) {
        console.error(
          "Error consultando historial:",
          error
        );

        if (active) {
          setHistoryError(
            error.message ||
            "No fue posible consultar el historial."
          );
        }
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    }

    loadMaintenanceHistory();

    return () => {
      active = false;
    };
  }, [asset.id]);

  /*
   * INICIAR EDICIÓN
   */

  function handleStartEdit() {
    setFormData(buildFormData(asset));
    setError("");
    setSuccess("");
    setEditing(true);
  }

  /*
   * CANCELAR EDICIÓN
   */

  function handleCancelEdit() {
    setFormData(buildFormData(asset));
    setError("");
    setSuccess("");
    setEditing(false);
  }

  /*
   * CAMBIAR CAMPOS
   */

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));
  }

  /*
   * GUARDAR CAMBIOS
   */

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        ...formData,

        manufactureYear:
          formData.manufactureYear === ""
            ? null
            : Number(formData.manufactureYear),
      };

      const updatedAsset = await updateAsset(
        asset.id,
        payload
      );

      setEditing(false);

      setSuccess(
        "La ficha técnica se actualizó correctamente."
      );

      if (onAssetUpdated) {
        await onAssetUpdated(updatedAsset);
      }
    } catch (error) {
      console.error(
        "Error actualizando activo:",
        error
      );

      setError(
        error.message ||
        "No fue posible actualizar la ficha técnica."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * OPCIONES DE LOS SELECTORES
   */

  const typeOptions = Object.values(ASSET_TYPES);
  const criticalityOptions = Object.values(ASSET_CRITICALITIES);
  const statusOptions = Object.values(ASSET_STATUSES);

  /*
   * PRESENTACIÓN
   */

  return (
    <section className="asset-detail-page">

      {/* ENCABEZADO */}

      <div className="module-header">
        <div>
          <span className="module-eyebrow">
            GESTIÓN DE ACTIVOS
          </span>

          <h1>Ficha técnica del activo</h1>

          <p>
            Información y características del equipo industrial.
          </p>
        </div>

        <div className="assets-form-actions">
          {canEdit && !editing && (
            <button
              type="button"
              className="button button-primary"
              onClick={handleStartEdit}
            >
              <Pencil size={16} />
              Editar ficha técnica
            </button>
          )}

          <button
            type="button"
            className="button button-secondary"
            onClick={
              editing
                ? handleCancelEdit
                : onClose
            }
          >
            <X size={16} />

            {editing
              ? "Cancelar edición"
              : "Volver al listado"}
          </button>
        </div>
      </div>

      {/* MENSAJES */}

      {error && (
        <div className="assets-message assets-message-error">
          {error}
        </div>
      )}

      {success && (
        <div className="assets-message assets-message-success">
          {success}
        </div>
      )}

      {/* MODO EDICIÓN */}

      {editing ? (
        <Card>
          <div className="card-header">
            <div>
              <h2>Editar información del equipo</h2>
              <p>
                Modifica los campos y guarda los cambios.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="assets-form"
          >
            <div className="assets-filters">

              <div className="form-group">
                <label htmlFor="edit-code">
                  Código del activo *
                </label>
                <input
                  id="edit-code"
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  required
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-name">
                  Nombre del equipo *
                </label>
                <input
                  id="edit-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  maxLength={120}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-type">
                  Tipo de activo *
                </label>
                <select
                  id="edit-type"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                >
                  <option value="">
                    Seleccionar tipo
                  </option>

                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type] || type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-criticality">
                  Criticidad *
                </label>
                <select
                  id="edit-criticality"
                  name="criticality"
                  value={formData.criticality}
                  onChange={handleChange}
                  required
                >
                  <option value="">
                    Seleccionar criticidad
                  </option>

                  {criticalityOptions.map((value) => (
                    <option key={value} value={value}>
                      {CRITICALITY_LABELS[value] || value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-status">
                  Estado *
                </label>
                <select
                  id="edit-status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                >
                  {statusOptions.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value] || value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-location">
                  Ubicación *
                </label>
                <input
                  id="edit-location"
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  required
                  maxLength={120}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-manufacturer">
                  Fabricante
                </label>
                <input
                  id="edit-manufacturer"
                  type="text"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleChange}
                  maxLength={120}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-model">
                  Modelo
                </label>
                <input
                  id="edit-model"
                  type="text"
                  name="model"
                  value={formData.model}
                  onChange={handleChange}
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-serialNumber">
                  Número de serie
                </label>
                <input
                  id="edit-serialNumber"
                  type="text"
                  name="serialNumber"
                  value={formData.serialNumber}
                  onChange={handleChange}
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-manufactureYear">
                  Año de fabricación
                </label>
                <input
                  id="edit-manufactureYear"
                  type="number"
                  name="manufactureYear"
                  value={formData.manufactureYear}
                  onChange={handleChange}
                  min="1900"
                  max={new Date().getFullYear()}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-acquisitionDate">
                  Fecha de adquisición
                </label>
                <input
                  id="edit-acquisitionDate"
                  type="date"
                  name="acquisitionDate"
                  value={formData.acquisitionDate}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-installationDate">
                  Fecha de instalación
                </label>
                <input
                  id="edit-installationDate"
                  type="date"
                  name="installationDate"
                  value={formData.installationDate}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-power">
                  Potencia
                </label>
                <input
                  id="edit-power"
                  type="text"
                  name="power"
                  value={formData.power}
                  onChange={handleChange}
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-description">
                  Descripción técnica
                </label>
                <textarea
                  id="edit-description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  maxLength={1000}
                />
              </div>

            </div>

            <div className="assets-form-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <XCircle size={16} />
                Cancelar
              </button>

              <button
                type="submit"
                className="button button-primary"
                disabled={saving}
              >
                <Save size={16} />

                {saving
                  ? "Guardando..."
                  : "Guardar cambios"}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <>

          {/* IDENTIFICACIÓN DEL ACTIVO */}

          <Card>
            <div className="card-header">
              <div>
                <h2>Identificación del activo</h2>
                <p>
                  Datos generales y clasificación del equipo.
                </p>
              </div>

              <StatusBadge status={asset.status} />
            </div>

            <div className="asset-detail-grid">
              <TechnicalField
                icon={Hash}
                label="Código"
                value={asset.code}
              />

              <TechnicalField
                icon={Factory}
                label="Nombre"
                value={asset.name}
              />

              <TechnicalField
                icon={Settings}
                label="Tipo"
                value={TYPE_LABELS[asset.type] || asset.type}
              />

              <TechnicalField
                icon={MapPin}
                label="Ubicación"
                value={asset.location}
              />

              <TechnicalField
                icon={Settings}
                label="Criticidad"
                value={
                  CRITICALITY_LABELS[asset.criticality] ||
                  asset.criticality
                }
              />

              <TechnicalField
                icon={Settings}
                label="Estado"
                value={
                  STATUS_LABELS[asset.status] ||
                  asset.status
                }
              />
            </div>
          </Card>

          {/* CARACTERÍSTICAS TÉCNICAS */}

          <Card>
            <div className="card-header">
              <div>
                <h2>Características técnicas</h2>
                <p>
                  Especificaciones del fabricante y del equipo.
                </p>
              </div>
            </div>

            <div className="asset-detail-grid">
              <TechnicalField
                icon={Factory}
                label="Fabricante"
                value={asset.manufacturer}
              />

              <TechnicalField
                icon={Settings}
                label="Modelo"
                value={asset.model}
              />

              <TechnicalField
                icon={Hash}
                label="Número de serie"
                value={asset.serialNumber}
              />

              <TechnicalField
                icon={Calendar}
                label="Año de fabricación"
                value={asset.manufactureYear}
              />

              <TechnicalField
                icon={Zap}
                label="Potencia"
                value={asset.power}
              />
            </div>
          </Card>

          {/* FECHAS IMPORTANTES */}

          <Card>
            <div className="card-header">
              <h2>Fechas importantes</h2>
            </div>

            <div className="asset-detail-grid">
              <TechnicalField
                icon={Calendar}
                label="Fecha de adquisición"
                value={asset.acquisitionDate}
              />

              <TechnicalField
                icon={Calendar}
                label="Fecha de instalación"
                value={asset.installationDate}
              />
            </div>
          </Card>

          {/* DESCRIPCIÓN */}

          <Card>
            <div className="card-header">
              <h2>Descripción técnica</h2>
            </div>

            <div className="asset-detail-description">
              <FileText size={20} />

              <p>
                {asset.description ||
                  "No existe una descripción registrada."}
              </p>
            </div>
          </Card>

          {/* HISTORIAL DE MANTENIMIENTO */}

          <Card>
            <div className="card-header">
              <div>
                <h2>
                  <History
                    size={21}
                    style={{
                      display: "inline",
                      verticalAlign: "middle",
                      marginRight: "8px",
                    }}
                  />
                  Historial de mantenimiento
                </h2>

                <p>
                  Últimas cinco intervenciones registradas.
                </p>
              </div>
            </div>

            {historyLoading ? (
              <p>
                Cargando historial de mantenimiento...
              </p>
            ) : historyError ? (
              <div className="assets-message assets-message-error">
                {historyError}
              </div>
            ) : maintenanceHistory.length === 0 ? (
              <div className="asset-detail-description">
                <History size={22} />

                <p>
                  Este activo todavía no tiene intervenciones
                  de mantenimiento registradas.
                </p>
              </div>
            ) : (
              <div className="asset-maintenance-history">

                {maintenanceHistory.map((intervention, index) => {
                  const beforePhotos =
                    intervention.beforePhotos || [];

                  const afterPhotos =
                    intervention.afterPhotos || [];

                  const workDescription =
                    intervention.workDescription ||
                    intervention.workPerformed ||
                    intervention.description ||
                    intervention.notes ||
                    "";

                  const orderTitle =
                    intervention.workOrderTitle ||
                    intervention.workOrderCode ||
                    "Orden de trabajo";

                  const orderCode =
                    intervention.workOrderCode || "";

                  const isCompleted = Boolean(
                    intervention.completedAt
                  );

                  return (
                    <article
                      key={intervention.id}
                      className="asset-history-item"
                      style={{
                        marginBottom: "20px",
                      }}
                    >

                      {/* ORDEN Y ESTADO */}

                      <div className="asset-history-item-header">
                        <div className="asset-history-icon">
                          <Wrench size={20} />
                        </div>

                        <div>
                          <h3>
                            {orderCode || `Intervención ${index + 1}`}
                          </h3>

                          <span>
                            {orderTitle}
                          </span>
                        </div>

                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: "12px",
                            fontWeight: 600,
                            padding: "5px 10px",
                            borderRadius: "20px",
                            background: isCompleted
                              ? "#dcfce7"
                              : "#fef3c7",
                            color: isCompleted
                              ? "#166534"
                              : "#92400e",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isCompleted
                            ? "Finalizada"
                            : "En ejecución"}
                        </span>
                      </div>

                      {/* DATOS PRINCIPALES */}

                      <div className="asset-detail-grid">
                        <TechnicalField
                          icon={ClipboardList}
                          label="Tipo de mantenimiento"
                          value={intervention.type}
                        />

                        <TechnicalField
                          icon={Calendar}
                          label="Fecha de inicio"
                          value={formatDate(intervention.startedAt)}
                        />

                        <TechnicalField
                          icon={Clock}
                          label="Fecha de finalización"
                          value={
                            isCompleted
                              ? formatDate(intervention.completedAt)
                              : "Pendiente"
                          }
                        />

                        <TechnicalField
                          icon={User}
                          label="Técnico responsable"
                          value={
                            intervention.technicianName ||
                            intervention.technicianId ||
                            "No identificado"
                          }
                        />
                      </div>

                      {/* TRABAJO REALIZADO */}

                      <div
                        style={{
                          marginTop: "18px",
                          padding: "14px",
                          borderRadius: "10px",
                          background: "var(--surface-secondary, #f3f4f6)",
                          color: "#1f2937",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "8px",
                          }}
                        >
                          <FileText size={18} />

                          <strong>
                            Trabajo realizado
                          </strong>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            lineHeight: 1.6,
                          }}
                        >
                          {workDescription ||
                            "No se registró una descripción del trabajo realizado."}
                        </p>
                      </div>

                      {/* FOTOGRAFÍAS */}

                      <MaintenancePhotoGroup
                        title="Fotografías ANTES"
                        photos={beforePhotos}
                        photoUrls={photoUrls}
                      />

                      <MaintenancePhotoGroup
                        title="Fotografías DESPUÉS"
                        photos={afterPhotos}
                        photoUrls={photoUrls}
                      />

                    </article>
                  );
                })}

              </div>
            )}
          </Card>

          {/* CÓDIGO QR */}

          <Card>
            <div className="card-header">
              <h2>Identificación QR</h2>
            </div>

            <div className="asset-detail-qr">
              <div className="asset-detail-qr-image">
                {qrImage ? (
                  <img
                    src={qrImage}
                    alt={`Código QR del activo ${asset.code}`}
                    width="260"
                    height="260"
                  />
                ) : (
                  <div className="asset-detail-qr-placeholder">
                    <QrCode size={42} />

                    <span>
                      {qrError || "Generando código QR..."}
                    </span>
                  </div>
                )}
              </div>

              <div className="asset-detail-qr-information">
                <strong>Código QR del activo</strong>

                <p>
                  {asset.qrCode || "Código QR pendiente"}
                </p>

                {qrImage && (
                  <a
                    href={qrImage}
                    download={`QR-${asset.code || asset.id}.png`}
                    className="button button-secondary"
                  >
                    Descargar código QR
                  </a>
                )}
              </div>
            </div>

            <p className="module-description">
              Este código QR representa el identificador único
              del activo y se mantiene aunque se edite su ficha.
            </p>
          </Card>

          {/* INFORMACIÓN DEL REGISTRO */}

          <Card>
            <div className="card-header">
              <h2>Información del registro</h2>
            </div>

            <div className="asset-detail-grid">
              <TechnicalField
                icon={Calendar}
                label="Fecha de creación"
                value={formatDate(asset.createdAt)}
              />

              <TechnicalField
                icon={Calendar}
                label="Última actualización"
                value={formatDate(asset.updatedAt)}
              />
            </div>
          </Card>

        </>
      )}
    </section>
  );
}

export default AssetDetail;
