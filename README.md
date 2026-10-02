# Library Finder · Mendeley Explorer

App en Next.js 16, React 19 y TypeScript con columnas tipo Finder, inspector y dos proveedores: **Demo** (IndexedDB local) y **Mendeley** (OAuth y API desde el servidor). La integración está conectada a la UI; las credenciales de una aplicación Mendeley son necesarias para usar una cuenta real.

## Correr localmente

Requiere Node.js 22.13 o superior y npm. En esta carpeta:

```sh
npm install
npm run dev
```

Abre **http://127.0.0.1:3000** y mantén la terminal abierta. Ctrl+C detiene la app. En PowerShell usa `npm.cmd` si la política de ejecución bloquea `npm.ps1`.

Sin configuración inicia en Demo. Para producción local:

```sh
npm run typecheck
npm test
npm run build
npm start
```

`build` genera una aplicación Next.js con servidor y rutas OAuth/API activas. Ya no es una exportación estática. `mendeley:enable` solo imprime instrucciones; no instala ni sobrescribe archivos.

## Conectar Mendeley

1. Registra una aplicación en [Mendeley Developers](https://dev.mendeley.com/). Obtén su **Client ID** y **Client Secret**.
2. Registra exactamente la URL de retorno del entorno donde usarás la app:
   - Local: `http://127.0.0.1:3000/api/auth/mendeley/callback`.
   - Sitio privado: `https://mendeley-library-finder.miunidad21.chatgpt.site/api/auth/mendeley/callback`.
3. Para ejecución local, copia `.env.example` a `.env.local` y completa los cuatro valores. Genera el secreto con el comando siguiente; guarda su resultado únicamente en `.env.local`.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| Variable del servidor | Valor |
| --- | --- |
| MENDELEY_CLIENT_ID | ID registrado de la aplicación |
| MENDELEY_CLIENT_SECRET | Secreto de la aplicación |
| MENDELEY_REDIRECT_URI | Callback exacto registrado en Mendeley |
| SESSION_SECRET | 64 caracteres hexadecimales aleatorios (32 bytes) |

4. Reinicia la app. Pulsa **Conectar Mendeley → Autorizar en Mendeley** e inicia sesión en Mendeley. Al volver se carga automáticamente la biblioteca real.
5. En **Conexión Mendeley** puedes cambiar a Demo sin desconectar, volver a la biblioteca real o desconectar. Demo y Mendeley permanecen separados; los PDFs demo nunca se suben automáticamente.

Para el sitio privado los valores se guardan como variables del servidor en Sites, con `MENDELEY_CLIENT_SECRET` y `SESSION_SECRET` marcados como secretos. La URL de retorno y el secreto interno ya están configurados; faltan las credenciales Mendeley. Un cambio de variables se aplica al publicar una versión. No guardes valores en `.openai/hosting.json`, Git ni archivos del frontend; nunca uses `NEXT_PUBLIC_` para secretos.

El acceso privado al sitio lo administra Sites. El OAuth de Mendeley vincula una biblioteca externa y no reemplaza ese control de acceso. Desconectar borra las cookies de esta app; no elimina documentos ni revoca la aplicación en el portal de Mendeley.

## Uso

- Columnas muestran jerarquía padre/hijo. Direct only muestra asignaciones directas; Include descendants muestra documentos únicos de todo el árbol.
- Cada artículo indica cuántas carpetas tiene. Appears in muestra rutas completas; pulsarlas navega conservando la selección.
- All Papers, Unsorted, Multiple Locations y Missing PDF excluyen Trash. La búsqueda filtra la vista actual por título, autor, año, DOI, publicación y etiquetas; selecciona All Papers para buscar en toda la biblioteca.
- Crear, renombrar y mover carpetas mantiene su contenido y rechaza ciclos o nombres iguales entre hermanos.
- Arrastrar un documento **añade** una ubicación. Move añade destino y elimina únicamente el origen elegido. La X en Appears in elimina una relación; quitar la última asignación lleva el artículo a Unsorted.
- Subir PDF admite hasta 20 archivos, 25 MB por archivo. En Mendeley la carga conjunta está limitada a 28 MB y la API extrae metadata. En una carpeta añade la asignación; en vistas virtuales carga sin clasificar.
- Editar permite título, autores, año, publicación, DOI, etiquetas y resumen. En Mendeley separa autores con `;`, por ejemplo `Ana García; Luis Pérez`. Los autores sin editar y otros identificadores permanecen intactos.
- Open, Download y preview obtienen el archivo real mediante un proxy autenticado. La tarjeta del inspector representa metadata; el visor completo usa el PDF.
- Replace PDF adjunta el nuevo archivo antes de eliminar el seleccionado anterior. Conserva la referencia, metadata, ubicaciones y otros adjuntos. Los PDFs anteriores mayores de 25 MB no pueden reemplazarse en este MVP porque no puede conservar su copia para Deshacer.
- Trash y Restore usan la papelera real. La app no ofrece borrado permanente de documentos. Mendeley determina las asignaciones recuperadas al restaurar; Deshacer un envío a Trash vuelve a añadir las ubicaciones originales registradas.
- Deshacer mantiene hasta 20 operaciones durante la sesión. En Mendeley los tickets duran dos horas, están firmados y vinculados a la sesión. Una recarga/Actualización, desconexión o error de operación limpia el historial. Ctrl/⌘ Z deshace fuera de formularios; Ctrl/⌘ K enfoca búsqueda; las flechas recorren documentos.
- Actualizar consulta nuevamente la biblioteca. Si otro cliente cambió los datos, la app rechaza una escritura con revisión antigua y recarga antes de continuar.

El demo contiene 18 referencias ficticias (17 activas y una en Trash), con PDFs de muestra. VR Security contiene 5 directos y 12 únicos incluyendo descendientes. Demo guarda biblioteca y archivos en IndexedDB; borrar los datos del navegador los elimina. Cada origen/navegador/dispositivo tiene un demo independiente.

## Arquitectura

```text
app/page.tsx + components/library-finder.tsx     UI compartida
app/globals.css                               Diseño responsive
lib/domain.ts                                Modelo y reglas inmutables
lib/demo-provider.ts                          IndexedDB y undo por snapshots
lib/mendeley-provider.ts                      Cliente del servidor y copias PDF para undo
app/api/auth/mendeley/[action]/route.ts        OAuth, status, refresh, disconnect
app/api/mendeley/[action]/route.ts             Library, commands, undo y file
integrations/mendeley/oauth.ts                Intercambio y cifrado de tokens
integrations/mendeley/session.ts              Sesión, renovación y control de origen
integrations/mendeley/client.ts               Cliente API y paginación
integrations/mendeley/library.ts              Normalización, mutaciones y undo firmado
integrations/mendeley/validation.ts           Validación del servidor
integrations/mendeley/runtime-env.ts          Variables de servidor por solicitud
build/sites-worker.ts + vite.config.ts        Adaptador Vinext / Cloudflare para Sites
tests/domain.test.ts + tests/mendeley.test.ts  Pruebas de dominio e integración simulada
```

`LibraryProvider` comparte `load`, `execute`, `restore` y `getPdf`. La UI elige proveedor según sesión OAuth y preferencia Demo/Mendeley. Mendeley es la fuente de datos; no se almacena una copia persistente de la biblioteca en el servidor. Las colecciones siguen `Link: rel=next`. Carpetas, referencias, papelera y archivos se consultan paginados; las asignaciones directas se reconstruyen con cuatro solicitudes simultáneas como máximo.

Las revisiones remotas derivan del contenido normalizado. Antes de escribir se consulta la biblioteca y se compara la revisión. La API no proporciona una transacción global: puede haber cambios externos durante una operación. Los errores parciales explican el resultado y requieren recargar; no se reintentan escrituras automáticamente. Un 429 muestra un aviso y conserva `Retry-After`.

En Demo, metadata y archivos se guardan en una transacción IndexedDB con revisión incremental. En Mendeley, `restore` utiliza un ticket firmado del último comando y ejecuta acciones compensatorias; nunca acepta un snapshot del navegador para sobrescribir una biblioteca real. Los tickets comprueban el estado del elemento afectado para conservar cambios posteriores. La copia del PDF para Deshacer permanece solo en memoria del navegador. Restaurar un PDF crea un adjunto nuevo; su ID puede cambiar. Una secuencia de reemplazos cuyos IDs cambian puede invalidar un Deshacer anterior; la app lo comunica sin forzar la reversión.

## Modelo

| Entidad | Campos | Regla |
| --- | --- | --- |
| Folder | id, name, parentId | null representa raíz; sin ciclos |
| Paper | id, title, authors, year, journal, doi, abstract, tags, addedAt | Metadata editable |
| Asignaciones | Paper.folderIds | IDs únicos y exclusivamente directos |
| PDF | key, name, size, mock | ID de archivo Mendeley o clave IndexedDB |
| Trash | Paper.trashed | Papelera lógica |
| Library | version, revision, folders, papers | Biblioteca normalizada y revisión |

Las carpetas virtuales son selectores, no registros persistentes. Las rutas se calculan con parentId. Si una referencia contiene varios PDFs, el inspector selecciona uno de forma determinista por ID; los otros adjuntos se conservan.

## Rutas implementadas

| Ruta propia | Método | Función |
| --- | --- | --- |
| /api/auth/mendeley/start | GET | Autorización con state |
| /api/auth/mendeley/callback | GET | Intercambio de code, cookie y retorno a la app |
| /api/auth/mendeley/status | GET | Configuración y conexión, sin secretos |
| /api/auth/mendeley/refresh | POST | Renovación explícita |
| /api/auth/mendeley/disconnect | POST | Borrar sesión |
| /api/mendeley/library | GET | Biblioteca completa normalizada |
| /api/mendeley/commands | POST | Comando con expectedRevision; JSON o multipart con operation y archivos por key |
| /api/mendeley/undo | POST | Ticket, expectedRevision y backup opcional |
| /api/mendeley/file?id=... | GET | PDF real por proxy |

| Operación | API Mendeley |
| --- | --- |
| Carpetas | GET/POST /folders; PATCH/DELETE /folders/{id} |
| Documentos | GET /documents?view=all; GET/PATCH /documents/{id} |
| Asignaciones | GET/POST /folders/{id}/documents; DELETE /folders/{id}/documents/{documentId} |
| Upload con extracción | POST /documents con application/pdf |
| Adjuntos | GET/POST /files; GET/DELETE /files/{id} |
| Papelera | POST /documents/{id}/trash; GET /trash; POST /trash/{id}/restore |

La eliminación de carpetas solo se utiliza para Deshacer la creación de una carpeta vacía. Replace PDF y su inversa reemplazan el adjunto seleccionado; este MVP no gestiona anotaciones del archivo. No asumas que anotaciones, historial o IDs de archivos se recuperan al reemplazar un PDF.

Los contratos se contrastaron con la [referencia oficial](https://dev.mendeley.com/methods/) y [Authorization Code](https://dev.mendeley.com/reference/topics/authorization_auth_code.html). Sin credenciales no se ha realizado una prueba con una biblioteca real.

## Seguridad y límites

Los tokens se cifran con AES-256-GCM en una cookie HttpOnly, SameSite=Lax y Secure con HTTPS. Se renuevan automáticamente antes de caducar; nunca se devuelven al frontend. Los POST comprueban el origen configurado, validan comandos y limitan el tamaño del cuerpo. Los datos personalizados responden `private, no-store`. OAuth usa state aleatorio con vencimiento de diez minutos. No se registran credenciales ni tokens.

Las llamadas con Bearer permanecen en `api.mendeley.com`. El proxy acepta la redirección firmada de Mendeley únicamente a HTTPS en Mendeley/Amazon S3/CloudFront y descarga sin reenviar el token. Preview/descarga mediante la app tiene límite de 40 MB. Si Mendeley cambia sus dominios de almacenamiento será necesario actualizar esa lista.

La biblioteca se carga en memoria; esta primera versión no implementa sincronización incremental ni caché para bibliotecas muy grandes. Se refresca manualmente y después de operaciones. El servidor no guarda PDFs ni una biblioteca en D1/R2 porque los datos reales residen en Mendeley. Los límites de acceso y disponibilidad dependen de Mendeley y de la app registrada.

## Publicación y validación

Local usa Next.js. Sites usa Vinext para adaptar los mismos componentes y Route Handlers a un Worker compatible con Cloudflare:

```sh
npm run build:site
```

El artefacto está en `dist/server` y `dist/client`, con metadata de hosting en `dist/.openai`. El flujo de publicación de Sites verifica/push el código y empaqueta esta salida conservando el proyecto y su acceso privado. `SITE_BUILD=1 npm run build` elige este adaptador cuando el publicador usa el script estándar.

Las 25 pruebas cubren pertenencia directa, conjuntos únicos, filtros, ciclos, metadata, upload, PDF, OAuth, paginación, protección de redirecciones, normalización API, revisiones, resultados parciales de Move, undo firmado, carpetas, papelera y reemplazo. `typecheck`, producción Next.js y producción Worker también se verifican. La herramienta opcional WebMCP `read_library_view` es de solo lectura.
