
/*
 * ANDINACARE - GESTIÓN DE ACTIVOS INDUSTRIALES
 *
 * Esta pantalla permite:
 * - Consultar los activos registrados.
 * - Buscar equipos por código o nombre.
 * - Filtrar por tipo, criticidad y estado.
 * - Registrar nuevos activos.
 * - Abrir la ficha técnica de cada activo.
 * - Actualizar la ficha después de editar un activo.
 * - Escanear códigos QR para localizar activos.
 *
 * Los datos se consultan y almacenan localmente
 * mediante IndexedDB a través de assetService.
 */

import { useEffect, useMemo, useState } from "react";

import {
  Search,
  Plus,
  Factory,
  Filter,
  RefreshCw,
  X,
  QrCode,
} from "lucide-react";

import {
  getAllAssets,
  createAsset,
  ASSET_TYPES,
  ASSET_CRITICALITIES,
  ASSET_STATUSES,
} from "../../services/assets/assetService";

import AssetDetail from "./components/AssetDetail";
import AssetScanner from "./components/AssetScanner";

import Card from "../../components/common/Card";
import StatusBadge from "../../components/common/StatusBadge";

/*
 * Etiquetas que se muestran en pantalla.
 * Separamos los valores internos de los textos visibles.
 */

const TYPE_LABELS = {
  [ASSET_TYPES.EXTRUDER]: "Extrusora",
  [ASSET_TYPES.INJECTION]: "Inyectora",
  [ASSET_TYPES.COMPRESSOR]: "Compresor",
  [ASSET_TYPES.BOILER]: "Caldera",
  [ASSET_TYPES.CONVEYOR]: "Cinta transportadora",
  [ASSET_TYPES.MOLD]: "Molde",
};

const CRITICALITY_LABELS = {
  [ASSET_CRITICALITIES.LOW]: "Baja",
  [ASSET_CRITICALITIES.MEDIUM]: "Media",
  [ASSET_CRITICALITIES.HIGH]: "Alta",
  [ASSET_CRITICALITIES.CRITICAL]: "Crítica",
};

const TYPE_OPTIONS = Object.values(ASSET_TYPES).map((value) => ({
  value,
  label: TYPE_LABELS[value],
}));

const CRITICALITY_OPTIONS = Object.values(ASSET_CRITICALITIES).map(
  (value) => ({
    value,
    label: CRITICALITY_LABELS[value],
  })
);

const STATUS_OPTIONS = Object.values(ASSET_STATUSES).map((value) => ({
  value,
  label: value.replaceAll("_", " "),
}));

/*
 * Estado inicial del formulario de creación.
 */

const INITIAL_FORM_DATA = {
  code: "",
  name: "",
  type: ASSET_TYPES.EXTRUDER,
  criticality: ASSET_CRITICALITIES.MEDIUM,
  status: ASSET_STATUSES.OPERATIONAL,
  location: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  manufactureYear: "",
  acquisitionDate: "",
  installationDate: "",
  power: "",
  description: "",
};

function AssetsPage() {

  /*
   * ESTADOS PRINCIPALES
   */

  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /*
   * Controla la apertura y cierre del lector QR.
   */

  const [showScanner, setShowScanner] = useState(false);

  /*
   * ESTADOS DEL FORMULARIO DE CREACIÓN
   */

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  /*
   * CARGAR ACTIVOS DESDE INDEXEDDB
   */

  async function loadAssets() {
    try {
      setLoading(true);
      setError("");

      const records = await getAllAssets();

      setAssets(records);

    } catch (err) {

      console.error("Error al cargar activos:", err);

      setError(
        err.message || "No fue posible cargar los activos."
      );

    } finally {

      setLoading(false);

    }
  }

  /*
   * CARGA INICIAL DEL MÓDULO
   */

  useEffect(() => {
    loadAssets();
  }, []);

  /*
   * ACTUALIZAR FICHA DESPUÉS DE EDITAR UN ACTIVO
   */

  async function handleAssetUpdated(updatedAsset) {

    // Actualiza la ficha que se encuentra abierta.
    setSelectedAsset(updatedAsset);

    // Actualiza el listado desde IndexedDB.
    await loadAssets();

  }

  /*
   * ABRIR LA FICHA DE UN ACTIVO ENCONTRADO POR QR
   *
   * Esta función recibe el activo desde AssetScanner.
   */

  function handleAssetFound(asset) {

    // Cierra el lector QR.
    setShowScanner(false);

    // Guarda el activo seleccionado.
    setSelectedAsset(asset);

  }

  /*
   * ACTUALIZAR LOS CAMPOS DEL FORMULARIO
   */

  function handleFormChange(event) {

    const { name, value } = event.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));

  }

  /*
   * REGISTRAR UN NUEVO ACTIVO
   */

  async function handleCreateAsset(event) {

    event.preventDefault();

    try {

      setSaving(true);
      setFormError("");
      setFormSuccess("");

      const assetData = {
        ...formData,

        manufactureYear: formData.manufactureYear
          ? Number(formData.manufactureYear)
          : null,

        acquisitionDate: formData.acquisitionDate || null,

        installationDate: formData.installationDate || null,
      };

      await createAsset(assetData);

      setFormSuccess("Activo registrado correctamente.");

      // Limpia el formulario.
      setFormData(INITIAL_FORM_DATA);

      // Actualiza el listado desde IndexedDB.
      await loadAssets();

      // Cierra el formulario.
      setShowForm(false);

    } catch (err) {

      console.error("Error al registrar activo:", err);

      setFormError(
        err.message || "No fue posible registrar el activo."
      );

    } finally {

      setSaving(false);

    }

  }

  /*
   * FILTRADO LOCAL DE ACTIVOS
   */

  const filteredAssets = useMemo(() => {

    return assets.filter((asset) => {

      const normalizedSearch = searchTerm.trim().toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        asset.code?.toLowerCase().includes(normalizedSearch) ||
        asset.name?.toLowerCase().includes(normalizedSearch);

      const matchesType =
        !typeFilter || asset.type === typeFilter;

      const matchesCriticality =
        !criticalityFilter ||
        asset.criticality === criticalityFilter;

      const matchesStatus =
        !statusFilter || asset.status === statusFilter;

      return (
        matchesSearch &&
        matchesType &&
        matchesCriticality &&
        matchesStatus
      );

    });

  }, [
    assets,
    searchTerm,
    typeFilter,
    criticalityFilter,
    statusFilter,
  ]);

  /*
   * LIMPIAR TODOS LOS FILTROS
   */

  function clearFilters() {

    setSearchTerm("");
    setTypeFilter("");
    setCriticalityFilter("");
    setStatusFilter("");

  }

  /*
   * DETERMINAR SI EXISTEN FILTROS ACTIVOS
   */

  const hasActiveFilters =
    searchTerm !== "" ||
    typeFilter !== "" ||
    criticalityFilter !== "" ||
    statusFilter !== "";

  /*
   * MOSTRAR LA FICHA TÉCNICA
   *
   * Se utiliza tanto cuando el usuario selecciona un activo
   * del listado como cuando encuentra uno mediante QR.
   */

  if (selectedAsset) {

    return (

      <AssetDetail
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
        onAssetUpdated={handleAssetUpdated}
      />

    );

  }

  /*
   * INTERFAZ PRINCIPAL DEL MÓDULO
   */

  return (

    <div className="module-page assets-page">

      {/* LECTOR QR */}

      {showScanner && (

        <AssetScanner
          onAssetFound={handleAssetFound}
          onClose={() => setShowScanner(false)}
        />

      )}

      {/* ENCABEZADO */}

      <div className="module-page-header">

        <div>

          <h1>Gestión de activos</h1>

          <p>
            Administración de equipos industriales de
            Manufacturas Andina S.A.
          </p>

        </div>

        <div className="module-page-actions">

          <button
            type="button"
            className="button button-secondary"
            onClick={loadAssets}
            disabled={loading}
          >

            <RefreshCw size={18} />

            Actualizar

          </button>

          {/* BOTÓN PARA ABRIR EL LECTOR QR */}

          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowScanner(true)}
          >

            <QrCode size={18} />

            Escanear código QR

          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setShowForm(true);
              setFormError("");
              setFormSuccess("");
            }}
          >

            <Plus size={18} />

            Nuevo activo

          </button>

        </div>

      </div>

      {/* MENSAJES GENERALES */}

      {error && (

        <div className="alert alert-error">
          {error}
        </div>

      )}

      {formSuccess && (

        <div className="alert alert-success">
          {formSuccess}
        </div>

      )}

      {/* FORMULARIO DE CREACIÓN */}

      {showForm && (

        <Card>

          <div className="asset-form-header">

            <div>

              <h2>Registrar nuevo activo</h2>

              <p>
                Completa los datos del equipo industrial.
              </p>

            </div>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setShowForm(false);
                setFormError("");
              }}
              aria-label="Cerrar formulario"
            >

              <X size={18} />

            </button>

          </div>

          {formError && (

            <div className="alert alert-error">
              {formError}
            </div>

          )}

          <form onSubmit={handleCreateAsset}>

            <div className="asset-form-grid">

              <div className="form-group">

                <label htmlFor="asset-code">
                  Código *
                </label>

                <input
                  id="asset-code"
                  name="code"
                  value={formData.code}
                  onChange={handleFormChange}
                  placeholder="Ej: EXT-001"
                  required
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-name">
                  Nombre *
                </label>

                <input
                  id="asset-name"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="Ej: Extrusora principal"
                  required
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-type">
                  Tipo *
                </label>

                <select
                  id="asset-type"
                  name="type"
                  value={formData.type}
                  onChange={handleFormChange}
                  required
                >

                  {TYPE_OPTIONS.map((option) => (

                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>

                  ))}

                </select>

              </div>

              <div className="form-group">

                <label htmlFor="asset-criticality">
                  Criticidad *
                </label>

                <select
                  id="asset-criticality"
                  name="criticality"
                  value={formData.criticality}
                  onChange={handleFormChange}
                  required
                >

                  {CRITICALITY_OPTIONS.map((option) => (

                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>

                  ))}

                </select>

              </div>

              <div className="form-group">

                <label htmlFor="asset-status">
                  Estado *
                </label>

                <select
                  id="asset-status"
                  name="status"
                  value={formData.status}
                  onChange={handleFormChange}
                  required
                >

                  {STATUS_OPTIONS.map((option) => (

                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>

                  ))}

                </select>

              </div>

              <div className="form-group">

                <label htmlFor="asset-location">
                  Ubicación *
                </label>

                <input
                  id="asset-location"
                  name="location"
                  value={formData.location}
                  onChange={handleFormChange}
                  placeholder="Ej: Planta 1 - Línea A"
                  required
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-manufacturer">
                  Fabricante
                </label>

                <input
                  id="asset-manufacturer"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleFormChange}
                  placeholder="Fabricante"
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-model">
                  Modelo
                </label>

                <input
                  id="asset-model"
                  name="model"
                  value={formData.model}
                  onChange={handleFormChange}
                  placeholder="Modelo del equipo"
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-serial">
                  Número de serie
                </label>

                <input
                  id="asset-serial"
                  name="serialNumber"
                  value={formData.serialNumber}
                  onChange={handleFormChange}
                  placeholder="Número de serie"
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-year">
                  Año de fabricación
                </label>

                <input
                  id="asset-year"
                  name="manufactureYear"
                  type="number"
                  min="1900"
                  max="2100"
                  value={formData.manufactureYear}
                  onChange={handleFormChange}
                  placeholder="Ej: 2022"
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-acquisition">
                  Fecha de adquisición
                </label>

                <input
                  id="asset-acquisition"
                  name="acquisitionDate"
                  type="date"
                  value={formData.acquisitionDate}
                  onChange={handleFormChange}
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-installation">
                  Fecha de instalación
                </label>

                <input
                  id="asset-installation"
                  name="installationDate"
                  type="date"
                  value={formData.installationDate}
                  onChange={handleFormChange}
                />

              </div>

              <div className="form-group">

                <label htmlFor="asset-power">
                  Potencia
                </label>

                <input
                  id="asset-power"
                  name="power"
                  value={formData.power}
                  onChange={handleFormChange}
                  placeholder="Ej: 75 kW"
                />

              </div>

              <div className="form-group asset-form-full">

                <label htmlFor="asset-description">
                  Descripción
                </label>

                <textarea
                  id="asset-description"
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows="4"
                  placeholder="Descripción técnica del equipo..."
                />

              </div>

            </div>

            <div className="asset-form-actions">

              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setShowForm(false);
                  setFormData(INITIAL_FORM_DATA);
                  setFormError("");
                }}
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="button button-primary"
                disabled={saving}
              >
                {saving ? "Guardando..." : "Registrar activo"}
              </button>

            </div>

          </form>

        </Card>

      )}

      {/* RESUMEN */}

      <div className="assets-summary">

        <Card>

          <div className="assets-summary-item">

            <Factory size={22} />

            <div>

              <strong>{assets.length}</strong>

              <span>Activos registrados</span>

            </div>

          </div>

        </Card>

        <Card>

          <div className="assets-summary-item">

            <Filter size={22} />

            <div>

              <strong>{filteredAssets.length}</strong>

              <span>Resultados encontrados</span>

            </div>

          </div>

        </Card>

      </div>

      {/* BÚSQUEDA Y FILTROS */}

      <Card>

        <div className="assets-filters">

          <div className="assets-search">

            <Search size={19} />

            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por código o nombre..."
              aria-label="Buscar activos"
            />

          </div>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Filtrar por tipo"
          >

            <option value="">
              Todos los tipos
            </option>

            {TYPE_OPTIONS.map((option) => (

              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>

            ))}

          </select>

          <select
            value={criticalityFilter}
            onChange={(event) =>
              setCriticalityFilter(event.target.value)
            }
            aria-label="Filtrar por criticidad"
          >

            <option value="">
              Todas las criticidades
            </option>

            {CRITICALITY_OPTIONS.map((option) => (

              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>

            ))}

          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar por estado"
          >

            <option value="">
              Todos los estados
            </option>

            {STATUS_OPTIONS.map((option) => (

              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>

            ))}

          </select>

          {hasActiveFilters && (

            <button
              type="button"
              className="button button-secondary"
              onClick={clearFilters}
            >

              <X size={16} />

              Limpiar filtros

            </button>

          )}

        </div>

      </Card>

      {/* LISTADO DE ACTIVOS */}

      <div className="assets-list-header">

        <h2>Equipos registrados</h2>

        <span>{filteredAssets.length} activos</span>

      </div>

      {loading ? (

        <Card>
          <p>Cargando activos...</p>
        </Card>

      ) : filteredAssets.length === 0 ? (

        <Card>

          <div className="assets-empty">

            <Factory size={38} />

            <h3>No se encontraron activos</h3>

            <p>
              No hay equipos que coincidan con los criterios
              de búsqueda seleccionados.
            </p>

            {hasActiveFilters && (

              <button
                type="button"
                className="button button-secondary"
                onClick={clearFilters}
              >
                Limpiar filtros
              </button>

            )}

          </div>

        </Card>

      ) : (

        <div className="assets-grid">

          {filteredAssets.map((asset) => (

            <Card key={asset.id}>

              <button
                type="button"
                className="asset-card-button"
                onClick={() => setSelectedAsset(asset)}
              >

                <div className="asset-card-header">

                  <div className="asset-card-icon">

                    <Factory size={23} />

                  </div>

                  <StatusBadge status={asset.status} />

                </div>

                <div className="asset-card-content">

                  <span className="asset-card-code">
                    {asset.code}
                  </span>

                  <h3>{asset.name}</h3>

                  <p>
                    {TYPE_LABELS[asset.type] || asset.type}
                  </p>

                </div>

                <div className="asset-card-details">

                  <div>

                    <span>Ubicación</span>

                    <strong>{asset.location}</strong>

                  </div>

                  <div>

                    <span>Criticidad</span>

                    <strong>
                      {CRITICALITY_LABELS[asset.criticality] ||
                        asset.criticality}
                    </strong>

                  </div>

                </div>

                <div className="asset-card-footer">
                  Consultar ficha técnica
                </div>

              </button>

            </Card>

          ))}

        </div>

      )}

    </div>

  );

}

export default AssetsPage;
