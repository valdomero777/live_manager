# ADR 0010 — Design system del dashboard: shadcn/ui sobre Angular

Fecha: 2026-10-08 · Estado: aceptada

## Contexto

Se pidió adoptar shadcn/ui en todo el frontend para darle al panel una identidad de SaaS de
automatización para TikTok LIVE, sin reescribir el proyecto ni tocar la lógica de negocio.

Auditoría del frontend existente (`apps/dashboard`):

| Aspecto | Encontrado |
| --- | --- |
| Framework | **Angular 21** (standalone, signals, OnPush, control flow `@if/@for`). No es React ni Next.js |
| Build | `@angular/build:application` (esbuild), `baseHref /admin/`, servido por Fastify |
| Lenguaje | TypeScript estricto (`strictTemplates`) |
| Package manager | npm workspaces |
| CSS | Un `styles.css` global con variables propias + estilos por componente. Sin Tailwind |
| Librería UI | Ninguna. Botones, avisos, badges y formularios hechos a mano; `window.confirm()` para borrar |
| Iconos | Emojis y caracteres (▶ ■ ↑ ↓) |
| Routing | `provideRouter` con lazy `loadComponent` y `authGuard` |
| Estado | Servicios `@Injectable` con signals (`*Store`), sin librería de estado global |
| API | `ApiClient` sobre `HttpClient` → `/api/v1`, errores RFC 9457 (`ApiError`) |
| Realtime | `AdminSocketService`: WebSocket `/ws/admin`, mensajes validados con Zod, buffer de 500 eventos |
| Auth | Cookie HttpOnly; `authGuard` + interceptor de 401 |
| Sonidos | `SoundsStore` (búsqueda MyInstants vía nuestra API) + `AudioService` (un `HTMLAudioElement`) |
| Automatizaciones | Reglas = Evento → Condiciones[] → Acciones[] (catálogo genérico en `rule-catalog.ts`) |
| Restricciones | CSP sin scripts inline ni fuentes externas; lint con `complexity ≤ 10` y funciones ≤ 40 líneas |

**shadcn/ui es una librería de React**: no puede instalarse en Angular. Migrar a React habría sido
una reescritura, que el encargo prohíbe explícitamente.

## Decisión

Adoptar **shadcn/ui como sistema de diseño y arquitectura de componentes, portado a Angular**:

```
Design system
  ├── shadcn/ui        → mismas convenciones: tokens CSS, variantes con cva, cn() con tailwind-merge,
  │                      componentes copiados al repo (components/ui) y propiedad del proyecto
  ├── Tailwind CSS v4  → utilidades generadas desde los tokens (@theme inline)
  ├── Angular CDK      → primitivas accesibles (equivalente de Radix): Dialog, Menu, Overlay,
  │                      FocusTrap, Scrolling virtual
  └── Lucide           → @lucide/angular (paquete oficial de Lucide para Angular)
          │
          ▼
  Componentes de producto (components/{layout,live,dashboard,automations,sounds,analytics,shared})
          │
          ▼
  Páginas (features/*) — conservan su lógica; solo cambia la presentación
```

Alternativa descartada: **spartan/ui** (port comunitario de shadcn a Angular). Su CLI arrastra Nx
como dependencia y su capa "brain" exige `luxon`; además cambia de API con frecuencia. Escribir los
componentes con el CDK — que es justo la base de spartan — da el mismo resultado con menos
dependencias y código que el proyecto controla, que es la filosofía de shadcn.

## Estructura

```
src/app/
  lib/            utils.ts (cn), labels.ts
  core/           servicios y stores (sin UI): api, auth, socket, audio, theme, sounds, rules…
  components/
    ui/           componentes genéricos estilo shadcn (sin conocimiento del producto)
    layout/       AppShell, Sidebar, Topbar, navigation
    live/         LiveStatus, EventFeed, live-state, event-format, event-meta
    dashboard/    LiveSessionCard, RecentAutomations
    automations/  AutomationBuilder, TriggerSelector, ConditionBuilder, ActionBuilder,
                  RuleItemEditor, AutomationStep, AutomationCard, rule-catalog, rule-draft, rule-ops
    sounds/       SoundSelector, SoundPlayer, SoundPreview
    analytics/    MetricCard, AnalyticsCard, ChartContainer, ActivityChart
    shared/       PageHeader, EmptyState, CopyButton, GiftGrid
  features/       páginas (rutas)
```

Regla: `components/ui` es genérico. Lo específico de una pantalla se construye encima
(p. ej. `AutomationCard` usa `uiCard`, `uiBadge`, `ui-switch`), nunca modificando `ui/`.

## Componentes

**Base (`components/ui`)** — Button, Badge, Card (+Header/Title/Description/Action/Content/Footer),
Input, Textarea, NativeSelect, Label, Checkbox, Slider, Switch (ControlValueAccessor), FormField,
ToggleGroup, Tabs, Alert, Table, Skeleton, Spinner, Progress, Separator, Avatar, Dialog + Sheet
(CDK Dialog), ConfirmDialog (AlertDialog que reemplaza `window.confirm`), DropdownMenu (CDK Menu),
Tooltip (CDK Overlay), Toast (estilo Sonner).

La mayoría son **directivas de atributo** (`<button uiButton>`, `<section uiCard>`) para conservar
el elemento nativo, su semántica y los landmarks. Los controles de formulario usan elementos nativos
(`select`, `input type=range/checkbox`) con estilo shadcn: teclado, móviles y Reactive Forms
funcionan sin código extra.

No se crearon Combobox, Command, Popover, Pagination, RadioGroup ni ScrollArea genéricos: ninguna
pantalla los necesita todavía (el selector de evento usa radios nativos; el scroll usa
`scrollbar-thin`; los listados no paginan).

**Producto** — AppShell, Sidebar (colapsable con tooltips, sheet en móvil), Topbar, LiveStatus
(Desconectado/Conectando/Conectado/LIVE/Reconectando/Error), EventFeed (virtualizado con CDK),
MetricCard, AnalyticsCard, ChartContainer, ActivityChart, LiveSessionCard, RecentAutomations,
AutomationCard, AutomationBuilder, TriggerSelector, ConditionBuilder, ActionBuilder,
RuleItemEditor, AutomationStep, SoundSelector, SoundPlayer, SoundPreview, PageHeader, EmptyState.

## Páginas migradas

Todas: Login, **Dashboard (nueva, `/inicio`)**, Conexión y estado, Eventos, Simulador, Reglas,
Editor de reglas, Triggers de sonido, Sonidos e imágenes, Overlays (+ rotator), Rankings y metas
(+ formulario de meta), Ajustes (pestañas: configuración, voz TTS, seguridad).

Eliminados por quedar sin referencias: los 6 CSS de página, `gift-grid.css`, `sound-picker.ts`
(sustituido por `SoundSelector`) y todas las clases globales antiguas (`.card`, `.notice`, `.badge`,
`.row`, `.muted`…).

## Design tokens

Definidos una sola vez en `src/styles.css` (claro y `.dark`), expuestos como utilidades Tailwind:

- Superficies: `background`, `foreground`, `surface`, `surface-hover`, `surface-active`, `muted`,
  `border`, `border-subtle`, `input`, `sidebar`.
- Marca: `primary`, `primary-hover`, `primary-foreground`, `ring`.
- Estado: `success`, `warning`, `danger`, `info`.
- Dominio del producto: `live`, `gift`, `automation`, `sound`, `analytics`, `comment`, `follow`.
  Cada uno con `-text` (texto legible en ambos temas) y `-soft` (fondo translúcido).

El magenta de marca se reserva para acciones; los estados y dominios tienen su propio color, así un
regalo siempre es ámbar y una automatización siempre es violeta en todo el panel.

Tipografía (`type-*`, prefijo propio para no chocar con los colores `text-*`): `type-page-title`,
`type-section-title`, `type-card-title`, `type-body`, `type-secondary`, `type-label`,
`type-caption`, `type-overline` (CUANDO / SI / ENTONCES) y `type-metric` (números grandes,
tabulares).

Espaciado: escala de Tailwind. Utilidades de layout: `page` (gap-6 entre secciones),
`form-grid` (gap-4, columnas automáticas), `field-stack` (gap-2 label/control/ayuda); tarjetas con
padding 5.

Tema: claro, oscuro o según el sistema (`ThemeService`, recordado en `localStorage`).

## Decisiones de UX

- **Dashboard** solo con datos reales: `/stats` (espectadores, likes, diamantes, seguidores,
  destacados), eventos del socket (feed y gráfico de interacciones por minuto, contando eventos y
  no likes para no esconder un regalo bajo 500 likes) y `rule.executed` (automatizaciones
  recientes). Sin sesión, las métricas muestran «—» y no un cero inventado.
- **Automatizaciones** se leen como una frase: CUANDO → SI → ENTONCES. El builder trata las
  acciones como lista (`Actions[]`): sonido, voz, alerta, sumar a una meta y webhook; OBS aparece
  como «Próximamente» deshabilitado.
- **Errores de formulario** junto al campo (`ui-form-field`), con `aria-invalid` y
  `aria-describedby`; los toasts solo confirman acciones, nunca son el único aviso de un error.
- **Borrar** pide confirmación con un AlertDialog accesible (foco en «Cancelar», Escape cierra).
- **Event feed**: virtualizado (500 eventos cuestan lo mismo que 10); no es una región `aria-live`
  porque a ritmo de un live leería sin parar — la página Eventos ofrece «Pausar».
- **Responsive**: sidebar fijo y colapsable en escritorio, sheet en móvil; métricas 4 → 2 columnas;
  editor de reglas con panel lateral en pantallas anchas y apilado en móvil. Validado sin overflow
  horizontal a 1440, 1280, 768 y 390 px.
- **Animaciones** cortas (entrada de eventos, pulso del estado LIVE, diálogos) y desactivadas con
  `prefers-reduced-motion`.

## Cambios fuera de la capa visual (solo frontend, sin tocar el backend)

- `AdminSocketService` guarda los mensajes `rule.executed` que el servidor ya emitía y se ignoraban,
  expone `historyLoading`, y consulta `/health` al (re)conectar para conocer el estado del conector
  (el WebSocket solo informa cambios).
- `AudioService` gana `pause`/`resume` reales y `loadingUrl` (con pruebas).
- `RulesStore` pasa a `core/` porque ahora también lo usa el dashboard.
- Rutas: nueva `/inicio` (dashboard) como página por defecto; `/estado` se mantiene.

## Dependencias

Agregadas (solo `@tiklive/dashboard`): `@angular/cdk`, `@lucide/angular`,
`class-variance-authority`, `clsx`, `tailwind-merge`; dev: `tailwindcss`, `@tailwindcss/postcss`,
`postcss`. Eliminadas: ninguna (no había librería visual previa).

Bundle inicial de producción: 748 kB → 828 kB (límite de aviso: 900 kB).

## Pendientes

- Observado en el backend, no modificado: `/ws/admin` no envía el estado del conector al conectar
  (`AdminSocketHub.sendTo` no se usa); el frontend lo compensa leyendo `/health`. Tampoco hay
  historial de ejecuciones de reglas, así que «Automatizaciones recientes» empieza vacía al abrir el
  panel.
- Métricas que el backend aún no calcula (comentarios, compartidos, tasa de engagement,
  coins/minuto, conversión): `MetricCard` y `ChartContainer` ya admiten «sin datos», falta exponerlas
  en `/stats`.
- Pruebas e2e con Playwright en CI (en esta migración se validó con Playwright manualmente).
- Textos en archivos de traducción.
