# CNT Core · Dashboard Financiero Personal

> Dashboard financiero personal construido como PWA (Progressive Web App). Funciona en móvil, tablet y PC. Tus datos nunca salen de tu dispositivo.

---

## ¿Qué es esto?

Un dashboard financiero completo que vive en 5 archivos. No requiere servidor, no tiene base de datos en la nube, no necesita cuenta. Los datos se guardan en tu propio navegador usando IndexedDB.

Puedes empezar **sin ningún archivo Excel** — un asistente de configuración te guía para ingresar tus datos directamente y genera el Excel inicial automáticamente. O puedes importar un `cnt.xlsx` existente si ya tienes tus datos ahí.

---

## Archivos incluidos

```
cnt-dashboard-v6.html   — El dashboard completo (toda la app en un archivo)
manifest.json           — Configuración PWA (nombre, ícono, instalación)
sw.js                   — Service worker (caché offline)
icon-192.png            — Ícono de la app (requerido por Chrome para instalar)
icon-512.png            — Ícono de la app en alta resolución
```

Los 5 archivos deben estar en la **misma carpeta** para que la PWA funcione correctamente.

---

## Primeros pasos

Al abrir el dashboard por primera vez verás tres opciones:

### Opción A — Empezar desde cero ✨ (sin Excel)
Si es tu primera vez o no tienes un archivo Excel previo, elige **"Empezar desde cero"**. Un asistente de 5 pasos te guiará para configurar:

| Paso | Qué configuras |
|------|----------------|
| 1 | Mes, año, tasa dólar, ingreso mensual, días de alerta |
| 2 | Cuentas disponibles (corriente, ahorro, cash…) con sus saldos |
| 3 | Gastos fijos, deudas y cuotas mensuales |
| 4 | Fondos de emergencia y balance de ahorros acumulado |
| 5 | Resumen y confirmación |

Al confirmar, el dashboard se lanza con tus datos y se descarga automáticamente un `cnt.xlsx` como respaldo inicial. Los datos también quedan guardados localmente en el navegador.

### Opción B — Importar archivo Excel 📂
Si ya tienes un `cnt.xlsx` con datos, arrástralo o selecciónalo. El dashboard lo procesa localmente y guarda los datos en el navegador para futuras visitas.

### Opción C — Continuar donde lo dejé ▶
Si ya usaste el dashboard antes en este navegador, aparece esta opción automáticamente. Abre los datos guardados sin necesidad de subir nada.

---

## Funcionalidades

### Dashboard
- **Resumen mensual** — KPIs de ingresos, gastos, superávit y net worth
- **Alertas** — Pagos próximos a vencer y pagos atrasados con días de retraso
- **Gastos & Deudas** — Tabla completa con estado de pago por ítem
- **Checklist de pagos** — Marca cada compromiso como pagado con persistencia automática
- **Deudas** — Cards individuales con balance, tasa, proyección de interés
- **Proyector de deudas** — Estrategias Avalanche vs Snowball con timeline y alertas de vencimiento
- **Fondos de emergencia** — Progreso vs meta por fondo
- **Disponibilidad (ForNow)** — Saldos de cuentas vs comprometido del mes
- **Historial mensual** — Registro histórico con gráficos de tendencia

### Edición
- Modal de edición completo para todos los datos sin tocar el Excel
- Descarga Excel actualizado con todos los cambios en cualquier momento

### Cierre de Mes
- Wizard de 7 pasos que guía el proceso mensual completo
- Registra automáticamente el mes en el historial
- Resetea checklist de pagos para el mes nuevo
- Descarga Excel actualizado con historial

### PWA / Offline
- Se instala como app nativa en Android, iOS y PC
- Funciona completamente sin conexión después de la primera visita
- Datos guardados automáticamente en el navegador (IndexedDB)
- Próximas visitas cargan los datos sin necesidad de subir el Excel

---

## Estructura del Excel (`cnt.xlsx`)

El archivo Excel tiene 5 hojas. Si empezaste desde cero, el dashboard lo genera automáticamente con esta estructura.

| Hoja | Contenido |
|------|-----------|
| `Config` | Tasa dólar, mes actual, año, ingreso mensual USD, días de alerta |
| `Esenciales` | Gastos y deudas mensuales (12 columnas) |
| `ForNow` | Saldos de cuentas de disponibilidad inmediata |
| `Emergency` | Fondos de emergencia y cashflow |
| `Historial` | Registro mensual histórico |

### Hoja Config

| Clave | Ejemplo |
|-------|---------|
| Tasa Dólar | `60.5` |
| Mes Actual | `Marzo` |
| Año | `2026` |
| Ingreso Mensual | `4208` (en USD) |
| Días alerta | `5` |

### Hoja Esenciales — columnas (índice 0–11)

| Col | Campo |
|-----|-------|
| 0 | Descripción |
| 1 | Tipo (Familiar, Cuota, Préstamo, Servicio…) |
| 2 | Pagado (RD$) |
| 3 | Adeudado/Cuota (RD$) |
| 4 | Día de pago |
| 5 | Tasa de interés % |
| 6 | Balance pendiente (RD$) |
| 7 | Monto original (RD$) |
| 8 | Monto original (USD) |
| 9 | Fecha límite (YYYY-MM-DD) |
| 10 | Notas |
| 11 | Pagado_Mes (SI / NO) |

> **Nota:** La tasa de interés puede estar como porcentaje (`19.45`) o decimal (`0.1945`) — el dashboard normaliza automáticamente.

---

## Instalación y despliegue

### Opción 1 — GitHub Pages (recomendado)

1. Crea un repositorio en [github.com](https://github.com)
2. Sube los 5 archivos (`cnt-dashboard-v6.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`)
3. Ve a **Settings → Pages → Branch: main → Save**
4. Tu URL: `https://tuusuario.github.io/nombre-repo/cnt-dashboard-v6.html`

### Opción 2 — Netlify Drop

1. Ve a [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta con los 5 archivos
3. URL pública en segundos, sin cuenta

### Opción 3 — Servidor local (red WiFi)

```bash
# En la carpeta con los 5 archivos:
python3 -m http.server 8080

# Accede desde cualquier dispositivo en la misma red:
# http://[IP-de-tu-PC]:8080/cnt-dashboard-v6.html
```

> ⚠️ El service worker no funciona con `file://`. Usa siempre un servidor HTTP.

---

## Instalar como app

### Android (Chrome)
1. Abre la URL en **Chrome**
2. Espera el banner: *"Agregar CNT Core a la pantalla de inicio"* → **Instalar**
3. Si no aparece: menú `⋮` → **"Agregar a pantalla de inicio"**

### iOS (Safari)
1. Abre la URL en **Safari** (requerido en iOS — Chrome no soporta PWA en iOS)
2. Botón compartir `⬆` → **"Agregar a pantalla de inicio"** → **Agregar**

### PC (Chrome / Edge)
1. Abre la URL en Chrome o Edge
2. Ícono `⊕` en la barra de direcciones → **Instalar**

---

## Persistencia local (IndexedDB)

| Acción | Resultado |
|--------|-----------|
| Primera carga / asistente completado | Datos guardados automáticamente |
| Editar datos y aplicar | Guardado automático |
| Marcar pago en checklist | Guardado automático |
| Cerrar el mes (wizard) | Guardado automático + Excel descargado |
| Próxima visita | Banner "Continuar donde lo dejé" |
| Borrar datos | Botón 🗑 en el banner de inicio |

> Los datos son específicos del navegador y dispositivo. Si cambias de navegador o dispositivo, necesitas importar el Excel una vez.

---

## Flujo mensual recomendado

```
Durante el mes:
  └── Abrir la app → Checklist → Marcar pagos conforme se realizan
  └── Cambios guardados automáticamente

Al cierre del mes:
  └── Header → "🗓 Cerrar Mes"
  └── Wizard 7 pasos: tasa · mes · ingreso · gasto real · saldos · ahorros · confirmar
  └── Historial actualizado + Excel descargado + checklist reseteado

Al inicio del mes nuevo:
  └── Si los gastos/deudas cambiaron → Editar → ajustar → aplicar
  └── Si no cambiaron → empieza a marcar el checklist directamente
```

---

## Tecnologías utilizadas

| Tecnología | Uso |
|------------|-----|
| HTML / CSS / JavaScript vanilla | La app completa — sin frameworks |
| [SheetJS (xlsx)](https://sheetjs.com) | Leer y escribir archivos Excel |
| [Chart.js](https://chartjs.org) | Gráficos de donut, barras y líneas |
| IndexedDB | Persistencia local de datos |
| Service Worker | Caché offline |
| Web App Manifest | Instalación como app nativa |
| Google Fonts (Syne + JetBrains Mono) | Tipografía |

---

## Privacidad

- ✅ Ningún dato se envía a ningún servidor
- ✅ Todo el procesamiento ocurre en tu navegador
- ✅ IndexedDB almacena datos solo en tu dispositivo
- ✅ El service worker solo cachea los archivos de la app — nunca tus datos financieros
- ✅ Sin analytics, cookies de terceros ni telemetría

---

## Notas técnicas

**¿Por qué 5 archivos y no uno solo?**
El service worker (`sw.js`) debe ser un archivo separado por especificación del navegador. El `manifest.json` y los íconos PNG también deben ser archivos externos — Chrome rechaza íconos en formato `data:` URI para mostrar el banner de instalación.

**¿Funciona con `file://`?**
El dashboard y el asistente de configuración funcionan, pero el service worker y la instalación como PWA requieren HTTPS o `localhost`. IndexedDB sí funciona con `file://`.

**¿Qué pasa si actualizo el HTML?**
El service worker usa Network-first para el HTML — siempre intenta descargar la versión más nueva. Si estás offline, usa la versión cacheada.

**Compatibilidad de navegadores**

| Navegador | PWA | IndexedDB | Offline |
|-----------|-----|-----------|---------|
| Chrome / Edge | ✅ Completo | ✅ | ✅ |
| Safari iOS 16.4+ | ✅ Completo | ✅ | ✅ |
| Firefox | ⚠️ Sin instalación | ✅ | ✅ |


> Dashboard financiero personal construido como PWA (Progressive Web App). Funciona en móvil, tablet y PC. Tus datos nunca salen de tu dispositivo.

---

## ¿Qué es esto?

Un dashboard financiero completo que vive en 3 archivos. No requiere servidor, no tiene base de datos en la nube, no necesita cuenta. Los datos se guardan en tu propio navegador usando IndexedDB.

Toma un archivo Excel (`cnt.xlsx`) como fuente de verdad y genera un dashboard interactivo con gráficos, alertas, proyector de deudas, fondos de emergencia e historial mensual.

---

## Archivos incluidos

```
cnt-dashboard-v6.html   — El dashboard completo (toda la app en un archivo)
manifest.json           — Configuración PWA (nombre, ícono, instalación)
sw.js                   — Service worker (caché offline)
```

Los 3 archivos deben estar en la **misma carpeta** para que la PWA funcione correctamente.

---

## Funcionalidades

### Dashboard
- **Resumen mensual** — KPIs de ingresos, gastos, superávit y net worth
- **Alertas** — Pagos próximos a vencer y pagos atrasados con días de retraso
- **Gastos & Deudas** — Tabla completa con estado de pago por ítem
- **Checklist de pagos** — Marca cada compromiso como pagado con persistencia en Excel
- **Deudas** — Cards individuales con balance, tasa, proyección de interés
- **Proyector de deudas** — Estrategias Avalanche vs Snowball con timeline de liberación
- **Fondos de emergencia** — Progreso vs meta por fondo
- **Disponibilidad (ForNow)** — Saldos de cuentas vs comprometido del mes
- **Historial mensual** — Registro histórico con gráficos de tendencia

### Edición
- Modal de edición completo para todos los datos sin necesidad de modificar el Excel
- Descarga Excel actualizado con todos los cambios

### Cierre de Mes
- Wizard de 7 pasos que guía el proceso mensual
- Registra automáticamente el mes en el historial
- Resetea checklist de pagos para el mes nuevo
- Descarga Excel actualizado con historial

### PWA / Offline
- Se instala como app nativa en Android, iOS y PC
- Funciona completamente sin conexión después de la primera visita
- Los datos se guardan automáticamente en el navegador (IndexedDB)
- La próxima visita carga los datos sin necesidad de subir el Excel

---

## Estructura del Excel (`cnt.xlsx`)

El archivo Excel debe tener 5 hojas con estos nombres:

| Hoja | Contenido |
|------|-----------|
| `Config` | Tasa dólar, mes actual, año, ingreso mensual USD, días de alerta |
| `Esenciales` | Gastos y deudas mensuales (14+ columnas) |
| `ForNow` | Saldos de cuentas de disponibilidad inmediata |
| `Emergency` | Fondos de emergencia y cashflow |
| `Historial` | Registro mensual histórico |

### Hoja Config — columnas esperadas

| Clave | Ejemplo |
|-------|---------|
| Tasa Dólar | `60.5` |
| Mes Actual | `Marzo` |
| Año | `2026` |
| Ingreso Mensual | `4208` (en USD) |
| Días alerta | `5` |

### Hoja Esenciales — columnas (índice 0–11)

| Col | Campo |
|-----|-------|
| 0 | Descripción |
| 1 | Tipo (Familiar, Cuota, Préstamo, Servicio…) |
| 2 | Pagado (RD$) |
| 3 | Adeudado (RD$) |
| 4 | Día de pago |
| 5 | Tasa de interés % |
| 6 | Balance pendiente (RD$) |
| 7 | Monto original (RD$) |
| 8 | Monto original (USD) |
| 9 | Fecha límite (YYYY-MM-DD) |
| 10 | Notas |
| 11 | Pagado_Mes (SI / NO) |

> **Nota:** La tasa de interés puede estar como porcentaje (`19.45`) o decimal (`0.1945`) — el dashboard normaliza automáticamente.

---

## Instalación y despliegue

### Opción 1 — GitHub Pages (recomendado)

1. Crea un repositorio en [github.com](https://github.com) — puede ser privado o público
2. Sube los 3 archivos (`cnt-dashboard-v6.html`, `manifest.json`, `sw.js`)
3. Ve a **Settings → Pages → Branch: main → Save**
4. Tu URL quedará: `https://tuusuario.github.io/nombre-repo/cnt-dashboard-v6.html`

### Opción 2 — Netlify Drop

1. Ve a [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta con los 3 archivos
3. Obtienes una URL pública en segundos

### Opción 3 — Servidor local (red WiFi)

```bash
# En la carpeta con los 3 archivos:
python3 -m http.server 8080

# Luego abre en cualquier dispositivo de la misma red:
# http://[IP-de-tu-PC]:8080/cnt-dashboard-v6.html
```

> ⚠️ El service worker no funciona con `file://`. Siempre usa un servidor HTTP, aunque sea local.

---

## Instalar como app en Android

1. Abre la URL del dashboard en **Chrome para Android**
2. Espera a que aparezca el banner inferior: *"Agregar CNT Core a la pantalla de inicio"*
3. Toca **Instalar**
4. El ícono aparece en tu launcher — se abre sin barra del navegador

Si el banner no aparece automáticamente: menú `⋮` → **"Agregar a pantalla de inicio"**

## Instalar como app en iOS (Safari)

1. Abre la URL en **Safari** (no Chrome — Safari es requerido en iOS para PWA)
2. Toca el botón de compartir `⬆`
3. Selecciona **"Agregar a pantalla de inicio"**
4. Confirma el nombre y toca **Agregar**

## Instalar como app en PC (Chrome / Edge)

1. Abre la URL en Chrome o Edge
2. Busca el ícono de instalación `⊕` en la barra de direcciones
3. Haz clic → **Instalar**

---

## Persistencia local (IndexedDB)

El dashboard guarda automáticamente todos los datos en tu navegador:

- **Primera vez:** subes el `.xlsx` → los datos se guardan en IndexedDB
- **Visitas siguientes:** aparece el banner "Datos guardados" → abres con un clic sin subir nada
- **Auto-guardado** ocurre después de: editar datos, marcar pagos, cerrar el mes
- **Borrar datos:** botón 🗑 en el banner de la pantalla de carga

> Los datos de IndexedDB son específicos del navegador y dispositivo. Si cambias de navegador o dispositivo, necesitas subir el Excel de nuevo una vez.

---

## Flujo mensual recomendado

```
Durante el mes:
  └── Abrir la app → Checklist → Marcar pagos conforme se realizan
  └── Los cambios se guardan automáticamente (sin necesidad de descargar Excel)

Al cierre del mes:
  └── Header → "🗓 Cerrar Mes"
  └── Completar el wizard de 7 pasos (tasa, mes, ingreso, gasto, saldos, ahorros)
  └── Confirmar → se agrega al Historial + se descarga Excel actualizado + se resetea checklist

Al inicio del mes nuevo:
  └── Si los valores de Esenciales cambiaron → Editar → descargar Excel → listo
  └── Si no cambiaron → solo empieza a marcar el checklist
```

---

## Tecnologías utilizadas

| Tecnología | Uso |
|------------|-----|
| HTML / CSS / JavaScript vanilla | La app completa — sin frameworks |
| [SheetJS (xlsx)](https://sheetjs.com) | Leer y escribir archivos Excel |
| [Chart.js](https://chartjs.org) | Gráficos de donut, barras y líneas |
| IndexedDB | Persistencia local de datos |
| Service Worker | Caché offline |
| Web App Manifest | Instalación como app nativa |
| Google Fonts (Syne + JetBrains Mono) | Tipografía |

---

## Privacidad

- ✅ Ningún dato se envía a ningún servidor
- ✅ Todo el procesamiento ocurre en tu navegador
- ✅ IndexedDB almacena datos solo en tu dispositivo
- ✅ El service worker solo cachea los archivos de la app (JS, CSS, fuentes) — nunca tus datos financieros
- ✅ No hay analytics, cookies de terceros ni telemetría

---

## Notas técnicas

**¿Por qué 3 archivos y no uno solo?**
El service worker (`sw.js`) debe ser un archivo separado por especificación del navegador — no puede estar inline en el HTML. El `manifest.json` también debe ser un archivo externo para que los navegadores lo detecten correctamente.

**¿Funciona con `file://`?**
El dashboard funciona, pero el service worker y la instalación como PWA requieren HTTPS o `localhost`. IndexedDB sí funciona con `file://`.

**¿Qué pasa si actualizo el HTML?**
El service worker usa Network-first para el HTML — siempre intenta descargar la versión más nueva. Si estás offline, usa la versión cacheada.

**Compatibilidad de navegadores**
- Chrome / Edge: soporte completo (PWA + IndexedDB + SW)
- Safari iOS 16.4+: soporte completo
- Firefox: IndexedDB + SW funcionan, instalación como PWA limitada
