
/*
 * ANDINACARE - TARJETA REUTILIZABLE
 *
 * Las tarjetas permiten agrupar información relacionada.
 *
 * Se utilizarán posteriormente en:
 * - Dashboard.
 * - Fichas de activos.
 * - Órdenes de trabajo.
 * - Inventario.
 * - Reportes.
 */

function Card({ children, title, className = "" }) {
  return (
    <section className={`app-card ${className}`}>
      {title && (
        <h2 className="app-card__title">
          {title}
        </h2>
      )}

      <div className="app-card__content">
        {children}
      </div>
    </section>
  );
}

export default Card;
