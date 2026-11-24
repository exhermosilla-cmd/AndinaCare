
/*
 * ANDINACARE - CONFIGURACIÓN DE VITE Y PWA
 *
 * Vite administra el servidor de desarrollo y la compilación.
 *
 * vite-plugin-pwa genera el Service Worker mediante Workbox.
 * Workbox permite almacenar recursos para que la aplicación
 * pueda abrirse incluso cuando no exista conexión a internet.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    // Configuración de la Progressive Web App.
    VitePWA({
      // Actualización automática de la aplicación.
      registerType: "autoUpdate",

      // El registro se realiza desde main.jsx.
      injectRegister: false,

      // Habilita el Service Worker durante el desarrollo.
      devOptions: {
        enabled: true,
      },

      // Utilizamos el manifest existente en public.
      manifest: false,
      manifestFilename: "manifest.webmanifest",

      // Archivos adicionales de la PWA.
      includeAssets: [
        "icons/andinacare.svg",
      ],

      // Configuración del Service Worker.
      workbox: {
        // Recursos estáticos que se precargan.
        globPatterns: [
          "**/*.{js,css,html,ico,svg,png,jpg,jpeg,webp,webmanifest,woff2}",
        ],

        // Excluimos mapas y manuales PDF de la precarga.
        globIgnores: [
          "**/*.map",
          "**/manuals/**",
        ],

        // Tamaño máximo de cada archivo precargado: 2 MB.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,

        // Limpia cachés antiguas.
        cleanupOutdatedCaches: true,

        // Permite que el Service Worker controle las páginas.
        clientsClaim: true,

        // Activa inmediatamente la nueva versión.
        skipWaiting: true,

        // Permite abrir rutas internas sin conexión.
        navigateFallback: "/index.html",

        // Excluye las rutas de API de la navegación alternativa.
        navigateFallbackDenylist: [
          /^\/api\//,
        ],

        // Estrategias de almacenamiento específicas.
        runtimeCaching: [
          {
            // Identifica manuales PDF dentro de /manuals/.
            urlPattern: /\/manuals\/[^/]+\.pdf$/i,

            // Primero busca el documento en la caché.
            handler: "CacheFirst",

            options: {
              // Caché independiente para los manuales.
              cacheName: "andinacare-manuales",

              // Solo almacena respuestas correctas.
              cacheableResponse: {
                statuses: [200],
              },

              // Conserva un máximo de cinco manuales
              // durante un período de 30 días.
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },

              // Permite solicitudes parciales de PDF.
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
});
