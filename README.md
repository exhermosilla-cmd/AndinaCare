# AndinaCare — Gestión de mantenimiento industrial

Proyecto académico desarrollado con React y Vite como aplicación web progresiva (PWA).

## Requisitos

- Node.js compatible con Vite 8.
- npm.

## Instalación

Desde la carpeta raíz del proyecto:

```bash
npm install
```

## Ejecución en desarrollo

```bash
npm run dev
```

Vite mostrará la dirección local para abrir AndinaCare en el navegador.

## Compilación de producción

```bash
npm run build
```

## Vista previa de producción

```bash
npm run preview
```

## Módulos incluidos

- Dashboard.
- Activos y detalle de activos.
- Órdenes de trabajo y tablero Kanban.
- Seguridad AST/LOTO.
- Registro fotográfico antes y después del trabajo.
- Inventario y reservas de repuestos.
- Administración de usuarios y perfiles.
- Reportes.
- Auditoría.
- Funcionamiento PWA y almacenamiento local.

## Consideraciones importantes

Esta versión es un prototipo académico con almacenamiento local mediante IndexedDB. Los datos quedan asociados al navegador y al origen (dominio y puerto) utilizado; por ejemplo, `localhost:5173` y `localhost:4173` mantienen almacenamientos separados.

El adaptador de sincronización incluido es simulado. No existe un backend real ni sincronización entre distintos dispositivos. La autenticación y los perfiles de demostración tampoco sustituyen un sistema de identidad y autorización de producción.

Para un despliegue productivo se requiere implementar y probar un backend real, autenticación segura, autorización en servidor, persistencia centralizada, copias de seguridad y controles adicionales de seguridad.

## Estructura

- `src/`: código fuente de la aplicación.
- `public/`: manifiesto e iconos públicos de la PWA.
- `index.html`: documento HTML principal.
- `vite.config.js`: configuración de Vite y de la PWA.
- `package.json` y `package-lock.json`: dependencias y scripts del proyecto.

Las carpetas generadas (`node_modules`, `dist` y `dev-dist`) se omiten en este paquete para reducir su tamaño. Se regeneran mediante `npm install` y `npm run build`.
