/* ROG Monitor — Roadmap (v17).
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

// NOTA: mantener esta versión (v20.0.0) sincronizada con desktop/package.json ("version").
const ROADMAP_CURRENT = {
  version: 'v20.0.0',
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
    {
      es: 'Monitoreo en vivo (1 Hz): CPU/GPU temperatura, potencia, frecuencias, ventiladores (RPM), RAM, discos, red y batería',
      en: 'Live monitoring (1 Hz): CPU/GPU temperature, power, frequencies, fans (RPM), RAM, disks, network and battery',
      fr: 'Surveillance en direct (1 Hz) : température CPU/GPU, puissance, fréquences, ventilateurs (RPM), RAM, disques, réseau et batterie',
      it: 'Monitoraggio in tempo reale (1 Hz): temperatura CPU/GPU, potenza, frequenze, ventole (RPM), RAM, dischi, rete e batteria',
      pt: 'Monitoramento ao vivo (1 Hz): temperatura CPU/GPU, potência, frequências, ventoinhas (RPM), RAM, discos, rede e bateria',
      zh: '实时监控（1 Hz）：CPU/GPU 温度、功耗、频率、风扇（RPM）、内存、磁盘、网络和电池',
      ja: 'リアルタイム監視（1 Hz）: CPU/GPU 温度、電力、周波数、ファン（RPM）、RAM、ディスク、ネットワーク、バッテリー',
      ko: '실시간 모니터링(1 Hz): CPU/GPU 온도, 전력, 주파수, 팬(RPM), RAM, 디스크, 네트워크, 배터리',
    },
    {
      es: 'Centro de Poder seguro: PL1/PL2, Dynamic Boost, techo térmico y offsets de reloj GPU — con doble recorte al rango seguro, aviso de riesgos por cada cambio y modo avanzado por marca/componente con documentación oficial',
      en: 'Safe Power Center: PL1/PL2, Dynamic Boost, thermal ceiling and GPU clock offsets — with double clamp to the safe range, risk warning on every change and an advanced mode per brand/component with official documentation',
      fr: 'Centre de puissance sûr : PL1/PL2, Dynamic Boost, plafond thermique et offsets d\'horloge GPU — avec double bridage au plage sûre, avertissement de risques à chaque changement et mode avancé par marque/composant avec documentation officielle',
      it: 'Centro di potenza sicuro: PL1/PL2, Dynamic Boost, soffitto termico e offset di clock GPU — con doppio clamp al range sicuro, avviso di rischi a ogni modifica e modalità avanzata per marca/componente con documentazione ufficiale',
      pt: 'Central de Energia segura: PL1/PL2, Dynamic Boost, teto térmico e offsets de clock da GPU — com duplo clamp à faixa segura, aviso de riscos a cada mudança e modo avançado por marca/componente com documentação oficial',
      zh: '安全功耗中心：PL1/PL2、Dynamic Boost、温度上限和 GPU 时钟偏移 — 双重钳制到安全范围，每次更改都有风险提示，按品牌/部件提供带官方文档的高级模式',
      ja: '安全な電力センター: PL1/PL2、Dynamic Boost、温度上限、GPU クロックオフセット — 安全範囲への二重クランプ、変更ごとのリスク警告、メーカー/コンポーネント別の公式ドキュメント付き上級モード',
      ko: '안전한 전력 센터: PL1/PL2, Dynamic Boost, 온도 상한, GPU 클럭 오프셋 — 안전 범위로 이중 클램프, 변경마다 위험 경고, 브랜드/부품별 공식 문서 포함 고급 모드',
    },
    {
      es: 'Perfiles Ahorro/Balance/Performance que aplican curvas de ventilador Y límites de poder reales: en Ahorro el equipo no puede calentarse como en Performance',
      en: 'Saver/Balance/Performance profiles that apply fan curves AND real power limits: in Saver the machine cannot heat up like in Performance',
      fr: 'Profils Économie/Équilibre/Performance appliquant des courbes de ventilateur ET de vraies limites de puissance : en Économie, la machine ne peut pas chauffer comme en Performance',
      it: 'Profili Risparmio/Bilanciato/Performance che applicano curve delle ventole E limiti di potenza reali: in Risparmio la macchina non può scaldarsi come in Performance',
      pt: 'Perfis Economia/Equilíbrio/Performance que aplicam curvas de ventoinha E limites de potência reais: em Economia a máquina não pode esquentar como em Performance',
      zh: '节能/平衡/性能配置同时应用风扇曲线和真实功耗限制：节能模式下机器不会像性能模式那样发热',
      ja: '省電力/バランス/パフォーマンスのプロファイルがファンカーブと実際の電力制限の両方を適用: 省電力ではパフォーマンスのように熱くならない',
      ko: '절약/균형/성능 프로필이 팬 커브와 실제 전력 제한을 함께 적용: 절약 모드에서는 성능 모드처럼 뜨거워질 수 없음',
    },
    {
      es: 'Ventiladores: editor de curvas por perfil (8 puntos × ventilador) con cap de RPM verificado por calibración real',
      en: 'Fans: per-profile curve editor (8 points × fan) with an RPM cap verified by real calibration',
      fr: 'Ventilateurs : éditeur de courbes par profil (8 points × ventilateur) avec plafond de RPM vérifié par calibration réelle',
      it: 'Ventole: editor di curve per profilo (8 punti × ventola) con cap di RPM verificato da calibrazione reale',
      pt: 'Ventoinhas: editor de curvas por perfil (8 pontos × ventoinha) com cap de RPM verificado por calibração real',
      zh: '风扇：按配置的曲线编辑器（每风扇 8 点），RPM 上限经真实校准验证',
      ja: 'ファン: プロファイル別カーブエディタ（8 ポイント × ファン）と実キャリブレーションで検証された RPM 上限',
      ko: '팬: 프로필별 커브 편집기(팬당 8개 포인트)와 실제 보정으로 검증된 RPM 상한',
    },
    {
      es: 'Núcleos: rejilla por hilo con frecuencia/temperatura, P-cores vs E-cores diferenciados y detalle por núcleo',
      en: 'Cores: per-thread grid with frequency/temperature, P-cores vs E-cores differentiated and per-core detail',
      fr: 'Cœurs : grille par thread avec fréquence/température, P-cores vs E-cores différenciés et détail par cœur',
      it: 'Core: griglia per thread con frequenza/temperatura, P-core vs E-core differenziati e dettaglio per core',
      pt: 'Núcleos: grade por thread com frequência/temperatura, P-cores vs E-cores diferenciados e detalhe por núcleo',
      zh: '核心：按线程的网格显示频率/温度，区分 P 核与 E 核，并提供单核详情',
      ja: 'コア: スレッド別グリッドで周波数/温度を表示、P コアと E コアを区別、コア別の詳細',
      ko: '코어: 스레드별 그리드로 주파수/온도 표시, P코어와 E코어 구분, 코어별 상세',
    },
    {
      es: 'Sesión de juego: graba una sesión y la compara contra otra (original vs ajustada) en %, calcula el costo en energía y abre gráficas neón ampliables',
      en: 'Game session: records a session and compares it against another (original vs tuned) in %, computes the energy cost and opens zoomable neon graphs',
      fr: 'Session de jeu : enregistre une session et la compare à une autre (originale vs ajustée) en %, calcule le coût énergétique et ouvre des graphiques néon zoomables',
      it: 'Sessione di gioco: registra una sessione e la confronta con un\'altra (originale vs ottimizzata) in %, calcola il costo energetico e apre grafici neon ingrandibili',
      pt: 'Sessão de jogo: grava uma sessão e a compara com outra (original vs ajustada) em %, calcula o custo de energia e abre gráficos neon ampliáveis',
      zh: '游戏会话：录制一次会话并与另一次（原始 vs 调优）按 % 对比，计算能耗并打开可放大的霓虹图表',
      ja: 'ゲームセッション: セッションを記録し別のセッション（元 vs 調整後）と % で比較、消費エネルギーを計算し拡大可能なネオングラフを開く',
      ko: '게임 세션: 세션을 기록해 다른 세션(원본 vs 튜닝)과 % 로 비교, 에너지 비용을 계산하고 확대 가능한 네온 그래프를 엶',
    },
    {
      es: 'Benchmarks CPU/GPU con historial y modal de detalle (gráficas + eventos)',
      en: 'CPU/GPU benchmarks with history and a detail modal (graphs + events)',
      fr: 'Benchmarks CPU/GPU avec historique et fenêtre de détail (graphiques + événements)',
      it: 'Benchmark CPU/GPU con cronologia e modale di dettaglio (grafici + eventi)',
      pt: 'Benchmarks CPU/GPU com histórico e modal de detalhe (gráficos + eventos)',
      zh: 'CPU/GPU 基准测试，带历史记录和详情弹窗（图表 + 事件）',
      ja: 'CPU/GPU ベンチマーク（履歴と詳細モーダル：グラフ + イベント）',
      ko: 'CPU/GPU 벤치마크와 기록, 상세 모달(그래프 + 이벤트)',
    },
    {
      es: 'Iluminación Aura (efectos reales del hardware + modo música) y overlay para juegos siempre encima',
      en: 'Aura lighting (real hardware effects + music mode) and an always-on-top game overlay',
      fr: 'Éclairage Aura (effets matériels réels + mode musique) et overlay de jeu toujours au-dessus',
      it: 'Illuminazione Aura (effetti hardware reali + modalità musica) e overlay di gioco sempre in primo piano',
      pt: 'Iluminação Aura (efeitos reais do hardware + modo música) e overlay de jogo sempre por cima',
      zh: 'Aura 灯效（真实硬件效果 + 音乐模式）以及始终置顶的游戏叠加层',
      ja: 'Aura ライティング（実ハードウェアエフェクト + ミュージックモード）と常に最前面のゲームオーバーレイ',
      ko: 'Aura 조명(실제 하드웨어 효과 + 음악 모드)과 항상 위에 표시되는 게임 오버레이',
    },
    {
      es: '8 idiomas (es/en/fr/it/pt/zh/ja/ko) · 12 temas × claro/oscuro · tablero arrastrable',
      en: '8 languages (es/en/fr/it/pt/zh/ja/ko) · 12 themes × light/dark · draggable dashboard',
      fr: '8 langues (es/en/fr/it/pt/zh/ja/ko) · 12 thèmes × clair/sombre · tableau de bord déplaçable',
      it: '8 lingue (es/en/fr/it/pt/zh/ja/ko) · 12 temi × chiaro/scuro · dashboard trascinabile',
      pt: '8 idiomas (es/en/fr/it/pt/zh/ja/ko) · 12 temas × claro/escuro · painel arrastável',
      zh: '8 种语言（es/en/fr/it/pt/zh/ja/ko）· 12 套主题 × 明/暗 · 可拖动仪表盘',
      ja: '8 言語（es/en/fr/it/pt/zh/ja/ko）· 12 テーマ × ライト/ダーク · ドラッグ可能なダッシュボード',
      ko: '8개 언어(es/en/fr/it/pt/zh/ja/ko) · 12개 테마 × 라이트/다크 · 드래그 가능한 대시보드',
    },
  ],
};

// Hitos completados — orden cronológico ascendente (más viejo arriba, más reciente justo antes de POR HACER)
const ROADMAP_DONE = [
  {
    date: '2026-06-08',
    version: 'v1',
    title: {
      es: 'Primer monitor en tiempo real (TUI)',
      en: 'First real-time monitor (TUI)',
      fr: 'Premier moniteur en temps réel (TUI)',
      it: 'Primo monitor in tempo reale (TUI)',
      pt: 'Primeiro monitor em tempo real (TUI)',
      zh: '首个实时监控（TUI）',
      ja: '初のリアルタイムモニター（TUI）',
      ko: '첫 실시간 모니터(TUI)',
    },
    points: [
      {
        es: 'Lectura directa de sensores (sysfs/hwmon) de CPU, GPU, ventiladores y temperaturas',
        en: 'Direct sensor reads (sysfs/hwmon) of CPU, GPU, fans and temperatures',
        fr: 'Lecture directe des capteurs (sysfs/hwmon) du CPU, GPU, ventilateurs et températures',
        it: 'Lettura diretta dei sensori (sysfs/hwmon) di CPU, GPU, ventole e temperature',
        pt: 'Leitura direta de sensores (sysfs/hwmon) de CPU, GPU, ventoinhas e temperaturas',
        zh: '直接读取传感器（sysfs/hwmon）：CPU、GPU、风扇和温度',
        ja: 'CPU、GPU、ファン、温度のセンサーを直接読み取り（sysfs/hwmon）',
        ko: 'CPU, GPU, 팬, 온도 센서를 직접 읽기(sysfs/hwmon)',
      },
      {
        es: 'Salida de terminal con refresco continuo — la semilla de todo el proyecto',
        en: 'Terminal output with continuous refresh — the seed of the whole project',
        fr: 'Sortie terminal avec rafraîchissement continu — la graine de tout le projet',
        it: 'Output da terminale con aggiornamento continuo — il seme di tutto il progetto',
        pt: 'Saída de terminal com atualização contínua — a semente de todo o projeto',
        zh: '持续刷新的终端输出 — 整个项目的起点',
        ja: '連続更新のターミナル出力 — プロジェクト全体の出発点',
        ko: '연속 갱신되는 터미널 출력 — 프로젝트 전체의 씨앗',
      },
    ],
  },
  {
    date: '2026-06-08',
    version: 'v2',
    title: {
      es: 'Migración Bash → Python, TUI con Rich',
      en: 'Bash → Python migration, Rich TUI',
      fr: 'Migration Bash → Python, TUI avec Rich',
      it: 'Migrazione Bash → Python, TUI con Rich',
      pt: 'Migração Bash → Python, TUI com Rich',
      zh: 'Bash → Python 迁移，使用 Rich 的 TUI',
      ja: 'Bash → Python へ移行、Rich による TUI',
      ko: 'Bash → Python 마이그레이션, Rich TUI',
    },
    points: [
      {
        es: 'Interfaz Rich con historial térmico, colores dinámicos y barras de progreso',
        en: 'Rich interface with thermal history, dynamic colors and progress bars',
        fr: 'Interface Rich avec historique thermique, couleurs dynamiques et barres de progression',
        it: 'Interfaccia Rich con cronologia termica, colori dinamici e barre di avanzamento',
        pt: 'Interface Rich com histórico térmico, cores dinâmicas e barras de progresso',
        zh: 'Rich 界面，带热历史、动态颜色和进度条',
        ja: 'サーマル履歴、動的な色、プログレスバーを備えた Rich インターフェース',
        ko: '열 기록, 동적 색상, 진행 바를 갖춘 Rich 인터페이스',
      },
      {
        es: 'Detección de GPU (Hybrid / Integrated / Dedicated) y soporte AMD',
        en: 'GPU detection (Hybrid / Integrated / Dedicated) and AMD support',
        fr: 'Détection GPU (Hybrid / Integrated / Dedicated) et prise en charge AMD',
        it: 'Rilevamento GPU (Hybrid / Integrated / Dedicated) e supporto AMD',
        pt: 'Detecção de GPU (Hybrid / Integrated / Dedicated) e suporte AMD',
        zh: 'GPU 检测（Hybrid / Integrated / Dedicated）及 AMD 支持',
        ja: 'GPU 検出（Hybrid / Integrated / Dedicated）と AMD 対応',
        ko: 'GPU 감지(Hybrid / Integrated / Dedicated)와 AMD 지원',
      },
      {
        es: 'Configuración persistente en ~/.config/rog-monitor/config.json',
        en: 'Persistent configuration in ~/.config/rog-monitor/config.json',
        fr: 'Configuration persistante dans ~/.config/rog-monitor/config.json',
        it: 'Configurazione persistente in ~/.config/rog-monitor/config.json',
        pt: 'Configuração persistente em ~/.config/rog-monitor/config.json',
        zh: '持久化配置存于 ~/.config/rog-monitor/config.json',
        ja: '~/.config/rog-monitor/config.json に設定を永続化',
        ko: '~/.config/rog-monitor/config.json에 영구 설정',
      },
    ],
  },
  {
    date: '2026-06-10',
    version: 'v5',
    title: {
      es: 'Dashboard profesional (reescritura modular)',
      en: 'Professional dashboard (modular rewrite)',
      fr: 'Tableau de bord professionnel (réécriture modulaire)',
      it: 'Dashboard professionale (riscrittura modulare)',
      pt: 'Painel profissional (reescrita modular)',
      zh: '专业仪表盘（模块化重写）',
      ja: 'プロ仕様ダッシュボード（モジュール式に書き直し）',
      ko: '전문 대시보드(모듈식 재작성)',
    },
    points: [
      {
        es: 'Las versiones 3 y 4 fueron iteraciones internas sin release; v5 consolidó la reescritura modular',
        en: 'Versions 3 and 4 were internal iterations without a release; v5 consolidated the modular rewrite',
        fr: 'Les versions 3 et 4 étaient des itérations internes sans publication ; v5 a consolidé la réécriture modulaire',
        it: 'Le versioni 3 e 4 erano iterazioni interne senza release; v5 ha consolidato la riscrittura modulare',
        pt: 'As versões 3 e 4 foram iterações internas sem lançamento; v5 consolidou a reescrita modular',
        zh: '版本 3 和 4 是未发布的内部迭代；v5 整合了模块化重写',
        ja: 'バージョン 3 と 4 はリリースなしの内部イテレーション；v5 でモジュール式の書き直しを統合',
        ko: '버전 3과 4는 릴리스 없는 내부 반복이었고; v5에서 모듈식 재작성을 통합',
      },
      {
        es: 'Paquete Python modular en src/rog_monitor/ — sin script monolítico',
        en: 'Modular Python package in src/rog_monitor/ — no monolithic script',
        fr: 'Paquet Python modulaire dans src/rog_monitor/ — sans script monolithique',
        it: 'Pacchetto Python modulare in src/rog_monitor/ — senza script monolitico',
        pt: 'Pacote Python modular em src/rog_monitor/ — sem script monolítico',
        zh: 'src/rog_monitor/ 中的模块化 Python 包 — 不再是单体脚本',
        ja: 'src/rog_monitor/ のモジュール式 Python パッケージ — モノリシックなスクリプトなし',
        ko: 'src/rog_monitor/의 모듈식 Python 패키지 — 단일 스크립트 없음',
      },
      {
        es: 'Sistema de alertas con umbrales, notificaciones de escritorio y log de eventos',
        en: 'Alert system with thresholds, desktop notifications and event log',
        fr: 'Système d\'alertes avec seuils, notifications de bureau et journal d\'événements',
        it: 'Sistema di avvisi con soglie, notifiche desktop e log degli eventi',
        pt: 'Sistema de alertas com limiares, notificações de desktop e log de eventos',
        zh: '告警系统：阈值、桌面通知和事件日志',
        ja: 'しきい値、デスクトップ通知、イベントログを備えたアラートシステム',
        ko: '임계값, 데스크톱 알림, 이벤트 로그를 갖춘 경고 시스템',
      },
      {
        es: 'Detección de thermal throttling, promedios 1m/5m/15m, gráficas multihistorial',
        en: 'Thermal throttling detection, 1m/5m/15m averages, multi-history graphs',
        fr: 'Détection du throttling thermique, moyennes 1m/5m/15m, graphiques multi-historique',
        it: 'Rilevamento del thermal throttling, medie 1m/5m/15m, grafici multi-cronologia',
        pt: 'Detecção de thermal throttling, médias 1m/5m/15m, gráficos multi-histórico',
        zh: '热降频检测、1m/5m/15m 平均值、多历史图表',
        ja: 'サーマルスロットリング検出、1分/5分/15分平均、マルチ履歴グラフ',
        ko: '열 스로틀링 감지, 1분/5분/15분 평균, 다중 기록 그래프',
      },
      {
        es: 'Potencia CPU por Intel RAPL con acceso no-root (scripts/enable-cpu-power.sh)',
        en: 'CPU power via Intel RAPL with non-root access (scripts/enable-cpu-power.sh)',
        fr: 'Puissance CPU via Intel RAPL avec accès non-root (scripts/enable-cpu-power.sh)',
        it: 'Potenza CPU via Intel RAPL con accesso non-root (scripts/enable-cpu-power.sh)',
        pt: 'Potência da CPU via Intel RAPL com acesso não-root (scripts/enable-cpu-power.sh)',
        zh: '通过 Intel RAPL 获取 CPU 功耗，非 root 访问（scripts/enable-cpu-power.sh）',
        ja: 'Intel RAPL による CPU 電力を非 root アクセスで取得（scripts/enable-cpu-power.sh）',
        ko: 'Intel RAPL을 통한 CPU 전력, 비 root 접근(scripts/enable-cpu-power.sh)',
      },
      {
        es: 'Panel de sistema: RAM, disco, NVMe, red, batería, carga',
        en: 'System panel: RAM, disk, NVMe, network, battery, load',
        fr: 'Panneau système : RAM, disque, NVMe, réseau, batterie, charge',
        it: 'Pannello di sistema: RAM, disco, NVMe, rete, batteria, carico',
        pt: 'Painel de sistema: RAM, disco, NVMe, rede, bateria, carga',
        zh: '系统面板：内存、磁盘、NVMe、网络、电池、负载',
        ja: 'システムパネル: RAM、ディスク、NVMe、ネットワーク、バッテリー、負荷',
        ko: '시스템 패널: RAM, 디스크, NVMe, 네트워크, 배터리, 부하',
      },
    ],
  },
  {
    date: '2026-06-10',
    version: 'v6',
    title: {
      es: 'App Electron — primera interfaz gráfica',
      en: 'Electron app — first graphical interface',
      fr: 'App Electron — première interface graphique',
      it: 'App Electron — prima interfaccia grafica',
      pt: 'App Electron — primeira interface gráfica',
      zh: 'Electron 应用 — 首个图形界面',
      ja: 'Electron アプリ — 初のグラフィカルインターフェース',
      ko: 'Electron 앱 — 첫 그래픽 인터페이스',
    },
    points: [
      {
        es: 'Dashboard gráfico con gauges canvas, ventiladores animados y gráficas de historial',
        en: 'Graphical dashboard with canvas gauges, animated fans and history graphs',
        fr: 'Tableau de bord graphique avec jauges canvas, ventilateurs animés et graphiques d\'historique',
        it: 'Dashboard grafica con gauge canvas, ventole animate e grafici della cronologia',
        pt: 'Painel gráfico com gauges canvas, ventoinhas animadas e gráficos de histórico',
        zh: '图形仪表盘：canvas 仪表、动画风扇和历史图表',
        ja: 'canvas ゲージ、アニメーションファン、履歴グラフを備えたグラフィカルダッシュボード',
        ko: 'canvas 게이지, 애니메이션 팬, 기록 그래프를 갖춘 그래픽 대시보드',
      },
      {
        es: 'Botones de perfil de energía y modo GPU desde la app',
        en: 'Power profile and GPU mode buttons from the app',
        fr: 'Boutons de profil d\'énergie et de mode GPU depuis l\'app',
        it: 'Pulsanti di profilo energetico e modalità GPU dall\'app',
        pt: 'Botões de perfil de energia e modo GPU pela app',
        zh: '应用内的电源配置和 GPU 模式按钮',
        ja: 'アプリから電力プロファイルと GPU モードのボタン',
        ko: '앱에서 전원 프로필과 GPU 모드 버튼',
      },
      {
        es: 'Botón ACTUALIZAR (git pull + reinicio del backend)',
        en: 'UPDATE button (git pull + backend restart)',
        fr: 'Bouton METTRE À JOUR (git pull + redémarrage du backend)',
        it: 'Pulsante AGGIORNA (git pull + riavvio del backend)',
        pt: 'Botão ATUALIZAR (git pull + reinício do backend)',
        zh: '更新按钮（git pull + 重启后端）',
        ja: '更新ボタン（git pull + バックエンド再起動）',
        ko: '업데이트 버튼(git pull + 백엔드 재시작)',
      },
      {
        es: 'Sistema de 6 paletas × claro/oscuro (Magma, Nébula, Océano, Glaciar, Reactor, Grafito)',
        en: '6-palette system × light/dark (Magma, Nebula, Ocean, Glacier, Reactor, Graphite)',
        fr: 'Système de 6 palettes × clair/sombre (Magma, Nébuleuse, Océan, Glacier, Réacteur, Graphite)',
        it: 'Sistema di 6 palette × chiaro/scuro (Magma, Nebulosa, Oceano, Ghiacciaio, Reattore, Grafite)',
        pt: 'Sistema de 6 paletas × claro/escuro (Magma, Nébula, Oceano, Glaciar, Reator, Grafite)',
        zh: '6 套配色 × 明/暗（Magma、星云、海洋、冰川、反应堆、石墨）',
        ja: '6 パレット × ライト/ダーク（Magma、ネビュラ、オーシャン、グレイシア、リアクター、グラファイト）',
        ko: '6개 팔레트 × 라이트/다크(Magma, 네뷸라, 오션, 글레이셔, 리액터, 그래파이트)',
      },
      {
        es: 'Panel de procesos, todos los discos, log de eventos, exportación JSON/CSV',
        en: 'Process panel, all disks, event log, JSON/CSV export',
        fr: 'Panneau de processus, tous les disques, journal d\'événements, export JSON/CSV',
        it: 'Pannello dei processi, tutti i dischi, log degli eventi, esportazione JSON/CSV',
        pt: 'Painel de processos, todos os discos, log de eventos, exportação JSON/CSV',
        zh: '进程面板、所有磁盘、事件日志、JSON/CSV 导出',
        ja: 'プロセスパネル、全ディスク、イベントログ、JSON/CSV エクスポート',
        ko: '프로세스 패널, 모든 디스크, 이벤트 로그, JSON/CSV 내보내기',
      },
    ],
  },
  {
    date: '2026-06-10',
    version: 'v7',
    title: {
      es: 'Centro de Control (ventiladores, clocks, procesos)',
      en: 'Control Center (fans, clocks, processes)',
      fr: 'Centre de contrôle (ventilateurs, horloges, processus)',
      it: 'Centro di controllo (ventole, clock, processi)',
      pt: 'Central de Controle (ventoinhas, clocks, processos)',
      zh: '控制中心（风扇、时钟、进程）',
      ja: 'コントロールセンター（ファン、クロック、プロセス）',
      ko: '제어 센터(팬, 클럭, 프로세스)',
    },
    points: [
      {
        es: 'Editor de curvas de ventilación: 8 puntos × 3 ventiladores, por perfil, en % del máximo',
        en: 'Fan curve editor: 8 points × 3 fans, per profile, in % of maximum',
        fr: 'Éditeur de courbes de ventilation : 8 points × 3 ventilateurs, par profil, en % du maximum',
        it: 'Editor di curve delle ventole: 8 punti × 3 ventole, per profilo, in % del massimo',
        pt: 'Editor de curvas de ventilação: 8 pontos × 3 ventoinhas, por perfil, em % do máximo',
        zh: '风扇曲线编辑器：每配置 8 点 × 3 风扇，以最大值百分比表示',
        ja: 'ファンカーブエディタ: プロファイル別に 8 ポイント × 3 ファン、最大値の % で',
        ko: '팬 커브 편집기: 프로필별 8개 포인트 × 3개 팬, 최댓값의 % 단위',
      },
      {
        es: 'Cap de RPM editable y benchmark de máximos por ventilador (pkexec + medición real)',
        en: 'Editable RPM cap and per-fan maximum benchmark (pkexec + real measurement)',
        fr: 'Plafond de RPM modifiable et benchmark des maximums par ventilateur (pkexec + mesure réelle)',
        it: 'Cap di RPM modificabile e benchmark dei massimi per ventola (pkexec + misurazione reale)',
        pt: 'Cap de RPM editável e benchmark de máximos por ventoinha (pkexec + medição real)',
        zh: '可编辑的 RPM 上限及每风扇最大值基准测试（pkexec + 真实测量）',
        ja: '編集可能な RPM 上限とファン別最大値ベンチマーク（pkexec + 実測）',
        ko: '편집 가능한 RPM 상한과 팬별 최댓값 벤치마크(pkexec + 실측)',
      },
      {
        es: 'Frecuencias en vivo: GPU núcleo/VRAM en MHz, CPU en GHz',
        en: 'Live frequencies: GPU core/VRAM in MHz, CPU in GHz',
        fr: 'Fréquences en direct : cœur/VRAM GPU en MHz, CPU en GHz',
        it: 'Frequenze in tempo reale: core/VRAM GPU in MHz, CPU in GHz',
        pt: 'Frequências ao vivo: núcleo/VRAM da GPU em MHz, CPU em GHz',
        zh: '实时频率：GPU 核心/显存（MHz），CPU（GHz）',
        ja: 'リアルタイム周波数: GPU コア/VRAM を MHz、CPU を GHz で',
        ko: '실시간 주파수: GPU 코어/VRAM은 MHz, CPU는 GHz',
      },
      {
        es: 'Clic en RAM → qué procesos consumen la memoria, con cierre desde la app',
        en: 'Click on RAM → which processes consume memory, with kill from the app',
        fr: 'Clic sur la RAM → quels processus consomment la mémoire, avec fermeture depuis l\'app',
        it: 'Clic sulla RAM → quali processi consumano la memoria, con chiusura dall\'app',
        pt: 'Clique na RAM → quais processos consomem a memória, com encerramento pela app',
        zh: '点击内存 → 查看哪些进程占用内存，可在应用内结束',
        ja: 'RAM をクリック → どのプロセスがメモリを消費しているか、アプリから終了可能',
        ko: 'RAM 클릭 → 어떤 프로세스가 메모리를 소비하는지, 앱에서 종료 가능',
      },
      {
        es: 'Salud de discos SMART (botón en Sistema, pkexec + smartctl)',
        en: 'SMART disk health (button in System, pkexec + smartctl)',
        fr: 'Santé des disques SMART (bouton dans Système, pkexec + smartctl)',
        it: 'Salute dei dischi SMART (pulsante in Sistema, pkexec + smartctl)',
        pt: 'Saúde dos discos SMART (botão em Sistema, pkexec + smartctl)',
        zh: 'SMART 磁盘健康度（系统中的按钮，pkexec + smartctl）',
        ja: 'SMART ディスク健康度（システム内のボタン、pkexec + smartctl）',
        ko: 'SMART 디스크 수명(시스템 버튼, pkexec + smartctl)',
      },
      {
        es: 'Botón REPORTAR ERROR → abre issue en GitHub con info del sistema',
        en: 'REPORT BUG button → opens a GitHub issue with system info',
        fr: 'Bouton SIGNALER UN BUG → ouvre une issue GitHub avec infos système',
        it: 'Pulsante SEGNALA BUG → apre una issue su GitHub con info di sistema',
        pt: 'Botão REPORTAR ERRO → abre issue no GitHub com info do sistema',
        zh: '报告错误按钮 → 在 GitHub 上创建附带系统信息的 issue',
        ja: 'バグ報告ボタン → システム情報付きで GitHub の issue を開く',
        ko: '오류 신고 버튼 → 시스템 정보와 함께 GitHub 이슈 생성',
      },
      {
        es: 'Eje de tiempo en las 4 gráficas ("hace N min" / "ahora")',
        en: 'Time axis on all 4 graphs ("N min ago" / "now")',
        fr: 'Axe temporel sur les 4 graphiques (« il y a N min » / « maintenant »)',
        it: 'Asse temporale nei 4 grafici ("N min fa" / "ora")',
        pt: 'Eixo de tempo nos 4 gráficos ("há N min" / "agora")',
        zh: '4 个图表的时间轴（"N 分钟前" / "现在"）',
        ja: '4 つのグラフの時間軸（「N 分前」/「現在」）',
        ko: '4개 그래프의 시간축("N분 전" / "지금")',
      },
      {
        es: 'Tamaño de letra configurable (A−/Normal/A+/A++) y scrollbars temáticas',
        en: 'Configurable font size (A−/Normal/A+/A++) and themed scrollbars',
        fr: 'Taille de police configurable (A−/Normal/A+/A++) et barres de défilement thématiques',
        it: 'Dimensione del testo configurabile (A−/Normale/A+/A++) e scrollbar a tema',
        pt: 'Tamanho de fonte configurável (A−/Normal/A+/A++) e scrollbars temáticas',
        zh: '可配置字号（A−/正常/A+/A++）和主题化滚动条',
        ja: '設定可能なフォントサイズ（A−/標準/A+/A++）とテーマ対応スクロールバー',
        ko: '구성 가능한 글꼴 크기(A−/보통/A+/A++)와 테마 스크롤바',
      },
      {
        es: 'AGENTS.md + docs/HANDOFF.md: memoria compartida para agentes IA',
        en: 'AGENTS.md + docs/HANDOFF.md: shared memory for AI agents',
        fr: 'AGENTS.md + docs/HANDOFF.md : mémoire partagée pour les agents IA',
        it: 'AGENTS.md + docs/HANDOFF.md: memoria condivisa per agenti IA',
        pt: 'AGENTS.md + docs/HANDOFF.md: memória compartilhada para agentes de IA',
        zh: 'AGENTS.md + docs/HANDOFF.md：AI 智能体的共享记忆',
        ja: 'AGENTS.md + docs/HANDOFF.md: AI エージェント向けの共有メモリ',
        ko: 'AGENTS.md + docs/HANDOFF.md: AI 에이전트용 공유 메모리',
      },
    ],
  },
  {
    date: '2026-06-10',
    version: 'v8.0–8.1',
    title: {
      es: 'Iluminación Aura: backend + UI + modo música',
      en: 'Aura lighting: backend + UI + music mode',
      fr: 'Éclairage Aura : backend + UI + mode musique',
      it: 'Illuminazione Aura: backend + UI + modalità musica',
      pt: 'Iluminação Aura: backend + UI + modo música',
      zh: 'Aura 灯效：后端 + UI + 音乐模式',
      ja: 'Aura ライティング: バックエンド + UI + ミュージックモード',
      ko: 'Aura 조명: 백엔드 + UI + 음악 모드',
    },
    points: [
      {
        es: 'Backend aura.py: detecta asusctl, lista efectos reales del hardware, guarda perfiles en aura.json',
        en: 'aura.py backend: detects asusctl, lists real hardware effects, saves profiles in aura.json',
        fr: 'Backend aura.py : détecte asusctl, liste les effets matériels réels, enregistre les profils dans aura.json',
        it: 'Backend aura.py: rileva asusctl, elenca gli effetti hardware reali, salva i profili in aura.json',
        pt: 'Backend aura.py: detecta asusctl, lista efeitos reais do hardware, salva perfis em aura.json',
        zh: 'aura.py 后端：检测 asusctl，列出真实硬件效果，将配置保存到 aura.json',
        ja: 'aura.py バックエンド: asusctl を検出し、実ハードウェアのエフェクトを列挙、aura.json にプロファイルを保存',
        ko: 'aura.py 백엔드: asusctl 감지, 실제 하드웨어 효과 나열, aura.json에 프로필 저장',
      },
      {
        es: 'Bloque 08 Iluminación con selector de efecto, color, velocidad, dirección, brillo, perfiles guardados',
        en: 'Block 08 Lighting with effect, color, speed, direction, brightness selector and saved profiles',
        fr: 'Bloc 08 Éclairage avec sélecteur d\'effet, couleur, vitesse, direction, luminosité et profils enregistrés',
        it: 'Blocco 08 Illuminazione con selettore di effetto, colore, velocità, direzione, luminosità e profili salvati',
        pt: 'Bloco 08 Iluminação com seletor de efeito, cor, velocidade, direção, brilho e perfis salvos',
        zh: '08 灯效区块：效果、颜色、速度、方向、亮度选择器及已保存配置',
        ja: 'ブロック 08 ライティング: エフェクト、色、速度、方向、明るさのセレクタと保存済みプロファイル',
        ko: '08 조명 블록: 효과, 색상, 속도, 방향, 밝기 선택기와 저장된 프로필',
      },
      {
        es: 'Modo música: captura audio del sistema vía PipeWire y ajusta brillo/color en tiempo real',
        en: 'Music mode: captures system audio via PipeWire and adjusts brightness/color in real time',
        fr: 'Mode musique : capture l\'audio système via PipeWire et ajuste luminosité/couleur en temps réel',
        it: 'Modalità musica: cattura l\'audio di sistema via PipeWire e regola luminosità/colore in tempo reale',
        pt: 'Modo música: captura o áudio do sistema via PipeWire e ajusta brilho/cor em tempo real',
        zh: '音乐模式：通过 PipeWire 捕获系统音频，实时调整亮度/颜色',
        ja: 'ミュージックモード: PipeWire でシステム音声をキャプチャし、明るさ/色をリアルタイムに調整',
        ko: '음악 모드: PipeWire로 시스템 오디오를 캡처해 밝기/색상을 실시간 조정',
      },
      {
        es: 'Benchmark GPU local mejorado (4× vkcube immediate = ~99% de carga real)',
        en: 'Improved local GPU benchmark (4× vkcube immediate = ~99% real load)',
        fr: 'Benchmark GPU local amélioré (4× vkcube immediate = ~99% de charge réelle)',
        it: 'Benchmark GPU locale migliorato (4× vkcube immediate = ~99% di carico reale)',
        pt: 'Benchmark de GPU local melhorado (4× vkcube immediate = ~99% de carga real)',
        zh: '改进的本地 GPU 基准测试（4× vkcube immediate = 约 99% 真实负载）',
        ja: '改良されたローカル GPU ベンチマーク（4× vkcube immediate = 実負荷 約 99%）',
        ko: '개선된 로컬 GPU 벤치마크(4× vkcube immediate = 실제 부하 약 99%)',
      },
      {
        es: 'Umbrales y colores de alerta editables desde la app (botón ALERTAS → backend settings.py)',
        en: 'Editable alert thresholds and colors from the app (ALERTS button → settings.py backend)',
        fr: 'Seuils et couleurs d\'alerte modifiables depuis l\'app (bouton ALERTES → backend settings.py)',
        it: 'Soglie e colori di avviso modificabili dall\'app (pulsante AVVISI → backend settings.py)',
        pt: 'Limiares e cores de alerta editáveis pela app (botão ALERTAS → backend settings.py)',
        zh: '可在应用内编辑告警阈值和颜色（告警按钮 → settings.py 后端）',
        ja: 'アプリからアラートのしきい値と色を編集可能（アラートボタン → settings.py バックエンド）',
        ko: '앱에서 경고 임계값과 색상 편집 가능(경고 버튼 → settings.py 백엔드)',
      },
    ],
  },
  {
    date: '2026-06-10',
    version: 'v8.2',
    title: {
      es: 'Overlay para juegos + Aura honesto',
      en: 'Game overlay + honest Aura',
      fr: 'Overlay de jeu + Aura honnête',
      it: 'Overlay di gioco + Aura onesto',
      pt: 'Overlay de jogo + Aura honesto',
      zh: '游戏叠加层 + 诚实的 Aura',
      ja: 'ゲームオーバーレイ + 正直な Aura',
      ko: '게임 오버레이 + 정직한 Aura',
    },
    points: [
      {
        es: 'Overlay siempre encima, transparente, click-through y sin robar foco (KDE/Wayland)',
        en: 'Always-on-top overlay, transparent, click-through and without stealing focus (KDE/Wayland)',
        fr: 'Overlay toujours au-dessus, transparent, click-through et sans voler le focus (KDE/Wayland)',
        it: 'Overlay sempre in primo piano, trasparente, click-through e senza rubare il focus (KDE/Wayland)',
        pt: 'Overlay sempre por cima, transparente, click-through e sem roubar o foco (KDE/Wayland)',
        zh: '叠加层始终置顶、透明、可点击穿透且不抢占焦点（KDE/Wayland）',
        ja: '常に最前面・透明・クリックスルーでフォーカスを奪わないオーバーレイ（KDE/Wayland）',
        ko: '항상 위에 표시되고 투명하며 클릭 통과되고 포커스를 빼앗지 않는 오버레이(KDE/Wayland)',
      },
      {
        es: 'Aura: detecta SupportedBasicModes por D-Bus → solo ofrece los efectos que el teclado soporta de verdad',
        en: 'Aura: detects SupportedBasicModes via D-Bus → only offers the effects the keyboard truly supports',
        fr: 'Aura : détecte SupportedBasicModes via D-Bus → ne propose que les effets réellement pris en charge par le clavier',
        it: 'Aura: rileva SupportedBasicModes via D-Bus → offre solo gli effetti realmente supportati dalla tastiera',
        pt: 'Aura: detecta SupportedBasicModes via D-Bus → só oferece os efeitos que o teclado realmente suporta',
        zh: 'Aura：通过 D-Bus 检测 SupportedBasicModes → 仅提供键盘真正支持的效果',
        ja: 'Aura: D-Bus で SupportedBasicModes を検出 → キーボードが本当に対応するエフェクトのみ提示',
        ko: 'Aura: D-Bus로 SupportedBasicModes 감지 → 키보드가 실제로 지원하는 효과만 제공',
      },
      {
        es: 'Perfiles Aura como lista interactiva (color, etiqueta, inicio, APLICAR, borrar con confirmación)',
        en: 'Aura profiles as an interactive list (color, label, startup, APPLY, delete with confirmation)',
        fr: 'Profils Aura sous forme de liste interactive (couleur, étiquette, démarrage, APPLIQUER, supprimer avec confirmation)',
        it: 'Profili Aura come lista interattiva (colore, etichetta, avvio, APPLICA, elimina con conferma)',
        pt: 'Perfis Aura como lista interativa (cor, rótulo, início, APLICAR, excluir com confirmação)',
        zh: 'Aura 配置以交互列表呈现（颜色、标签、开机启动、应用、带确认删除）',
        ja: 'Aura プロファイルをインタラクティブなリストで（色、ラベル、起動、適用、確認付き削除）',
        ko: 'Aura 프로필을 상호작용 목록으로(색상, 라벨, 시작, 적용, 확인 후 삭제)',
      },
      {
        es: 'Cap de RPM real: curvas en JSON del usuario, servicio root las lee en cada cambio de perfil',
        en: 'Real RPM cap: curves in the user JSON, root service reads them on every profile change',
        fr: 'Plafond de RPM réel : courbes dans le JSON utilisateur, le service root les lit à chaque changement de profil',
        it: 'Cap di RPM reale: curve nel JSON dell\'utente, il servizio root le legge a ogni cambio di profilo',
        pt: 'Cap de RPM real: curvas no JSON do usuário, serviço root as lê a cada mudança de perfil',
        zh: '真实 RPM 上限：曲线存于用户 JSON，root 服务在每次切换配置时读取',
        ja: '実 RPM 上限: カーブをユーザー JSON に保存、root サービスがプロファイル変更ごとに読み込み',
        ko: '실제 RPM 상한: 사용자 JSON의 커브를 root 서비스가 프로필 변경마다 읽음',
      },
    ],
  },
  {
    date: '2026-06-10',
    version: 'v8.3',
    title: {
      es: 'Cap verificado + Aura arreglado de raíz + overlay AVG/FPS',
      en: 'Verified cap + Aura fixed at the root + AVG/FPS overlay',
      fr: 'Plafond vérifié + Aura corrigé à la racine + overlay AVG/FPS',
      it: 'Cap verificato + Aura corretto alla radice + overlay AVG/FPS',
      pt: 'Cap verificado + Aura corrigido na raiz + overlay AVG/FPS',
      zh: '已验证上限 + Aura 彻底修复 + AVG/FPS 叠加层',
      ja: '検証済み上限 + Aura を根本から修正 + AVG/FPS オーバーレイ',
      ko: '검증된 상한 + Aura 근본 수정 + AVG/FPS 오버레이',
    },
    points: [
      {
        es: 'Cap ya no se "hornea" en la curva; subir o quitar el cap libera RPM al instante',
        en: 'The cap is no longer "baked" into the curve; raising or removing the cap frees RPM instantly',
        fr: 'Le plafond n\'est plus « cuit » dans la courbe ; augmenter ou retirer le plafond libère les RPM instantanément',
        it: 'Il cap non viene più "cotto" nella curva; alzare o rimuovere il cap libera gli RPM all\'istante',
        pt: 'O cap não é mais "assado" na curva; aumentar ou remover o cap libera RPM na hora',
        zh: '上限不再"烘焙"进曲线；提高或移除上限会立即释放 RPM',
        ja: '上限がカーブに「焼き込まれ」なくなった；上限を上げる/外すと即座に RPM が解放される',
        ko: '상한이 더 이상 커브에 "구워지지" 않음; 상한을 올리거나 제거하면 즉시 RPM 해제',
      },
      {
        es: 'Calibración PWM→RPM real (7 escalones, espera estabilización < 75 RPM delta)',
        en: 'Real PWM→RPM calibration (7 steps, waits for stabilization < 75 RPM delta)',
        fr: 'Calibration PWM→RPM réelle (7 paliers, attend la stabilisation < 75 RPM delta)',
        it: 'Calibrazione PWM→RPM reale (7 step, attende la stabilizzazione < 75 RPM delta)',
        pt: 'Calibração PWM→RPM real (7 degraus, espera estabilização < 75 RPM delta)',
        zh: '真实 PWM→RPM 校准（7 个台阶，等待稳定至 < 75 RPM 偏差）',
        ja: '実 PWM→RPM キャリブレーション（7 段階、安定化を待つ < 75 RPM デルタ）',
        ko: '실제 PWM→RPM 보정(7단계, 안정화 대기 < 75 RPM 편차)',
      },
      {
        es: 'Aura: label asesino corregido (los chips estaban dentro de <label> que reenviaba al Static)',
        en: 'Aura: killer label fixed (the chips were inside a <label> that re-routed to Static)',
        fr: 'Aura : label tueur corrigé (les chips étaient dans un <label> qui réacheminait vers Static)',
        it: 'Aura: label assassino corretto (i chip erano dentro un <label> che reindirizzava a Static)',
        pt: 'Aura: label assassino corrigido (os chips estavam dentro de um <label> que reenviava para Static)',
        zh: 'Aura：致命的 label 已修复（chips 位于 <label> 内，导致跳转到 Static）',
        ja: 'Aura: 致命的な label を修正（chips が <label> 内にあり Static に転送されていた）',
        ko: 'Aura: 치명적인 label 수정(chips가 Static으로 다시 보내던 <label> 안에 있었음)',
      },
      {
        es: 'Aura: ya no reconstruye los chips cada segundo (firma de estado)',
        en: 'Aura: no longer rebuilds the chips every second (state signature)',
        fr: 'Aura : ne reconstruit plus les chips chaque seconde (signature d\'état)',
        it: 'Aura: non ricostruisce più i chip ogni secondo (firma di stato)',
        pt: 'Aura: não reconstrói mais os chips a cada segundo (assinatura de estado)',
        zh: 'Aura：不再每秒重建 chips（状态签名）',
        ja: 'Aura: 毎秒 chips を再構築しなくなった（状態シグネチャ）',
        ko: 'Aura: 더 이상 매초 chips를 재생성하지 않음(상태 시그니처)',
      },
      {
        es: 'Overlay: CPU muestra promedio AVG; FPS reales vía MangoHud (opt-in)',
        en: 'Overlay: CPU shows AVG average; real FPS via MangoHud (opt-in)',
        fr: 'Overlay : le CPU affiche la moyenne AVG ; FPS réels via MangoHud (opt-in)',
        it: 'Overlay: la CPU mostra la media AVG; FPS reali via MangoHud (opt-in)',
        pt: 'Overlay: a CPU mostra a média AVG; FPS reais via MangoHud (opt-in)',
        zh: '叠加层：CPU 显示 AVG 平均值；通过 MangoHud 获取真实 FPS（可选启用）',
        ja: 'オーバーレイ: CPU は AVG 平均を表示；MangoHud 経由の実 FPS（オプトイン）',
        ko: '오버레이: CPU는 AVG 평균 표시; MangoHud를 통한 실제 FPS(옵트인)',
      },
      {
        es: 'Modales arrastrables, ALERTAS con iconos/colores, EXPORTAR/IMPORTAR CONFIG',
        en: 'Draggable modals, ALERTS with icons/colors, EXPORT/IMPORT CONFIG',
        fr: 'Fenêtres déplaçables, ALERTES avec icônes/couleurs, EXPORTER/IMPORTER CONFIG',
        it: 'Modali trascinabili, AVVISI con icone/colori, ESPORTA/IMPORTA CONFIG',
        pt: 'Modais arrastáveis, ALERTAS com ícones/cores, EXPORTAR/IMPORTAR CONFIG',
        zh: '可拖动弹窗、带图标/颜色的告警、导出/导入配置',
        ja: 'ドラッグ可能なモーダル、アイコン/色付きアラート、設定のエクスポート/インポート',
        ko: '드래그 가능한 모달, 아이콘/색상이 있는 경고, 설정 내보내기/가져오기',
      },
      {
        es: 'Modo música: captura el monitor del sink, no el micrófono; brillo por D-Bus directo (~20 ms)',
        en: 'Music mode: captures the sink monitor, not the microphone; brightness via direct D-Bus (~20 ms)',
        fr: 'Mode musique : capture le monitor du sink, pas le micro ; luminosité via D-Bus direct (~20 ms)',
        it: 'Modalità musica: cattura il monitor del sink, non il microfono; luminosità via D-Bus diretto (~20 ms)',
        pt: 'Modo música: captura o monitor do sink, não o microfone; brilho via D-Bus direto (~20 ms)',
        zh: '音乐模式：捕获 sink 的 monitor 而非麦克风；亮度通过直连 D-Bus（约 20 ms）',
        ja: 'ミュージックモード: マイクではなく sink のモニターをキャプチャ；明るさは直接 D-Bus で（約 20 ms）',
        ko: '음악 모드: 마이크가 아닌 sink 모니터를 캡처; 밝기는 직접 D-Bus로(~20 ms)',
      },
    ],
  },
  {
    date: '2026-06-12',
    version: 'v8.4',
    title: {
      es: 'Identidad visual propia + hover en gráficas + nombre GPU real',
      en: 'Own visual identity + graph hover + real GPU name',
      fr: 'Identité visuelle propre + survol des graphiques + nom GPU réel',
      it: 'Identità visiva propria + hover sui grafici + nome GPU reale',
      pt: 'Identidade visual própria + hover nos gráficos + nome real da GPU',
      zh: '专属视觉识别 + 图表悬停 + 真实 GPU 名称',
      ja: '独自のビジュアルアイデンティティ + グラフのホバー + 実 GPU 名',
      ko: '고유 비주얼 아이덴티티 + 그래프 호버 + 실제 GPU 이름',
    },
    points: [
      {
        es: 'Identidad visual que no parezca "hecha por IA": esquinas cortadas, placas numeradas inclinadas, rayado diagonal',
        en: 'Visual identity that does not look "made by AI": cut corners, tilted numbered plates, diagonal hatching',
        fr: 'Identité visuelle qui ne semble pas « faite par IA » : coins coupés, plaques numérotées inclinées, hachures diagonales',
        it: 'Identità visiva che non sembri "fatta dall\'IA": angoli tagliati, targhette numerate inclinate, tratteggio diagonale',
        pt: 'Identidade visual que não pareça "feita por IA": cantos cortados, placas numeradas inclinadas, hachura diagonal',
        zh: '不显得"由 AI 制作"的视觉识别：切角、倾斜的编号铭牌、对角线斜纹',
        ja: '「AI 製」に見えないビジュアルアイデンティティ: 角の切り欠き、傾いた番号プレート、斜めのハッチング',
        ko: '"AI가 만든" 것처럼 보이지 않는 비주얼 아이덴티티: 잘린 모서리, 기울어진 번호판, 대각선 빗금',
      },
      {
        es: 'Bloques renumerados en orden visual: 01 CPU → 04 Iluminación; 05 Historial → 09 Procesos',
        en: 'Blocks renumbered in visual order: 01 CPU → 04 Lighting; 05 History → 09 Processes',
        fr: 'Blocs renumérotés dans l\'ordre visuel : 01 CPU → 04 Éclairage ; 05 Historique → 09 Processus',
        it: 'Blocchi rinumerati in ordine visivo: 01 CPU → 04 Illuminazione; 05 Cronologia → 09 Processi',
        pt: 'Blocos renumerados em ordem visual: 01 CPU → 04 Iluminação; 05 Histórico → 09 Processos',
        zh: '区块按视觉顺序重新编号：01 CPU → 04 灯效；05 历史 → 09 进程',
        ja: 'ブロックを視覚的な順に番号付け直し: 01 CPU → 04 ライティング；05 履歴 → 09 プロセス',
        ko: '블록을 시각적 순서로 재번호: 01 CPU → 04 조명; 05 기록 → 09 프로세스',
      },
      {
        es: 'Hover en las 4 gráficas: crosshair punteado, valor exacto y hace cuántos segundos fue',
        en: 'Hover on all 4 graphs: dotted crosshair, exact value and how many seconds ago it was',
        fr: 'Survol des 4 graphiques : croisillon pointillé, valeur exacte et il y a combien de secondes',
        it: 'Hover sui 4 grafici: crosshair punteggiato, valore esatto e quanti secondi fa è stato',
        pt: 'Hover nos 4 gráficos: crosshair pontilhado, valor exato e há quantos segundos foi',
        zh: '4 个图表的悬停：虚线十字准星、精确数值及距今几秒',
        ja: '4 つのグラフのホバー: 点線のクロスヘア、正確な値、何秒前かを表示',
        ko: '4개 그래프 호버: 점선 십자선, 정확한 값, 몇 초 전인지 표시',
      },
      {
        es: '+2 temas: Neón (cian/magenta) y Atardecer (oro/rosa) → ya son 8 paletas × claro/oscuro',
        en: '+2 themes: Neon (cyan/magenta) and Sunset (gold/pink) → now 8 palettes × light/dark',
        fr: '+2 thèmes : Néon (cyan/magenta) et Crépuscule (or/rose) → désormais 8 palettes × clair/sombre',
        it: '+2 temi: Neon (ciano/magenta) e Tramonto (oro/rosa) → ora 8 palette × chiaro/scuro',
        pt: '+2 temas: Neon (ciano/magenta) e Entardecer (ouro/rosa) → agora 8 paletas × claro/escuro',
        zh: '新增 2 套主题：霓虹（青/品红）和黄昏（金/粉）→ 现已 8 套配色 × 明/暗',
        ja: '+2 テーマ: ネオン（シアン/マゼンタ）とサンセット（ゴールド/ピンク）→ これで 8 パレット × ライト/ダーク',
        ko: '테마 2개 추가: 네온(시안/마젠타)과 노을(금/분홍) → 이제 8개 팔레트 × 라이트/다크',
      },
      {
        es: 'Modo claro con identidad real: paneles tintados por paleta (antes todos "blanco plano")',
        en: 'Light mode with real identity: panels tinted per palette (previously all "flat white")',
        fr: 'Mode clair avec identité réelle : panneaux teintés par palette (avant tous « blanc plat »)',
        it: 'Modalità chiara con identità reale: pannelli tinti per palette (prima tutti "bianco piatto")',
        pt: 'Modo claro com identidade real: painéis tingidos por paleta (antes todos "branco chapado")',
        zh: '具备真实识别的明亮模式：面板按配色着色（此前全是"纯平白"）',
        ja: '本物のアイデンティティを持つライトモード: パネルをパレット別に着色（以前はすべて「フラットな白」）',
        ko: '진짜 정체성을 가진 라이트 모드: 패널을 팔레트별로 색조 처리(이전엔 모두 "평평한 흰색")',
      },
      {
        es: 'Nombre de GPU detectado (nvidia-smi), ya no hardcodeado como "RTX 4060"',
        en: 'GPU name detected (nvidia-smi), no longer hardcoded as "RTX 4060"',
        fr: 'Nom du GPU détecté (nvidia-smi), plus codé en dur comme « RTX 4060 »',
        it: 'Nome della GPU rilevato (nvidia-smi), non più hardcoded come "RTX 4060"',
        pt: 'Nome da GPU detectado (nvidia-smi), não mais hardcoded como "RTX 4060"',
        zh: 'GPU 名称由检测获得（nvidia-smi），不再硬编码为"RTX 4060"',
        ja: 'GPU 名を検出（nvidia-smi）、もう「RTX 4060」とハードコードしない',
        ko: 'GPU 이름을 감지(nvidia-smi), 더 이상 "RTX 4060"으로 하드코딩하지 않음',
      },
      {
        es: 'Consumo GPU por power.draw.average → no se desploma a 1 W en micro-sueños',
        en: 'GPU draw via power.draw.average → no longer collapses to 1 W during micro-sleeps',
        fr: 'Consommation GPU via power.draw.average → ne s\'effondre plus à 1 W lors des micro-sommeils',
        it: 'Consumo GPU via power.draw.average → non crolla più a 1 W nei micro-sonni',
        pt: 'Consumo da GPU via power.draw.average → não despenca mais para 1 W em micro-sonos',
        zh: 'GPU 功耗采用 power.draw.average → 微睡眠时不再骤降到 1 W',
        ja: 'GPU 消費を power.draw.average で取得 → マイクロスリープ中に 1 W へ落ち込まない',
        ko: 'GPU 소비를 power.draw.average로 → 마이크로 슬립 중 1 W로 떨어지지 않음',
      },
      {
        es: 'Detección de teclados RGB USB de terceros vía sysfs (control sujeto a protocolo verificado)',
        en: 'Detection of third-party USB RGB keyboards via sysfs (control subject to a verified protocol)',
        fr: 'Détection de claviers RGB USB tiers via sysfs (contrôle soumis à un protocole vérifié)',
        it: 'Rilevamento di tastiere RGB USB di terze parti via sysfs (controllo soggetto a protocollo verificato)',
        pt: 'Detecção de teclados RGB USB de terceiros via sysfs (controle sujeito a protocolo verificado)',
        zh: '通过 sysfs 检测第三方 USB RGB 键盘（控制以已验证协议为准）',
        ja: 'サードパーティ製 USB RGB キーボードを sysfs で検出（制御は検証済みプロトコルが前提）',
        ko: 'sysfs를 통한 서드파티 USB RGB 키보드 감지(제어는 검증된 프로토콜 전제)',
      },
    ],
  },
  {
    date: '2026-06-13',
    version: 'v9.0.0',
    title: {
      es: 'Centro de Poder + wizard + 4 estados + 12 temas + grid Aura',
      en: 'Power Center + wizard + 4 states + 12 themes + Aura grid',
      fr: 'Centre de puissance + assistant + 4 états + 12 thèmes + grille Aura',
      it: 'Centro di potenza + wizard + 4 stati + 12 temi + griglia Aura',
      pt: 'Central de Energia + wizard + 4 estados + 12 temas + grade Aura',
      zh: '功耗中心 + 向导 + 4 种状态 + 12 套主题 + Aura 网格',
      ja: '電力センター + ウィザード + 4 状態 + 12 テーマ + Aura グリッド',
      ko: '전력 센터 + 마법사 + 4가지 상태 + 12개 테마 + Aura 그리드',
    },
    points: [
      {
        es: 'Centro de Poder: PL1 (28–140 W), PL2 (28–175 W), GPU Dynamic Boost (5–25 W), Thermal Target (75–87 °C)',
        en: 'Power Center: PL1 (28–140 W), PL2 (28–175 W), GPU Dynamic Boost (5–25 W), Thermal Target (75–87 °C)',
        fr: 'Centre de puissance : PL1 (28–140 W), PL2 (28–175 W), GPU Dynamic Boost (5–25 W), Thermal Target (75–87 °C)',
        it: 'Centro di potenza: PL1 (28–140 W), PL2 (28–175 W), GPU Dynamic Boost (5–25 W), Thermal Target (75–87 °C)',
        pt: 'Central de Energia: PL1 (28–140 W), PL2 (28–175 W), GPU Dynamic Boost (5–25 W), Thermal Target (75–87 °C)',
        zh: '功耗中心：PL1（28–140 W）、PL2（28–175 W）、GPU Dynamic Boost（5–25 W）、Thermal Target（75–87 °C）',
        ja: '電力センター: PL1（28–140 W）、PL2（28–175 W）、GPU Dynamic Boost（5–25 W）、Thermal Target（75–87 °C）',
        ko: '전력 센터: PL1(28–140 W), PL2(28–175 W), GPU Dynamic Boost(5–25 W), Thermal Target(75–87 °C)',
      },
      {
        es: 'Cada escritura recortada dos veces al mín/máx del firmware; diálogo de consentimiento; RESET A FÁBRICA',
        en: 'Every write double-clamped to the firmware min/max; consent dialog; FACTORY RESET',
        fr: 'Chaque écriture bridée deux fois au min/max du firmware ; dialogue de consentement ; RÉINITIALISATION USINE',
        it: 'Ogni scrittura clampata due volte al min/max del firmware; dialogo di consenso; RESET DI FABBRICA',
        pt: 'Cada escrita com duplo clamp ao mín/máx do firmware; diálogo de consentimento; RESET DE FÁBRICA',
        zh: '每次写入都双重钳制到固件的最小/最大值；同意对话框；恢复出厂设置',
        ja: '各書き込みをファームウェアの最小/最大で二重クランプ；同意ダイアログ；工場出荷時リセット',
        ko: '모든 쓰기를 펌웨어 최소/최대로 이중 클램프; 동의 대화상자; 공장 초기화',
      },
      {
        es: 'device_profiles.json + rangos en vivo de sysfs → funciona en cualquier portátil con asus-armoury',
        en: 'device_profiles.json + live sysfs ranges → works on any laptop with asus-armoury',
        fr: 'device_profiles.json + plages live de sysfs → fonctionne sur tout portable avec asus-armoury',
        it: 'device_profiles.json + range live di sysfs → funziona su qualsiasi portatile con asus-armoury',
        pt: 'device_profiles.json + faixas ao vivo do sysfs → funciona em qualquer laptop com asus-armoury',
        zh: 'device_profiles.json + 来自 sysfs 的实时范围 → 适用于任何带 asus-armoury 的笔记本',
        ja: 'device_profiles.json + sysfs のライブ範囲 → asus-armoury を備えた任意のノートで動作',
        ko: 'device_profiles.json + sysfs의 실시간 범위 → asus-armoury가 있는 모든 노트북에서 동작',
      },
      {
        es: '+4 temas (12 total): Neon Nights, Cyberpunk, Aurora, Alba; modos claros completamente rehechos',
        en: '+4 themes (12 total): Neon Nights, Cyberpunk, Aurora, Dawn; light modes completely redone',
        fr: '+4 thèmes (12 au total) : Neon Nights, Cyberpunk, Aurora, Aube ; modes clairs entièrement refaits',
        it: '+4 temi (12 in totale): Neon Nights, Cyberpunk, Aurora, Alba; modalità chiare completamente rifatte',
        pt: '+4 temas (12 no total): Neon Nights, Cyberpunk, Aurora, Alvorada; modos claros completamente refeitos',
        zh: '新增 4 套主题（共 12 套）：Neon Nights、Cyberpunk、Aurora、黎明；明亮模式彻底重做',
        ja: '+4 テーマ（合計 12）: Neon Nights、Cyberpunk、Aurora、夜明け；ライトモードを全面的に作り直し',
        ko: '테마 4개 추가(총 12개): Neon Nights, Cyberpunk, Aurora, 새벽; 라이트 모드 완전 재작업',
      },
      {
        es: 'Grid de 9 modos Aura con honestidad: 5 HW reales + Música + 3 marcados explícitamente',
        en: 'Honest grid of 9 Aura modes: 5 real HW + Music + 3 explicitly marked',
        fr: 'Grille honnête de 9 modes Aura : 5 HW réels + Musique + 3 marqués explicitement',
        it: 'Griglia onesta di 9 modalità Aura: 5 HW reali + Musica + 3 contrassegnate esplicitamente',
        pt: 'Grade honesta de 9 modos Aura: 5 HW reais + Música + 3 marcados explicitamente',
        zh: '诚实的 9 种 Aura 模式网格：5 个真实硬件 + 音乐 + 3 个明确标注',
        ja: '正直な 9 つの Aura モードのグリッド: 実 HW 5 + ミュージック + 明示マーク 3',
        ko: '정직한 9가지 Aura 모드 그리드: 실제 HW 5개 + 음악 + 명시적으로 표시된 3개',
      },
      {
        es: 'Wizard de primera vez: 5 pasos repetibles (bienvenida → fans → calibración → benchmark → tour)',
        en: 'First-run wizard: 5 repeatable steps (welcome → fans → calibration → benchmark → tour)',
        fr: 'Assistant de première utilisation : 5 étapes répétables (bienvenue → ventilos → calibration → benchmark → visite)',
        it: 'Wizard al primo avvio: 5 passi ripetibili (benvenuto → ventole → calibrazione → benchmark → tour)',
        pt: 'Wizard de primeira vez: 5 passos repetíveis (boas-vindas → ventoinhas → calibração → benchmark → tour)',
        zh: '首次运行向导：5 个可重复步骤（欢迎 → 风扇 → 校准 → 基准 → 导览）',
        ja: '初回ウィザード: 繰り返し可能な 5 ステップ（ようこそ → ファン → キャリブレーション → ベンチマーク → ツアー）',
        ko: '첫 실행 마법사: 반복 가능한 5단계(환영 → 팬 → 보정 → 벤치마크 → 둘러보기)',
      },
      {
        es: '4 estados por widget: skeleton / sin datos / error por widget, ventilador dañado mostrado PARADO',
        en: '4 states per widget: skeleton / no data / per-widget error, a broken fan shown STOPPED',
        fr: '4 états par widget : squelette / sans données / erreur par widget, ventilateur cassé affiché ARRÊTÉ',
        it: '4 stati per widget: skeleton / senza dati / errore per widget, ventola guasta mostrata FERMA',
        pt: '4 estados por widget: skeleton / sem dados / erro por widget, ventoinha danificada mostrada PARADA',
        zh: '每个组件 4 种状态：骨架 / 无数据 / 组件级错误，损坏风扇显示为停止',
        ja: 'ウィジェットごとに 4 状態: スケルトン / データなし / ウィジェット別エラー、故障ファンは停止と表示',
        ko: '위젯별 4가지 상태: 스켈레톤 / 데이터 없음 / 위젯별 오류, 고장난 팬은 정지로 표시',
      },
      {
        es: 'docs/supported-devices.md, CONTRIBUTING.md, plantillas de issues, CI GitHub Actions (preparado para open source)',
        en: 'docs/supported-devices.md, CONTRIBUTING.md, issue templates, GitHub Actions CI (prepared for open source)',
        fr: 'docs/supported-devices.md, CONTRIBUTING.md, modèles d\'issues, CI GitHub Actions (préparé pour l\'open source)',
        it: 'docs/supported-devices.md, CONTRIBUTING.md, template di issue, CI GitHub Actions (preparato per l\'open source)',
        pt: 'docs/supported-devices.md, CONTRIBUTING.md, modelos de issue, CI GitHub Actions (preparado para open source)',
        zh: 'docs/supported-devices.md、CONTRIBUTING.md、issue 模板、GitHub Actions CI（为开源做好准备）',
        ja: 'docs/supported-devices.md、CONTRIBUTING.md、issue テンプレート、GitHub Actions CI（オープンソースに向けた準備）',
        ko: 'docs/supported-devices.md, CONTRIBUTING.md, 이슈 템플릿, GitHub Actions CI(오픈소스 준비)',
      },
    ],
  },
  {
    date: '2026-06-15',
    version: 'v10.0.0',
    title: {
      es: 'i18n 8 idiomas + tablero arrastrable + neón puro + Roadmap + offsets GPU NVML + guardián térmico',
      en: 'i18n 8 languages + draggable dashboard + pure neon + Roadmap + NVML GPU offsets + thermal guardian',
      fr: 'i18n 8 langues + tableau de bord déplaçable + néon pur + Roadmap + offsets GPU NVML + gardien thermique',
      it: 'i18n 8 lingue + dashboard trascinabile + neon puro + Roadmap + offset GPU NVML + guardiano termico',
      pt: 'i18n 8 idiomas + painel arrastável + neon puro + Roadmap + offsets de GPU NVML + guardião térmico',
      zh: 'i18n 8 种语言 + 可拖动仪表盘 + 纯霓虹 + 路线图 + NVML GPU 偏移 + 热守护',
      ja: 'i18n 8 言語 + ドラッグ可能なダッシュボード + 純ネオン + ロードマップ + NVML GPU オフセット + サーマルガーディアン',
      ko: 'i18n 8개 언어 + 드래그 가능한 대시보드 + 순수 네온 + 로드맵 + NVML GPU 오프셋 + 열 가디언',
    },
    points: [
      {
        es: 'Internacionalización completa: 8 idiomas (es/en/fr/it/pt/zh/ja/ko), selector en topbar, 100% de claves core',
        en: 'Full internationalization: 8 languages (es/en/fr/it/pt/zh/ja/ko), topbar selector, 100% of core keys',
        fr: 'Internationalisation complète : 8 langues (es/en/fr/it/pt/zh/ja/ko), sélecteur dans la topbar, 100% des clés core',
        it: 'Internazionalizzazione completa: 8 lingue (es/en/fr/it/pt/zh/ja/ko), selettore nella topbar, 100% delle chiavi core',
        pt: 'Internacionalização completa: 8 idiomas (es/en/fr/it/pt/zh/ja/ko), seletor na topbar, 100% das chaves core',
        zh: '完整国际化：8 种语言（es/en/fr/it/pt/zh/ja/ko），顶栏选择器，100% 核心键',
        ja: '完全な国際化: 8 言語（es/en/fr/it/pt/zh/ja/ko）、トップバーのセレクタ、コアキーの 100%',
        ko: '완전한 국제화: 8개 언어(es/en/fr/it/pt/zh/ja/ko), 상단바 선택기, 코어 키 100%',
      },
      {
        es: 'Tablero reordenable y arrastrable: drag-and-drop por bloques, ocultar/mostrar, layout persistido',
        en: 'Reorderable and draggable dashboard: drag-and-drop by blocks, hide/show, persisted layout',
        fr: 'Tableau de bord réordonnable et déplaçable : glisser-déposer par blocs, masquer/afficher, disposition persistée',
        it: 'Dashboard riordinabile e trascinabile: drag-and-drop per blocchi, nascondi/mostra, layout persistente',
        pt: 'Painel reordenável e arrastável: drag-and-drop por blocos, ocultar/mostrar, layout persistido',
        zh: '可重排可拖动的仪表盘：按区块拖放、隐藏/显示、布局持久化',
        ja: '並べ替え可能でドラッグできるダッシュボード: ブロック単位のドラッグ＆ドロップ、非表示/表示、レイアウトを永続化',
        ko: '재정렬 및 드래그 가능한 대시보드: 블록 단위 드래그 앤 드롭, 숨기기/표시, 레이아웃 유지',
      },
      {
        es: 'Offsets GPU (núcleo/memoria) vía NVML: rangos seguros por device_profiles.json, rango avanzado con doble consentimiento',
        en: 'GPU offsets (core/memory) via NVML: safe ranges from device_profiles.json, advanced range with double consent',
        fr: 'Offsets GPU (cœur/mémoire) via NVML : plages sûres depuis device_profiles.json, plage avancée avec double consentement',
        it: 'Offset GPU (core/memoria) via NVML: range sicuri da device_profiles.json, range avanzato con doppio consenso',
        pt: 'Offsets de GPU (núcleo/memória) via NVML: faixas seguras de device_profiles.json, faixa avançada com duplo consentimento',
        zh: '通过 NVML 设置 GPU 偏移（核心/显存）：安全范围来自 device_profiles.json，高级范围需双重同意',
        ja: 'NVML による GPU オフセット（コア/メモリ）: device_profiles.json から安全範囲、上級範囲は二重同意付き',
        ko: 'NVML을 통한 GPU 오프셋(코어/메모리): device_profiles.json의 안전 범위, 고급 범위는 이중 동의',
      },
      {
        es: 'Guardián térmico: systemd unit con lógica consciente de carga CPU/GPU e histéresis de bajada',
        en: 'Thermal guardian: systemd unit with CPU/GPU load-aware logic and down hysteresis',
        fr: 'Gardien thermique : unit systemd avec logique consciente de la charge CPU/GPU et hystérésis de descente',
        it: 'Guardiano termico: unit systemd con logica consapevole del carico CPU/GPU e isteresi in discesa',
        pt: 'Guardião térmico: unit systemd com lógica consciente da carga CPU/GPU e histerese de descida',
        zh: '热守护：带 CPU/GPU 负载感知逻辑和下降迟滞的 systemd 单元',
        ja: 'サーマルガーディアン: CPU/GPU 負荷を意識したロジックと下降ヒステリシスを持つ systemd ユニット',
        ko: '열 가디언: CPU/GPU 부하 인식 로직과 하강 히스테리시스를 갖춘 systemd 유닛',
      },
      {
        es: 'Roadmap interactivo: timeline expandible con hitos completados y por hacer',
        en: 'Interactive roadmap: expandable timeline with completed and to-do milestones',
        fr: 'Roadmap interactive : timeline déroulable avec jalons accomplis et à faire',
        it: 'Roadmap interattiva: timeline espandibile con traguardi completati e da fare',
        pt: 'Roadmap interativo: timeline expansível com marcos concluídos e a fazer',
        zh: '交互式路线图：可展开的时间线，含已完成和待办里程碑',
        ja: 'インタラクティブなロードマップ: 完了済みと未着手のマイルストーンを持つ展開可能なタイムライン',
        ko: '대화형 로드맵: 완료 및 할 일 마일스톤을 갖춘 확장 가능한 타임라인',
      },
      {
        es: 'Neón reactivo puro: glow de números por nivel de alerta (frío/normal/caliente/crítico), no por color de tema',
        en: 'Pure reactive neon: number glow by alert level (cold/normal/hot/critical), not by theme color',
        fr: 'Néon réactif pur : glow des chiffres par niveau d\'alerte (froid/normal/chaud/critique), pas par couleur de thème',
        it: 'Neon reattivo puro: glow dei numeri per livello di allerta (freddo/normale/caldo/critico), non per colore del tema',
        pt: 'Neon reativo puro: glow dos números por nível de alerta (frio/normal/quente/crítico), não por cor do tema',
        zh: '纯反应式霓虹：数字辉光按告警级别（冷/正常/热/危急）而非主题颜色',
        ja: '純粋なリアクティブネオン: 数字のグローをアラートレベル別（冷/通常/熱/危険）で、テーマ色ではなく',
        ko: '순수 반응형 네온: 숫자 글로우를 경고 수준별(차가움/보통/뜨거움/위급)로, 테마 색상이 아님',
      },
      {
        es: 'Benchmarks con historial clickable: cada resultado abre un modal de detalle con gráficas',
        en: 'Benchmarks with clickable history: each result opens a detail modal with graphs',
        fr: 'Benchmarks avec historique cliquable : chaque résultat ouvre une fenêtre de détail avec graphiques',
        it: 'Benchmark con cronologia cliccabile: ogni risultato apre una modale di dettaglio con grafici',
        pt: 'Benchmarks com histórico clicável: cada resultado abre um modal de detalhe com gráficos',
        zh: '基准测试带可点击历史：每个结果打开带图表的详情弹窗',
        ja: 'クリック可能な履歴付きベンチマーク: 各結果がグラフ付きの詳細モーダルを開く',
        ko: '클릭 가능한 기록이 있는 벤치마크: 각 결과가 그래프 포함 상세 모달을 엶',
      },
      {
        es: 'Fix Aura: HARDWARE_CAP_OVERRIDE para teclados de 4 zonas (breathe 1 color sin segundos)',
        en: 'Aura fix: HARDWARE_CAP_OVERRIDE for 4-zone keyboards (breathe 1 color without seconds)',
        fr: 'Correctif Aura : HARDWARE_CAP_OVERRIDE pour claviers à 4 zones (breathe 1 couleur sans secondes)',
        it: 'Fix Aura: HARDWARE_CAP_OVERRIDE per tastiere a 4 zone (breathe 1 colore senza secondi)',
        pt: 'Fix Aura: HARDWARE_CAP_OVERRIDE para teclados de 4 zonas (breathe 1 cor sem segundos)',
        zh: 'Aura 修复：为 4 区键盘提供 HARDWARE_CAP_OVERRIDE（呼吸单色、无秒数）',
        ja: 'Aura 修正: 4 ゾーンキーボード向け HARDWARE_CAP_OVERRIDE（breathe 単色、秒数なし）',
        ko: 'Aura 수정: 4존 키보드용 HARDWARE_CAP_OVERRIDE(단색 호흡, 초 단위 없음)',
      },
    ],
  },
  {
    date: '2026-06-16',
    version: 'v11.0.0',
    title: {
      es: 'Ventiladores inteligentes + modo edición + neón reactivo + sesión de juego',
      en: 'Smart fans + edit mode + reactive neon + game session',
      fr: 'Ventilateurs intelligents + mode édition + néon réactif + session de jeu',
      it: 'Ventole intelligenti + modalità modifica + neon reattivo + sessione di gioco',
      pt: 'Ventoinhas inteligentes + modo edição + neon reativo + sessão de jogo',
      zh: '智能风扇 + 编辑模式 + 反应式霓虹 + 游戏会话',
      ja: 'スマートファン + 編集モード + リアクティブネオン + ゲームセッション',
      ko: '스마트 팬 + 편집 모드 + 반응형 네온 + 게임 세션',
    },
    points: [
      {
        es: 'Ventiladores inteligentes: curvas por perfil con histéresis (subir inmediato, bajar escalonado tras 20 s)',
        en: 'Smart fans: per-profile curves with hysteresis (ramp up immediately, step down after 20 s)',
        fr: 'Ventilateurs intelligents : courbes par profil avec hystérésis (montée immédiate, descente échelonnée après 20 s)',
        it: 'Ventole intelligenti: curve per profilo con isteresi (salita immediata, discesa a gradini dopo 20 s)',
        pt: 'Ventoinhas inteligentes: curvas por perfil com histerese (subir imediato, descer escalonado após 20 s)',
        zh: '智能风扇：按配置的曲线带迟滞（立即升速，20 秒后逐级降速）',
        ja: 'スマートファン: ヒステリシス付きのプロファイル別カーブ（上昇は即時、下降は 20 秒後に段階的）',
        ko: '스마트 팬: 히스테리시스가 있는 프로필별 커브(즉시 상승, 20초 후 단계적 하강)',
      },
      {
        es: 'Guardián consciente de carga: modula agresividad por uso CPU/GPU + temperatura + tendencia',
        en: 'Load-aware guardian: modulates aggressiveness by CPU/GPU usage + temperature + trend',
        fr: 'Gardien conscient de la charge : module l\'agressivité selon l\'usage CPU/GPU + température + tendance',
        it: 'Guardiano consapevole del carico: modula l\'aggressività per uso CPU/GPU + temperatura + tendenza',
        pt: 'Guardião consciente da carga: modula a agressividade por uso CPU/GPU + temperatura + tendência',
        zh: '负载感知守护：依据 CPU/GPU 使用率 + 温度 + 趋势调节激进程度',
        ja: '負荷を意識したガーディアン: CPU/GPU 使用率 + 温度 + トレンドで強度を調整',
        ko: '부하 인식 가디언: CPU/GPU 사용량 + 온도 + 추세로 공격성 조절',
      },
      {
        es: 'Neón por nivel: glow/box-shadow de números atado a variables de nivel (--lvl-cold/ok/hot/crit), no al acento',
        en: 'Neon by level: number glow/box-shadow bound to level variables (--lvl-cold/ok/hot/crit), not the accent',
        fr: 'Néon par niveau : glow/box-shadow des chiffres lié aux variables de niveau (--lvl-cold/ok/hot/crit), pas à l\'accent',
        it: 'Neon per livello: glow/box-shadow dei numeri legato alle variabili di livello (--lvl-cold/ok/hot/crit), non all\'accento',
        pt: 'Neon por nível: glow/box-shadow dos números atado a variáveis de nível (--lvl-cold/ok/hot/crit), não ao acento',
        zh: '按级别的霓虹：数字的 glow/box-shadow 绑定到级别变量（--lvl-cold/ok/hot/crit），而非强调色',
        ja: 'レベル別ネオン: 数字の glow/box-shadow をレベル変数（--lvl-cold/ok/hot/crit）に紐付け、アクセントではない',
        ko: '레벨별 네온: 숫자의 glow/box-shadow를 레벨 변수(--lvl-cold/ok/hot/crit)에 연결, 강조색이 아님',
      },
      {
        es: 'Bordes neón en tarjetas: glow del acento del tema, sutil y visible',
        en: 'Neon borders on cards: theme accent glow, subtle yet visible',
        fr: 'Bordures néon sur les cartes : glow de l\'accent du thème, subtil et visible',
        it: 'Bordi neon sulle schede: glow dell\'accento del tema, sottile ma visibile',
        pt: 'Bordas neon nos cartões: glow do acento do tema, sutil e visível',
        zh: '卡片霓虹边框：主题强调色辉光，微妙且可见',
        ja: 'カードのネオンボーダー: テーマアクセントのグロー、控えめだが視認できる',
        ko: '카드의 네온 테두리: 테마 강조색 글로우, 은은하지만 보임',
      },
      {
        es: 'Modo edición del tablero: toggle en barra superior; arrastre/ocultación solo cuando está activo',
        en: 'Dashboard edit mode: topbar toggle; drag/hide only when active',
        fr: 'Mode édition du tableau de bord : bascule dans la topbar ; glisser/masquer seulement quand actif',
        it: 'Modalità modifica della dashboard: toggle nella topbar; trascinamento/occultamento solo quando attiva',
        pt: 'Modo edição do painel: toggle na topbar; arrastar/ocultar só quando ativo',
        zh: '仪表盘编辑模式：顶栏开关；仅在激活时可拖动/隐藏',
        ja: 'ダッシュボード編集モード: トップバーのトグル；ドラッグ/非表示は有効時のみ',
        ko: '대시보드 편집 모드: 상단바 토글; 드래그/숨기기는 활성화 시에만',
      },
      {
        es: 'Sesión de juego: graba CPU/GPU temp, RPM, watts, RAM; resumen con gráficas; comparar vs baseline; detecta el juego',
        en: 'Game session: records CPU/GPU temp, RPM, watts, RAM; summary with graphs; compare vs baseline; detects the game',
        fr: 'Session de jeu : enregistre temp CPU/GPU, RPM, watts, RAM ; résumé avec graphiques ; comparer vs baseline ; détecte le jeu',
        it: 'Sessione di gioco: registra temp CPU/GPU, RPM, watt, RAM; riepilogo con grafici; confronto vs baseline; rileva il gioco',
        pt: 'Sessão de jogo: grava temp CPU/GPU, RPM, watts, RAM; resumo com gráficos; comparar vs baseline; detecta o jogo',
        zh: '游戏会话：记录 CPU/GPU 温度、RPM、瓦数、内存；带图表的摘要；与基线对比；检测游戏',
        ja: 'ゲームセッション: CPU/GPU 温度、RPM、ワット、RAM を記録；グラフ付き要約；ベースラインと比較；ゲームを検出',
        ko: '게임 세션: CPU/GPU 온도, RPM, 와트, RAM 기록; 그래프 포함 요약; 베이스라인과 비교; 게임 감지',
      },
      {
        es: 'Temas con carácter: 11 animaciones CSS por tema (Magma=lava, Océano=agua, Glaciar=hielo, Reactor=pulso)',
        en: 'Themes with character: 11 CSS animations per theme (Magma=lava, Ocean=water, Glacier=ice, Reactor=pulse)',
        fr: 'Thèmes avec du caractère : 11 animations CSS par thème (Magma=lave, Océan=eau, Glacier=glace, Réacteur=pulsation)',
        it: 'Temi con carattere: 11 animazioni CSS per tema (Magma=lava, Oceano=acqua, Ghiacciaio=ghiaccio, Reattore=pulsazione)',
        pt: 'Temas com caráter: 11 animações CSS por tema (Magma=lava, Oceano=água, Glaciar=gelo, Reator=pulso)',
        zh: '有个性的主题：每套主题 11 个 CSS 动画（Magma=熔岩，海洋=水，冰川=冰，反应堆=脉冲）',
        ja: '個性のあるテーマ: テーマごとに 11 の CSS アニメーション（Magma=溶岩、オーシャン=水、グレイシア=氷、リアクター=パルス）',
        ko: '개성 있는 테마: 테마별 11개 CSS 애니메이션(Magma=용암, 오션=물, 글레이셔=얼음, 리액터=펄스)',
      },
      {
        es: 'Menú de núcleos CPU: grid con frecuencia y temperatura por núcleo',
        en: 'CPU cores menu: grid with frequency and temperature per core',
        fr: 'Menu des cœurs CPU : grille avec fréquence et température par cœur',
        it: 'Menu dei core CPU: griglia con frequenza e temperatura per core',
        pt: 'Menu de núcleos da CPU: grade com frequência e temperatura por núcleo',
        zh: 'CPU 核心菜单：每核心的频率和温度网格',
        ja: 'CPU コアメニュー: コア別の周波数と温度のグリッド',
        ko: 'CPU 코어 메뉴: 코어별 주파수와 온도 그리드',
      },
      {
        es: 'Modal de detalle de benchmark: gráficas grandes con ejes, eventos importantes, tabla de resumen',
        en: 'Benchmark detail modal: large graphs with axes, important events, summary table',
        fr: 'Fenêtre de détail de benchmark : grands graphiques avec axes, événements importants, tableau récapitulatif',
        it: 'Modale di dettaglio del benchmark: grafici grandi con assi, eventi importanti, tabella di riepilogo',
        pt: 'Modal de detalhe de benchmark: gráficos grandes com eixos, eventos importantes, tabela de resumo',
        zh: '基准详情弹窗：带坐标轴的大图表、重要事件、摘要表',
        ja: 'ベンチマーク詳細モーダル: 軸付きの大きなグラフ、重要なイベント、要約テーブル',
        ko: '벤치마크 상세 모달: 축이 있는 큰 그래프, 중요 이벤트, 요약 표',
      },
    ],
  },
  {
    date: '2026-06-16',
    version: 'v11.1–11.2',
    title: {
      es: 'Pulido visual + rejilla de núcleos',
      en: 'Visual polish + core grid',
      fr: 'Finitions visuelles + grille de cœurs',
      it: 'Rifinitura visiva + griglia dei core',
      pt: 'Polimento visual + grade de núcleos',
      zh: '视觉打磨 + 核心网格',
      ja: 'ビジュアルの仕上げ + コアグリッド',
      ko: '시각적 다듬기 + 코어 그리드',
    },
    points: [
      {
        es: 'Temas con tinte estático (sin animación continua que castigue CPU/GPU)',
        en: 'Themes with static tint (no continuous animation that taxes CPU/GPU)',
        fr: 'Thèmes avec teinte statique (pas d\'animation continue qui pénalise le CPU/GPU)',
        it: 'Temi con tinta statica (senza animazione continua che penalizzi CPU/GPU)',
        pt: 'Temas com tinta estática (sem animação contínua que castigue CPU/GPU)',
        zh: '静态着色主题（无持续动画拖累 CPU/GPU）',
        ja: '静的な色合いのテーマ（CPU/GPU を消耗する連続アニメーションなし）',
        ko: '정적 색조 테마(CPU/GPU를 소모하는 연속 애니메이션 없음)',
      },
      {
        es: 'Glow de números moderado y reactivo por nivel',
        en: 'Moderate, level-reactive number glow',
        fr: 'Glow des chiffres modéré et réactif par niveau',
        it: 'Glow dei numeri moderato e reattivo per livello',
        pt: 'Glow dos números moderado e reativo por nível',
        zh: '适度且按级别反应的数字辉光',
        ja: '控えめでレベルに応じた数字のグロー',
        ko: '적당하고 레벨에 반응하는 숫자 글로우',
      },
      {
        es: 'Rejilla de núcleos por CPU; ejes legibles en las gráficas de benchmark',
        en: 'Per-CPU core grid; readable axes in benchmark graphs',
        fr: 'Grille de cœurs par CPU ; axes lisibles dans les graphiques de benchmark',
        it: 'Griglia dei core per CPU; assi leggibili nei grafici di benchmark',
        pt: 'Grade de núcleos por CPU; eixos legíveis nos gráficos de benchmark',
        zh: '每 CPU 的核心网格；基准图表坐标轴清晰可读',
        ja: 'CPU ごとのコアグリッド；ベンチマークグラフの読みやすい軸',
        ko: 'CPU별 코어 그리드; 벤치마크 그래프의 읽기 쉬운 축',
      },
    ],
  },
  {
    date: '2026-06-17',
    version: 'v12.0.0',
    title: {
      es: 'Integración multiagente: neón por nivel, fans inteligentes, sesión de juego',
      en: 'Multi-agent integration: neon by level, smart fans, game session',
      fr: 'Intégration multi-agent : néon par niveau, ventilateurs intelligents, session de jeu',
      it: 'Integrazione multiagente: neon per livello, ventole intelligenti, sessione di gioco',
      pt: 'Integração multiagente: neon por nível, ventoinhas inteligentes, sessão de jogo',
      zh: '多智能体集成：按级别霓虹、智能风扇、游戏会话',
      ja: 'マルチエージェント統合: レベル別ネオン、スマートファン、ゲームセッション',
      ko: '멀티에이전트 통합: 레벨별 네온, 스마트 팬, 게임 세션',
    },
    points: [
      {
        es: 'Neón por nivel de alerta consolidado; temas con carácter (animaciones baratas por paleta)',
        en: 'Consolidated alert-level neon; themes with character (cheap per-palette animations)',
        fr: 'Néon par niveau d\'alerte consolidé ; thèmes avec du caractère (animations peu coûteuses par palette)',
        it: 'Neon per livello di allerta consolidato; temi con carattere (animazioni economiche per palette)',
        pt: 'Neon por nível de alerta consolidado; temas com caráter (animações baratas por paleta)',
        zh: '整合的告警级别霓虹；有个性的主题（按配色的低开销动画）',
        ja: 'アラートレベル別ネオンを統合；個性のあるテーマ（パレット別の軽量アニメーション）',
        ko: '통합된 경고 수준 네온; 개성 있는 테마(팔레트별 가벼운 애니메이션)',
      },
      {
        es: 'Ventiladores con curvas suaves por perfil e histéresis; guardián térmico consciente de carga',
        en: 'Fans with smooth per-profile curves and hysteresis; load-aware thermal guardian',
        fr: 'Ventilateurs avec courbes douces par profil et hystérésis ; gardien thermique conscient de la charge',
        it: 'Ventole con curve morbide per profilo e isteresi; guardiano termico consapevole del carico',
        pt: 'Ventoinhas com curvas suaves por perfil e histerese; guardião térmico consciente da carga',
        zh: '带平滑的按配置曲线和迟滞的风扇；负载感知热守护',
        ja: 'プロファイル別の滑らかなカーブとヒステリシスを持つファン；負荷を意識したサーマルガーディアン',
        ko: '프로필별 부드러운 커브와 히스테리시스가 있는 팬; 부하 인식 열 가디언',
      },
      {
        es: 'Sesión de juego con resumen y comparación; i18n y dashboard mejorados',
        en: 'Game session with summary and comparison; improved i18n and dashboard',
        fr: 'Session de jeu avec résumé et comparaison ; i18n et tableau de bord améliorés',
        it: 'Sessione di gioco con riepilogo e confronto; i18n e dashboard migliorati',
        pt: 'Sessão de jogo com resumo e comparação; i18n e painel melhorados',
        zh: '带摘要和对比的游戏会话；改进的 i18n 和仪表盘',
        ja: '要約と比較を備えたゲームセッション；i18n とダッシュボードを改善',
        ko: '요약과 비교가 있는 게임 세션; 개선된 i18n과 대시보드',
      },
    ],
  },
  {
    date: '2026-06-17',
    version: 'v13.0.0',
    title: {
      es: 'Centro de Poder seguro + sesión de juego comparativa + listo para open source',
      en: 'Safe Power Center + comparative game session + ready for open source',
      fr: 'Centre de puissance sûr + session de jeu comparative + prêt pour l\'open source',
      it: 'Centro di potenza sicuro + sessione di gioco comparativa + pronto per l\'open source',
      pt: 'Central de Energia segura + sessão de jogo comparativa + pronto para open source',
      zh: '安全功耗中心 + 对比式游戏会话 + 开源就绪',
      ja: '安全な電力センター + 比較型ゲームセッション + オープンソース対応',
      ko: '안전한 전력 센터 + 비교형 게임 세션 + 오픈소스 준비 완료',
    },
    points: [
      {
        es: 'Perfiles Ahorro/Balance/Performance que aplican límites de poder REALES (CPU/GPU) con recorte seguro, además de las curvas de ventilador',
        en: 'Saver/Balance/Performance profiles that apply REAL power limits (CPU/GPU) with safe clamping, on top of the fan curves',
        fr: 'Profils Économie/Équilibre/Performance appliquant de VRAIES limites de puissance (CPU/GPU) avec bridage sûr, en plus des courbes de ventilateur',
        it: 'Profili Risparmio/Bilanciato/Performance che applicano limiti di potenza REALI (CPU/GPU) con clamp sicuro, oltre alle curve delle ventole',
        pt: 'Perfis Economia/Equilíbrio/Performance que aplicam limites de potência REAIS (CPU/GPU) com clamp seguro, além das curvas de ventoinha',
        zh: '节能/平衡/性能配置在风扇曲线之外，应用真实的功耗限制（CPU/GPU）并安全钳制',
        ja: '省電力/バランス/パフォーマンスのプロファイルが、ファンカーブに加えて実際の電力制限（CPU/GPU）を安全クランプ付きで適用',
        ko: '절약/균형/성능 프로필이 팬 커브에 더해 실제 전력 제한(CPU/GPU)을 안전 클램프와 함께 적용',
      },
      {
        es: 'Centro de Poder: aviso de riesgos por cada cambio, rieles de seguridad, doble consentimiento fuera de rango y modo avanzado por marca/componente con documentación oficial',
        en: 'Power Center: risk warning on every change, safety rails, double consent out of range and an advanced mode per brand/component with official documentation',
        fr: 'Centre de puissance : avertissement de risques à chaque changement, garde-fous, double consentement hors plage et mode avancé par marque/composant avec documentation officielle',
        it: 'Centro di potenza: avviso di rischi a ogni modifica, guardrail di sicurezza, doppio consenso fuori range e modalità avanzata per marca/componente con documentazione ufficiale',
        pt: 'Central de Energia: aviso de riscos a cada mudança, trilhos de segurança, duplo consentimento fora da faixa e modo avançado por marca/componente com documentação oficial',
        zh: '功耗中心：每次更改的风险提示、安全护栏、超出范围的双重同意，以及按品牌/部件提供带官方文档的高级模式',
        ja: '電力センター: 変更ごとのリスク警告、セーフティレール、範囲外での二重同意、メーカー/コンポーネント別の公式ドキュメント付き上級モード',
        ko: '전력 센터: 변경마다 위험 경고, 안전 가드레일, 범위 초과 시 이중 동의, 브랜드/부품별 공식 문서 포함 고급 모드',
      },
      {
        es: 'Sesión de juego: gráficas neón ampliables con zoom, comparación original vs ajustada en %, costo en energía y notas',
        en: 'Game session: zoomable neon graphs, original vs tuned comparison in %, energy cost and notes',
        fr: 'Session de jeu : graphiques néon zoomables, comparaison originale vs ajustée en %, coût énergétique et notes',
        it: 'Sessione di gioco: grafici neon ingrandibili, confronto originale vs ottimizzata in %, costo energetico e note',
        pt: 'Sessão de jogo: gráficos neon ampliáveis com zoom, comparação original vs ajustada em %, custo de energia e notas',
        zh: '游戏会话：可缩放的霓虹图表、原始 vs 调优按 % 对比、能耗及备注',
        ja: 'ゲームセッション: ズーム可能なネオングラフ、元 vs 調整後の % 比較、消費エネルギー、メモ',
        ko: '게임 세션: 확대 가능한 네온 그래프, 원본 vs 튜닝 % 비교, 에너지 비용, 메모',
      },
      {
        es: 'Núcleos: P-cores (rendimiento) y E-cores (eficiencia) diferenciados, GHz en la celda y detalle por núcleo',
        en: 'Cores: P-cores (performance) and E-cores (efficiency) differentiated, GHz in the cell and per-core detail',
        fr: 'Cœurs : P-cores (performance) et E-cores (efficacité) différenciés, GHz dans la cellule et détail par cœur',
        it: 'Core: P-core (prestazioni) ed E-core (efficienza) differenziati, GHz nella cella e dettaglio per core',
        pt: 'Núcleos: P-cores (desempenho) e E-cores (eficiência) diferenciados, GHz na célula e detalhe por núcleo',
        zh: '核心：区分 P 核（性能）和 E 核（能效），单元格显示 GHz，并提供单核详情',
        ja: 'コア: P コア（性能）と E コア（効率）を区別、セルに GHz、コア別の詳細',
        ko: '코어: P코어(성능)와 E코어(효율) 구분, 셀에 GHz, 코어별 상세',
      },
      {
        es: 'Arreglos: cambio de perfil sin "rebote"; todos los textos de bloques cambian de idioma',
        en: 'Fixes: profile change without "bounce"; all block texts change language',
        fr: 'Correctifs : changement de profil sans « rebond » ; tous les textes de blocs changent de langue',
        it: 'Fix: cambio di profilo senza "rimbalzo"; tutti i testi dei blocchi cambiano lingua',
        pt: 'Correções: mudança de perfil sem "rebote"; todos os textos dos blocos mudam de idioma',
        zh: '修复：切换配置不再"回弹"；所有区块文本随语言切换',
        ja: '修正: プロファイル変更時の「跳ね返り」をなくす；全ブロックのテキストが言語切り替えに対応',
        ko: '수정: 프로필 변경 시 "되튐" 없음; 모든 블록 텍스트가 언어에 따라 변경',
      },
      {
        es: 'Limpieza para publicar: versión unificada, roadmap honesto y sin datos personales',
        en: 'Cleanup for release: unified version, honest roadmap and no personal data',
        fr: 'Nettoyage pour publier : version unifiée, roadmap honnête et sans données personnelles',
        it: 'Pulizia per pubblicare: versione unificata, roadmap onesta e senza dati personali',
        pt: 'Limpeza para publicar: versão unificada, roadmap honesto e sem dados pessoais',
        zh: '发布前清理：统一版本、诚实路线图、无个人数据',
        ja: '公開向けクリーンアップ: バージョン統一、正直なロードマップ、個人データなし',
        ko: '공개를 위한 정리: 통일된 버전, 정직한 로드맵, 개인정보 없음',
      },
    ],
  },
  {
    date: '2026-06-18',
    version: 'v14.0.0',
    title: {
      es: 'Carpeta única + guardián 2 modos + instalación 1 línea',
      en: 'Single folder + 2-mode guardian + 1-line install',
      fr: 'Dossier unique + gardien 2 modes + installation en 1 ligne',
      it: 'Cartella unica + guardiano a 2 modalità + installazione in 1 riga',
      pt: 'Pasta única + guardião 2 modos + instalação em 1 linha',
      zh: '单一文件夹 + 双模式守护 + 一行安装',
      ja: '単一フォルダ + 2 モードのガーディアン + 1 行インストール',
      ko: '단일 폴더 + 2모드 가디언 + 한 줄 설치',
    },
    points: [
      {
        es: 'Scripts consolidados al repo: todo en una sola carpeta, sin dispersión por el sistema',
        en: 'Scripts consolidated into the repo: everything in a single folder, no scattering across the system',
        fr: 'Scripts consolidés dans le dépôt : tout dans un seul dossier, sans dispersion dans le système',
        it: 'Script consolidati nel repo: tutto in un\'unica cartella, senza dispersione nel sistema',
        pt: 'Scripts consolidados no repo: tudo em uma única pasta, sem dispersão pelo sistema',
        zh: '脚本整合进仓库：全部集中在单一文件夹，不再散落于系统各处',
        ja: 'スクリプトをリポジトリに集約: すべてを単一フォルダに、システム内に散らばらせない',
        ko: '스크립트를 저장소에 통합: 모두 단일 폴더에, 시스템 곳곳에 흩어지지 않음',
      },
      {
        es: 'Guardián con 2 modos: Protección (puede limitar) y Gaming (solo ventiladores, sin throttling)',
        en: 'Guardian with 2 modes: Protection (may throttle) and Gaming (fans only, no throttling)',
        fr: 'Gardien à 2 modes : Protection (peut limiter) et Gaming (ventilateurs seuls, sans throttling)',
        it: 'Guardiano con 2 modalità: Protezione (può limitare) e Gaming (solo ventole, senza throttling)',
        pt: 'Guardião com 2 modos: Proteção (pode limitar) e Gaming (só ventoinhas, sem throttling)',
        zh: '双模式守护：保护（可限制）和游戏（仅风扇，不降频）',
        ja: '2 モードのガーディアン: 保護（制限可能）とゲーミング（ファンのみ、スロットリングなし）',
        ko: '2모드 가디언: 보호(제한 가능)와 게이밍(팬만, 스로틀링 없음)',
      },
      {
        es: 'rog-power-source ahora opt-in: ya no rebota el perfil ni provoca "ladrillazos" por fuente de energía',
        en: 'rog-power-source now opt-in: no longer bounces the profile or causes "bricking" by power source',
        fr: 'rog-power-source désormais opt-in : ne fait plus rebondir le profil ni ne provoque de « brique » selon la source d\'alimentation',
        it: 'rog-power-source ora opt-in: non fa più rimbalzare il profilo né provoca "brick" in base alla fonte di alimentazione',
        pt: 'rog-power-source agora opt-in: não faz mais o perfil "rebotar" nem provoca "brick" pela fonte de energia',
        zh: 'rog-power-source 现为可选启用：不再因电源切换导致配置回弹或"变砖"',
        ja: 'rog-power-source をオプトインに: 電源によるプロファイルの跳ね返りや「文鎮化」を起こさない',
        ko: 'rog-power-source를 옵트인으로: 전원에 따른 프로필 되튐이나 "벽돌화"를 더 이상 일으키지 않음',
      },
      {
        es: 'Autostart minimizado sin castigar el rendimiento (backend congelado hasta mostrarse)',
        en: 'Minimized autostart without hurting performance (backend frozen until shown)',
        fr: 'Démarrage automatique minimisé sans pénaliser les performances (backend gelé jusqu\'à l\'affichage)',
        it: 'Avvio automatico minimizzato senza penalizzare le prestazioni (backend congelato fino alla visualizzazione)',
        pt: 'Autostart minimizado sem prejudicar o desempenho (backend congelado até ser mostrado)',
        zh: '最小化自启动且不拖累性能（后端在显示前保持冻结）',
        ja: '最小化での自動起動でも性能を損なわない（表示までバックエンドを凍結）',
        ko: '성능을 해치지 않는 최소화 자동 시작(표시될 때까지 백엔드 동결)',
      },
      {
        es: 'Instalar/desinstalar en 1 línea + wizard de Mantenimiento en la app',
        en: 'Install/uninstall in 1 line + Maintenance wizard in the app',
        fr: 'Installer/désinstaller en 1 ligne + assistant de Maintenance dans l\'app',
        it: 'Installa/disinstalla in 1 riga + wizard di Manutenzione nell\'app',
        pt: 'Instalar/desinstalar em 1 linha + wizard de Manutenção na app',
        zh: '一行安装/卸载 + 应用内维护向导',
        ja: '1 行でインストール/アンインストール + アプリ内のメンテナンスウィザード',
        ko: '한 줄 설치/제거 + 앱 내 유지보수 마법사',
      },
      {
        es: 'Modo seguro para TTY (rog-monitor-safe-mode.sh) como vía de recuperación',
        en: 'Safe mode for TTY (rog-monitor-safe-mode.sh) as a recovery path',
        fr: 'Mode sûr pour TTY (rog-monitor-safe-mode.sh) comme voie de récupération',
        it: 'Modalità sicura per TTY (rog-monitor-safe-mode.sh) come via di ripristino',
        pt: 'Modo seguro para TTY (rog-monitor-safe-mode.sh) como via de recuperação',
        zh: 'TTY 安全模式（rog-monitor-safe-mode.sh）作为恢复途径',
        ja: 'TTY 向けセーフモード（rog-monitor-safe-mode.sh）を復旧経路として',
        ko: 'TTY용 안전 모드(rog-monitor-safe-mode.sh)를 복구 경로로',
      },
    ],
  },
  {
    date: '2026-06-19',
    version: 'v15.0.0',
    title: {
      es: 'Fix caps por perfil + i18n total + overlay fino + guardián gaming con cap',
      en: 'Fix per-profile caps + full i18n + slim overlay + gaming guardian with cap',
      fr: 'Correctif des plafonds par profil + i18n total + overlay fin + gardien gaming avec plafond',
      it: 'Fix dei cap per profilo + i18n totale + overlay sottile + guardiano gaming con cap',
      pt: 'Fix dos caps por perfil + i18n total + overlay fino + guardião gaming com cap',
      zh: '修复按配置上限 + 完整 i18n + 纤细叠加层 + 带上限的游戏守护',
      ja: 'プロファイル別上限の修正 + 完全 i18n + スリムなオーバーレイ + 上限付きゲーミングガーディアン',
      ko: '프로필별 상한 수정 + 완전한 i18n + 슬림 오버레이 + 상한 있는 게이밍 가디언',
    },
    points: [
      {
        es: 'Bug arreglado: los caps de RPM por perfil ahora persisten de forma independiente',
        en: 'Bug fixed: per-profile RPM caps now persist independently',
        fr: 'Bug corrigé : les plafonds de RPM par profil persistent désormais de façon indépendante',
        it: 'Bug corretto: i cap di RPM per profilo ora persistono in modo indipendente',
        pt: 'Bug corrigido: os caps de RPM por perfil agora persistem de forma independente',
        zh: '修复 bug：按配置的 RPM 上限现可独立持久化',
        ja: 'バグ修正: プロファイル別の RPM 上限が独立して永続化されるように',
        ko: '버그 수정: 프로필별 RPM 상한이 이제 독립적으로 유지됨',
      },
      {
        es: 'i18n TOTAL: 411 claves × 8 idiomas cableadas; el idioma persiste al backend y los eventos nuevos llegan traducidos',
        en: 'FULL i18n: 411 keys × 8 languages wired; the language persists to the backend and new events arrive translated',
        fr: 'i18n TOTAL : 411 clés × 8 langues câblées ; la langue persiste au backend et les nouveaux événements arrivent traduits',
        it: 'i18n TOTALE: 411 chiavi × 8 lingue cablate; la lingua persiste al backend e i nuovi eventi arrivano tradotti',
        pt: 'i18n TOTAL: 411 chaves × 8 idiomas cabeadas; o idioma persiste no backend e os novos eventos chegam traduzidos',
        zh: '完整 i18n：411 个键 × 8 种语言全部接线；语言持久化到后端，新事件以翻译后送达',
        ja: '完全 i18n: 411 キー × 8 言語を配線；言語はバックエンドに永続化され、新規イベントは翻訳済みで届く',
        ko: '완전한 i18n: 411개 키 × 8개 언어 연결; 언어가 백엔드에 유지되고 새 이벤트가 번역되어 도착',
      },
      {
        es: 'Overlay rediseñado: una sola fila fina arriba-centro, consciente del tema',
        en: 'Redesigned overlay: a single slim row at top-center, theme-aware',
        fr: 'Overlay redessiné : une seule rangée fine en haut au centre, consciente du thème',
        it: 'Overlay ridisegnato: una singola riga sottile in alto al centro, consapevole del tema',
        pt: 'Overlay redesenhado: uma única linha fina no topo-centro, consciente do tema',
        zh: '重新设计的叠加层：顶部居中的单行纤细布局，感知主题',
        ja: '再設計したオーバーレイ: 上部中央の単一スリム行、テーマ対応',
        ko: '재설계된 오버레이: 상단 중앙의 단일 슬림 행, 테마 인식',
      },
      {
        es: 'Guardián Gaming con cap de ventilador configurable (por defecto = máximo medido)',
        en: 'Gaming Guardian with configurable fan cap (default = measured maximum)',
        fr: 'Gardien Gaming avec plafond de ventilateur configurable (par défaut = maximum mesuré)',
        it: 'Guardiano Gaming con cap della ventola configurabile (predefinito = massimo misurato)',
        pt: 'Guardião Gaming com cap de ventoinha configurável (padrão = máximo medido)',
        zh: '游戏守护带可配置的风扇上限（默认 = 实测最大值）',
        ja: 'ゲーミングガーディアンに設定可能なファン上限（デフォルト = 実測最大値）',
        ko: '게이밍 가디언에 구성 가능한 팬 상한(기본값 = 측정된 최댓값)',
      },
    ],
  },
  {
    date: '2026-06-20',
    version: 'v16.0.0',
    title: {
      es: 'Roadmap competitivo alineado + multilingüe',
      en: 'Competitive aligned roadmap + multilingual',
      fr: 'Roadmap compétitive alignée + multilingue',
      it: 'Roadmap competitiva allineata + multilingue',
      pt: 'Roadmap competitivo alinhado + multilíngue',
      zh: '对标对齐的路线图 + 多语言',
      ja: '競争力ある整列ロードマップ + 多言語',
      ko: '경쟁력 있는 정렬 로드맵 + 다국어',
    },
    points: [
      {
        es: 'Roadmap reposicionado: "Armoury Crate para Linux" — seguro, bonito, todo-en-uno, sin telemetría',
        en: 'Repositioned roadmap: "Armoury Crate for Linux" — safe, beautiful, all-in-one, no telemetry',
        fr: 'Roadmap repositionnée : « Armoury Crate pour Linux » — sûr, beau, tout-en-un, sans télémétrie',
        it: 'Roadmap riposizionata: "Armoury Crate per Linux" — sicuro, bello, tutto-in-uno, senza telemetria',
        pt: 'Roadmap reposicionado: "Armoury Crate para Linux" — seguro, bonito, tudo-em-um, sem telemetria',
        zh: '重新定位的路线图："Linux 版 Armoury Crate" — 安全、美观、一体化、无遥测',
        ja: 'リポジショニングしたロードマップ: 「Linux 版 Armoury Crate」— 安全・美しい・オールインワン・テレメトリなし',
        ko: '재포지셔닝된 로드맵: "Linux용 Armoury Crate" — 안전하고 아름다운 올인원, 텔레메트리 없음',
      },
      {
        es: 'Fases claras de post-lanzamiento (seguimiento → P1 DIFERENCIADORES → P2 ALCANCE → P3 ECOSISTEMA)',
        en: 'Clear post-launch phases (follow-up → P1 DIFFERENTIATORS → P2 REACH → P3 ECOSYSTEM)',
        fr: 'Phases claires post-lancement (suivi → P1 DIFFÉRENCIATEURS → P2 PORTÉE → P3 ÉCOSYSTÈME)',
        it: 'Fasi chiare post-lancio (follow-up → P1 DIFFERENZIATORI → P2 PORTATA → P3 ECOSISTEMA)',
        pt: 'Fases claras de pós-lançamento (acompanhamento → P1 DIFERENCIAIS → P2 ALCANCE → P3 ECOSSISTEMA)',
        zh: '清晰的发布后阶段（跟进 → P1 差异化 → P2 覆盖 → P3 生态）',
        ja: '明確なローンチ後フェーズ（フォローアップ → P1 差別化 → P2 リーチ → P3 エコシステム）',
        ko: '명확한 출시 후 단계(후속 → P1 차별화 → P2 도달 범위 → P3 생태계)',
      },
      {
        es: 'Roadmap multilingüe en los 8 idiomas; se re-renderiza al cambiar de idioma',
        en: 'Multilingual roadmap in all 8 languages; re-renders on language change',
        fr: 'Roadmap multilingue dans les 8 langues ; se re-rend au changement de langue',
        it: 'Roadmap multilingue nelle 8 lingue; si ri-renderizza al cambio di lingua',
        pt: 'Roadmap multilíngue nos 8 idiomas; re-renderiza ao mudar de idioma',
        zh: '8 种语言的多语言路线图；切换语言时重新渲染',
        ja: '8 言語の多言語ロードマップ；言語変更時に再レンダリング',
        ko: '8개 언어의 다국어 로드맵; 언어 변경 시 다시 렌더링',
      },
      {
        es: 'Títulos de la línea de tiempo alineados en una sola columna (grid de cabecera)',
        en: 'Timeline titles aligned in a single column (header grid)',
        fr: 'Titres de la timeline alignés sur une seule colonne (grille d\'en-tête)',
        it: 'Titoli della timeline allineati in una singola colonna (griglia di intestazione)',
        pt: 'Títulos da timeline alinhados em uma única coluna (grid de cabeçalho)',
        zh: '时间线标题对齐到单一列（表头网格）',
        ja: 'タイムラインのタイトルを単一カラムに整列（ヘッダーグリッド）',
        ko: '타임라인 제목을 단일 열에 정렬(헤더 그리드)',
      },
    ],
  },
  {
    date: '2026-06-23',
    version: 'v17.0.0',
    title: {
      es: 'Pulido pre-lanzamiento open source',
      en: 'Pre-launch open source polish',
      fr: 'Finitions pré-lancement open source',
      it: 'Rifinitura pre-lancio open source',
      pt: 'Polimento pré-lançamento open source',
      zh: '开源发布前的打磨',
      ja: 'オープンソース公開前の仕上げ',
      ko: '오픈소스 출시 전 다듬기',
    },
    points: [
      {
        es: 'Arreglado el congelamiento crítico: watchdog que fuerza SIGCONT y respawnea el backend si deja de emitir datos al restaurar la ventana (KDE/Wayland); estado "reconectando…" en la UI',
        en: 'Fixed the critical freeze: a watchdog that forces SIGCONT and respawns the backend if it stops emitting data when the window is restored (KDE/Wayland); "reconnecting…" state in the UI',
        fr: 'Correction du gel critique : un watchdog qui force SIGCONT et relance le backend s\'il cesse d\'émettre des données au restaurer la fenêtre (KDE/Wayland) ; état « reconnexion… » dans l\'UI',
        it: 'Risolto il blocco critico: un watchdog che forza SIGCONT e fa il respawn del backend se smette di emettere dati al ripristino della finestra (KDE/Wayland); stato "riconnessione…" nell\'UI',
        pt: 'Corrigido o congelamento crítico: um watchdog que força SIGCONT e faz respawn do backend se ele parar de emitir dados ao restaurar a janela (KDE/Wayland); estado "reconectando…" na UI',
        zh: '修复关键卡死：看门狗在还原窗口（KDE/Wayland）后若后端停止发送数据则强制 SIGCONT 并重启后端；UI 显示"重新连接中…"状态',
        ja: '致命的なフリーズを修正: ウィンドウ復元時（KDE/Wayland）にバックエンドがデータ送信を止めたら SIGCONT を強制し再起動するウォッチドッグ；UI に「再接続中…」状態',
        ko: '치명적 멈춤 수정: 창 복원(KDE/Wayland) 시 백엔드가 데이터 전송을 멈추면 SIGCONT를 강제하고 재시작하는 워치독; UI에 "재연결 중…" 상태',
      },
      {
        es: 'Diálogos de confirmación ahora SIEMPRE encima del fondo oscuro (z-index corregido); toasts rediseñados con variantes ok/aviso/error (color e icono)',
        en: 'Confirmation dialogs now ALWAYS above the dark backdrop (z-index fixed); toasts redesigned with ok/warning/error variants (color and icon)',
        fr: 'Les dialogues de confirmation sont désormais TOUJOURS au-dessus du fond sombre (z-index corrigé) ; toasts redessinés avec variantes ok/avertissement/erreur (couleur et icône)',
        it: 'I dialoghi di conferma ora sono SEMPRE sopra lo sfondo scuro (z-index corretto); toast ridisegnati con varianti ok/avviso/errore (colore e icona)',
        pt: 'Os diálogos de confirmação agora ficam SEMPRE acima do fundo escuro (z-index corrigido); toasts redesenhados com variantes ok/aviso/erro (cor e ícone)',
        zh: '确认对话框现始终位于深色背景之上（修复 z-index）；toast 重新设计，含 ok/警告/错误 变体（颜色与图标）',
        ja: '確認ダイアログが常に暗い背景の上に表示されるように（z-index を修正）；トーストを ok/警告/エラーのバリアント（色とアイコン）で再設計',
        ko: '확인 대화상자가 이제 항상 어두운 배경 위에 표시됨(z-index 수정); 토스트를 ok/경고/오류 변형(색상과 아이콘)으로 재설계',
      },
      {
        es: 'Pre-confirmación temática antes de pedir la contraseña: lista los valores exactos que se van a aplicar; la contraseña sigue gestionada por pkexec, nunca por la app',
        en: 'Themed pre-confirmation before asking for the password: lists the exact values about to be applied; the password is still handled by pkexec, never by the app',
        fr: 'Pré-confirmation thématisée avant de demander le mot de passe : liste les valeurs exactes sur le point d\'être appliquées ; le mot de passe reste géré par pkexec, jamais par l\'app',
        it: 'Pre-conferma a tema prima di chiedere la password: elenca i valori esatti che stanno per essere applicati; la password è ancora gestita da pkexec, mai dall\'app',
        pt: 'Pré-confirmação temática antes de pedir a senha: lista os valores exatos que serão aplicados; a senha continua gerida pelo pkexec, nunca pela app',
        zh: '请求密码前的主题化预确认：列出即将应用的精确值；密码仍由 pkexec 处理，绝不经由应用',
        ja: 'パスワードを求める前のテーマ付き事前確認: これから適用する正確な値を列挙；パスワードは引き続き pkexec が管理し、アプリは扱わない',
        ko: '비밀번호를 요청하기 전 테마 사전 확인: 적용될 정확한 값을 나열; 비밀번호는 여전히 pkexec가 처리하며 앱은 절대 다루지 않음',
      },
      {
        es: 'CONFIGURACIÓN ahora es un botón de primer nivel (un clic) y el idioma 🌐 está siempre visible; eliminado el selector de idioma duplicado; barra de navegación colapsable',
        en: 'SETTINGS is now a top-level button (one click) and the language 🌐 is always visible; removed the duplicate language selector; collapsible navigation bar',
        fr: 'CONFIGURATION est désormais un bouton de premier niveau (un clic) et la langue 🌐 est toujours visible ; sélecteur de langue dupliqué supprimé ; barre de navigation repliable',
        it: 'IMPOSTAZIONI ora è un pulsante di primo livello (un clic) e la lingua 🌐 è sempre visibile; rimosso il selettore di lingua duplicato; barra di navigazione comprimibile',
        pt: 'CONFIGURAÇÃO agora é um botão de primeiro nível (um clique) e o idioma 🌐 está sempre visível; removido o seletor de idioma duplicado; barra de navegação recolhível',
        zh: '配置现为一级按钮（一键）且语言 🌐 始终可见；移除重复的语言选择器；导航栏可折叠',
        ja: '設定が第一階層のボタン（ワンクリック）になり、言語 🌐 は常に表示；重複した言語セレクタを削除；折りたためるナビゲーションバー',
        ko: '설정이 이제 최상위 버튼(한 번 클릭)이고 언어 🌐는 항상 표시; 중복된 언어 선택기 제거; 접을 수 있는 내비게이션 바',
      },
      {
        es: 'Perfiles de poder con transición animada y tooltips por botón; al agarrar un ventilador se pausa su animación de giro y se reanuda al soltar',
        en: 'Power profiles with animated transition and per-button tooltips; grabbing a fan pauses its spin animation and resumes it on release',
        fr: 'Profils de puissance avec transition animée et infobulles par bouton ; saisir un ventilateur met en pause son animation de rotation et la reprend au relâcher',
        it: 'Profili di potenza con transizione animata e tooltip per pulsante; afferrando una ventola si mette in pausa la sua animazione di rotazione e si riprende al rilascio',
        pt: 'Perfis de potência com transição animada e tooltips por botão; ao segurar uma ventoinha pausa-se a animação de giro e retoma-se ao soltar',
        zh: '功耗配置带动画过渡和逐按钮提示；抓住风扇时暂停其旋转动画，松开后恢复',
        ja: '電力プロファイルにアニメーション付き遷移とボタンごとのツールチップ；ファンを掴むと回転アニメーションが一時停止し、離すと再開',
        ko: '전력 프로필에 애니메이션 전환과 버튼별 툴팁; 팬을 잡으면 회전 애니메이션이 멈추고 놓으면 재개',
      },
      {
        es: 'Hover en núcleos ahora muestra un tooltip flotante sin descuadrar la rejilla; quitado el indicador "Live" titilante',
        en: 'Hovering cores now shows a floating tooltip without breaking the grid layout; removed the blinking "Live" indicator',
        fr: 'Le survol des cœurs affiche désormais une infobulle flottante sans désaligner la grille ; indicateur « Live » clignotant supprimé',
        it: 'L\'hover sui core ora mostra un tooltip flottante senza scompaginare la griglia; rimosso l\'indicatore "Live" lampeggiante',
        pt: 'O hover nos núcleos agora mostra um tooltip flutuante sem desalinhar a grade; removido o indicador "Live" piscante',
        zh: '悬停核心现显示浮动提示而不打乱网格；移除闪烁的"Live"指示器',
        ja: 'コアのホバーでグリッドを崩さずフローティングツールチップを表示；点滅する「Live」インジケーターを削除',
        ko: '코어 호버 시 그리드를 흐트러뜨리지 않고 떠 있는 툴팁 표시; 깜박이는 "Live" 표시기 제거',
      },
      {
        es: 'Info (i) explicando los modos de VRAM (C/G/CG); lista de procesos por RAM ordenable (RAM/nombre/PID) igual que la de CPU',
        en: 'Info (i) explaining the VRAM modes (C/G/CG); RAM process list sortable (RAM/name/PID) just like the CPU one',
        fr: 'Info (i) expliquant les modes de VRAM (C/G/CG) ; liste de processus par RAM triable (RAM/nom/PID) comme celle du CPU',
        it: 'Info (i) che spiega le modalità VRAM (C/G/CG); lista dei processi per RAM ordinabile (RAM/nome/PID) come quella della CPU',
        pt: 'Info (i) explicando os modos de VRAM (C/G/CG); lista de processos por RAM ordenável (RAM/nome/PID) igual à da CPU',
        zh: '信息（i）说明 VRAM 模式（C/G/CG）；按 RAM 的进程列表可排序（RAM/名称/PID），与 CPU 列表一致',
        ja: 'VRAM モード（C/G/CG）を説明する情報（i）；RAM のプロセス一覧を CPU と同様にソート可能（RAM/名前/PID）',
        ko: 'VRAM 모드(C/G/CG)를 설명하는 정보(i); RAM 프로세스 목록을 CPU와 동일하게 정렬 가능(RAM/이름/PID)',
      },
      {
        es: 'Arreglos de layout a zoom alto: eliminado el hueco rosa bajo Iluminación y la caja de detección de teclado que crecía sin límite',
        en: 'High-zoom layout fixes: removed the pink gap under Lighting and the keyboard detection box that grew without limit',
        fr: 'Correctifs de mise en page à fort zoom : suppression de l\'espace rose sous Éclairage et de la boîte de détection du clavier qui grandissait sans limite',
        it: 'Fix di layout a zoom elevato: rimosso lo spazio rosa sotto Illuminazione e il box di rilevamento della tastiera che cresceva senza limite',
        pt: 'Correções de layout em zoom alto: removido o vão rosa sob Iluminação e a caixa de detecção de teclado que crescia sem limite',
        zh: '高缩放布局修复：移除灯效下方的粉色空隙和无限增长的键盘检测框',
        ja: '高ズーム時のレイアウト修正: ライティング下のピンクの隙間と、無制限に大きくなるキーボード検出ボックスを除去',
        ko: '고배율 레이아웃 수정: 조명 아래의 분홍색 빈틈과 무한히 커지던 키보드 감지 상자 제거',
      },
      {
        es: 'Roadmap 100% traducido a los 8 idiomas (historial completo, no solo lo futuro)',
        en: 'Roadmap 100% translated into all 8 languages (full history, not just the future)',
        fr: 'Roadmap traduite à 100% dans les 8 langues (historique complet, pas seulement le futur)',
        it: 'Roadmap tradotta al 100% nelle 8 lingue (cronologia completa, non solo il futuro)',
        pt: 'Roadmap 100% traduzido nos 8 idiomas (histórico completo, não só o futuro)',
        zh: '路线图 100% 翻译为 8 种语言（完整历史，不只是未来）',
        ja: 'ロードマップを 8 言語に 100% 翻訳（未来だけでなく履歴全体）',
        ko: '로드맵을 8개 언어로 100% 번역(미래뿐 아니라 전체 기록)',
      },
    ],
  },
  {
    date: '2026-06-24',
    version: 'v18.0.0',
    title: {
      es: 'Diagnóstico de hardware: discos, batería, hub de pruebas y eventos explicados',
      en: 'Hardware diagnostics: disks, battery, test hub and explained events',
      fr: 'Diagnostic matériel : disques, batterie, hub de tests et événements expliqués',
      it: 'Diagnostica hardware: dischi, batteria, hub di test ed eventi spiegati',
      pt: 'Diagnóstico de hardware: discos, bateria, hub de testes e eventos explicados',
      zh: '硬件诊断：磁盘、电池、测试中心和事件说明',
      ja: 'ハードウェア診断: ディスク、バッテリー、テストハブ、イベント解説',
      ko: '하드웨어 진단: 디스크, 배터리, 테스트 허브 및 이벤트 설명',
    },
    points: [
      {
        es: 'Panel de salud de batería: desgaste / salud %, ciclos de carga, capacidad actual vs diseño y consumo en vivo',
        en: 'Battery health panel: wear / health %, charge cycles, current vs design capacity and live draw',
        fr: 'Panneau de santé de la batterie : usure / santé %, cycles de charge, capacité actuelle vs conception et consommation en direct',
        it: 'Pannello salute batteria: usura / salute %, cicli di carica, capacità attuale vs progetto e consumo in tempo reale',
        pt: 'Painel de saúde da bateria: desgaste / saúde %, ciclos de carga, capacidade atual vs projeto e consumo ao vivo',
        zh: '电池健康面板：损耗/健康 %、充电循环、当前与设计容量及实时功耗',
        ja: 'バッテリー健康パネル: 劣化/健康 %、充電サイクル、現在対設計容量、リアルタイム消費',
        ko: '배터리 건강 패널: 마모/건강 %, 충전 주기, 현재 대 설계 용량, 실시간 소비',
      },
      {
        es: 'Panel de discos en vivo (uso, temperatura, modelo, sistema de archivos, lectura/escritura) + SMART bajo demanda con pkexec: horas encendido, ciclos, desgaste SSD y sectores reasignados',
        en: 'Live disk panel (usage, temperature, model, filesystem, read/write) + on-demand SMART via pkexec: power-on hours, cycles, SSD wear and reallocated sectors',
        fr: 'Panneau de disques en direct (utilisation, température, modèle, système de fichiers, lecture/écriture) + SMART à la demande via pkexec : heures de fonctionnement, cycles, usure SSD et secteurs réalloués',
        it: 'Pannello dischi in tempo reale (uso, temperatura, modello, filesystem, lettura/scrittura) + SMART su richiesta via pkexec: ore di accensione, cicli, usura SSD e settori riallocati',
        pt: 'Painel de discos ao vivo (uso, temperatura, modelo, sistema de arquivos, leitura/escrita) + SMART sob demanda via pkexec: horas ligado, ciclos, desgaste SSD e setores realocados',
        zh: '实时磁盘面板（使用率、温度、型号、文件系统、读/写）+ 通过 pkexec 按需 SMART：通电时间、循环次数、SSD 损耗和重映射扇区',
        ja: 'ライブディスクパネル（使用率、温度、モデル、ファイルシステム、読み書き）+ pkexec によるオンデマンド SMART: 通電時間、サイクル、SSD 劣化、代替処理済みセクタ',
        ko: '실시간 디스크 패널(사용량, 온도, 모델, 파일시스템, 읽기/쓰기) + pkexec를 통한 온디맨드 SMART: 전원 켜짐 시간, 주기, SSD 마모, 재할당 섹터',
      },
      {
        es: 'Hub de Diagnóstico: tarjetas de CPU/GPU/iGPU/batería/ventiladores/placa madre + pruebas interactivas de teclado, sonido (canales L/R) y pantalla (colores a pantalla completa)',
        en: 'Diagnostics hub: CPU/GPU/iGPU/battery/fans/motherboard cards + interactive keyboard, sound (L/R channels) and display (full-screen colors) tests',
        fr: 'Hub de diagnostic : cartes CPU/GPU/iGPU/batterie/ventilateurs/carte mère + tests interactifs clavier, son (canaux G/D) et écran (couleurs plein écran)',
        it: 'Hub diagnostica: schede CPU/GPU/iGPU/batteria/ventole/scheda madre + test interattivi di tastiera, audio (canali L/R) e schermo (colori a tutto schermo)',
        pt: 'Hub de diagnóstico: cartões de CPU/GPU/iGPU/bateria/ventoinhas/placa-mãe + testes interativos de teclado, som (canais E/D) e tela (cores em tela cheia)',
        zh: '诊断中心：CPU/GPU/iGPU/电池/风扇/主板信息卡 + 交互式键盘、声音（左/右声道）和显示（全屏颜色）测试',
        ja: '診断ハブ: CPU/GPU/iGPU/バッテリー/ファン/マザーボードのカード + 対話式のキーボード、音（L/R チャンネル）、ディスプレイ（全画面カラー）テスト',
        ko: '진단 허브: CPU/GPU/iGPU/배터리/팬/메인보드 카드 + 대화형 키보드, 소리(L/R 채널), 디스플레이(전체 화면 색상) 테스트',
      },
      {
        es: 'Eventos clicables y categorizados por tipo, con un modal que explica qué es y cómo funciona cada evento en los 8 idiomas',
        en: 'Clickable events categorized by type, with a modal explaining what each event is and how it works in all 8 languages',
        fr: 'Événements cliquables et catégorisés par type, avec une fenêtre expliquant ce qu\'est chaque événement et son fonctionnement dans les 8 langues',
        it: 'Eventi cliccabili e categorizzati per tipo, con un modale che spiega cos\'è e come funziona ogni evento nelle 8 lingue',
        pt: 'Eventos clicáveis e categorizados por tipo, com um modal que explica o que é e como funciona cada evento nos 8 idiomas',
        zh: '可点击并按类型分类的事件，提供以 8 种语言解释每个事件是什么及如何工作的弹窗',
        ja: 'タイプ別に分類されたクリック可能なイベント。各イベントが何で、どう動くかを 8 言語で説明するモーダル付き',
        ko: '유형별로 분류된 클릭 가능한 이벤트와 각 이벤트가 무엇이며 어떻게 작동하는지 8개 언어로 설명하는 모달',
      },
      {
        es: 'Detalle de benchmark traducido y exportaciones (benchmark/eventos) generadas en el idioma activo; arreglado el neón de la columna por-núcleo en Procesos',
        en: 'Benchmark detail translated and exports (benchmark/events) generated in the active language; fixed the per-core column neon in Processes',
        fr: 'Détail du benchmark traduit et exports (benchmark/événements) générés dans la langue active ; correction du néon de la colonne par cœur dans Processus',
        it: 'Dettaglio benchmark tradotto ed esportazioni (benchmark/eventi) generate nella lingua attiva; corretto il neon della colonna per-core in Processi',
        pt: 'Detalhe do benchmark traduzido e exportações (benchmark/eventos) geradas no idioma ativo; corrigido o neon da coluna por núcleo em Processos',
        zh: 'Benchmark 详情已翻译，导出（benchmark/事件）按当前语言生成；修复了进程中按核心列的霓虹效果',
        ja: 'ベンチマーク詳細を翻訳、エクスポート（ベンチマーク/イベント）をアクティブ言語で生成；プロセスのコア別カラムのネオンを修正',
        ko: '벤치마크 상세 번역 및 내보내기(벤치마크/이벤트)를 활성 언어로 생성; 프로세스의 코어별 열 네온 수정',
      },
    ],
  },
  {
    date: '2026-06-25',
    version: 'v20.0.0',
    title: {
      es: 'Transparencia, arreglo de Diagnóstico y listo para lanzar',
      en: 'Transparency, Diagnostics fix and launch-ready',
      fr: 'Transparence, correction du Diagnostic et prêt à lancer',
      it: 'Trasparenza, correzione Diagnostica e pronto al lancio',
      pt: 'Transparência, correção do Diagnóstico e pronto para lançar',
      zh: '透明化、诊断修复与可发布',
      ja: '透明性、診断の修正、ローンチ準備完了',
      ko: '투명성, 진단 수정, 출시 준비 완료',
    },
    points: [
      {
        es: 'Comandos del sistema: lista cada comando pkexec con el comando literal + qué hace + por qué pide root, en 8 idiomas (también en los confirmaciones de Poder y SMART)',
        en: 'System commands: lists every pkexec command with the literal command + what it does + why it needs root, in 8 languages (also in the Power and SMART confirms)',
        fr: 'Commandes système : liste chaque commande pkexec avec la commande littérale + ce qu\'elle fait + pourquoi root, en 8 langues (aussi dans les confirmations Puissance et SMART)',
        it: 'Comandi di sistema: elenca ogni comando pkexec con il comando letterale + cosa fa + perché serve root, in 8 lingue (anche nelle conferme Potenza e SMART)',
        pt: 'Comandos do sistema: lista cada comando pkexec com o comando literal + o que faz + porque pede root, em 8 idiomas (também nas confirmações de Energia e SMART)',
        zh: '系统命令：以 8 种语言列出每条 pkexec 命令的字面命令 + 作用 + 为何需要 root（功率与 SMART 确认中也会显示）',
        ja: 'システムコマンド: すべての pkexec コマンドを、リテラルなコマンド + 何をするか + なぜ root が必要かと共に 8 言語で一覧（電力と SMART の確認にも表示）',
        ko: '시스템 명령: 모든 pkexec 명령을 리터럴 명령 + 동작 + root 필요 이유와 함께 8개 언어로 나열(전력 및 SMART 확인에도 표시)',
      },
      {
        es: 'Diagnóstico ya abre (chocaba un _t global con roadmap.js); hueco abajo-izquierda reequilibrado',
        en: 'Diagnostics now opens (a global _t clashed with roadmap.js); bottom-left dead space rebalanced',
        fr: 'Le Diagnostic s\'ouvre désormais (un _t global entrait en conflit avec roadmap.js) ; espace mort en bas à gauche rééquilibré',
        it: 'La Diagnostica ora si apre (un _t globale era in conflitto con roadmap.js); spazio morto in basso a sinistra riequilibrato',
        pt: 'O Diagnóstico já abre (um _t global colidia com roadmap.js); espaço morto em baixo à esquerda reequilibrado',
        zh: '诊断现在可以打开了（全局 _t 与 roadmap.js 冲突）；左下角空白已重新平衡',
        ja: '診断が開くように（グローバル _t が roadmap.js と衝突していた）；左下の余白を再調整',
        ko: '진단이 이제 열림(전역 _t가 roadmap.js와 충돌했음); 좌하단 빈 공간 재배치',
      },
      {
        es: 'Listo para lanzar: AppImage (instala sin terminal), CI con validación i18n, guía de traducción y docs al día',
        en: 'Launch-ready: AppImage (no-terminal install), CI with i18n validation, translation guide and up-to-date docs',
        fr: 'Prêt à lancer : AppImage (install sans terminal), CI avec validation i18n, guide de traduction et docs à jour',
        it: 'Pronto al lancio: AppImage (installazione senza terminale), CI con validazione i18n, guida alla traduzione e docs aggiornati',
        pt: 'Pronto para lançar: AppImage (instala sem terminal), CI com validação i18n, guia de tradução e docs em dia',
        zh: '可发布：AppImage（免终端安装）、含 i18n 校验的 CI、翻译指南与最新文档',
        ja: 'ローンチ準備完了: AppImage（ターミナル不要インストール）、i18n 検証付き CI、翻訳ガイド、最新ドキュメント',
        ko: '출시 준비 완료: AppImage(터미널 없이 설치), i18n 검증 CI, 번역 가이드, 최신 문서',
      },
    ],
  },
];

// Pendientes (por hacer) — roadmap COMPETITIVO en 4 fases orientadas al
// seguimiento de lanzamiento: seguimiento → P1 DIFERENCIADORES → P2 ALCANCE → P3 ECOSISTEMA.
// Posicionamiento: "Armoury Crate para Linux — seguro, bonito, todo-en-uno,
// sin telemetría". Todos los campos de texto son mapas {es,en,…} (8 idiomas).
const ROADMAP_TODO = [
  {
    phase: {
      es: 'Seguimiento de lanzamiento',
      en: 'Launch follow-up',
      fr: 'Suivi de lancement',
      it: 'Follow-up del lancio',
      pt: 'Acompanhamento do lançamento',
      zh: '发布后跟进',
      ja: 'ローンチ後フォローアップ',
      ko: '출시 후 후속',
    },
    note: {
      es: 'Pendientes de validación real antes de cerrar el ciclo de lanzamiento.',
      en: 'Items still needing real validation before the release cycle is closed.',
      fr: 'Éléments nécessitant encore une validation réelle avant de clore le cycle de lancement.',
      it: 'Elementi che richiedono ancora una validazione reale prima di chiudere il ciclo di lancio.',
      pt: 'Itens que ainda precisam de validação real antes de fechar o ciclo de lançamento.',
      zh: '在关闭发布周期前仍需真实验证的项目。',
      ja: 'ローンチサイクルを閉じる前に実地検証が必要な項目。',
      ko: '출시 사이클을 닫기 전에 실제 검증이 필요한 항목.',
    },
    items: [
      {
        title: {
          es: 'Casi listo (v20) — solo falta esto para lanzar',
          en: 'Almost there (v20) — only these remain to launch',
          fr: 'Presque prêt (v20) — il ne reste que ça pour lancer',
          it: 'Quasi pronto (v20) — manca solo questo per il lancio',
          pt: 'Quase lá (v20) — só falta isto para lançar',
          zh: '即将就绪（v20）— 发布前只剩这些',
          ja: 'あと少し（v20）— ローンチに残るのはこれだけ',
          ko: '거의 완료(v20) — 출시까지 이것만 남음',
        },
        points: [
          {
            es: 'Hecho en v20: AppImage (instala sin terminal), CI con validación i18n, docs (LICENSE/CONTRIBUTING/SECURITY/TRANSLATING) y transparencia total de comandos',
            en: 'Done in v20: AppImage (no-terminal install), CI with i18n validation, docs (LICENSE/CONTRIBUTING/SECURITY/TRANSLATING) and full command transparency',
            fr: 'Fait en v20 : AppImage (install sans terminal), CI avec validation i18n, docs (LICENSE/CONTRIBUTING/SECURITY/TRANSLATING) et transparence totale des commandes',
            it: 'Fatto in v20: AppImage (installazione senza terminale), CI con validazione i18n, docs (LICENSE/CONTRIBUTING/SECURITY/TRANSLATING) e trasparenza totale dei comandi',
            pt: 'Feito na v20: AppImage (instala sem terminal), CI com validação i18n, docs (LICENSE/CONTRIBUTING/SECURITY/TRANSLATING) e transparência total dos comandos',
            zh: 'v20 已完成：AppImage（免终端安装）、含 i18n 校验的 CI、文档（LICENSE/CONTRIBUTING/SECURITY/TRANSLATING）以及命令全透明',
            ja: 'v20 で完了: AppImage（ターミナル不要インストール）、i18n 検証付き CI、ドキュメント（LICENSE/CONTRIBUTING/SECURITY/TRANSLATING）、コマンドの完全な透明性',
            ko: 'v20 완료: AppImage(터미널 없이 설치), i18n 검증 포함 CI, 문서(LICENSE/CONTRIBUTING/SECURITY/TRANSLATING), 명령 완전 투명성',
          },
          {
            es: 'Falta capturas + GIF/vídeo corto para el README (requiere la GUI)',
            en: 'Remaining: screenshots + a short GIF/video for the README (needs the GUI)',
            fr: 'Reste : captures + court GIF/vidéo pour le README (nécessite la GUI)',
            it: 'Manca: screenshot + breve GIF/video per il README (richiede la GUI)',
            pt: 'Falta: capturas + GIF/vídeo curto para o README (requer a GUI)',
            zh: '待办：README 的截图 + 短 GIF/视频（需要 GUI）',
            ja: '残り: README 用のスクショ + 短い GIF/動画（GUI が必要）',
            ko: '남음: README용 스크린샷 + 짧은 GIF/영상 (GUI 필요)',
          },
          {
            es: 'Flatpak (siguiente paso tras el AppImage) y GitHub Pages simple; el helper único polkit pasa a P1',
            en: 'Flatpak (next step after AppImage) and a simple GitHub Pages; the single polkit helper moves to P1',
            fr: 'Flatpak (étape suivante après l\'AppImage) et un GitHub Pages simple ; le helper polkit unique passe en P1',
            it: 'Flatpak (passo successivo dopo l\'AppImage) e un GitHub Pages semplice; l\'helper polkit unico passa a P1',
            pt: 'Flatpak (próximo passo após o AppImage) e um GitHub Pages simples; o helper único polkit vai para P1',
            zh: 'Flatpak（AppImage 之后的下一步）与简单的 GitHub Pages；单一 polkit 助手移至 P1',
            ja: 'Flatpak（AppImage の次の一歩）とシンプルな GitHub Pages；単一 polkit ヘルパーは P1 へ',
            ko: 'Flatpak(AppImage 다음 단계)와 간단한 GitHub Pages; 단일 polkit 헬퍼는 P1로 이동',
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
          es: 'Overlay personalizable',
          en: 'Customizable overlay',
          fr: 'Overlay personnalisable',
          it: 'Overlay personalizzabile',
          pt: 'Overlay personalizável',
          zh: '可自定义叠加层',
          ja: 'カスタマイズ可能なオーバーレイ',
          ko: '맞춤형 오버레이',
        },
        points: [
          {
            es: 'Muchos temas/skins de overlay, posición libre y elegir el monitor (en 2 pantallas, ponerlo en la otra)',
            en: 'Many overlay themes/skins, free placement and per-monitor choice (on dual screens, park it on the other)',
            fr: 'Nombreux thèmes/skins d\'overlay, placement libre et choix du moniteur (sur deux écrans, le mettre sur l\'autre)',
            it: 'Tanti temi/skin per l\'overlay, posizione libera e scelta del monitor (con due schermi, mettilo sull\'altro)',
            pt: 'Muitos temas/skins de overlay, posição livre e escolha do monitor (em 2 telas, colocá-lo na outra)',
            zh: '多种叠加层主题/皮肤、自由摆放并可选显示器（双屏时放到另一块屏）',
            ja: '多数のオーバーレイのテーマ/スキン、自由配置とモニター選択（2画面ならもう一方へ）',
            ko: '다양한 오버레이 테마/스킨, 자유 배치 및 모니터 선택(듀얼 화면이면 다른 화면에 배치)',
          },
          {
            es: 'Elegir qué mostrar: FPS, CPU, GPU, ventiladores, RAM, VRAM, discos, batería',
            en: 'Pick what to show: FPS, CPU, GPU, fans, RAM, VRAM, disks, battery',
            fr: 'Choisir quoi afficher : FPS, CPU, GPU, ventilateurs, RAM, VRAM, disques, batterie',
            it: 'Scegliere cosa mostrare: FPS, CPU, GPU, ventole, RAM, VRAM, dischi, batteria',
            pt: 'Escolher o que mostrar: FPS, CPU, GPU, ventoinhas, RAM, VRAM, discos, bateria',
            zh: '自选显示内容：FPS、CPU、GPU、风扇、RAM、VRAM、磁盘、电池',
            ja: '表示項目を選択：FPS、CPU、GPU、ファン、RAM、VRAM、ディスク、バッテリー',
            ko: '표시 항목 선택: FPS, CPU, GPU, 팬, RAM, VRAM, 디스크, 배터리',
          },
          {
            es: 'Ligero de verdad: sin coste medible de FPS; minimalista para 1 monitor, completo para 2',
            en: 'Truly lightweight: no measurable FPS cost; minimal for one monitor, full for two',
            fr: 'Vraiment léger : aucun coût FPS mesurable ; minimal pour un écran, complet pour deux',
            it: 'Davvero leggero: nessun costo FPS misurabile; minimale con un monitor, completo con due',
            pt: 'Realmente leve: sem custo de FPS mensurável; mínimo para um monitor, completo para dois',
            zh: '真正轻量：无可测量的 FPS 损耗；单屏极简，双屏完整',
            ja: '本当に軽量：測定可能な FPS コストなし；1画面はミニマル、2画面はフル',
            ko: '진짜 가벼움: 측정 가능한 FPS 비용 없음; 단일 모니터는 미니멀, 듀얼은 풀',
          },
        ],
      },
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
          es: 'Gestor de drivers',
          en: 'Driver manager',
          fr: 'Gestionnaire de pilotes',
          it: 'Gestore driver',
          pt: 'Gestor de drivers',
          zh: '驱动管理器',
          ja: 'ドライバーマネージャー',
          ko: '드라이버 관리자',
        },
        points: [
          {
            es: 'Ver qué drivers hay (GPU/Wi-Fi/chipset) y sus versiones, marcar los desactualizados y ofrecer actualización segura (NVIDIA/Mesa/firmware) vía el gestor de paquetes — inventario de solo lectura primero, con ruta de recuperación',
            en: 'See installed drivers (GPU/Wi-Fi/chipset) and versions, flag outdated ones and offer safe updates (NVIDIA/Mesa/firmware) via the package manager — read-only inventory first, with a recovery path',
            fr: 'Voir les pilotes installés (GPU/Wi-Fi/chipset) et leurs versions, signaler les obsolètes et proposer des mises à jour sûres (NVIDIA/Mesa/firmware) via le gestionnaire de paquets — inventaire en lecture seule d\'abord, avec voie de récupération',
            it: 'Vedere i driver installati (GPU/Wi-Fi/chipset) e le versioni, segnalare quelli obsoleti e offrire aggiornamenti sicuri (NVIDIA/Mesa/firmware) tramite il gestore pacchetti — prima inventario in sola lettura, con percorso di recupero',
            pt: 'Ver os drivers instalados (GPU/Wi-Fi/chipset) e versões, assinalar os desatualizados e oferecer atualizações seguras (NVIDIA/Mesa/firmware) via gestor de pacotes — inventário só-leitura primeiro, com via de recuperação',
            zh: '查看已安装的驱动（GPU/Wi-Fi/芯片组）及版本，标记过时项并通过包管理器提供安全更新（NVIDIA/Mesa/固件）——先只读清单，带恢复路径',
            ja: 'インストール済みドライバー（GPU/Wi-Fi/チップセット）とバージョンを表示し、古いものを警告、パッケージマネージャー経由で安全に更新（NVIDIA/Mesa/ファームウェア）— まず読み取り専用の一覧、復旧手段付き',
            ko: '설치된 드라이버(GPU/Wi-Fi/칩셋)와 버전 확인, 오래된 항목 표시, 패키지 관리자를 통한 안전한 업데이트(NVIDIA/Mesa/펌웨어) 제공 — 먼저 읽기 전용 목록, 복구 경로 포함',
          },
        ],
      },
      {
        title: {
          es: 'Diseño inteligente que aprovecha el espacio',
          en: 'Smarter, space-aware layout',
          fr: 'Disposition intelligente qui exploite l\'espace',
          it: 'Layout intelligente che sfrutta lo spazio',
          pt: 'Layout inteligente que aproveita o espaço',
          zh: '善用空间的智能布局',
          ja: 'スペースを活かすスマートなレイアウト',
          ko: '공간을 활용하는 스마트 레이아웃',
        },
        points: [
          {
            es: 'Rellenar automáticamente los huecos (p. ej. el espacio que deja Iluminación cuando es corto), tarjetas más densas en ventanas pequeñas y un orden por defecto limpio sin grandes zonas vacías',
            en: 'Auto-fill empty areas (e.g. the gap the Lighting block leaves when short), denser cards on small windows and a clean default arrangement with no large dead space',
            fr: 'Remplir automatiquement les zones vides (p. ex. l\'espace laissé par Éclairage quand il est court), des cartes plus denses sur petites fenêtres et un agencement par défaut net sans grandes zones mortes',
            it: 'Riempire automaticamente le aree vuote (es. lo spazio lasciato da Illuminazione quando è corto), schede più dense su finestre piccole e una disposizione predefinita pulita senza grandi spazi morti',
            pt: 'Preencher automaticamente as áreas vazias (ex. o espaço que a Iluminação deixa quando é curta), cartões mais densos em janelas pequenas e um arranjo padrão limpo sem grandes zonas mortas',
            zh: '自动填充空白区域（例如灯效块较短时留下的空隙），小窗口下更紧凑的卡片，以及没有大片空白的整洁默认布局',
            ja: '空き領域を自動で埋める（例: ライティングが短いときの隙間）、小さいウィンドウでは密なカード、大きな余白のない整然とした既定配置',
            ko: '빈 영역 자동 채우기(예: 조명 블록이 짧을 때 생기는 공백), 작은 창에서 더 조밀한 카드, 큰 빈 공간 없는 깔끔한 기본 배치',
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
      {
        title: {
          es: 'App de Windows',
          en: 'Windows app',
          fr: 'Application Windows',
          it: 'App per Windows',
          pt: 'App para Windows',
          zh: 'Windows 应用',
          ja: 'Windows アプリ',
          ko: 'Windows 앱',
        },
        points: [
          {
            es: 'Versión para Windows que controle el mismo equipo (poder/ventiladores/RGB/overlay) donde las apps del fabricante son pesadas o intrusivas — reutilizando el núcleo Python y la UI de escritorio, con un ayudante privilegiado nativo en vez de pkexec. Linux sigue siendo el foco; es a largo plazo',
            en: 'A Windows build to control the same machine (power/fans/RGB/overlay) where vendor apps are heavy or intrusive — reusing the Python core and the desktop UI, with a native privileged helper instead of pkexec. Linux stays the focus; long-term',
            fr: 'Une version Windows pour contrôler la même machine (alimentation/ventilateurs/RGB/overlay) là où les apps du fabricant sont lourdes ou intrusives — en réutilisant le cœur Python et l\'UI de bureau, avec un assistant privilégié natif au lieu de pkexec. Linux reste la priorité ; à long terme',
            it: 'Una build Windows per controllare la stessa macchina (alimentazione/ventole/RGB/overlay) dove le app del produttore sono pesanti o invadenti — riutilizzando il core Python e la UI desktop, con un helper privilegiato nativo invece di pkexec. Linux resta il focus; a lungo termine',
            pt: 'Uma versão Windows para controlar a mesma máquina (energia/ventoinhas/RGB/overlay) onde as apps do fabricante são pesadas ou intrusivas — reutilizando o núcleo Python e a UI de desktop, com um ajudante privilegiado nativo em vez de pkexec. Linux continua o foco; a longo prazo',
            zh: '面向 Windows 的版本，在厂商应用笨重或侵入时控制同一台设备（电源/风扇/RGB/叠加层）——复用 Python 核心与桌面 UI，用原生特权助手替代 pkexec。仍以 Linux 为重点；属长期目标',
            ja: 'メーカー製アプリが重い・侵襲的な場合に同じ PC を制御する Windows 版（電力/ファン/RGB/オーバーレイ）。Python コアとデスクトップ UI を再利用し、pkexec の代わりにネイティブの特権ヘルパーを使用。Linux が引き続き主軸で、長期的な方向性',
            ko: '제조사 앱이 무겁거나 침습적인 경우 동일한 PC를 제어하는 Windows 빌드(전원/팬/RGB/오버레이) — Python 코어와 데스크톱 UI를 재사용하고 pkexec 대신 네이티브 권한 도우미 사용. Linux가 계속 핵심이며 장기 방향',
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
