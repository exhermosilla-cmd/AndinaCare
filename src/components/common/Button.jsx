
/*
 * ANDINACARE - BOTÓN REUTILIZABLE
 *
 * Evita crear estilos diferentes para cada botón.
 *
 * variant permite elegir el propósito visual:
 * primary, secondary, danger o ghost.
 *
 * size permite elegir entre small, medium y large.
 */

function Button({
  children,
  variant = "primary",
  size = "medium",
  type = "button",
  disabled = false,
  onClick,
  className = "",
}) {
  return (
    <button
      type={type}
      className={`app-button app-button--${variant} app-button--${size} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default Button;
