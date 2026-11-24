
/*
 * ANDINACARE - PUNTO DE ENTRADA
 *
 * Este archivo conecta React con el documento HTML.
 *
 * También configura:
 * - React Router para administrar las rutas.
 * - AuthProvider para compartir la sesión del usuario.
 * - El registro del Service Worker para el funcionamiento PWA.
 */

import React from "react";
import ReactDOM from "react-dom/client";

// Permite administrar las rutas de la aplicación.
import { BrowserRouter } from "react-router";

// Componente principal.
import App from "./App";

// Contexto global de autenticación.
import { AuthProvider } from "./context/AuthContext";

// Estilos generales.
import "./styles/global.css";

// Registro del Service Worker de la PWA.
import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
});

// Obtenemos el elemento HTML donde se montará React.
const rootElement = document.getElementById("root");

// Creamos la aplicación y sus proveedores globales.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
