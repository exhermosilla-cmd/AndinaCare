
/*
 * ANDINACARE - ETIQUETA DE ESTADO
 *
 * Se utiliza para identificar estados mediante colores.
 *
 * Ejemplos futuros:
 * - Pendiente.
 * - En ejecución.
 * - Finalizada.
 * - Crítica.
 * - Error de sincronización.
 *
 * El color es visual. La lógica que determina el estado
 * deberá implementarse posteriormente en cada módulo.
 */

function StatusBadge({ children, tone = "neutral" }) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {children}
    </span>
  );
}

export default StatusBadge;
