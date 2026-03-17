# CNT Core · Dashboard Financiero Personal

> Dashboard financiero personal construido como PWA (Progressive Web App). Funciona en móvil, tablet y PC. Tus datos nunca salen de tu dispositivo.

---

## ¿Qué es esto?

Un dashboard financiero completo que vive en 5 archivos. No requiere servidor, no tiene base de datos en la nube, no necesita cuenta. Los datos se guardan en tu propio navegador usando IndexedDB.

Puedes empezar **sin ningún archivo Excel** — un asistente de configuración te guía para ingresar tus datos directamente y genera el Excel inicial automáticamente. O puedes importar un `cnt.xlsx` existente si ya tienes tus datos ahí.

---

## Archivos incluidos

```
cnt.html            — El dashboard completo (toda la app en un archivo)
manifest.json       — Configuración PWA (nombre, ícono, instalación)
sw.js               — Service worker (caché offline)
icon-192.png        — Ícono de la app (requerido por Chrome para instalar)
icon-512.png        — Ícono de la app en alta resolución
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
- **Deudas** — Cards individuales con balance, tasa, proyección de interés y botón "Liquidar deuda" para saldar en un clic
- **Proyector de deudas** — Estrategias Avalanche vs Snowball con timeline, alertas de vencimiento, y simulador de fondos comprometidos
- **Fondos de emergencia** — Progreso vs meta por fondo
- **Disponibilidad (ForNow)** — Saldos de cuentas vs compromisos mensuales (calculados automáticamente desde gastos)
- **Historial mensual** — Registro histórico con gráficos de tendencia

### Edición
- Modal de edición completo para todos los datos sin tocar el Excel
- Descarga Excel actualizado con todos los cambios en cualquier momento

### Cierre de Mes
- Wizard de 8 pasos que guía el proceso mensual completo
- Registra automáticamente el mes en el historial
- Resetea checklist de pagos para el mes nuevo
- Descarga Excel actualizado con historial

| Paso | Qué haces |
|------|-----------|
| 1 | Actualiza la tasa del dólar |
| 2 | Confirma el mes y año que estás cerrando |
| 3 | Registra tu ingreso mensual en USD |
| 4 | Ingresa el gasto real total del mes |
| 5 | Actualiza los saldos de tus cuentas |
| 6 | Registra ahorros del mes y balance acumulado |
| 7 | Revisa el resumen y confirma el cierre |
| 8 | Define el nombre del próximo mes en el dashboard |

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
2. Sube los 5 archivos (`cnt.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`)
3. Ve a **Settings → Pages → Branch: main → Save**
4. Tu URL: `https://tuusuario.github.io/nombre-repo/cnt.html`

### Opción 2 — Netlify Drop

1. Ve a [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta con los 5 archivos
3. URL pública en segundos, sin cuenta

### Opción 3 — Servidor local (red WiFi)

```bash
# En la carpeta con los 5 archivos:
python3 -m http.server 8080

# Accede desde cualquier dispositivo en la misma red:
# http://[IP-de-tu-PC]:8080/cnt.html
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
  └── Wizard 8 pasos: tasa · mes · ingreso · gasto real · saldos · ahorros · confirmar · próximo mes
  └── Historial actualizado + Excel descargado + checklist reseteado

Al pagar una deuda en su totalidad:
  └── Tab Deudas → Card de la deuda → "✓ Liquidar deuda"
  └── Confirmar → balance = 0, marcada como pagada, guardado automático

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
