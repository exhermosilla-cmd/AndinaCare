
/*
 * ANDINACARE - ADAPTADOR DE SINCRONIZACIÓN
 *
 * Simula la comunicación con un servidor externo.
 *
 * IMPORTANTE:
 * No existe un backend real en esta versión académica.
 */

export async function sendOperation(operation) {
  if (!operation || !operation.operationId) {
    throw new Error(
      "No se recibió una operación válida para sincronizar."
    );
  }

  // Simulamos el tiempo de comunicación.
  await new Promise((resolve) => {
    setTimeout(resolve, 500);
  });

  return {
    confirmed: true,
    simulated: true,
    operationId: operation.operationId,
    confirmedAt: new Date().toISOString(),
    message: "Operación confirmada por el adaptador simulado.",
  };
}

