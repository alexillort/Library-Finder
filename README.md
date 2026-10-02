# Library Finder · Mendeley Explorer

MVP en Next.js 16 / React 19 / TypeScript para explorar una biblioteca con columnas tipo Finder e inspector. El modo demo funciona sin cuentas ni credenciales y conserva la biblioteca y los PDFs en IndexedDB, en el navegador actual.

## Correr localmente

Requisito: Node.js 22.13 o superior (recomendado: Node.js 24 LTS) y npm.

Desde una terminal en esta carpeta:

```sh
npm install
npm run dev
```

Abre **http://127.0.0.1:3000**. Mantén la terminal abierta; Ctrl+C detiene el servidor. Si el puerto está ocupado, usa la dirección que Next.js imprime. Si ya hay un servidor de este mismo proyecto, abre su dirección en lugar de iniciar otro.

En PowerShell también puedes usar `npm.cmd install` y `npm.cmd run dev` si la política de ejecución bloquea `npm.ps1`.

No copies `.env.example` para probar el demo: no necesita variables.

```sh
npm run typecheck
npm test
npm run build
npm start
```

`build` produce el demo estático en `out/`; `start` lo sirve en el puerto 3000. Para el servidor con OAuth usa `npm run start:server`, después de habilitar las rutas y compilar en modo servidor.

## Cómo probar

La biblioteca contiene 18 referencias ficticias: 17 activas y una en Trash. Los PDFs de ejemplo son documentos de muestra, no artículos reales.

1. Abre VR Security: muestra 5 documentos directos. Include descendants muestra 12 documentos únicos del árbol.
2. Selecciona un artículo: el inspector muestra sus ubicaciones directas con rutas completas. Pulsa una ruta para navegar conservando la selección.
3. Arrastra un artículo a una carpeta: añade la asignación sin quitar ninguna otra. También puedes usar Añadir ubicación en pantallas táctiles.
4. Move permite elegir origen y destino: añade destino y quita exclusivamente el origen elegido. El resto de ubicaciones se conserva.
5. La X junto a una ubicación quita esa relación. Al quitar la última, el documento aparece en Unsorted.
6. Usa Nueva carpeta o Nueva subcarpeta. El botón de tres puntos de la carpeta seleccionada permite renombrarla y cambiar su carpeta padre.
7. Subir PDF acepta varios archivos o arrastrarlos desde el sistema. Se verifica la cabecera PDF, con límite de 25 MB por archivo y 20 archivos por operación. En una carpeta se añaden directamente allí; en vistas virtuales se añaden sin clasificar.
8. Editar cambia título, autores, año, publicación, DOI, etiquetas y resumen. Open y Download abren/descargan el archivo; Replace PDF conserva los metadatos y ubicaciones.
9. Enviar a Trash conserva las asignaciones y el PDF. Desde Trash, Restaurar documento recupera el registro.
10. Deshacer revierte hasta 20 operaciones de la sesión, incluyendo reemplazos de PDF. Ctrl/⌘ Z activa undo fuera de formularios; Ctrl/⌘ K enfoca búsqueda. Las flechas arriba/abajo recorren la lista.

All Papers, Unsorted, Multiple Locations y Missing PDF excluyen Trash. La búsqueda opera sobre la vista actual por título, autores, año, DOI, publicación y etiquetas. Para buscar en toda la biblioteca, selecciona All Papers.

## Arquitectura

```text
app/page.tsx + app/layout.tsx         Next.js App Router y metadata
components/library-finder.tsx        Columnas, navegación, inspector, formularios
app/globals.css                      Diseño responsive y estados visuales
lib/domain.ts                       Modelo, selectores y comandos inmutables
lib/demo.ts                         Datos ficticios iniciales
lib/provider.ts                     Contrato LibraryProvider
lib/demo-provider.ts                 Persistencia IndexedDB y transacciones
lib/pdf.ts                          PDF de muestra y validación de uploads
integrations/mendeley/oauth.ts       Authorization Code, refresh y sesión cifrada
integrations/mendeley/client.ts      Cliente de API, paginación y operaciones
integrations/mendeley/auth-route.ts  Plantilla de Route Handler OAuth
scripts/enable-mendeley.mjs          Instala las rutas OAuth opcionales
tests/domain.test.ts                Invariantes del modelo y casos de integración simulados
```

La UI utiliza actualmente `demoProvider`. `LibraryProvider` define load, execute, restore y getPdf para sustituir el almacenamiento sin alterar el modelo. El dominio distingue pertenencia directa de presencia en descendientes y calcula cada total como un conjunto de documentos únicos.

Las mutaciones del demo guardan metadata y archivos en la misma transacción IndexedDB. Una revisión incremental detecta escrituras concurrentes desde otras pestañas y evita sobrescribirlas. En ese caso se recargan los datos y se invalida el historial undo anterior.

## Modelo de datos

| Entidad | Campos principales | Regla |
| --- | --- | --- |
| Folder | id, name, parentId | parentId null representa la raíz. No admite ciclos ni nombres iguales entre hermanos. |
| Paper | id, title, authors, year, journal, doi, abstract, tags | Metadata editable. |
| Asignación | Paper.folderIds | Relación muchos a muchos; IDs únicos, exclusivamente directos. |
| PDF | key, name, size, mock | Blob separado de metadata, conservado para undo. |
| Trash | Paper.trashed | Borrado lógico, mantiene archivo y asignaciones. |
| Library | version, revision, folders, papers | Snapshot serializable y control de concurrencia. |

Las carpetas virtuales son selectores derivados, no carpetas persistentes. Renombrar o mover una carpeta actualiza las rutas calculadas sin reescribir documentos.

## Preparación para Mendeley OAuth 2.0

**La integración real está preparada como base de servidor, pero no conectada a la UI del MVP ni validada con una cuenta real.** Activar OAuth no cambia automáticamente el proveedor del demo.

1. Registra una aplicación en el [Developer Portal de Mendeley](https://dev.mendeley.com/).
2. Registra exactamente la URL de callback que usarás. La plantilla local utiliza `http://127.0.0.1:3000/api/auth/mendeley/callback`.
3. Ejecuta `npm run mendeley:enable`. Copia la plantilla a `app/api/auth/mendeley/[action]/route.ts`.
4. Copia `.env.example` a `.env.local`, completa sus valores y reinicia Next.js.

| Variable de servidor | Propósito |
| --- | --- |
| MENDELEY_SERVER=1 | Desactiva exportación estática para usar Route Handlers. |
| MENDELEY_CLIENT_ID | ID de aplicación registrada. |
| MENDELEY_CLIENT_SECRET | Secreto de la aplicación, nunca en el frontend. |
| MENDELEY_REDIRECT_URI | Callback idéntico al registrado en Mendeley. |
| SESSION_SECRET | 32 bytes aleatorios como 64 caracteres hexadecimales. |

Puedes generar SESSION_SECRET con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y guardar el resultado solo en `.env.local`.

No uses prefijos NEXT_PUBLIC_ para estos valores. La plantilla valida state, intercambia el code mediante HTTP Basic, permite renovación, y cifra los tokens con AES-256-GCM en una cookie HttpOnly y SameSite=Lax. La cookie es Secure con un callback HTTPS. La desconexión y renovación exigen un POST del mismo origen. No se devuelven tokens al navegador en JSON.

### Rutas OAuth instalables

| Ruta local | Método | Función |
| --- | --- | --- |
| /api/auth/mendeley/start | GET | Redirige a autorización de Mendeley con state aleatorio. |
| /api/auth/mendeley/callback | GET | Valida state, intercambia code y guarda sesión cifrada. |
| /api/auth/mendeley/status | GET | Estado de autorización; la UI sigue en demo. |
| /api/auth/mendeley/refresh | POST | Renueva tokens sin exponerlos. |
| /api/auth/mendeley/disconnect | POST | Borra la sesión de esta app. |

### Endpoints previstos para el proveedor remoto

Base: `https://api.mendeley.com`. El cliente incluido implementa los bloques siguientes con cabeceras de media type por recurso y Authorization Bearer, siguiendo Link para paginación.

| Operación | Endpoint Mendeley |
| --- | --- |
| Listar / crear carpetas | GET / POST /folders |
| Renombrar / mover carpeta | PATCH /folders/{id} con name y parent_id |
| Documentos de biblioteca | GET /documents?view=all |
| Asignaciones directas | GET /folders/{id}/documents |
| Añadir ubicación | POST /folders/{id}/documents con {id: documentId} |
| Quitar ubicación | DELETE /folders/{id}/documents/{documentId} |
| Editar metadata | PATCH /documents/{id} |
| Upload de PDF con extracción de metadata | POST /documents con Content-Type: application/pdf |
| Listar adjuntos de un documento | GET /files?document_id={id} |
| Enviar a papelera | POST /documents/{id}/trash |
| Listar / restaurar papelera | GET /trash · POST /trash/{id}/restore |
| Abrir / descargar PDF (siguiente etapa) | GET /files/{id}, a través de proxy autorizado |
| Reemplazar PDF (siguiente etapa) | Crear nuevo adjunto /files antes de eliminar el anterior; validar el contrato real con una cuenta. |

Move remoto consta de añadir y después quitar; la API no ofrece una transacción entre ambas llamadas. El cliente nunca quita origen si falla añadir destino y comunica un resultado parcial si falla el segundo paso.

Para completar la conexión: implementar un `MendeleyProvider` de servidor que normalice `parent_id`, autores, identifiers y adjuntos; reconstruir membresías consultando cada carpeta; añadir rutas propias de biblioteca, comandos y archivos; introducir control de sesión/origen y una cola para 429; implementar undo como operaciones compensatorias y sustituir la instancia demo en la UI. La autorización sola no activa sincronización. Mantén separados los datos demo y los datos remotos.

Los endpoints y flujo se contrastaron con la [referencia oficial](https://dev.mendeley.com/methods/) y la [documentación Authorization Code](https://dev.mendeley.com/reference/topics/authorization_auth_code.html) el 2 de octubre de 2026. La disponibilidad y permisos finales requieren prueba con credenciales reales.

## Límites del MVP

- Los datos demo y archivos son locales al origen, navegador y dispositivo. localhost y 127.0.0.1 son orígenes diferentes; usa siempre la misma dirección. No hay sincronización entre dispositivos.
- Los cambios sobreviven a recargas; undo solo dura la sesión abierta. Borrar datos del navegador elimina la biblioteca demo y los PDFs subidos.
- No hay extracción automática de metadata en demo; el título inicial proviene del nombre de archivo.
- El preview completo usa el visor PDF del navegador. La tarjeta del inspector es una representación de metadata, no una miniatura renderizada del archivo.
- Los Blobs anteriores se retienen para undo; no se implementa limpieza automática ni borrado permanente.
- La publicación estática contiene solo el demo. OAuth necesita un despliegue Next.js con servidor Node y variables protegidas.
- La herramienta WebMCP opcional `read_library_view` es de solo lectura y utiliza los mismos selectores visibles; navegadores sin WebMCP funcionan normalmente.

## Validación

`npm test` cubre contadores únicos, carpetas virtuales, asignaciones, Move, ciclos de carpetas, metadata, Trash/restore, snapshots y reemplazos, PDFs, state OAuth, cifrado, paginación y protección del origen en el cliente. `npm run typecheck` comprueba también las plantillas de integración. `npm run build` verifica la compilación y exportación de producción.
