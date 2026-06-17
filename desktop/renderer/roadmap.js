/* ROG Monitor — Roadmap (v13).
 * Botón #roadmap-btn -> #roadmap-modal con "Hecho" (por fechas) y "Por hacer".
 * Se carga DESPUÉS de app.js. Datos: ROADMAP_CURRENT/DONE/TODO abajo. */

/* ============================================================
   DATOS DEL ROADMAP
   Fuente de verdad para el contenido de la timeline.
   Para actualizar: edita estos objetos; el render es automático.
   ============================================================ */

// NOTA: mantener esta versión sincronizada con desktop/package.json ("version").
const ROADMAP_CURRENT = {
  version: 'v13.0.0',
  label: 'Listo para publicar (open source)',
  // Lo que la app YA hace hoy:
  features: [
    'Monitoreo en vivo (1 Hz): CPU/GPU temperatura, potencia, frecuencias, ventiladores (RPM), RAM, discos, red y batería',
    'Centro de Poder seguro: PL1/PL2, Dynamic Boost, techo térmico y offsets de reloj GPU — con doble recorte al rango seguro, aviso de riesgos por cada cambio y modo avanzado por marca/componente con documentación oficial',
    'Perfiles Ahorro/Balance/Performance que aplican curvas de ventilador Y límites de poder reales: en Ahorro el equipo no puede calentarse como en Performance',
    'Ventiladores: editor de curvas por perfil (8 puntos × ventilador) con cap de RPM verificado por calibración real',
    'Núcleos: rejilla por hilo con frecuencia/temperatura, P-cores vs E-cores diferenciados y detalle por núcleo',
    'Sesión de juego: graba una sesión y la compara contra otra (original vs ajustada) en %, calcula el costo en energía y abre gráficas neón ampliables',
    'Benchmarks CPU/GPU con historial y modal de detalle (gráficas + eventos)',
    'Iluminación Aura (efectos reales del hardware + modo música) y overlay para juegos siempre encima',
    '8 idiomas (es/en/fr/it/pt/zh/ja/ko) · 12 temas × claro/oscuro · tablero arrastrable',
  ],
};

// Hitos completados — orden cronológico ascendente (más viejo arriba, más reciente justo antes de POR HACER)
const ROADMAP_DONE = [
  {
    date: '2026-06-08',
    version: 'v1',
    title: 'Primer monitor en tiempo real (TUI)',
    points: [
      'Lectura directa de sensores (sysfs/hwmon) de CPU, GPU, ventiladores y temperaturas',
      'Salida de terminal con refresco continuo — la semilla de todo el proyecto',
    ],
  },
  {
    date: '2026-06-08',
    version: 'v2',
    title: 'Migración Bash → Python, TUI con Rich',
    points: [
      'Interfaz Rich con historial térmico, colores dinámicos y barras de progreso',
      'Detección de GPU (Hybrid / Integrated / Dedicated) y soporte AMD',
      'Configuración persistente en ~/.config/rog-monitor/config.json',
    ],
  },
  {
    date: '2026-06-10',
    version: 'v5',
    title: 'Dashboard profesional (reescritura modular)',
    points: [
      'Las versiones 3 y 4 fueron iteraciones internas sin release; v5 consolidó la reescritura modular',
      'Paquete Python modular en src/rog_monitor/ — sin script monolítico',
      'Sistema de alertas con umbrales, notificaciones de escritorio y log de eventos',
      'Detección de thermal throttling, promedios 1m/5m/15m, gráficas multihistorial',
      'Potencia CPU por Intel RAPL con acceso no-root (scripts/enable-cpu-power.sh)',
      'Panel de sistema: RAM, disco, NVMe, red, batería, carga',
    ],
  },
  {
    date: '2026-06-10',
    version: 'v6',
    title: 'App Electron — primera interfaz gráfica',
    points: [
      'Dashboard gráfico con gauges canvas, ventiladores animados y gráficas de historial',
      'Botones de perfil de energía y modo GPU desde la app',
      'Botón ACTUALIZAR (git pull + reinicio del backend)',
      'Sistema de 6 paletas × claro/oscuro (Magma, Nébula, Océano, Glaciar, Reactor, Grafito)',
      'Panel de procesos, todos los discos, log de eventos, exportación JSON/CSV',
    ],
  },
  {
    date: '2026-06-10',
    version: 'v7',
    title: 'Centro de Control (ventiladores, clocks, procesos)',
    points: [
      'Editor de curvas de ventilación: 8 puntos × 3 ventiladores, por perfil, en % del máximo',
      'Cap de RPM editable y benchmark de máximos por ventilador (pkexec + medición real)',
      'Frecuencias en vivo: GPU núcleo/VRAM en MHz, CPU en GHz',
      'Clic en RAM → qué procesos consumen la memoria, con cierre desde la app',
      'Salud de discos SMART (botón en Sistema, pkexec + smartctl)',
      'Botón REPORTAR ERROR → abre issue en GitHub con info del sistema',
      'Eje de tiempo en las 4 gráficas ("hace N min" / "ahora")',
      'Tamaño de letra configurable (A−/Normal/A+/A++) y scrollbars temáticas',
      'AGENTS.md + docs/HANDOFF.md: memoria compartida para agentes IA',
    ],
  },
  {
    date: '2026-06-10',
    version: 'v8.0–8.1',
    title: 'Iluminación Aura: backend + UI + modo música',
    points: [
      'Backend aura.py: detecta asusctl, lista efectos reales del hardware, guarda perfiles en aura.json',
      'Bloque 08 Iluminación con selector de efecto, color, velocidad, dirección, brillo, perfiles guardados',
      'Modo música: captura audio del sistema vía PipeWire y ajusta brillo/color en tiempo real',
      'Benchmark GPU local mejorado (4× vkcube immediate = ~99% de carga real)',
      'Umbrales y colores de alerta editables desde la app (botón ALERTAS → backend settings.py)',
    ],
  },
  {
    date: '2026-06-10',
    version: 'v8.2',
    title: 'Overlay para juegos + Aura honesto',
    points: [
      'Overlay siempre encima, transparente, click-through y sin robar foco (KDE/Wayland)',
      'Aura: detecta SupportedBasicModes por D-Bus → solo ofrece los efectos que el teclado soporta de verdad',
      'Perfiles Aura como lista interactiva (color, etiqueta, inicio, APLICAR, borrar con confirmación)',
      'Cap de RPM real: curvas en JSON del usuario, servicio root las lee en cada cambio de perfil',
    ],
  },
  {
    date: '2026-06-10',
    version: 'v8.3',
    title: 'Cap verificado + Aura arreglado de raíz + overlay AVG/FPS',
    points: [
      'Cap ya no se "hornea" en la curva; subir o quitar el cap libera RPM al instante',
      'Calibración PWM→RPM real (7 escalones, espera estabilización < 75 RPM delta)',
      'Aura: label asesino corregido (los chips estaban dentro de <label> que reenviaba al Static)',
      'Aura: ya no reconstruye los chips cada segundo (firma de estado)',
      'Overlay: CPU muestra promedio AVG; FPS reales vía MangoHud (opt-in)',
      'Modales arrastrables, ALERTAS con iconos/colores, EXPORTAR/IMPORTAR CONFIG',
      'Modo música: captura el monitor del sink, no el micrófono; brillo por D-Bus directo (~20 ms)',
    ],
  },
  {
    date: '2026-06-12',
    version: 'v8.4',
    title: 'Identidad visual propia + hover en gráficas + nombre GPU real',
    points: [
      'Identidad visual que no parezca "hecha por IA": esquinas cortadas, placas numeradas inclinadas, rayado diagonal',
      'Bloques renumerados en orden visual: 01 CPU → 04 Iluminación; 05 Historial → 09 Procesos',
      'Hover en las 4 gráficas: crosshair punteado, valor exacto y hace cuántos segundos fue',
      '+2 temas: Neón (cian/magenta) y Atardecer (oro/rosa) → ya son 8 paletas × claro/oscuro',
      'Modo claro con identidad real: paneles tintados por paleta (antes todos "blanco plano")',
      'Nombre de GPU detectado (nvidia-smi), ya no hardcodeado como "RTX 4060"',
      'Consumo GPU por power.draw.average → no se desploma a 1 W en micro-sueños',
      'Detección de teclados RGB USB de terceros vía sysfs (control sujeto a protocolo verificado)',
    ],
  },
  {
    date: '2026-06-13',
    version: 'v9.0.0',
    title: 'Centro de Poder + wizard + 4 estados + 12 temas + grid Aura',
    points: [
      'Centro de Poder: PL1 (28–140 W), PL2 (28–175 W), GPU Dynamic Boost (5–25 W), Thermal Target (75–87 °C)',
      'Cada escritura recortada dos veces al mín/máx del firmware; diálogo de consentimiento; RESET A FÁBRICA',
      'device_profiles.json + rangos en vivo de sysfs → funciona en cualquier portátil con asus-armoury',
      '+4 temas (12 total): Neon Nights, Cyberpunk, Aurora, Alba; modos claros completamente rehechos',
      'Grid de 9 modos Aura con honestidad: 5 HW reales + Música + 3 marcados explícitamente',
      'Wizard de primera vez: 5 pasos repetibles (bienvenida → fans → calibración → benchmark → tour)',
      '4 estados por widget: skeleton / sin datos / error por widget, ventilador dañado mostrado PARADO',
      'docs/supported-devices.md, CONTRIBUTING.md, plantillas de issues, CI GitHub Actions (preparado para open source)',
    ],
  },
  {
    date: '2026-06-15',
    version: 'v10.0.0',
    title: 'i18n 8 idiomas + tablero arrastrable + neón puro + Roadmap + offsets GPU NVML + guardián térmico',
    points: [
      'Internacionalización completa: 8 idiomas (es/en/fr/it/pt/zh/ja/ko), selector en topbar, 100% de claves core',
      'Tablero reordenable y arrastrable: drag-and-drop por bloques, ocultar/mostrar, layout persistido',
      'Offsets GPU (núcleo/memoria) vía NVML: rangos seguros por device_profiles.json, rango avanzado con doble consentimiento',
      'Guardián térmico: systemd unit con lógica consciente de carga CPU/GPU e histéresis de bajada',
      'Roadmap interactivo: timeline expandible con hitos completados y por hacer',
      'Neón reactivo puro: glow de números por nivel de alerta (frío/normal/caliente/crítico), no por color de tema',
      'Benchmarks con historial clickable: cada resultado abre un modal de detalle con gráficas',
      'Fix Aura: HARDWARE_CAP_OVERRIDE para teclados de 4 zonas (breathe 1 color sin segundos)',
    ],
  },
  {
    date: '2026-06-16',
    version: 'v11.0.0',
    title: 'Ventiladores inteligentes + modo edición + neón reactivo + sesión de juego',
    points: [
      'Ventiladores inteligentes: curvas por perfil con histéresis (subir inmediato, bajar escalonado tras 20 s)',
      'Guardián consciente de carga: modula agresividad por uso CPU/GPU + temperatura + tendencia',
      'Neón por nivel: glow/box-shadow de números atado a variables de nivel (--lvl-cold/ok/hot/crit), no al acento',
      'Bordes neón en tarjetas: glow del acento del tema, sutil y visible',
      'Modo edición del tablero: toggle en barra superior; arrastre/ocultación solo cuando está activo',
      'Sesión de juego: graba CPU/GPU temp, RPM, watts, RAM; resumen con gráficas; comparar vs baseline; detecta el juego',
      'Temas con carácter: 11 animaciones CSS por tema (Magma=lava, Océano=agua, Glaciar=hielo, Reactor=pulso)',
      'Menú de núcleos CPU: grid con frecuencia y temperatura por núcleo',
      'Modal de detalle de benchmark: gráficas grandes con ejes, eventos importantes, tabla de resumen',
    ],
  },
  {
    date: '2026-06-16',
    version: 'v11.1–11.2',
    title: 'Pulido visual + rejilla de núcleos',
    points: [
      'Temas con tinte estático (sin animación continua que castigue CPU/GPU)',
      'Glow de números moderado y reactivo por nivel',
      'Rejilla de núcleos por CPU; ejes legibles en las gráficas de benchmark',
    ],
  },
  {
    date: '2026-06-17',
    version: 'v12.0.0',
    title: 'Integración multiagente: neón por nivel, fans inteligentes, sesión de juego',
    points: [
      'Neón por nivel de alerta consolidado; temas con carácter (animaciones baratas por paleta)',
      'Ventiladores con curvas suaves por perfil e histéresis; guardián térmico consciente de carga',
      'Sesión de juego con resumen y comparación; i18n y dashboard mejorados',
    ],
  },
  {
    date: '2026-06-17',
    version: 'v13.0.0',
    title: 'Centro de Poder seguro + sesión de juego comparativa + listo para open source',
    points: [
      'Perfiles Ahorro/Balance/Performance que aplican límites de poder REALES (CPU/GPU) con recorte seguro, además de las curvas de ventilador',
      'Centro de Poder: aviso de riesgos por cada cambio, rieles de seguridad, doble consentimiento fuera de rango y modo avanzado por marca/componente con documentación oficial',
      'Sesión de juego: gráficas neón ampliables con zoom, comparación original vs ajustada en %, costo en energía y notas',
      'Núcleos: P-cores (rendimiento) y E-cores (eficiencia) diferenciados, GHz en la celda y detalle por núcleo',
      'Arreglos: cambio de perfil sin "rebote"; todos los textos de bloques cambian de idioma',
      'Limpieza para publicar: versión unificada, roadmap honesto y sin datos personales',
    ],
  },
];

// Pendientes (por hacer) — visión a futuro de la aplicación
const ROADMAP_TODO = [
  {
    title: 'Monitoreo multi-equipo / centro de datos (visión)',
    points: [
      'Agente servidor "ROG Monitor Server" para monitorear varios equipos a la vez en la misma red',
      'Ideal para un segundo PC, un servidor o un centro de datos: ver procesos, temperaturas y benchmarks de todos en un solo tablero',
      'Instalación headless (sin interfaz gráfica) para servidores tipo Ubuntu Server',
      'Conexión segura y autenticada: nadie en la red puede conectarse ni modificar sin permiso',
      'Aún NO implementado — es la dirección a futuro del proyecto',
    ],
  },
  {
    title: 'Soporte AMD completo',
    points: [
      'k10temp por CCD, RAPL amd_energy, amdgpu probado en hardware AMD',
      'Perfiles vía platform_profile genérico (no solo asus-wmi)',
    ],
  },
  {
    title: 'Historial persistente (base de datos)',
    points: [
      'Base de datos local para consultar semanas de datos',
      'Gráficas de tendencia a largo plazo',
    ],
  },
  {
    title: 'Iluminación por zonas reactiva al audio',
    points: [
      'Graves/medios/agudos en distintas zonas del teclado',
      'Soporte de teclados externos vía OpenRGB cuando el protocolo esté verificado',
    ],
  },
  {
    title: 'Widget de escritorio + métricas + alertas inteligentes',
    points: [
      'Widget que lee los datos sin necesitar la app de escritorio abierta',
      'Exportación de métricas (Prometheus/Grafana) para tableros externos',
      'Alertas con acciones: bajar el perfil automáticamente al hacer throttling',
    ],
  },
  {
    title: 'Multi-distro / multi-marca + paquetes',
    points: [
      'Detección de hwmon genérico para portátiles no-ASUS (Lenovo, Gigabyte, MSI…)',
      'Meta: un "centro de control" de Linux para portátiles gaming',
      'Empaquetado: PyPI (pipx), Flatpak, AUR, COPR',
    ],
  },
  {
    title: 'Publicación open source',
    points: [
      'CI: lint + prueba de la salida --json en runner Ubuntu',
      'Releases con tag semver y notas de cambio',
      'Capturas en el README y wiki de modelos soportados',
    ],
  },
];

/* ============================================================
   RENDER
   ============================================================ */

function _t(key, fallback) {
  // Usa window.t si ya está implementado; sino el fallback literal
  try { const r = window.t(key); if (r !== key) return r; } catch (e) { /* noop */ }
  return fallback;
}

function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _buildCurrentStatus() {
  const features = ROADMAP_CURRENT.features
    .map((f) => `<li>${_escHtml(f)}</li>`)
    .join('');
  return `
    <div class="roadmap-status-pill">${_escHtml(ROADMAP_CURRENT.version)} — ${_escHtml(ROADMAP_CURRENT.label)}</div>
    <ul class="roadmap-current-list">${features}</ul>
  `;
}

function _buildTimelineItem(item, isDone, idx) {
  const cls = isDone ? 'done' : 'todo';
  const idPrefix = isDone ? 'rdone' : 'rtodo';
  const arrowId = `${idPrefix}-arrow-${idx}`;
  const bodyId = `${idPrefix}-body-${idx}`;

  const dateHtml = isDone && item.date
    ? `<span class="roadmap-item-date">${_escHtml(item.date)}${item.version ? ' · ' + _escHtml(item.version) : ''}</span>`
    : (item.version ? `<span class="roadmap-item-date">${_escHtml(item.version)}</span>` : '');

  const pointsHtml = item.points && item.points.length
    ? `<ul>${item.points.map((p) => `<li>${_escHtml(p)}</li>`).join('')}</ul>`
    : '';

  return `
    <div class="roadmap-item ${cls}" data-rdx="${idPrefix}-${idx}">
      <div class="roadmap-item-head" role="button" tabindex="0" aria-expanded="false" aria-controls="${bodyId}">
        ${dateHtml}
        <span class="roadmap-item-title">${_escHtml(item.title)}</span>
        <span class="roadmap-item-arrow" id="${arrowId}" aria-hidden="true">▼</span>
      </div>
      <div class="roadmap-item-body" id="${bodyId}">
        ${pointsHtml}
      </div>
    </div>
  `;
}

function _buildRoadmapContent() {
  // Orden cronológico: más viejo arriba → más reciente justo encima de "POR HACER"
  const doneItems = ROADMAP_DONE;

  const doneHtml = doneItems
    .map((item, i) => _buildTimelineItem(item, true, i))
    .join('');

  const todoHtml = ROADMAP_TODO
    .map((item, i) => _buildTimelineItem(item, false, i))
    .join('');

  return `
    <h3 data-i18n="roadmap.title">${_t('roadmap.title', 'Roadmap')}</h3>
    ${_buildCurrentStatus()}

    <div class="roadmap-sep" data-i18n="roadmap.done">${_t('roadmap.done', 'HECHO ▲')}</div>
    <div class="roadmap-timeline" id="roadmap-done-list">
      ${doneHtml}
    </div>

    <div class="roadmap-sep" data-i18n="roadmap.todo">${_t('roadmap.todo', 'POR HACER ▼')}</div>
    <div class="roadmap-timeline" id="roadmap-todo-list">
      ${todoHtml}
    </div>

    <div class="roadmap-close-row">
      <button class="ghost modal-close" id="roadmap-close" data-i18n="common.close">${_t('common.close', 'Cerrar')}</button>
    </div>
  `;
}

function _fillModal() {
  const modal = document.getElementById('roadmap-modal');
  if (!modal) return;

  // Solo poner el contenido si el modal-card no existe aún
  if (!modal.querySelector('.modal-card')) {
    const card = document.createElement('div');
    card.className = 'modal-card roadmap-card';
    modal.appendChild(card);
  }

  const card = modal.querySelector('.modal-card');
  card.innerHTML = `<div class="roadmap-scroll">${_buildRoadmapContent()}</div>`;

  // Botón cerrar
  const closeBtn = card.querySelector('#roadmap-close');
  if (closeBtn) closeBtn.addEventListener('click', closeRoadmapModal);
}

function _wireExpandToggle(container) {
  if (!container) return;
  container.querySelectorAll('.roadmap-item-head').forEach((head) => {
    head.addEventListener('click', () => {
      const item = head.closest('.roadmap-item');
      if (!item) return;
      const isOpen = item.classList.toggle('open');
      head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); }
    });
  });
}

/* ============================================================
   OPEN / CLOSE
   ============================================================ */

function openRoadmapModal() {
  const modal = document.getElementById('roadmap-modal');
  if (!modal) return;

  // ABRIR SIEMPRE PRIMERO: si rellenar lanzara una excepción, el modal igual
  // queda visible (antes, un throw en _fillModal cortaba antes de quitar
  // 'hidden' y el modal nunca aparecía — bug histórico ya corregido).
  modal.classList.remove('hidden');

  try {
    const card = modal.querySelector('.modal-card');
    if (!card || !card.querySelector('.roadmap-timeline')) {
      _fillModal();
      _wireExpandToggle(modal);
    }
  } catch (e) {
    const card = modal.querySelector('.modal-card');
    if (card) {
      card.innerHTML = '<div class="roadmap-scroll"><h3>Roadmap</h3>'
        + '<p class="sub">No se pudo cargar el contenido del roadmap.</p>'
        + '<button class="ghost modal-close" id="roadmap-close">Cerrar</button></div>';
      const c = card.querySelector('#roadmap-close');
      if (c) c.addEventListener('click', closeRoadmapModal);
    }
    console.error('[roadmap] fallo al rellenar:', e);
  }
}

function closeRoadmapModal() {
  const modal = document.getElementById('roadmap-modal');
  if (modal) modal.classList.add('hidden');
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */

(function initRoadmap() {
  // Rellenar el modal inmediatamente para que el HTML sea válido desde el primer instante.
  // Envuelto en try/catch: si algo más abajo en este IIFE lanzara una excepción
  // (p. ej. window.i18n.register con firma distinta) no debe dejar el modal vacío
  // ni impedir que el botón de la topbar quede cableado.
  try { _fillModal(); } catch (e) { /* se reintenta en openRoadmapModal() */ }

  // Botón del topbar — listener directo + DELEGACIÓN en document como red de
  // seguridad: si por cualquier motivo el listener directo no quedó (orden de
  // carga, nodo reemplazado por el sistema i18n, etc.), la delegación lo capta.
  const btn = document.getElementById('roadmap-btn');
  if (btn) {
    btn.addEventListener('click', openRoadmapModal);
  }
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('#roadmap-btn')) {
      e.preventDefault();
      openRoadmapModal();
    }
  });

  // Cerrar con clic en el overlay (fuera del modal-card)
  const modal = document.getElementById('roadmap-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeRoadmapModal();
    });
    // Cablear expanders tras llenar
    _wireExpandToggle(modal);
  }

  // Re-render si cambia el idioma
  if (window.i18n && typeof window.i18n.onChange === 'function') {
    window.i18n.onChange(() => {
      const m = document.getElementById('roadmap-modal');
      if (m) {
        const card = m.querySelector('.modal-card');
        if (card) {
          card.innerHTML = `<div class="roadmap-scroll">${_buildRoadmapContent()}</div>`;
          const closeBtn = card.querySelector('#roadmap-close');
          if (closeBtn) closeBtn.addEventListener('click', closeRoadmapModal);
          _wireExpandToggle(m);
        }
      }
    });
  }

  // Registrar traducciones propias (es + en mínimo; A1 completa los 8 idiomas)
  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      es: {
        'roadmap.title': 'Roadmap',
        'roadmap.done': 'HECHO ▲',
        'roadmap.todo': 'POR HACER ▼',
        'roadmap.current': 'Estado actual',
      },
      en: {
        'roadmap.title': 'Roadmap',
        'roadmap.done': 'DONE ▲',
        'roadmap.todo': 'TO DO ▼',
        'roadmap.current': 'Current status',
      },
    });
  }
})();
