
/*
 * ANDINACARE - ADMINISTRACIÓN DE USUARIOS
 *
 * Gestión de cuentas, roles, especialidades y RUT.
 *
 * El RUT identifica al técnico que confirma
 * los controles de seguridad AST/LOTO.
 */

import { useEffect, useState } from "react";

import {
  Users,
  UserPlus,
  Search,
  Pencil,
  UserCheck,
  UserX,
  X,
  Save,
  RefreshCw,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

import {
  getAllUsers,
  createUser,
  updateUser,
  setUserActive,
  TECHNICIAN_SPECIALTIES,
  normalizeChileanRut,
  validateChileanRut,
} from "../../services/auth/userManagementService";

// --------------------------------------------------
// CONFIGURACIÓN DE ROLES
// --------------------------------------------------

const ROLE_LABELS = {
  TECHNICIAN: "Técnico de terreno",
  MAINTENANCE_MANAGER: "Jefe de mantenimiento",
  WAREHOUSE_MANAGER: "Encargado de bodega",
  PLANT_OPERATOR: "Operador de planta",
  ADMIN_AUDITOR: "Administrador / Auditor",
};

const AVAILABLE_ROLES = Object.entries(ROLE_LABELS);

// --------------------------------------------------
// FORMATO DE RUT
// --------------------------------------------------

function formatRut(value) {
  const rut = normalizeChileanRut(value);

  if (rut.length < 2) return rut;

  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);

  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${verifier}`;
}

// --------------------------------------------------
// DATOS INICIALES
// --------------------------------------------------

function getEmptyFormData() {
  return {
    name: "",
    email: "",
    role: "TECHNICIAN",
    specialty: "",
    rut: "",
  };
}

// --------------------------------------------------
// COMPONENTE PRINCIPAL
// --------------------------------------------------

function UsersPage() {
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState(
    getEmptyFormData()
  );

  const isAdmin = user?.role === "ADMIN_AUDITOR";
  const isTechnician = formData.role === "TECHNICIAN";

  // ------------------------------------------------
  // CARGAR USUARIOS
  // ------------------------------------------------

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const result = await getAllUsers();

      setUsers(result);
    } catch (err) {
      console.error("Error al cargar usuarios:", err);

      setError(
        err.message || "No fue posible cargar los usuarios."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // ------------------------------------------------
  // FILTRAR USUARIOS
  // ------------------------------------------------

  const filteredUsers = users.filter((item) => {
    const searchText = search.toLowerCase().trim();

    const matchesSearch =
      (item.name || "").toLowerCase().includes(searchText) ||
      (item.email || "").toLowerCase().includes(searchText) ||
      (ROLE_LABELS[item.role] || item.role)
        .toLowerCase()
        .includes(searchText) ||
      (item.specialty || "")
        .toLowerCase()
        .includes(searchText) ||
      formatRut(item.rut || "")
        .toLowerCase()
        .includes(searchText) ||
      normalizeChileanRut(item.rut || "")
        .includes(normalizeChileanRut(searchText));

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && item.active === true) ||
      (statusFilter === "inactive" && item.active === false);

    return matchesSearch && matchesStatus;
  });

  // ------------------------------------------------
  // CREAR USUARIO
  // ------------------------------------------------

  function openCreateForm() {
    setEditingUser(null);
    setFormData(getEmptyFormData());
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  // ------------------------------------------------
  // EDITAR USUARIO
  // ------------------------------------------------

  function openEditForm(item) {
    setEditingUser(item);

    setFormData({
      name: item.name || "",
      email: item.email || "",
      role: item.role,
      specialty: item.specialty || "",
      rut: item.rut || "",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  // ------------------------------------------------
  // CERRAR FORMULARIO
  // ------------------------------------------------

  function closeForm() {
    setShowForm(false);
    setEditingUser(null);
    setFormData(getEmptyFormData());
  }

  // ------------------------------------------------
  // CAMBIAR CAMPOS
  // ------------------------------------------------

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => {
      const updatedData = {
        ...previous,
        [name]: value,
      };

      if (name === "role" && value !== "TECHNICIAN") {
        updatedData.specialty = "";
        updatedData.rut = "";
      }

      return updatedData;
    });
  }

  // ------------------------------------------------
  // GUARDAR USUARIO
  // ------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (isTechnician) {
        if (!formData.rut.trim()) {
          throw new Error(
            "Debes ingresar el RUT del técnico."
          );
        }

        if (!validateChileanRut(formData.rut)) {
          throw new Error(
            "El RUT ingresado no es válido. Revisa el número y su dígito verificador."
          );
        }
      }

      if (editingUser) {
        await updateUser(editingUser.id, formData);

        setSuccess(
          "El usuario fue modificado correctamente."
        );
      } else {
        await createUser(formData);

        setSuccess(
          "El usuario fue creado correctamente."
        );
      }

      closeForm();

      await loadUsers();
    } catch (err) {
      console.error("Error al guardar usuario:", err);

      setError(
        err.message || "No fue posible guardar el usuario."
      );
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------
  // ACTIVAR O DESACTIVAR USUARIO
  // ------------------------------------------------

  async function handleToggleStatus(item) {
    const nextStatus = !item.active;

    const message = nextStatus
      ? `¿Deseas activar la cuenta de ${item.name}?`
      : `¿Deseas desactivar la cuenta de ${item.name}?`;

    if (!window.confirm(message)) {
      return;
    }

    try {
      setError("");
      setSuccess("");

      await setUserActive(item.id, nextStatus);

      setSuccess(
        nextStatus
          ? "La cuenta fue activada correctamente."
          : "La cuenta fue desactivada correctamente."
      );

      await loadUsers();
    } catch (err) {
      console.error("Error al cambiar estado:", err);

      setError(
        err.message || "No fue posible cambiar el estado."
      );
    }
  }

  // ------------------------------------------------
  // ESTADÍSTICAS
  // ------------------------------------------------

  const totalUsers = users.length;

  const activeUsers = users.filter(
    (item) => item.active === true
  ).length;

  const inactiveUsers = users.filter(
    (item) => item.active === false
  ).length;

  // ------------------------------------------------
  // INTERFAZ
  // ------------------------------------------------

  return (
    <div className="space-y-6">

      {/* ENCABEZADO */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-500" />

            <h1 className="text-2xl font-bold text-slate-100">
              Administración de usuarios
            </h1>
          </div>

          <p className="mt-1 text-sm text-slate-400">
            Gestión de cuentas, perfiles, especialidades,
            identificación y permisos de acceso.
          </p>
        </div>

        <div className="flex gap-2">

          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateForm}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              <UserPlus className="h-4 w-4" />
              Nuevo usuario
            </button>
          )}

        </div>
      </div>

      {/* MENSAJES */}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
        >
          {success}
        </div>
      )}

      {/* ESTADÍSTICAS */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Total de usuarios
          </p>

          <p className="mt-2 text-3xl font-bold text-white">
            {totalUsers}
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Usuarios activos
          </p>

          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {activeUsers}
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Usuarios inactivos
          </p>

          <p className="mt-2 text-3xl font-bold text-red-400">
            {inactiveUsers}
          </p>
        </div>

      </div>

      {/* FORMULARIO */}

      {showForm && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">

          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {editingUser ? "Modificar usuario" : "Crear usuario"}
            </h2>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Cerrar formulario"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >

            {/* NOMBRE */}

            <div>
              <label
                htmlFor="user-name"
                className="mb-2 block text-sm text-slate-300"
              >
                Nombre completo
              </label>

              <input
                id="user-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                maxLength={100}
                placeholder="Ej. Juan Pérez"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
              />
            </div>

            {/* CORREO */}

            <div>
              <label
                htmlFor="user-email"
                className="mb-2 block text-sm text-slate-300"
              >
                Correo electrónico
              </label>

              <input
                id="user-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                maxLength={150}
                placeholder="usuario@andinacare.cl"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
              />
            </div>

            {/* ROL */}

            <div>
              <label
                htmlFor="user-role"
                className="mb-2 block text-sm text-slate-300"
              >
                Rol del usuario
              </label>

              <select
                id="user-role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
              >
                {AVAILABLE_ROLES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* IDENTIFICACIÓN RUT */}

            {isTechnician && (
              <div>
                <label
                  htmlFor="user-rut"
                  className="mb-2 block text-sm text-slate-300"
                >
                  RUT del técnico
                  <span className="ml-1 text-red-400">*</span>
                </label>

                <input
                  id="user-rut"
                  type="text"
                  name="rut"
                  value={formData.rut}
                  onChange={handleChange}
                  required
                  maxLength={12}
                  placeholder="Ej. 12.345.678-5"
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                />

                {formData.rut.trim() && (
                  <p
                    className={`mt-1 text-xs ${
                      validateChileanRut(formData.rut)
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {validateChileanRut(formData.rut)
                      ? `RUT válido: ${formatRut(formData.rut)}`
                      : "Revisa el RUT y su dígito verificador."}
                  </p>
                )}

                <p className="mt-1 text-xs text-slate-500">
                  Este RUT se utilizará para identificar al
                  técnico durante la confirmación AST/LOTO.
                </p>
              </div>
            )}

            {/* ESPECIALIDAD */}

            {isTechnician && (
              <div>
                <label
                  htmlFor="user-specialty"
                  className="mb-2 block text-sm text-slate-300"
                >
                  Especialidad del técnico
                </label>

                <select
                  id="user-specialty"
                  name="specialty"
                  value={formData.specialty}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
                >
                  <option value="">
                    Seleccionar especialidad
                  </option>

                  {TECHNICIAN_SPECIALTIES.map((specialty) => (
                    <option key={specialty} value={specialty}>
                      {specialty}
                    </option>
                  ))}
                </select>

                <p className="mt-1 text-xs text-slate-500">
                  Esta especialidad permitirá filtrar las órdenes
                  de trabajo.
                </p>
              </div>
            )}

            {/* ACCIONES */}

            <div className="flex flex-wrap items-end gap-2">

              <button
                type="submit"
                disabled={
                  saving ||
                  (isTechnician && !validateChileanRut(formData.rut))
                }
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />

                {saving
                  ? "Guardando..."
                  : editingUser
                    ? "Guardar cambios"
                    : "Crear usuario"}
              </button>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>

            </div>

          </form>
        </div>
      )}

      {/* BÚSQUEDA Y FILTROS */}

      <div className="flex flex-col gap-3 sm:flex-row">

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, correo, RUT, rol o especialidad..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>

      </div>

      {/* TABLA */}

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">

        <div className="border-b border-slate-700 px-5 py-4">
          <h2 className="font-semibold text-white">
            Usuarios registrados
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            {filteredUsers.length} usuarios encontrados
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">
            Cargando usuarios...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No se encontraron usuarios.
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full min-w-[1050px] text-left text-sm">

              <thead className="bg-slate-950 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-3">Usuario</th>
                  <th className="px-5 py-3">RUT</th>
                  <th className="px-5 py-3">Rol</th>
                  <th className="px-5 py-3">Especialidad</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Fecha de creación</th>

                  {isAdmin && (
                    <th className="px-5 py-3 text-right">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">

                {filteredUsers.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/50"
                  >

                    {/* USUARIO */}

                    <td className="px-5 py-4">
                      <p className="font-medium text-white">
                        {item.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {item.email}
                      </p>
                    </td>

                    {/* RUT */}

                    <td className="px-5 py-4 text-slate-300">
                      {item.role === "TECHNICIAN"
                        ? item.rut
                          ? formatRut(item.rut)
                          : "Pendiente"
                        : "—"}
                    </td>

                    {/* ROL */}

                    <td className="px-5 py-4 text-slate-300">
                      {ROLE_LABELS[item.role] || item.role}
                    </td>

                    {/* ESPECIALIDAD */}

                    <td className="px-5 py-4 text-slate-300">
                      {item.role === "TECHNICIAN"
                        ? item.specialty || "Sin asignar"
                        : "—"}
                    </td>

                    {/* ESTADO */}

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.active
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {item.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>

                    {/* FECHA */}

                    <td className="px-5 py-4 text-slate-400">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString("es-CL")
                        : "Sin fecha"}
                    </td>

                    {/* ACCIONES */}

                    {isAdmin && (
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">

                          <button
                            type="button"
                            onClick={() => openEditForm(item)}
                            title="Modificar usuario"
                            aria-label={`Modificar a ${item.name}`}
                            className="rounded-lg border border-slate-700 p-2 text-blue-400 hover:bg-slate-800"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            title={item.active ? "Desactivar usuario" : "Activar usuario"}
                            aria-label={`${item.active ? "Desactivar" : "Activar"} a ${item.name}`}
                            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
                          >
                            {item.active ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </button>

                        </div>
                      </td>
                    )}

                  </tr>
                ))}

              </tbody>
            </table>

          </div>
        )}
      </div>

      {/* INFORMACIÓN */}

      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">

        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />

          <p>
            Las cuentas desactivadas se conservan en la base de
            datos y no pueden iniciar sesión. Las operaciones
            administrativas quedan registradas en auditoría.
            El RUT identifica al técnico durante la confirmación
            AST/LOTO y su especialidad permite organizar las
            órdenes de trabajo.
          </p>
        </div>

      </div>

    </div>
  );
}

export default UsersPage;
