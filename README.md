# Pepe GO! Tu Compa de Viajes

Portal para que los clientes consulten sus viajes con folio o correo. Google Sheets es la fuente de datos y Google Apps Script expone la API JSON; no usa una base de datos de pago.

## Estructura de producción

```text
index.html         Portal de clientes: https://midominio.com/
admin.html         Panel: https://midominio.com/admin.html
cotizador.html     Cotizador protegido del panel administrativo
config.js          URL de la API de Google Apps Script
assets/            Logo y recursos estáticos
css/               Estilos
js/                Lógica del portal y del administrador
components/        Componentes reutilizables
apps-script/       API para desplegar en Google Apps Script
backend/           Contrato de la API
vercel.json        Configuración de caché para Vercel
.nojekyll          Compatibilidad con GitHub Pages
```

## Configuración de Google Sheets y Apps Script

1. Crea un Google Sheet, por ejemplo `Pepe GO - Operación`.
2. En **Extensiones → Apps Script**, crea un archivo de script llamado `Code` y pega [apps-script/Code.gs](apps-script/Code.gs). Crea también el archivo HTML `Setup` con [apps-script/Setup.html](apps-script/Setup.html).
3. Ejecuta `setupSpreadsheet` una vez desde Apps Script y concede permisos. Se crean las pestañas y encabezados requeridos.
4. En **Configuración del proyecto → Propiedades del script**, crea `ADMIN_PASSWORD` con una contraseña larga y única.
5. Ve a **Implementar → Nueva implementación → Aplicación web**. Selecciona ejecutar como tú y acceso para cualquiera. Copia la URL que termina en `/exec`.
6. Verifica la URL en [config.js](config.js). La conexión actual con Apps Script ya está conservada ahí.

Las pestañas creadas son: `Clientes`, `Viajes`, `Pagos` y `Cotizaciones`. La pestaña `Cotizaciones` también se crea automáticamente al abrir o guardar desde el cotizador si todavía no existe. Al registrar un pago desde el panel se recalculan automáticamente el total pagado, saldo pendiente y porcentaje de pago.

## Cotizador y conversión a reserva

El cotizador permite guardar borradores incompletos, editarlos y convertirlos en reservas. El código base se normaliza en mayúsculas, sin espacios, y recibe el sufijo `-1`. Antes de crear la reserva, Apps Script comprueba que el folio no pertenezca a otro viaje.

Las habitaciones, destinos, vuelos y traslados se almacenan como JSON. Las cuatro imágenes se guardan como URLs públicas; no se cargan archivos a Vercel. Al editar una cotización ya convertida, se actualizan el cliente, el viaje y el anticipo relacionado sin crear registros duplicados. El portal del viajero muestra los datos sincronizados.

`setupSpreadsheet` es también la función de migración. Puede ejecutarse nuevamente sobre una instalación existente: conserva todas las columnas y filas actuales y agrega al final los encabezados nuevos que falten en `Cotizaciones`, `Viajes` y `Pagos`.

### Actualizar Apps Script

1. Reemplaza el contenido del archivo `Code.gs` del proyecto de Apps Script por [apps-script/Code.gs](apps-script/Code.gs).
2. Guarda y ejecuta `setupSpreadsheet` una vez. Autoriza los permisos si Google los solicita.
3. Ve a **Implementar → Administrar implementaciones**, edita la aplicación web y selecciona **Nueva versión**.
4. Conserva la ejecución como propietario y el mismo nivel de acceso. Al actualizar la implementación existente, la URL `/exec` configurada en `config.js` no cambia.

## Publicar en GitHub Pages

1. Sube todo el proyecto a tu repositorio de GitHub.
2. En **Settings → Pages**, elige **Deploy from a branch**, la rama a publicar y la carpeta **/(root)**.
3. El portal estará en `/` y el panel en `/admin.html`. El archivo `.nojekyll` evita que GitHub Pages procese los archivos estáticos.

## Publicar en Vercel

1. Importa el repositorio en Vercel.
2. No indiques comando de compilación ni directorio de salida: es un sitio estático servido desde la raíz.
3. Pulsa **Deploy** y conecta tu dominio en **Project Settings → Domains**.

`vercel.json` conserva caché prolongada para el logo y obliga a revalidar CSS, JavaScript y componentes, de modo que las nuevas versiones del cotizador lleguen a navegadores y celulares sin conservar código anterior.

Para publicar esta versión mediante GitHub y Vercel, sube como mínimo: `cotizador.html`, `admin.html`, `css/styles.css`, `js/cotizador.js`, `js/api.js`, `js/admin.js`, `components/trip-card.js`, `apps-script/Code.gs`, `backend/API.md`, `vercel.json` y `README.md`. Si Vercel está conectado al repositorio, el nuevo commit iniciará el despliegue automáticamente.

## Resultado

- `https://midominio.com` carga automáticamente el portal de clientes.
- `https://midominio.com/admin.html` abre el panel administrativo.
- El favicon usa el logo de Pepe GO! desde `assets/logo.png`.

> No coloques la contraseña de administrador en `config.js`; únicamente debe existir como `ADMIN_PASSWORD` en las propiedades privadas de Apps Script.
