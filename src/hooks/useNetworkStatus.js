
/*
 * ANDINACARE - DETECCIÓN DEL ESTADO DE CONEXIÓN
 *
 * Este hook permite conocer si el navegador informa que
 * existe una conexión de red disponible.
 *
 * Utiliza los eventos online y offline del navegador.
 *
 * Importante:
 * navigator.onLine no garantiza que internet funcione
 * correctamente. Solo informa el estado de conexión
 * que detecta el navegador.
 */

import { useEffect, useState } from "react";

function useNetworkStatus() {

  // Estado inicial de conexión.
  // navigator.onLine permite conocer el estado actual.
  const [isOnline, setIsOnline] = useState(
    () => navigator.onLine
  );

  useEffect(() => {

    // Se ejecuta cuando el navegador recupera la conexión.
    const handleOnline = () => {
      setIsOnline(true);
    };

    // Se ejecuta cuando el navegador pierde la conexión.
    const handleOffline = () => {
      setIsOnline(false);
    };

    // Registramos los eventos del navegador.
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Eliminamos los eventos al desmontar el componente.
    // Esto evita acumular listeners innecesarios.
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };

  }, []);

  return isOnline;
}

export default useNetworkStatus;
