/* ROG Monitor — Roadmap (v16).
 * Botón #roadmap-btn -> #roadmap-modal con "Hecho" (por fechas) y "Por hacer".
 * Se carga DESPUÉS de app.js. Datos: ROADMAP_CURRENT/DONE/TODO abajo.
 *
 * MULTILINGÜE (8 idiomas: es,en,fr,it,pt,zh,ja,ko):
 *  - Los campos traducibles son MAPAS {es,en,…}; _loc() elige el idioma activo
 *    de window.i18n.get() con fallback a 'es' (y a 'en' si falta 'es').
 *  - Los strings sueltos (sin mapa) se asumen ya en es y se usan tal cual.
 *  - El roadmap se re-renderiza al vuelo cuando cambia el idioma
 *    (window.i18n.onChange, cableado abajo en initRoadmap). */

/* ============================================================
   DATOS DEL ROADMAP
   Fuente de verdad para el contenido de la timeline.
   Para actualizar: edita estos objetos; el render es automático.
   ============================================================ */

// NOTA: mantener esta versión sincronizada con desktop/package.json ("version").
const ROADMAP_CURRENT = {
  version: 'v16.0.0',
  label: {
    es: 'Armoury Crate para Linux — seguro, bonito, todo-en-uno, sin telemetría',
    en: 'Armoury Crate for Linux — safe, beautiful, all-in-one, no telemetry',
    fr: 'Armoury Crate pour Linux — sûr, beau, tout-en-un, sans télémétrie',
    it: 'Armoury Crate per Linux — sicuro, bello, tutto-in-uno, senza telemetria',
    pt: 'Armoury Crate para Linux — seguro, bonito, tudo-em-um, sem telemetria',
    zh: 'Linux 版 Armoury Crate — 安全、美观、一体化、无遥测',
    ja: 'Linux版 Armoury Crate — 安全・美しい・オールインワン・テレメトリなし',
    ko: 'Linux용 Armoury Crate — 안전하고 아름다운 올인원, 텔레메트리 없음',
  },
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
  {
    date: '2026-06-18',
    version: 'v14.0.0',
    title: 'Carpeta única + guardián 2 modos + instalación 1 línea',
    points: [
      'Scripts consolidados al repo: todo en una sola carpeta, sin dispersión por el sistema',
      'Guardián con 2 modos: Protección (puede limitar) y Gaming (solo ventiladores, sin throttling)',
      'rog-power-source ahora opt-in: ya no rebota el perfil ni provoca "ladrillazos" por fuente de energía',
      'Autostart minimizado sin castigar el rendimiento (backend congelado hasta mostrarse)',
      'Instalar/desinstalar en 1 línea + wizard de Mantenimiento en la app',
      'Modo seguro para TTY (rog-monitor-safe-mode.sh) como vía de recuperación',
    ],
  },
  {
    date: '2026-06-19',
    version: 'v15.0.0',
    title: 'Fix caps por perfil + i18n total + overlay fino + guardián gaming con cap',
    points: [
      'Bug arreglado: los caps de RPM por perfil ahora persisten de forma independiente',
      'i18n TOTAL: 411 claves × 8 idiomas cableadas; el idioma persiste al backend y los eventos nuevos llegan traducidos',
      'Overlay rediseñado: una sola fila fina arriba-centro, consciente del tema',
      'Guardián Gaming con cap de ventilador configurable (por defecto = máximo medido)',
    ],
  },
  {
    date: '2026-06-20',
    version: 'v16.0.0',
    title: 'Roadmap competitivo alineado + multilingüe',
    points: [
      'Roadmap reposicionado: "Armoury Crate para Linux" — seguro, bonito, todo-en-uno, sin telemetría',
      'Fases claras orientadas al lanzamiento (P0 LANZAMIENTO → P1 DIFERENCIADORES → P2 ALCANCE → P3 ECOSISTEMA)',
      'Roadmap multilingüe en los 8 idiomas; se re-renderiza al cambiar de idioma',
      'Títulos de la línea de tiempo alineados en una sola columna (grid de cabecera)',
    ],
  },
];

// Pendientes (por hacer) — roadmap COMPETITIVO en 4 fases orientadas al
// lanzamiento: P0 LANZAMIENTO → P1 DIFERENCIADORES → P2 ALCANCE → P3 ECOSISTEMA.
// Posicionamiento: "Armoury Crate para Linux — seguro, bonito, todo-en-uno,
// sin telemetría". Todos los campos de texto son mapas {es,en,…} (8 idiomas).
const ROADMAP_TODO = [
  {
    phase: {
      es: 'P0 · LANZAMIENTO — abrir el repo al público',
      en: 'P0 · LAUNCH — open the repo to the public',
      fr: 'P0 · LANCEMENT — ouvrir le dépôt au public',
      it: 'P0 · LANCIO — aprire il repo al pubblico',
      pt: 'P0 · LANÇAMENTO — abrir o repo ao público',
      zh: 'P0 · 发布 — 向公众开放仓库',
      ja: 'P0 · ローンチ — リポジトリを一般公開',
      ko: 'P0 · 출시 — 저장소 공개',
    },
    note: {
      es: 'Lo imprescindible para que cualquiera lo instale y confíe en él.',
      en: 'The essentials so anyone can install it and trust it.',
      fr: 'L\'essentiel pour que n\'importe qui l\'installe et lui fasse confiance.',
      it: 'L\'essenziale perché chiunque lo installi e si fidi.',
      pt: 'O essencial para que qualquer um instale e confie nele.',
      zh: '让任何人都能安装并信任它的必需项。',
      ja: '誰でもインストールして信頼できるための必須項目。',
      ko: '누구나 설치하고 신뢰할 수 있게 하는 필수 요소.',
    },
    items: [
      {
        title: {
          es: 'Empaquetado para no-desarrolladores',
          en: 'Packaging for non-developers',
          fr: 'Empaquetage pour non-développeurs',
          it: 'Pacchettizzazione per non sviluppatori',
          pt: 'Empacotamento para não desenvolvedores',
          zh: '面向非开发者的打包',
          ja: '非開発者向けパッケージング',
          ko: '비개발자용 패키징',
        },
        points: [
          {
            es: 'Flatpak / AppImage instalable sin terminal ni dependencias manuales',
            en: 'Flatpak / AppImage installable without a terminal or manual deps',
            fr: 'Flatpak / AppImage installable sans terminal ni dépendances manuelles',
            it: 'Flatpak / AppImage installabile senza terminale né dipendenze manuali',
            pt: 'Flatpak / AppImage instalável sem terminal nem dependências manuais',
            zh: 'Flatpak / AppImage 无需终端或手动依赖即可安装',
            ja: 'ターミナルや手動依存なしでインストールできる Flatpak / AppImage',
            ko: '터미널이나 수동 의존성 없이 설치 가능한 Flatpak / AppImage',
          },
          {
            es: 'Un único helper privilegiado por polkit, en vez de pkexec disperso',
            en: 'A single polkit privileged helper instead of scattered pkexec',
            fr: 'Un seul helper privilégié polkit au lieu de pkexec dispersés',
            it: 'Un unico helper privilegiato via polkit invece di pkexec sparsi',
            pt: 'Um único helper privilegiado por polkit em vez de pkexec espalhados',
            zh: '单一 polkit 特权助手，取代分散的 pkexec',
            ja: '散在する pkexec の代わりに polkit の特権ヘルパーを 1 つに',
            ko: '흩어진 pkexec 대신 단일 polkit 권한 헬퍼',
          },
          {
            es: 'CI con GitHub Actions: node --check, py_compile, validación JSON + i18n, prueba de sensores de solo lectura',
            en: 'GitHub Actions CI: node --check, py_compile, JSON + i18n validation, read-only sensor smoke test',
            fr: 'CI GitHub Actions : node --check, py_compile, validation JSON + i18n, test capteurs en lecture seule',
            it: 'CI GitHub Actions: node --check, py_compile, validazione JSON + i18n, smoke test sensori in sola lettura',
            pt: 'CI GitHub Actions: node --check, py_compile, validação JSON + i18n, smoke test de sensores só-leitura',
            zh: 'GitHub Actions CI：node --check、py_compile、JSON + i18n 校验、只读传感器冒烟测试',
            ja: 'GitHub Actions CI: node --check、py_compile、JSON + i18n 検証、読み取り専用センサーのスモークテスト',
            ko: 'GitHub Actions CI: node --check, py_compile, JSON + i18n 검증, 읽기 전용 센서 스모크 테스트',
          },
          {
            es: 'Pulido de lanzamiento: README con capturas+GIF, vídeo corto, LICENSE/CONTRIBUTING/SECURITY al día, GitHub Pages simple, degradación elegante verificada en equipos no-ASUS/AMD',
            en: 'Launch polish: README with screenshots+GIF, short video, LICENSE/CONTRIBUTING/SECURITY current, simple GitHub Pages, graceful degradation verified on non-ASUS/AMD',
            fr: 'Finitions de lancement : README avec captures+GIF, vidéo courte, LICENSE/CONTRIBUTING/SECURITY à jour, GitHub Pages simple, dégradation gracieuse vérifiée sur non-ASUS/AMD',
            it: 'Rifinitura del lancio: README con screenshot+GIF, video breve, LICENSE/CONTRIBUTING/SECURITY aggiornati, GitHub Pages semplice, degradazione elegante verificata su non-ASUS/AMD',
            pt: 'Acabamento de lançamento: README com capturas+GIF, vídeo curto, LICENSE/CONTRIBUTING/SECURITY em dia, GitHub Pages simples, degradação elegante verificada em não-ASUS/AMD',
            zh: '发布打磨：含截图+GIF 的 README、短视频、LICENSE/CONTRIBUTING/SECURITY 更新、简单的 GitHub Pages、在非 ASUS/AMD 上验证优雅降级',
            ja: 'ローンチ仕上げ: スクショ+GIF 入り README、短い動画、LICENSE/CONTRIBUTING/SECURITY を最新化、シンプルな GitHub Pages、非 ASUS/AMD での優雅な劣化を検証',
            ko: '출시 마무리: 스크린샷+GIF가 있는 README, 짧은 영상, LICENSE/CONTRIBUTING/SECURITY 최신화, 간단한 GitHub Pages, 비 ASUS/AMD에서 우아한 성능 저하 검증',
          },
          {
            es: 'i18n comunitario: base lista; documentar cómo contribuir traducciones',
            en: 'Community i18n: base ready; document how to contribute translations',
            fr: 'i18n communautaire : base prête ; documenter comment contribuer des traductions',
            it: 'i18n della community: base pronta; documentare come contribuire con traduzioni',
            pt: 'i18n da comunidade: base pronta; documentar como contribuir com traduções',
            zh: '社区 i18n：基础已就绪；说明如何贡献翻译',
            ja: 'コミュニティ i18n: 基盤は完成；翻訳の貢献方法を文書化',
            ko: '커뮤니티 i18n: 기반 완료; 번역 기여 방법 문서화',
          },
        ],
      },
    ],
  },
  {
    phase: {
      es: 'P1 · DIFERENCIADORES — lo que nadie más trae junto',
      en: 'P1 · DIFFERENTIATORS — what nobody else bundles',
      fr: 'P1 · DIFFÉRENCIATEURS — ce que personne d\'autre ne regroupe',
      it: 'P1 · DIFFERENZIATORI — ciò che nessun altro mette insieme',
      pt: 'P1 · DIFERENCIAIS — o que ninguém mais junta',
      zh: 'P1 · 差异化 — 别人没有整合的功能',
      ja: 'P1 · 差別化 — 他社が統合していない要素',
      ko: 'P1 · 차별화 — 아무도 한데 묶지 않은 것',
    },
    note: {
      es: 'Las funciones estrella que hacen único a ROG Monitor.',
      en: 'The standout features that make ROG Monitor unique.',
      fr: 'Les fonctions phares qui rendent ROG Monitor unique.',
      it: 'Le funzioni di punta che rendono unico ROG Monitor.',
      pt: 'Os recursos de destaque que tornam o ROG Monitor único.',
      zh: '让 ROG Monitor 与众不同的明星功能。',
      ja: 'ROG Monitor を唯一無二にする目玉機能。',
      ko: 'ROG Monitor를 특별하게 만드는 대표 기능.',
    },
    items: [
      {
        title: {
          es: 'Perfiles por juego / aplicación',
          en: 'Per-game / per-app profiles',
          fr: 'Profils par jeu / application',
          it: 'Profili per gioco / applicazione',
          pt: 'Perfis por jogo / aplicativo',
          zh: '按游戏/应用的配置',
          ja: 'ゲーム / アプリ別プロファイル',
          ko: '게임 / 앱별 프로필',
        },
        points: [
          {
            es: 'Al abrir un juego, aplicar automáticamente poder + curva de ventilador + RGB + overlay',
            en: 'On game launch, auto-apply power + fan curve + RGB + overlay',
            fr: 'Au lancement d\'un jeu, appliquer auto. puissance + courbe ventilo + RGB + overlay',
            it: 'All\'avvio del gioco, applicare auto. potenza + curva ventola + RGB + overlay',
            pt: 'Ao abrir o jogo, aplicar auto. potência + curva de ventoinha + RGB + overlay',
            zh: '游戏启动时自动应用功耗 + 风扇曲线 + RGB + 叠加层',
            ja: 'ゲーム起動時に電力 + ファンカーブ + RGB + オーバーレイを自動適用',
            ko: '게임 실행 시 전력 + 팬 커브 + RGB + 오버레이 자동 적용',
          },
          {
            es: 'Detección por proceso / GameMode / MangoHud — nadie más junta los cuatro (base: game_session.py)',
            en: 'Detect via process / GameMode / MangoHud — nobody bundles all four (base: game_session.py)',
            fr: 'Détection via processus / GameMode / MangoHud — personne ne regroupe les quatre (base : game_session.py)',
            it: 'Rilevamento via processo / GameMode / MangoHud — nessuno mette insieme i quattro (base: game_session.py)',
            pt: 'Detecção via processo / GameMode / MangoHud — ninguém junta os quatro (base: game_session.py)',
            zh: '通过进程 / GameMode / MangoHud 检测 — 无人整合这四者（基础：game_session.py）',
            ja: 'プロセス / GameMode / MangoHud で検出 — 4 つすべてを束ねるのは唯一（基盤: game_session.py）',
            ko: '프로세스 / GameMode / MangoHud로 감지 — 넷을 모두 묶는 곳은 없음(기반: game_session.py)',
          },
        ],
      },
      {
        title: {
          es: 'Benchmarks serios (tortura real)',
          en: 'Serious benchmarks (true torture)',
          fr: 'Benchmarks sérieux (vraie torture)',
          it: 'Benchmark seri (vera tortura)',
          pt: 'Benchmarks sérios (tortura real)',
          zh: '严肃的基准测试（真正的拷机）',
          ja: '本格ベンチマーク（真の拷問テスト）',
          ko: '진지한 벤치마크(진짜 고문 테스트)',
        },
        points: [
          {
            es: 'GPU Path Tracing en Vulkan que satura de verdad la GPU y estresa la CPU vía construcción de BVH',
            en: 'GPU Path Tracing in Vulkan that truly saturates the GPU and stresses the CPU via BVH build',
            fr: 'Path Tracing GPU en Vulkan saturant réellement le GPU et stressant le CPU via la construction de BVH',
            it: 'Path Tracing GPU in Vulkan che satura davvero la GPU e stressa la CPU tramite costruzione BVH',
            pt: 'Path Tracing de GPU em Vulkan que satura de verdade a GPU e estressa a CPU via construção de BVH',
            zh: '基于 Vulkan 的 GPU 路径追踪，真正榨干 GPU 并通过 BVH 构建压榨 CPU',
            ja: 'Vulkan の GPU パストレーシングで GPU を本当に飽和させ、BVH 構築で CPU も酷使',
            ko: 'Vulkan GPU 패스 트레이싱으로 GPU를 실제로 포화시키고 BVH 빌드로 CPU도 압박',
          },
          {
            es: 'Degrada con elegancia si la GPU no tiene núcleos RT — NO asumir RTX',
            en: 'Degrades gracefully if the GPU has no RT cores — do NOT assume RTX',
            fr: 'Se dégrade proprement si le GPU n\'a pas de cœurs RT — ne PAS supposer RTX',
            it: 'Degrada con eleganza se la GPU non ha core RT — NON dare per scontato RTX',
            pt: 'Degrada com elegância se a GPU não tiver núcleos RT — NÃO assumir RTX',
            zh: '若 GPU 无 RT 核心则优雅降级 — 不假设是 RTX',
            ja: 'GPU に RT コアがなければ優雅に劣化 — RTX を前提にしない',
            ko: 'GPU에 RT 코어가 없으면 우아하게 저하 — RTX를 가정하지 않음',
          },
          {
            es: 'CPU separado AVX/int/float, multihilo real, reporte por P-core/E-core; veredicto claro: estable / throttling / margen',
            en: 'CPU split AVX/int/float, true multi-thread, report per P-core/E-core; clear verdict: stable / throttling / headroom',
            fr: 'CPU séparé AVX/int/float, vrai multi-thread, rapport par P-core/E-core ; verdict clair : stable / throttling / marge',
            it: 'CPU separato AVX/int/float, multi-thread reale, report per P-core/E-core; verdetto chiaro: stabile / throttling / margine',
            pt: 'CPU separado AVX/int/float, multi-thread real, relatório por P-core/E-core; veredito claro: estável / throttling / margem',
            zh: 'CPU 分 AVX/整数/浮点，真多线程，按 P 核/E 核报告；明确结论：稳定 / 降频 / 余量',
            ja: 'CPU は AVX/整数/浮動小数で分割、真のマルチスレッド、P コア/E コア別レポート；明確な判定: 安定 / スロットリング / 余裕',
            ko: 'CPU를 AVX/정수/실수로 분리, 진짜 멀티스레드, P코어/E코어별 보고; 명확한 판정: 안정 / 스로틀링 / 여유',
          },
        ],
      },
      {
        title: {
          es: 'Guardián 2.0',
          en: 'Guardian 2.0',
          fr: 'Gardien 2.0',
          it: 'Guardiano 2.0',
          pt: 'Guardião 2.0',
          zh: '守护者 2.0',
          ja: 'ガーディアン 2.0',
          ko: '가디언 2.0',
        },
        points: [
          {
            es: 'Telemetría local de qué limitó y cuándo; modo "silencioso" programado; curvas de respuesta configurables',
            en: 'Local telemetry of what it throttled and when; scheduled "silent" mode; configurable response curves',
            fr: 'Télémétrie locale de ce qui a été limité et quand ; mode « silencieux » programmé ; courbes de réponse configurables',
            it: 'Telemetria locale di cosa ha limitato e quando; modalità "silenziosa" programmata; curve di risposta configurabili',
            pt: 'Telemetria local do que limitou e quando; modo "silencioso" agendado; curvas de resposta configuráveis',
            zh: '本地记录限制了什么、何时限制；可定时的"静音"模式；可配置的响应曲线',
            ja: '何をいつ抑制したかのローカル記録；スケジュール式「サイレント」モード；応答カーブを設定可能',
            ko: '무엇을 언제 제한했는지 로컬 기록; 예약 "조용" 모드; 구성 가능한 응답 곡선',
          },
        ],
      },
    ],
  },
  {
    phase: {
      es: 'P2 · ALCANCE — más hardware, más profundidad',
      en: 'P2 · REACH — more hardware, more depth',
      fr: 'P2 · PORTÉE — plus de matériel, plus de profondeur',
      it: 'P2 · PORTATA — più hardware, più profondità',
      pt: 'P2 · ALCANCE — mais hardware, mais profundidade',
      zh: 'P2 · 覆盖 — 更多硬件，更深功能',
      ja: 'P2 · リーチ — より多くのハードと深さ',
      ko: 'P2 · 도달 범위 — 더 많은 하드웨어, 더 깊은 기능',
    },
    note: {
      es: 'Abrir ROG Monitor a más equipos y al nivel de las herramientas dedicadas.',
      en: 'Open ROG Monitor to more machines and to the level of dedicated tools.',
      fr: 'Ouvrir ROG Monitor à plus de machines et au niveau des outils dédiés.',
      it: 'Aprire ROG Monitor a più macchine e al livello degli strumenti dedicati.',
      pt: 'Abrir o ROG Monitor a mais máquinas e ao nível das ferramentas dedicadas.',
      zh: '让 ROG Monitor 支持更多设备，并达到专用工具的水平。',
      ja: 'ROG Monitor をより多くの機種と専用ツール並みの水準へ。',
      ko: 'ROG Monitor를 더 많은 기기와 전용 도구 수준으로 확장.',
    },
    items: [
      {
        title: {
          es: 'AMD',
          en: 'AMD',
          fr: 'AMD',
          it: 'AMD',
          pt: 'AMD',
          zh: 'AMD',
          ja: 'AMD',
          ko: 'AMD',
        },
        points: [
          {
            es: 'CPU por ryzenadj/RAPL; GPU amdgpu estilo CoreCtrl; más SKUs ASUS; genérico de solo lectura',
            en: 'CPU via ryzenadj/RAPL; CoreCtrl-style amdgpu; more ASUS SKUs; generic read-only',
            fr: 'CPU via ryzenadj/RAPL ; amdgpu façon CoreCtrl ; plus de SKU ASUS ; générique en lecture seule',
            it: 'CPU via ryzenadj/RAPL; amdgpu stile CoreCtrl; più SKU ASUS; generico in sola lettura',
            pt: 'CPU via ryzenadj/RAPL; amdgpu estilo CoreCtrl; mais SKUs ASUS; genérico só-leitura',
            zh: 'CPU 用 ryzenadj/RAPL；CoreCtrl 风格的 amdgpu；更多 ASUS 型号；通用只读',
            ja: 'CPU は ryzenadj/RAPL；CoreCtrl 風 amdgpu；ASUS SKU を追加；汎用は読み取り専用',
            ko: 'CPU는 ryzenadj/RAPL; CoreCtrl 스타일 amdgpu; 더 많은 ASUS SKU; 범용 읽기 전용',
          },
        ],
      },
      {
        title: {
          es: 'Batería: límite de carga + salud',
          en: 'Battery: charge limit + health',
          fr: 'Batterie : limite de charge + santé',
          it: 'Batteria: limite di carica + salute',
          pt: 'Bateria: limite de carga + saúde',
          zh: '电池：充电限制 + 健康度',
          ja: 'バッテリー: 充電上限 + 健康度',
          ko: '배터리: 충전 제한 + 수명',
        },
        points: [
          {
            es: 'Límite de carga en la interfaz (asusctl lo expone) y desgaste / salud de la batería',
            en: 'Charge limit in the UI (asusctl exposes it) and battery wear / health',
            fr: 'Limite de charge dans l\'interface (asusctl l\'expose) et usure / santé de la batterie',
            it: 'Limite di carica nell\'interfaccia (asusctl lo espone) e usura / salute della batteria',
            pt: 'Limite de carga na interface (asusctl o expõe) e desgaste / saúde da bateria',
            zh: '界面中的充电限制（asusctl 提供）及电池损耗/健康度',
            ja: 'UI での充電上限（asusctl が提供）とバッテリーの劣化 / 健康度',
            ko: 'UI의 충전 제한(asusctl 제공)과 배터리 마모 / 수명',
          },
        ],
      },
      {
        title: {
          es: 'Ventiladores nivel CoolerControl',
          en: 'CoolerControl-level fans',
          fr: 'Ventilateurs niveau CoolerControl',
          it: 'Ventole livello CoolerControl',
          pt: 'Ventoinhas nível CoolerControl',
          zh: 'CoolerControl 级风扇',
          ja: 'CoolerControl 級のファン',
          ko: 'CoolerControl 수준 팬',
        },
        points: [
          {
            es: 'Múltiples fuentes de temperatura, curvas mixtas y curva de ventilador de GPU',
            en: 'Multiple temperature sources, mixed curves, and a GPU fan curve',
            fr: 'Sources de température multiples, courbes mixtes et courbe de ventilateur GPU',
            it: 'Più fonti di temperatura, curve miste e curva ventola GPU',
            pt: 'Várias fontes de temperatura, curvas mistas e curva de ventoinha de GPU',
            zh: '多个温度源、混合曲线及 GPU 风扇曲线',
            ja: '複数の温度ソース、混合カーブ、GPU ファンカーブ',
            ko: '여러 온도 소스, 혼합 곡선, GPU 팬 곡선',
          },
        ],
      },
      {
        title: {
          es: 'RGB completo',
          en: 'Full RGB',
          fr: 'RGB complet',
          it: 'RGB completo',
          pt: 'RGB completo',
          zh: '完整 RGB',
          ja: 'フル RGB',
          ko: '완전한 RGB',
        },
        points: [
          {
            es: 'Música por zona, puente OpenRGB para periféricos no-ASUS, AniMe Matrix donde exista',
            en: 'Music-by-zone, OpenRGB bridge for non-ASUS peripherals, AniMe Matrix where present',
            fr: 'Musique par zone, pont OpenRGB pour périphériques non-ASUS, AniMe Matrix si présent',
            it: 'Musica per zona, ponte OpenRGB per periferiche non-ASUS, AniMe Matrix se presente',
            pt: 'Música por zona, ponte OpenRGB para periféricos não-ASUS, AniMe Matrix onde existir',
            zh: '分区音乐、面向非 ASUS 外设的 OpenRGB 桥接、有则支持 AniMe Matrix',
            ja: 'ゾーン別ミュージック、非 ASUS 周辺機器向け OpenRGB ブリッジ、あれば AniMe Matrix',
            ko: '존별 음악, 비 ASUS 주변기기용 OpenRGB 브리지, 있으면 AniMe Matrix',
          },
          {
            es: 'Redragon BLOQUEADO hasta captura USB (Sinowealth, riesgo de ladrillazo): nunca enviar comandos a ciegas',
            en: 'Redragon BLOCKED until USB capture (Sinowealth, brick risk): never send blind commands',
            fr: 'Redragon BLOQUÉ jusqu\'à capture USB (Sinowealth, risque de brique) : jamais de commandes à l\'aveugle',
            it: 'Redragon BLOCCATO fino alla cattura USB (Sinowealth, rischio brick): mai comandi alla cieca',
            pt: 'Redragon BLOQUEADO até captura USB (Sinowealth, risco de brick): nunca enviar comandos às cegas',
            zh: 'Redragon 在完成 USB 抓包前封锁（Sinowealth，有变砖风险）：绝不盲发指令',
            ja: 'Redragon は USB キャプチャまで封鎖（Sinowealth、文鎮化リスク）：盲目的にコマンドを送らない',
            ko: 'Redragon은 USB 캡처 전까지 차단(Sinowealth, 벽돌화 위험): 절대 맹목적 명령 금지',
          },
        ],
      },
    ],
  },
  {
    phase: {
      es: 'P3 · ECOSISTEMA — comunidad y largo plazo',
      en: 'P3 · ECOSYSTEM — community and long term',
      fr: 'P3 · ÉCOSYSTÈME — communauté et long terme',
      it: 'P3 · ECOSISTEMA — community e lungo termine',
      pt: 'P3 · ECOSSISTEMA — comunidade e longo prazo',
      zh: 'P3 · 生态 — 社区与长期',
      ja: 'P3 · エコシステム — コミュニティと長期',
      ko: 'P3 · 생태계 — 커뮤니티와 장기',
    },
    note: {
      es: 'Lo grande, ya con la comunidad: historial, perfiles compartidos y más OEMs.',
      en: 'The big stuff, with the community: history, shared profiles and more OEMs.',
      fr: 'Le grand œuvre, avec la communauté : historique, profils partagés et plus d\'OEM.',
      it: 'Le cose grandi, con la community: cronologia, profili condivisi e più OEM.',
      pt: 'O grande, com a comunidade: histórico, perfis compartilhados e mais OEMs.',
      zh: '更大的目标，携手社区：历史、共享配置和更多 OEM。',
      ja: '大きな構想をコミュニティと: 履歴、共有プロファイル、より多くの OEM。',
      ko: '큰 그림을 커뮤니티와 함께: 기록, 공유 프로필, 더 많은 OEM.',
    },
    items: [
      {
        title: {
          es: 'Historial persistente + panel térmico',
          en: 'Persistent history + thermal panel',
          fr: 'Historique persistant + panneau thermique',
          it: 'Cronologia persistente + pannello termico',
          pt: 'Histórico persistente + painel térmico',
          zh: '持久化历史 + 热力面板',
          ja: '永続履歴 + サーマルパネル',
          ko: '영구 기록 + 열 패널',
        },
        points: [
          {
            es: 'SQLite persistente, panel térmico a largo plazo + exportación, exportador Prometheus/Grafana opcional',
            en: 'Persistent SQLite, long-term thermal panel + export, optional Prometheus/Grafana exporter',
            fr: 'SQLite persistant, panneau thermique long terme + export, exportateur Prometheus/Grafana optionnel',
            it: 'SQLite persistente, pannello termico a lungo termine + export, esportatore Prometheus/Grafana opzionale',
            pt: 'SQLite persistente, painel térmico de longo prazo + exportação, exportador Prometheus/Grafana opcional',
            zh: '持久化 SQLite、长期热力面板 + 导出、可选 Prometheus/Grafana 导出器',
            ja: '永続 SQLite、長期サーマルパネル + エクスポート、任意の Prometheus/Grafana エクスポーター',
            ko: '영구 SQLite, 장기 열 패널 + 내보내기, 선택적 Prometheus/Grafana 익스포터',
          },
        ],
      },
      {
        title: {
          es: 'Perfiles de dispositivo crowdsourced',
          en: 'Crowdsourced device profiles',
          fr: 'Profils d\'appareils participatifs',
          it: 'Profili dispositivo crowdsourced',
          pt: 'Perfis de dispositivo crowdsourced',
          zh: '众包设备配置',
          ja: 'クラウドソース型デバイスプロファイル',
          ko: '크라우드소싱 기기 프로필',
        },
        points: [
          {
            es: 'device_profiles.json crowdsourced + web simple para compartir perfiles ya calibrados',
            en: 'Crowdsourced device_profiles.json + simple web to share calibrated profiles',
            fr: 'device_profiles.json participatif + web simple pour partager des profils calibrés',
            it: 'device_profiles.json crowdsourced + web semplice per condividere profili calibrati',
            pt: 'device_profiles.json crowdsourced + web simples para compartilhar perfis calibrados',
            zh: '众包 device_profiles.json + 简单网站，共享已校准的配置',
            ja: 'クラウドソース型 device_profiles.json + 校正済みプロファイルを共有する簡易 Web',
            ko: '크라우드소싱 device_profiles.json + 보정된 프로필 공유용 간단한 웹',
          },
        ],
      },
      {
        title: {
          es: 'Widget de Plasma, accesibilidad y más OEMs',
          en: 'Plasma widget, accessibility and more OEMs',
          fr: 'Widget Plasma, accessibilité et plus d\'OEM',
          it: 'Widget Plasma, accessibilità e più OEM',
          pt: 'Widget do Plasma, acessibilidade e mais OEMs',
          zh: 'Plasma 小部件、无障碍及更多 OEM',
          ja: 'Plasma ウィジェット、アクセシビリティ、より多くの OEM',
          ko: 'Plasma 위젯, 접근성, 더 많은 OEM',
        },
        points: [
          {
            es: 'Widget de Plasma, accesibilidad, más OEMs (Legion/Omen/Predator/MSI) vía platform_profile genérico',
            en: 'Plasma widget, accessibility, more OEMs (Legion/Omen/Predator/MSI) via generic platform_profile',
            fr: 'Widget Plasma, accessibilité, plus d\'OEM (Legion/Omen/Predator/MSI) via platform_profile générique',
            it: 'Widget Plasma, accessibilità, più OEM (Legion/Omen/Predator/MSI) via platform_profile generico',
            pt: 'Widget do Plasma, acessibilidade, mais OEMs (Legion/Omen/Predator/MSI) via platform_profile genérico',
            zh: 'Plasma 小部件、无障碍、经由通用 platform_profile 支持更多 OEM（Legion/Omen/Predator/MSI）',
            ja: 'Plasma ウィジェット、アクセシビリティ、汎用 platform_profile 経由でより多くの OEM（Legion/Omen/Predator/MSI）',
            ko: '범용 platform_profile을 통한 Plasma 위젯, 접근성, 더 많은 OEM(Legion/Omen/Predator/MSI)',
          },
        ],
      },
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

// _loc(v): si v es un mapa {es,en,…} devuelve el idioma activo con fallback a
// es → en → primer valor disponible. Si v es un string, lo devuelve tal cual
// (se asume que ya está en es). Así conviven campos traducidos y literales.
function _loc(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    let lang = 'es';
    try { if (window.i18n && typeof window.i18n.get === 'function') lang = window.i18n.get(); } catch (e) { /* noop */ }
    return v[lang] || v.es || v.en || v[Object.keys(v)[0]] || '';
  }
  return String(v);
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
    .map((f) => `<li>${_escHtml(_loc(f))}</li>`)
    .join('');
  return `
    <div class="roadmap-status-pill">${_escHtml(ROADMAP_CURRENT.version)} — ${_escHtml(_loc(ROADMAP_CURRENT.label))}</div>
    <ul class="roadmap-current-list">${features}</ul>
  `;
}

function _buildTimelineItem(item, isDone, idx) {
  const cls = isDone ? 'done' : 'todo';
  const idPrefix = isDone ? 'rdone' : 'rtodo';
  const arrowId = `${idPrefix}-arrow-${idx}`;
  const bodyId = `${idPrefix}-body-${idx}`;

  // La celda de fecha/versión SIEMPRE se emite (aunque vacía) para que las 3
  // columnas del grid de cabecera existan en todas las filas → todos los
  // títulos arrancan en la misma x, tengan fecha o no.
  const dateText = isDone && item.date
    ? `${item.date}${item.version ? ' · ' + item.version : ''}`
    : (item.version || '');
  const dateHtml = `<span class="roadmap-item-date">${_escHtml(dateText)}</span>`;

  const pointsHtml = item.points && item.points.length
    ? `<ul>${item.points.map((p) => `<li>${_escHtml(_loc(p))}</li>`).join('')}</ul>`
    : '';

  return `
    <div class="roadmap-item ${cls}" data-rdx="${idPrefix}-${idx}">
      <div class="roadmap-item-head" role="button" tabindex="0" aria-expanded="false" aria-controls="${bodyId}">
        ${dateHtml}
        <span class="roadmap-item-title">${_escHtml(_loc(item.title))}</span>
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

  // POR HACER: cada FASE es un bloque (encabezado + nota + su mini-timeline).
  // idx continuo entre fases para IDs únicos de cada ítem expandible.
  let todoIdx = 0;
  const todoHtml = ROADMAP_TODO.map((phase) => {
    const itemsHtml = (phase.items || [])
      .map((item) => _buildTimelineItem(item, false, todoIdx++))
      .join('');
    const noteHtml = phase.note
      ? `<p class="roadmap-phase-note">${_escHtml(_loc(phase.note))}</p>` : '';
    return `
      <div class="roadmap-phase">
        <div class="roadmap-phase-head">${_escHtml(_loc(phase.phase))}</div>
        ${noteHtml}
        <div class="roadmap-timeline">${itemsHtml}</div>
      </div>`;
  }).join('');

  return `
    <h3 data-i18n="roadmap.title">${_t('roadmap.title', 'Roadmap')}</h3>
    ${_buildCurrentStatus()}

    <div class="roadmap-sep" data-i18n="roadmap.done">${_t('roadmap.done', 'HECHO ▲')}</div>
    <div class="roadmap-timeline" id="roadmap-done-list">
      ${doneHtml}
    </div>

    <div class="roadmap-sep" data-i18n="roadmap.todo">${_t('roadmap.todo', 'POR HACER ▼')}</div>
    <div id="roadmap-todo-list">
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

  // Registrar traducciones propias en los 8 idiomas (formato CORE {clave:{lang}}).
  // El contenido de la timeline va por mapas {es,en,…} + _loc(); aquí solo las
  // etiquetas estáticas (cabeceras, separadores y el botón Cerrar como fallback
  // por si common.close no estuviera registrado por el core).
  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      'roadmap.title': {
        es: 'Roadmap', en: 'Roadmap', fr: 'Feuille de route', it: 'Roadmap',
        pt: 'Roadmap', zh: '路线图', ja: 'ロードマップ', ko: '로드맵',
      },
      'roadmap.done': {
        es: 'HECHO ▲', en: 'DONE ▲', fr: 'FAIT ▲', it: 'FATTO ▲',
        pt: 'FEITO ▲', zh: '已完成 ▲', ja: '完了 ▲', ko: '완료 ▲',
      },
      'roadmap.todo': {
        es: 'POR HACER ▼', en: 'TO DO ▼', fr: 'À FAIRE ▼', it: 'DA FARE ▼',
        pt: 'A FAZER ▼', zh: '待办 ▼', ja: '未着手 ▼', ko: '할 일 ▼',
      },
      'roadmap.current': {
        es: 'Estado actual', en: 'Current status', fr: 'État actuel', it: 'Stato attuale',
        pt: 'Estado atual', zh: '当前状态', ja: '現在の状態', ko: '현재 상태',
      },
      'common.close': {
        es: 'Cerrar', en: 'Close', fr: 'Fermer', it: 'Chiudi',
        pt: 'Fechar', zh: '关闭', ja: '閉じる', ko: '닫기',
      },
    });
  }
})();
