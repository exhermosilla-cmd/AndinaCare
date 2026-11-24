
/*
 * ANDINACARE - PANTALLA DE BIENVENIDA
 *
 * Este componente representa la primera pantalla que verá
 * el usuario al ingresar a la aplicación.
 *
 * En esta etapa solo mostramos información de presentación.
 * Todavía no existe autenticación ni navegación funcional
 * hacia los módulos del sistema.
 */

// Importamos iconos de Lucide React.
// Se utilizan para reforzar visualmente la identidad industrial.
import {
  Activity,
  ShieldCheck,
  Wrench,
  Wifi,
} from "lucide-react";

// Componente principal de bienvenida.
function Welcome() {
  return (
    <main className="welcome-page">

      {/* Contenedor principal de la presentación */}
      <section className="welcome-card">

        {/* Identidad visual de AndinaCare */}
        <div className="brand">

          <div className="brand-icon">
            <Wrench size={30} />
          </div>

          <div>
            <h1>AndinaCare</h1>
            <p>Gestión de mantenimiento industrial</p>
          </div>

        </div>

        {/* Mensaje principal */}
        <div className="welcome-content">

          <span className="welcome-label">
            SISTEMA DE MANTENIMIENTO
          </span>

          <h2>
            Bienvenido a AndinaCare
          </h2>

          <p>
            Una plataforma diseñada para apoyar la gestión
            del mantenimiento industrial, facilitando el
            seguimiento de equipos, las intervenciones
            técnicas y la información de mantenimiento.
          </p>

        </div>

        {/* Características generales del proyecto */}
        <div className="feature-list">

          <div className="feature-item">
            <Activity size={22} />
            <span>Gestión de mantenimiento</span>
          </div>

          <div className="feature-item">
            <ShieldCheck size={22} />
            <span>Registro y trazabilidad</span>
          </div>

          <div className="feature-item">
            <Wifi size={22} />
            <span>Preparado para trabajo offline</span>
          </div>

        </div>

        {/* Información académica del sistema */}
        <footer className="welcome-footer">
          <span>AndinaCare</span>
          <span>Proyecto académico</span>
        </footer>

      </section>

    </main>
  );
}

// Exportamos el componente para utilizarlo desde App.jsx.
export default Welcome;
