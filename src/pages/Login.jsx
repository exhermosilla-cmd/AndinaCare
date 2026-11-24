
/*
 * ANDINACARE - INICIO DE SESIÓN ACADÉMICO
 *
 * Permite seleccionar uno de los usuarios de demostración
 * registrados en IndexedDB.
 *
 * No utiliza contraseñas ni representa autenticación
 * segura para un entorno de producción.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Activity,
  ShieldCheck,
  UserRound,
  LogIn,
} from "lucide-react";

import { getDemoUsers } from "../services/auth";
import { useAuth } from "../context/AuthContext";

function Login() {
  const navigate = useNavigate();
  const { login, loading, isAuthenticated } = useAuth();

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Carga los usuarios disponibles desde IndexedDB.
  useEffect(() => {
    let mounted = true;

    async function loadUsers() {

        if (loading) {
            return;
        }
        

      try {
        const availableUsers = await getDemoUsers();

        if (mounted) {
          setUsers(availableUsers);

          if (availableUsers.length > 0) {
            setSelectedUser(availableUsers[0].id);
          }
        }
      } catch (loadError) {
        console.error("Error cargando usuarios:", loadError);

        if (mounted) {
          setError(
            "No fue posible cargar los usuarios. Comprueba la base de datos."
          );
        }
      } finally {
        if (mounted) {
          setLoadingUsers(false);
        }
      }
    }

    loadUsers();

    return () => {
      mounted = false;
    };
  }, [loading]);

  // Si ya existe una sesión, no es necesario mostrar el login.
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  // Inicia sesión con el usuario seleccionado.
  async function handleLogin(event) {
    event.preventDefault();

    if (!selectedUser) {
      setError("Selecciona un usuario para continuar.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      await login(selectedUser);

      navigate("/dashboard", { replace: true });
    } catch (loginError) {
      console.error("Error de inicio de sesión:", loginError);

      setError(
        loginError.message || "No fue posible iniciar sesión."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">

        <header className="login-brand">
          <div className="login-brand__icon">
            <Activity size={28} />
          </div>

          <div>
            <h1>AndinaCare</h1>
            <p>Mantenimiento industrial</p>
          </div>
        </header>

        <div className="login-heading">
          <span className="login-heading__eyebrow">
            ACCESO AL SISTEMA
          </span>

          <h2>Bienvenido</h2>

          <p>
            Selecciona un perfil para ingresar a la aplicación
            y probar sus funcionalidades.
          </p>
        </div>

        <form onSubmit={handleLogin} className="login-form">

          <label htmlFor="demo-user">
            Usuario de demostración
          </label>

          <div className="login-select-wrapper">
            <UserRound size={19} />

            <select
              id="demo-user"
              value={selectedUser}
              onChange={(event) =>
                setSelectedUser(event.target.value)
              }
              disabled={loadingUsers || submitting}
            >
              {loadingUsers && (
                <option value="">Cargando usuarios...</option>
              )}

              {!loadingUsers && users.length === 0 && (
                <option value="">
                  No hay usuarios disponibles
                </option>
              )}

              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} — {user.role}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="app-button app-button--primary login-submit"
            disabled={
              loading ||
              loadingUsers ||
              submitting ||
              users.length === 0
            }
          >
            <LogIn size={18} />

            {submitting ? "Ingresando..." : "Ingresar a AndinaCare"}
          </button>
        </form>

        <div className="login-demo-notice">
          <ShieldCheck size={20} />

          <p>
            <strong>Modo académico de demostración</strong>
            <span>
              El acceso se realiza mediante perfiles de prueba,
              sin contraseñas.
            </span>
          </p>
        </div>

        <footer className="login-footer">
          AndinaCare · Proyecto académico
        </footer>

      </section>
    </main>
  );
}

export default Login;
