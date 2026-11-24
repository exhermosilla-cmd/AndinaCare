
/*
 * ANDINACARE - GENERADOR DE IDENTIFICADORES UUID
 *
 * Un UUID es un identificador único utilizado para
 * distinguir registros dentro de nuestra base de datos.
 *
 * Ejemplo:
 * 550e8400-e29b-41d4-a716-446655440000
 *
 * Utilizamos la API criptográfica del navegador.
 * No utilizamos Math.random() porque no es apropiado
 * para generar identificadores únicos de este tipo.
 */

/**
 * Genera un UUID versión 4.
 *
 * Primero intenta utilizar crypto.randomUUID().
 * Si el navegador no dispone de ese método, utiliza
 * crypto.getRandomValues() como alternativa.
 *
 * @returns {string} Identificador UUID.
 */
export function generateUUID() {
  // Comprobamos que el navegador tenga disponible
  // la API criptográfica necesaria.
  if (!globalThis.crypto) {
    throw new Error(
      "El navegador no dispone de una API criptográfica compatible."
    );
  }

  // Método moderno y recomendado para generar UUID.
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  /*
   * Alternativa para navegadores que no implementan
   * randomUUID(), pero sí disponen de getRandomValues().
   *
   * Se generan 16 bytes aleatorios.
   */
  const bytes = new Uint8Array(16);

  globalThis.crypto.getRandomValues(bytes);

  // Establecemos los bits correspondientes a UUID v4.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  // Convertimos los bytes a hexadecimal.
  const hexadecimal = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  // Organizamos el identificador con el formato UUID.
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20, 32),
  ].join("-");
}

/**
 * Comprueba si un valor tiene formato UUID válido.
 *
 * @param {string} value Valor que queremos comprobar.
 * @returns {boolean} True si tiene formato UUID válido.
 */
export function isValidUUID(value) {
  if (typeof value !== "string") {
    return false;
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value);
}
