# Arturo Studio

Portafolio público y panel privado en `/admin/`. Conserva los 23 proyectos originales y permite añadir enlaces de YouTube/Shorts, subir videos, editar textos ES/EN, cambiar categoría/formato, ordenar por arrastre o flechas, ocultar, quitar, elegir portada y publicar un borrador.

## Uso

1. Entra en `/admin/` con la contraseña privada del estudio.
2. Añade un proyecto: pega un enlace y pulsa **Obtener datos**, o selecciona un archivo y pulsa **Preparar video**.
3. Guarda el proyecto. Arrastrar, ocultar y ordenar generan cambios locales: pulsa **Guardar borrador** para guardarlos en la nube.
4. **Vista previa** abre el borrador autenticado. **Publicar cambios** cambia lo que ven los visitantes.
5. **Versiones anteriores** recupera una publicación como borrador; revisa y publica para restaurarla. **Exportar catálogo** descarga una copia JSON.

Quitar un proyecto no destruye sus medios. Los originales y versiones conservadas en Cloudinary siguen ocupando almacenamiento hasta que se gestionen allí. Los borradores con cambios sin guardar se recuperan en el mismo navegador; los borradores guardados se comparten entre computadoras.

## Desarrollo local

Node.js 22 o superior:

```sh
npm ci
npm test
npm run dev
```

Abre `http://127.0.0.1:4173/admin/`. La contraseña local aleatoria se guarda en `scratch/dev-password.txt`; cambia al reiniciar. La biblioteca local se guarda en `scratch/dev-data/`, separada del sitio real. La carga necesita las variables de Cloudinary en `.env`; YouTube funciona con conexión a Internet. No se simulan cargas exitosas si falta el servicio.

`npm run build` prepara `dist/` mediante una lista explícita de archivos públicos. Nunca publica `.env`, `scratch`, el servidor, documentación ni credenciales. En Netlify también se empaqueta `netlify/functions/portfolio.mjs`.

## Configuración en Netlify

Conecta el repositorio y la rama que contiene este cambio. El archivo `netlify.toml` configura `npm run build`, el directorio público `dist` y las funciones. El formulario de contacto original se conserva para Netlify Forms; en un sitio nuevo hay que activar la detección de formularios y configurar sus notificaciones en Netlify.

Genera la contraseña de producción una vez:

```sh
npm run admin:password
```

El comando crea un archivo **local, ignorado por Git, con permisos 0600**, bajo `scratch/admin-access-<fecha>.txt`. Guarda la contraseña en tu gestor e introduce únicamente las variables indicadas en la configuración de entorno de Netlify:

| Variable | Uso |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | Hash scrypt de la contraseña; nunca la contraseña en claro |
| `SESSION_SECRET` | Secreto aleatorio de firma de sesiones |
| `CLOUDINARY_CLOUD_NAME` | Nombre del entorno de Cloudinary |
| `CLOUDINARY_API_KEY` | Clave de API de ese entorno |
| `CLOUDINARY_API_SECRET` | Secreto, disponible únicamente en las funciones |
| `MAX_UPLOAD_MB` | Máximo de subida por archivo; predeterminado 100 MB. No supera el límite que imponga el plan de Cloudinary |

Las dos primeras variables son suficientes para administrar proyectos existentes y enlaces de YouTube. Sin ellas, el panel falla cerrado y no permite editar. Sin las de Cloudinary, el panel explica que los archivos todavía no están disponibles. Después de configurar variables, vuelve a desplegar para que las funciones las reciban.

No se requiere un preset de carga sin firma ni exponer secretos al navegador. No contratar un plan de pago automáticamente: comprobar límites de almacenamiento, transformaciones y transferencia en la cuenta elegida.

## Dónde vive cada cosa

- **GitHub**: código, catálogo inicial `data/catalog.json` y los videos heredados en `assets/`.
- **Netlify Blobs**: estado vigente, borrador, catálogo publicado y copias de publicaciones. Almacén `portfolio-cms-v1`, con consistencia fuerte y escrituras condicionadas por ETag para evitar sobrescribir cambios de otra sesión. Los cambios editoriales no generan commits ni despliegues de código.
- **Cloudinary**: originales nuevos y derivados. Subida directa firmada en bloques de 6 MiB; video H.264/AAC MP4 de hasta 1920 px por lado, clip silenciado de hasta 5 segundos y portada JPEG. Ajuste proporcional sin recorte ni ampliación por encima de la resolución fuente.
- **YouTube**: video completo. El panel consulta oEmbed para título y miniatura. Videos privados, eliminados o con inserción deshabilitada pueden rechazarse. El hover usa el reproductor oficial en equipos con ratón; si está bloqueado o hay movimiento reducido, queda la miniatura. No se descarga contenido de YouTube.

El catálogo público se consulta al abrir la página. Ante un fallo del servicio, se conserva el HTML original como respaldo: puede mostrar el catálogo inicial hasta recuperar el servicio. Las versiones del catálogo no son copias de los archivos de video; deben mantenerse los medios referenciados.

## Verificación y operación

`npm test` comprueba autenticación, expiración/revocación de sesiones, origen de solicitudes, límites de login, visibilidad de borradores, publicación, conflictos entre sesiones, restauración, URLs, cargas firmadas y preparación de medios mediante respuestas controladas. La prueba real de Cloudinary requiere una cuenta conectada y un video pequeño.

Al publicar por primera vez, verificar `/api/catalog` (público), `/api/draft` (401 sin sesión), login, guardar/recargar borrador, publicar y restaurar. Probar carga de un archivo pequeño con Cloudinary conectado y confirmar que las tres versiones se reproducen. Probar el formulario de contacto solo con autorización para enviar una consulta real.

La fuente de verdad tras la primera edición es **Netlify Blobs**. Para nuevas categorías o secciones, modificar el catálogo vigente mediante la API autenticada y ajustar navegación/traducciones si corresponde. Cambiar solo el catálogo semilla no actualiza una biblioteca ya inicializada. `update_portfolio.py` es el generador anterior y no debe usarse para administrar el panel nuevo.

## Detalles de la migración

Se preservan el diseño, los medios existentes y los textos. Se elimina la referencia del modal a un archivo inexistente. El proyecto «3 mistakes» conserva su clip y una nota privada solicitando el enlace real, sustituyendo el enlace de prueba que apuntaba a otro video. Se vincula el original existente de «Productos o servicios» cuyo nombre no coincidía por un espacio final.
