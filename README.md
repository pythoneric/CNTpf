# CNT Core · Dashboard Financiero Personal

> Dashboard financiero personal construido como PWA (Progressive Web App). Funciona en movil, tablet y PC. Tus datos nunca salen de tu dispositivo.

---

## Que es esto?

Un dashboard financiero completo que vive en 5 archivos. No requiere servidor, no tiene base de datos en la nube, no necesita cuenta. Los datos se guardan en tu propio navegador usando IndexedDB.

Puedes empezar **sin ningun archivo** -- un asistente de configuracion te guia para ingresar tus datos directamente y genera el respaldo JSON inicial automaticamente. Tambien puedes importar un `.json` exportado previamente, o un `.xlsx` legacy si ya tienes datos en Excel.

Soporta **espanol e ingles** con cambio de idioma en tiempo real, temas **oscuro y claro**, y **moneda dual USD / RD$** con conversion automatica.

---

## Archivos incluidos

```
cnt.html            -- El dashboard completo (toda la app en un archivo)
manifest.json       -- Configuracion PWA (nombre, icono, instalacion)
sw.js               -- Service worker (cache offline)
icon-192.png        -- Icono de la app (requerido por Chrome para instalar)
icon-512.png        -- Icono de la app en alta resolucion
```

Los 5 archivos deben estar en la **misma carpeta** para que la PWA funcione correctamente.

Archivos adicionales para desarrollo:
```
playwright.config.js  -- Configuracion de tests E2E
tests/                -- Suite de tests Playwright (377 tests)
package.json          -- Dependencias de desarrollo (Playwright)
```

---

## Primeros pasos

Al abrir el dashboard por primera vez veras tres opciones:

### Opcion A -- Empezar desde cero (sin Excel)
Si es tu primera vez o no tienes un archivo Excel previo, elige **"Empezar desde cero"**. Un asistente de 5 pasos te guiara para configurar:

| Paso | Que configuras |
|------|----------------|
| 1 | Moneda principal (USD o RD$), mes, ano, tasa dolar, **frecuencia de pago** (mensual / cada 2 semanas / semanal), ingreso por pago, dias de alerta |
| 2 | Cuentas disponibles (corriente, ahorro, cash...) con sus saldos y moneda (RD$/USD) |
| 3 | Gastos fijos, deudas y cuotas mensuales con tipo, tasa y balance |
| 4 | Fondos de emergencia con balance actual, meta minima y moneda |
| 5 | Resumen y confirmacion |

Al confirmar, el dashboard se lanza con tus datos y se descarga automaticamente un `cnt.json` como respaldo. Los datos tambien quedan guardados localmente en el navegador.

### Opcion B -- Importar archivo
Arrastra o selecciona un archivo `.json` (exportado previamente) o `.xlsx` (legacy). El dashboard lo procesa localmente y guarda los datos en el navegador para futuras visitas.

### Opcion C -- Continuar donde lo deje
Si ya usaste el dashboard antes en este navegador, aparece esta opcion automaticamente. Abre los datos guardados sin necesidad de subir nada.

### Opcion D -- Ver demo con datos de ejemplo
Dos demos disponibles:
- **Demo RD$** 🇩🇴 -- Persona dominicana con finanzas en pesos (Maria Fernandez, marketing manager, Santo Domingo). Ingreso RD$233,700/mes, hipoteca, auto, tarjetas, 18 meses de historial.
- **Demo USD** 🇺🇸 -- Persona estadounidense con finanzas en dolares (profesional USA). Ingreso $6,500/mes, mortgage, car loan, student loan, credit cards, 18 meses de historial.

Ambas demos son ficticias y utiles para explorar el dashboard sin ingresar datos propios.

---

## Pestanas del Dashboard

El dashboard tiene **12 pestanas** organizadas en **2 grupos** mediante un control segmentado (pill toggle). El grupo activo se recuerda entre sesiones.

### Operaciones — dia a dia financiero

| Pestana | Descripcion |
|---------|-------------|
| **Resumen** | KPIs de ingresos, gastos, superavit, net worth, tasa de ahorro y salud financiera |
| **Alertas & Pagos** | Checklist de pagos con countdown, calendario visual, alertas DTI, amortizacion negativa, fondo de emergencia y anomalias |
| **Registro** | Registro de gastos reales con categorias, transacciones recurrentes, graficos por tipo y totales del mes |
| **Presupuesto** | Presupuesto base cero por categoria con comparacion vs gastos reales del Registro |
| **Gastos** | Tabla completa de gastos y deudas con estado de pago, ETA de liquidacion por item |
| **Fondos** | Saldos de cuentas (RD$/USD) vs compromisos mensuales, disponibilidad real, autonomia en meses y cashflow mensual detallado |

### Estrategia — planificacion y analisis

| Pestana | Descripcion |
|---------|-------------|
| **Emergencia** | Fondos de emergencia con cobertura en meses, doughnut de progreso y plan de asignacion |
| **Deudas** | Cards individuales con balance, tasa, ETA de liquidacion, proyeccion de interes y boton "Liquidar deuda" |
| **Proyector** | Simulador de pago de deudas: Avalancha vs Bola de Nieve con escenarios what-if |
| **Metas** | Metas de ahorro con sparkline de proyeccion, progreso, ETA estimado y advertencia de sobrecompromiso |
| **Analisis** | Resumen financiero, flujo de caja waterfall, BVA, proyecciones de pago y tendencia de gastos |
| **Historial** | Registro historico con graficos de tendencia, proyeccion de net worth, tasa de ahorro y evolucion de deudas |

> En movil, el pill toggle aparece fijo encima de la barra de navegacion inferior. En desktop, aparece centrado encima de las pestanas. Navegar a una pestana de otro grupo cambia el grupo automaticamente (incluyendo deep links con `#tab-xxx`).

---

## Funcionalidades

### Dashboard y KPIs
- **5 KPIs principales** -- Ingresos, gastos totales (obligaciones + gastos registrados), superavit del mes, net worth, y tasa de ahorro con guia 50/30/20
- **Flechas delta mes-a-mes** -- Cada KPI muestra ▲/▼ comparando con el mes anterior del historial (verde = mejora, rojo = empeora, contextual por metrica)
- **Salud financiera** -- Puntaje de 0-100 con calificacion (Excelente/Bueno/Regular/Critico) basado en ratio de gastos, DTI, fondo de emergencia y tendencia de net worth
- **Distribucion de flujo de caja** -- Barra visual de gastos vs sobrante con metricas de retiro USD, tasa, ahorros y compromisos
- **Moneda dual** -- Soporte completo para USD y RD$ como moneda principal. Selector en el asistente de configuracion y en Editar > Configuracion. Todos los montos, graficos y KPIs se adaptan automaticamente. Internamente los datos se almacenan en RD$ y se convierten al vuelo para usuarios USD
- **Frecuencia de pago** -- Selecciona como te pagan: mensual, cada 2 semanas (quincenal) o semanal. Ingresa el monto que recibes por pago y el dashboard calcula automaticamente el equivalente mensual (× 26/12 quincenal, × 52/12 semanal) para todos los KPIs (DTI, tasa de ahorro, presupuesto, salud financiera). Editable desde el asistente o desde Editar > Configuracion
- **Mi Saldo (billetera de efectivo)** -- Seguimiento en tiempo real del saldo de efectivo. Cada cuenta de Fondos tiene un tipo (`cash` / `banco` / `ahorro` / `inversion`) y una se marca como **Mi Saldo** principal. Lo que el feature hace por ti:
  - **Chip en el header + tarjeta en Resumen** muestran el saldo actual con los ultimos 5 movimientos
  - **Deduccion automatica de transacciones en efectivo** -- al registrar un gasto en el Registro con metodo "Efectivo", el saldo baja automaticamente. Borrar la transaccion lo restaura
  - **Deduccion automatica de gastos fijos** -- cada gasto/deuda puede tener un metodo de pago (Efectivo / Tarjeta / Transferencia / sin auto-debito). Marcar uno como pagado en el checklist con metodo Efectivo descuenta la cuota del saldo. Desmarcar la restaura. Los items en efectivo muestran un badge 💵 en el checklist
  - **Boton "Recibi mi pago"** -- en la tarjeta de Resumen, abona automaticamente el equivalente mensual del ingreso (ingresoUSD x payFrequency multiplier x tasa) una vez por mes
  - **Boton flotante de pago rapido** -- FAB con icono +. Modal de 4 campos (monto, metodo, categoria, descripcion) para registrar un pago en segundos. Si no hay billetera configurada, se abre el asistente de configuracion y al confirmar reanuda el pago
  - **Configuracion** -- en el asistente "Empezar desde cero" (paso 2) o en Editar > Fondos. Si haces tu primera transaccion en efectivo sin billetera, el sistema te pide configurar el saldo inicial
  - **Soporta moneda mixta** -- billetera USD con transacciones en RD$ (o viceversa) se convierten via la tasa
- **Hitos de net worth** -- Celebraciones automaticas al alcanzar net worth positivo, libre de deudas, RD$100K, RD$500K y RD$1M

### Alertas & Pagos (tab unificado)
- **Checklist de pagos** -- Marca cada compromiso como pagado con persistencia automatica
- **Cuenta regresiva** -- Muestra el proximo pago pendiente con dias restantes, nombre y monto (coloreado por urgencia)
- **Calendario de pagos** -- Timeline visual de pagos pendientes agrupados por dia con totales
- Progreso por cantidad y por monto (RD$)
- Analisis de intereses con tabla de costo por deuda
- Botones de "Marcar todos" y "Resetear"
- **Vencimientos proximos** -- Pagos que vencen dentro de los proximos dias (configurable)
- **Pagos atrasados** -- Compromisos no pagados despues de su dia de pago
- **Fechas limite** -- Deudas con fecha limite dentro de 60 dias
- **DTI elevado** -- Alerta a >36% (riesgo crediticio) y urgente a >43% (umbral de prestamistas)
- **Amortizacion negativa** -- Alerta urgente cuando el pago mensual no cubre los intereses y la deuda crece
- **Tasa alta** -- Advertencia para deudas con tasa >15% anual
- **Fondo de emergencia** -- Critico si <25% de la meta, bajo si <50%
- **Carga de intereses** -- Alerta si los intereses consumen >50% del superavit
- **Anomalia de gastos** -- Alerta si los gastos del mes superan 120% del promedio de los ultimos 3 meses
- **Indicador visual** -- Punto rojo pulsante en la pestana cuando hay urgencias

### Registro de Gastos
- Registra gastos reales del dia a dia para responder "a donde se fue mi dinero?"
- **Formulario rapido** -- Fecha, monto, categoria, metodo de pago (efectivo/tarjeta/transferencia) y nota opcional
- **9 categorias** -- Comida, Transporte, Entretenimiento, Salud, Compras, Hogar, Educacion, Personal, Otro
- **Vinculacion opcional** -- Conecta una transaccion a un gasto/deuda existente
- **Transacciones recurrentes** -- Al agregar un gasto, selecciona frecuencia (diario/semanal/quincenal/mensual) para que se repita automaticamente
- **Gestion de reglas recurrentes** -- Lista de reglas activas al final del tab con opcion de eliminar (las transacciones ya generadas no se borran)
- **Generacion automatica** -- Las transacciones recurrentes se generan al abrir la app, con deduplicacion por fecha e ID
- **Badge visual** -- Las transacciones generadas automaticamente muestran un indicador 🔄 en la lista
- **KPIs del mes** -- Total gastado (con color contextual: verde/amarillo/rojo vs presupuesto), cantidad de transacciones y promedio diario (correcto para meses pasados y actuales)
- **Tendencia de gasto** -- Mini-grafico de barras comparando gasto actual vs ultimos 2 meses del historial con delta porcentual (verde si baja, rojo si sube)
- **Grafico de dona** -- Distribucion de gastos por categoria
- **Lista cronologica** -- Todas las transacciones del mes con opcion de eliminar
- Al cerrar el mes, el total registrado se archiva en el historial como `gastoReal`
- Editable en el modal de edicion (pestana Transacciones)
- Exportable/importable via Excel (hoja "Transacciones")

### Presupuesto (Forward Budget)
- Presupuesto mensual base cero: asigna el monto disponible (despues de compromisos fijos) a las 9 categorias
- **Formulario de asignacion** -- 9 campos (uno por categoria) con contador en tiempo real de monto sin asignar
- **Estimacion de recurrentes** -- Cada categoria muestra cuanto se espera de transacciones recurrentes
- **Tabla presupuesto vs real** -- Compara montos asignados vs gastos reales del Registro con barras de progreso y varianza
- **Grafico de barras agrupadas** -- Presupuestado vs gastado por categoria (Chart.js)
- **4 KPIs** -- Ingreso del mes, compromisos fijos (gastos/deudas), disponible para categorias, y sin asignar (o sobre-asignado en rojo)
- **Alerta de sobre-gasto** -- Muestra cuantas categorias excedieron el presupuesto
- **Cierre de mes** -- El total presupuestado se archiva en historial; el presupuesto se copia automaticamente al mes siguiente
- Editable en el modal de edicion (pestana Presupuesto)
- Exportable/importable via Excel (hoja "Presupuesto")

### Proyector de Deudas
- **Fondos comprometidos** -- Calcula runway (meses de gastos cubiertos), disponible seguro, y capacidad de redireccion
- **Simulador de pago extra** -- Slider configurable con escenarios what-if (25%, 40%, 50%, 100% del superavit)
- **Costo real de la deuda** -- Tabla con interes mensual, pago a capital y eficiencia por deuda
- **Deteccion de amortizacion negativa** -- Alerta prominente cuando pagos no cubren intereses
- **Estrategias comparadas** -- Avalancha (mayor tasa primero) vs Bola de Nieve (menor balance primero) con timeline, interes total y meses ahorrados

### Fondos de Emergencia
- **Cobertura en meses** -- KPI mostrando cuantos meses de gastos cubre el fondo (verde >=6, amarillo 3-6, rojo <3)
- **Doughnut de cobertura** -- Grafico mostrando meses cubiertos vs meta de 6 meses
- Progreso individual por fondo con barra de color
- Moneda dual (RD$/USD) con conversion automatica
- **Meta vinculada a gastos** -- Nuevos fondos se pre-llenan con meta = 3x gastos mensuales
- Asignacion dinamica del superavit (20% si hay deuda de alta tasa, 50% si no)
- Plan de aporte sugerido con estimado de tiempo para alcanzar meta

### Metas de Ahorro
- Nombre, monto meta, monto ahorrado y aporte mensual por meta
- **Sparkline de proyeccion** -- Mini-grafico SVG mostrando la trayectoria de ahorro proyectada hasta la meta (con linea punteada de meta)
- Barra de progreso con fecha estimada de completacion (ETA)
- Advertencia si aportes mensuales totales superan el superavit
- Grafico horizontal de progreso por meta

### Historial
- Tabla de registros mensuales con tasa de ahorro color-coded (verde >=20%, amarillo 10-20%, rojo <10%)
- **Grafico de net worth y deudas** -- Linea de evolucion historica con proyeccion punteada de 3 meses (extrapolacion lineal)
- **Grafico de ingresos vs gastos** -- Comparacion por mes
- **Grafico de balance de deudas** -- Tendencia de deuda y fondo de emergencia
- **Grafico de tasa de ahorro** -- Barras color-coded con meta del 20%
- **Tendencia de gastos recurrentes** -- Comparacion mes actual vs anterior por tipo

### Analisis
- **Resumen financiero** -- Card superior con 4 metricas: obligaciones mensuales, interes mensual, tiempo libre de deuda, interes total proyectado. Alerta si intereses >50% del superavit
- **Flujo de caja waterfall** -- Desglose visual: Ingreso → Compromisos fijos → Gasto registrado → Aportes a metas → Sobrante, con nota de intereses
- **Presupuesto vs Real (BVA)** -- Comparacion de pagado vs adeudado por gasto con indicadores de desviacion
- **Proyecciones de pago** -- Fechas estimadas de liquidacion por deuda
- **Tendencia de gastos** -- Evolucion por categoria con flechas de direccion

### Edicion
- Modal de edicion completo con 8 pestanas: Configuracion, Gastos & Deudas, Fondos, Emergencia, Historial, Transacciones, Presupuesto, Recurrentes
- **Sincronizacion en tiempo real** -- Cambios en configuracion se reflejan inmediatamente en los datos
- **Tipo de gasto como dropdown** -- 10 categorias predefinidas para evitar duplicados
- **Campos vinculados** -- Original RD$ y USD se sincronizan automaticamente usando la tasa
- **Conversion de moneda** -- Al cambiar moneda de una cuenta, ofrece convertir el saldo
- **Validacion de campos** -- Dia de pago (1-31), tasa (0-100%), balances no negativos
- **Deteccion de pagos** -- Reduccion de balance ofrece registrar como pago (con confirmacion)
- **Soporte de comas** -- Numeros pegados con comas (ej: "1,500") se parsean correctamente
- Advertencia de cambios sin guardar al cerrar
- Confirmacion de eliminacion en todas las secciones
- Exporta respaldo JSON con todos los cambios en cualquier momento

### Cierre de Mes
- Wizard de 8 pasos que guia el proceso mensual completo
- Registra automaticamente el mes en el historial
- Resetea checklist de pagos para el mes nuevo
- Descarga respaldo JSON con historial
- **Resumen post-cierre** -- Muestra tasa de ahorro, cambio en deuda y cambio en net worth

| Paso | Que haces |
|------|-----------|
| 1 | Actualiza la tasa del dolar |
| 2 | Confirma el mes y ano que estas cerrando |
| 3 | Registra tu ingreso mensual en USD |
| 4 | Ingresa el gasto real total del mes |
| 5 | Actualiza los saldos de tus cuentas |
| 6 | Registra ahorros del mes y balance acumulado |
| 7 | Revisa el resumen y confirma el cierre |
| 8 | Define el nombre del proximo mes en el dashboard |

### Idiomas
- **Espanol** (por defecto) e **Ingles** -- 420+ claves de traduccion (incluyendo moneda dual)
- Cambio en tiempo real sin recargar la pagina
- Boton de idioma en el header y en la pantalla de inicio

### Tema Oscuro / Claro
- Tema oscuro por defecto, con toggle a tema claro
- Variables CSS para personalizacion completa
- Boton de tema en el header

### Exportacion
- **JSON (.json)** -- Exporta todos los datos como archivo JSON lossless (formato nativo de respaldo)
- **Excel (.xlsx)** -- Importacion legacy compatible (solo lectura, no se exporta)
- **Snapshot (PDF)** -- Exporta vista actual optimizada para impresion

### PWA / Offline
- Se instala como app nativa en Android, iOS y PC
- Funciona completamente sin conexion despues de la primera visita
- Datos guardados automaticamente en el navegador (IndexedDB)
- Proximas visitas cargan los datos sin necesidad de subir nada

---

## Formato de datos

### JSON (formato nativo)

El respaldo se exporta como un archivo `.json` con esta estructura:

```json
{
  "_meta": { "version": 4, "exportedAt": "2026-03-30T...", "app": "CNTpf" },
  "config": { "tasa": 60, "mes": "Marzo", "anio": 2026, "ingresoUSD": 3000, "diasAlerta": 5, "monedaPrincipal": "RD", "payFrequency": "mensual", "defaultCashAccountId": "cnt_…" },
  "gastos": [...],
  "forNow": { "cuentas": [...], "fecha": "...", "total": 0 },
  "emerg": { "fondos": [...], "cashflow": {...} },
  "historial": [...],
  "metas": [...],
  "transacciones": [...],
  "presupuesto": [...],
  "recurrentes": [...]
}
```

### Excel (formato legacy, solo importacion)

El archivo Excel tiene hasta **9 hojas**. La importacion desde Excel sigue siendo compatible para usuarios existentes. Las hojas opcionales (Metas, Transacciones, Presupuesto, Recurrentes) solo se crean si hay datos.

| Hoja | Contenido |
|------|-----------|
| `Config` | Tasa dolar, mes actual, ano, ingreso mensual USD, dias de alerta |
| `Esenciales` | Gastos y deudas mensuales (12 columnas) |
| `ForNow` | Saldos de cuentas de disponibilidad inmediata con moneda |
| `Emergency` | Fondos de emergencia y cashflow |
| `Historial` | Registro mensual historico |
| `Metas` | Metas de ahorro (nombre, meta, ahorrado, aporte mensual) |
| `Transacciones` | Registro de gastos reales (fecha, monto, categoria, nota, metodo, mes, ano) |
| `Presupuesto` | Asignaciones de presupuesto por categoria y mes |
| `Recurrentes` | Reglas de transacciones recurrentes (frecuencia, monto, categoria) |

### Hoja Config

| Clave | Ejemplo |
|-------|---------|
| Tasa Dolar | `58` |
| Mes Actual | `Marzo` |
| Ano | `2026` |
| Ingreso Mensual | `3000` (en USD, **por pago** desde v3 — multiplicado por la frecuencia) |
| Dias alerta | `5` |

> **Nota:** desde v3 del JSON, `config.payFrequency` indica como se interpreta `ingresoUSD`: `"mensual"` (default · multiplicador 1), `"quincenal"` (× 26/12) o `"semanal"` (× 52/12). El campo `ingresoRD` siempre es el equivalente mensual ya multiplicado.

### Hoja Esenciales -- columnas (indice 0-11)

| Col | Campo |
|-----|-------|
| 0 | Descripcion |
| 1 | Tipo (Fijo, Variable, Cuota, Prestamo, Tarjeta, Servicio, Seguro, Familiar, Educacion, Vivienda) |
| 2 | Pagado (RD$) |
| 3 | Adeudado/Cuota (RD$) |
| 4 | Dia de pago |
| 5 | Tasa de interes % |
| 6 | Balance pendiente (RD$) |
| 7 | Monto original (RD$) |
| 8 | Monto original (USD) |
| 9 | Fecha limite (YYYY-MM-DD) |
| 10 | Notas |
| 11 | Pagado_Mes (SI / NO) |

> **Nota:** La tasa de interes puede estar como porcentaje (`19.45`) o decimal (`0.1945`) -- el dashboard normaliza automaticamente.

### Hoja ForNow -- columnas

| Col | Campo |
|-----|-------|
| 0 | Nombre cuenta |
| 1 | Moneda (RD / USD) |
| 2 | Saldo |

> **Nota (v4):** desde la versión 4 del JSON, cada cuenta lleva un `id` estable (`cnt_…`) y un `tipo` (`cash` / `banco` / `ahorro` / `inversion`). `config.defaultCashAccountId` apunta al `id` de la cuenta marcada como **Mi Saldo** (la billetera principal usada por los pagos en efectivo). Las importaciones desde versiones anteriores autogeneran ids y asignan `tipo: 'banco'` por defecto.

### Hoja Metas -- columnas

| Col | Campo |
|-----|-------|
| 0 | Nombre de la meta |
| 1 | Monto meta (RD$) |
| 2 | Monto ahorrado (RD$) |
| 3 | Aporte mensual (RD$) |

### Hoja Transacciones -- columnas

| Col | Campo |
|-----|-------|
| 0 | Fecha (YYYY-MM-DD) |
| 1 | Monto (RD$) |
| 2 | Categoria (Comida, Transporte, Entretenimiento, Salud, Compras, Hogar, Educacion, Personal, Otro) |
| 3 | Nota |
| 4 | Metodo (Efectivo, Tarjeta, Transferencia) |
| 5 | Gasto vinculado (nombre del gasto, o vacio) |
| 6 | Mes |
| 7 | Ano |

### Hoja Presupuesto -- columnas

| Col | Campo |
|-----|-------|
| 0 | Categoria (mismas 9 categorias que Transacciones) |
| 1 | Presupuestado (RD$) |
| 2 | Mes |
| 3 | Ano |

### Hoja Recurrentes -- columnas

| Col | Campo |
|-----|-------|
| 0 | ID (identificador unico de la regla) |
| 1 | Fecha de inicio (YYYY-MM-DD) |
| 2 | Monto (RD$) |
| 3 | Categoria |
| 4 | Nota |
| 5 | Metodo (Efectivo, Tarjeta, Transferencia) |
| 6 | Frecuencia (diario, semanal, quincenal, mensual) |
| 7 | LastGenerated (fecha de ultima generacion) |

---

## Instalacion y despliegue

### Opcion 1 -- GitHub Pages (recomendado)

1. Crea un repositorio en [github.com](https://github.com)
2. Sube los 5 archivos (`cnt.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`)
3. Ve a **Settings > Pages > Branch: main > Save**
4. Tu URL: `https://tuusuario.github.io/nombre-repo/cnt.html`

### Opcion 2 -- Netlify Drop

1. Ve a [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta con los 5 archivos
3. URL publica en segundos, sin cuenta

### Opcion 3 -- Servidor local (red WiFi)

```bash
# En la carpeta con los 5 archivos:
python3 -m http.server 8080

# Accede desde cualquier dispositivo en la misma red:
# http://[IP-de-tu-PC]:8080/cnt.html
```

> El service worker no funciona con `file://`. Usa siempre un servidor HTTP.

---

## Instalar como app

### Android (Chrome)
1. Abre la URL en **Chrome**
2. Espera el banner: *"Agregar CNT Core a la pantalla de inicio"* > **Instalar**
3. Si no aparece: menu > **"Agregar a pantalla de inicio"**

### iOS (Safari)
1. Abre la URL en **Safari** (requerido en iOS -- Chrome no soporta PWA en iOS)
2. Boton compartir > **"Agregar a pantalla de inicio"** > **Agregar**

### PC (Chrome / Edge)
1. Abre la URL en Chrome o Edge
2. Icono en la barra de direcciones > **Instalar**

---

## Persistencia local (IndexedDB)

| Accion | Resultado |
|--------|-----------|
| Primera carga / asistente completado | Datos guardados automaticamente |
| Editar datos y aplicar | Guardado automatico |
| Marcar pago en checklist | Guardado automatico |
| Cerrar el mes (wizard) | Guardado automatico + JSON descargado |
| Proxima visita | Banner "Continuar donde lo deje" |
| Borrar datos | Boton en el banner de inicio |

> Los datos son especificos del navegador y dispositivo. Si cambias de navegador o dispositivo, necesitas importar tu respaldo JSON una vez.

---

## Flujo mensual recomendado

```
Al inicio del mes (o al empezar a usar la app):
  -- Presupuesto > Asignar montos a cada categoria de gasto
  -- Registro > Configurar transacciones recurrentes (cafe diario, transporte semanal, etc.)

Durante el mes:
  -- Abrir la app > Checklist > Marcar pagos conforme se realizan
  -- Registrar gastos reales en Registro (los recurrentes se generan solos)
  -- Revisar Presupuesto para comparar gastado vs asignado por categoria
  -- Revisar Alertas para vencimientos proximos y advertencias financieras
  -- Ajustar Metas de ahorro segun progreso
  -- Cambios guardados automaticamente

Al cierre del mes:
  -- Header > "Cerrar Mes"
  -- Wizard 8 pasos: tasa > mes > ingreso > gasto real > saldos > ahorros > confirmar > proximo mes
  -- Ver resumen post-cierre con tasa de ahorro, cambio en deuda y net worth
  -- Historial actualizado + JSON descargado + checklist reseteado

Al pagar una deuda en su totalidad:
  -- Tab Deudas > Card de la deuda > "Liquidar deuda"
  -- Confirmar > balance = 0, marcada como pagada, guardado automatico

Al inicio del mes nuevo:
  -- Si los gastos/deudas cambiaron > Editar > ajustar > aplicar
  -- Si no cambiaron > empieza a marcar el checklist directamente
  -- Revisar Proyector para optimizar pagos de deuda
```

---

## Tests

El proyecto incluye una suite de tests end-to-end con **Playwright**:

```bash
# Instalar dependencias
npm install

# Ejecutar todos los tests
npx playwright test

# Ejecutar un archivo especifico
npx playwright test tests/finance-advisor-features.spec.js
```

| Suite | Tests | Cobertura |
|-------|-------|-----------|
| `alerts-tab.spec.js` | 39 | Alertas: vencimientos, DTI, EF, intereses, i18n |
| `edit-modal-fixes.spec.js` | 32 | Modal de edicion: validacion, sync, conversion, tipos |
| `edit-modal-i18n.spec.js` | 12 | Traduccion del modal de edicion |
| `finance-advisor-features.spec.js` | 17 | DTI (payment-based), neg-amort, savings rate, calendario, anomalias |
| `responsive-mobile.spec.js` | 21 | Layout responsive en phones, tablets |
| `account-currency.spec.js` | 13 | Moneda dual en cuentas (RD$/USD) |
| `goals-numeric-inputs.spec.js` | 8 | Inputs de metas sin spinners |
| `cache-clear.spec.js` | 3 | Limpieza de cache sin perder datos |
| `demo-loader.spec.js` | 13 | Carga de datos demo (RD$ y USD) |
| `dual-currency.spec.js` | 37 | Moneda dual: formato, conversion, demos, import/export, edge cases, wizard |
| `tasa-creacion.spec.js` | 8 | Tasa de creacion en deudas |
| `edit-table-scroll.spec.js` | 8 | Scroll de tabla de edicion |
| `foldable-projector.spec.js` | 7 | Proyector en pantallas plegables |
| `tab-order.spec.js` | 7 | Orden de pestanas (13 tabs, 2 grupos) |
| `json-backup.spec.js` | 13 | Exportar/importar JSON, round-trip, meta v2, demo embebido |
| `presupuesto-recurring.spec.js` | 40 | Presupuesto CRUD, BvA, obligaciones, recurrentes, generacion, dedup, Registro KPIs, Resumen integracion |
| `strategy-tabs.spec.js` | 31 | Deudas ETA, EF cobertura/doughnut, analisis summary, NW proyeccion, sparklines, waterfall, edge cases |
| `operations-tabs.spec.js` | 18 | Gastos payoff column, Registro trend, Fondos runway, Checklist countdown, KPI deltas |
| **Total** | **377** | |

---

## Tecnologias utilizadas

| Tecnologia | Uso |
|------------|-----|
| HTML / CSS / JavaScript vanilla | La app completa -- sin frameworks |
| [SheetJS (xlsx)](https://sheetjs.com) | Importar archivos Excel legacy |
| [Chart.js](https://chartjs.org) | Graficos de donut, barras y lineas |
| IndexedDB | Persistencia local de datos |
| Service Worker | Cache offline |
| Web App Manifest | Instalacion como app nativa |
| [Playwright](https://playwright.dev) | Tests end-to-end |
| Google Fonts (Syne + JetBrains Mono) | Tipografia |

---

## Privacidad

- Ningun dato se envia a ningun servidor
- Todo el procesamiento ocurre en tu navegador
- IndexedDB almacena datos solo en tu dispositivo
- El service worker solo cachea los archivos de la app -- nunca tus datos financieros
- Sin analytics, cookies de terceros ni telemetria

---

## Notas tecnicas

**Por que 5 archivos y no uno solo?**
El service worker (`sw.js`) debe ser un archivo separado por especificacion del navegador. El `manifest.json` y los iconos PNG tambien deben ser archivos externos -- Chrome rechaza iconos en formato `data:` URI para mostrar el banner de instalacion.

**Funciona con `file://`?**
El dashboard y el asistente de configuracion funcionan, pero el service worker y la instalacion como PWA requieren HTTPS o `localhost`. IndexedDB si funciona con `file://`.

**Que pasa si actualizo el HTML?**
El service worker usa Network-first para el HTML -- siempre intenta descargar la version mas nueva. Si estas offline, usa la version cacheada.

**Compatibilidad de navegadores**

| Navegador | PWA | IndexedDB | Offline |
|-----------|-----|-----------|---------|
| Chrome / Edge | Completo | Si | Si |
| Safari iOS 16.4+ | Completo | Si | Si |
| Firefox | Sin instalacion | Si | Si |
