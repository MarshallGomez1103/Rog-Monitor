/* ROG Monitor — Grid de núcleos (v13).
 * Botón "NÚCLEOS" (dentro del bloque de Procesos) -> modal con una rejilla de
 * todos los hilos de la CPU: uso%, frecuencia (GHz inline) y temperatura por
 * núcleo. Distingue núcleos de Rendimiento (P, estética deportiva) de los de
 * Eficiencia (E, estética ecológica) cuando el hardware lo permite; si la CPU
 * es homogénea degrada a un estilo neutro.
 *
 * Clic en un núcleo -> modal de detalle: procesos que corren en ese núcleo,
 * uso%, frecuencia y temperatura. Se refresca cada segundo SIN toast (ambos
 * modales se redibujan desde el mismo stream window.rog.onStats).
 *
 * Autocontenido: crea su DOM en runtime (no toca index.html). Lee
 * stats.cpu.core_grid y stats.procs[].last_cpu del stream existente. Solo
 * redibuja cuando hay un modal abierto, para no gastar CPU de fondo. */
(function () {
  'use strict';

  const t = (k, fb, vars) => {
    if (window.t) {
      const out = window.t(k, vars);
      return out && out !== k ? out : (fb || k);
    }
    return fb || k;
  };

  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      es: {
        'cores.btn': 'NÚCLEOS',
        'cores.title': 'Núcleos de la CPU',
        'cores.subtitle': '{model} · {threads} hilos ({phys} núcleos) · uso {use}% · máx {max}°C',
        'cores.ptype': 'Núcleo de rendimiento (P)',
        'cores.etype': 'Núcleo de eficiencia (E)',
        'cores.type': 'Núcleo',
        'cores.legend': 'Color = temperatura · barra = uso · P = núcleo de rendimiento (para tareas pesadas) · E = núcleo de eficiencia (para tareas ligeras, gasta menos) · clic en un núcleo para ver su detalle.',
        'cores.legend.flat': 'Color = temperatura · barra = uso · clic en un núcleo para ver su detalle.',
        'cores.note': 'Es normal que unos núcleos estén más calientes o más usados que otros: el sistema reparte el trabajo según convenga y mueve la carga entre núcleos. No es una falla.',
        'cores.refresh': 'Actualizar cada:',
        'cores.none': 'Sin datos de núcleos todavía…',
        'cores.ghz': 'GHz',
        'cores.usage': 'uso',
        'cores.hint': 'Clic para ver detalle',
        // --- modal de detalle ---
        'cores.detail.title': 'Núcleo {cpu}',
        'cores.detail.ptype': 'Rendimiento (P)',
        'cores.detail.etype': 'Eficiencia (E)',
        'cores.detail.usage': 'Uso',
        'cores.detail.freq': 'Frecuencia',
        'cores.detail.temp': 'Temperatura',
        'cores.detail.procs': 'Procesos en este núcleo',
        'cores.detail.procs.none': 'Sin procesos activos detectados en este núcleo ahora mismo.',
        'cores.detail.live': 'En vivo · actualiza cada segundo',
        'cores.detail.col.proc': 'Proceso',
        'cores.detail.col.cpu': '% CPU',
        'common.close': 'Cerrar',
      },
      en: {
        'cores.btn': 'CORES',
        'cores.title': 'CPU cores',
        'cores.subtitle': '{model} · {threads} threads ({phys} cores) · {use}% used · max {max}°C',
        'cores.ptype': 'Performance core (P)',
        'cores.etype': 'Efficiency core (E)',
        'cores.type': 'Core',
        'cores.legend': 'Color = temperature · bar = usage · P = performance core (for heavy tasks) · E = efficiency core (for light tasks, lower power) · click a core for details.',
        'cores.legend.flat': 'Color = temperature · bar = usage · click a core for details.',
        'cores.note': 'It is normal for some cores to be hotter or busier than others: the system spreads work as needed and moves load between cores. It is not a fault.',
        'cores.refresh': 'Refresh every:',
        'cores.none': 'No core data yet…',
        'cores.ghz': 'GHz',
        'cores.usage': 'usage',
        'cores.hint': 'Click for details',
        'cores.detail.title': 'Core {cpu}',
        'cores.detail.ptype': 'Performance (P)',
        'cores.detail.etype': 'Efficiency (E)',
        'cores.detail.usage': 'Usage',
        'cores.detail.freq': 'Frequency',
        'cores.detail.temp': 'Temperature',
        'cores.detail.procs': 'Processes on this core',
        'cores.detail.procs.none': 'No active processes detected on this core right now.',
        'cores.detail.live': 'Live · updates every second',
        'cores.detail.col.proc': 'Process',
        'cores.detail.col.cpu': 'CPU %',
        'common.close': 'Close',
      },
      fr: {
        'cores.title': 'Cœurs du CPU',
        'cores.subtitle': '{model} · {threads} threads ({phys} cœurs) · {use}% utilisé · max {max}°C',
        'cores.ptype': 'Cœur performance (P)',
        'cores.etype': 'Cœur efficacité (E)',
        'cores.type': 'Cœur',
        'cores.legend': 'Couleur = température · barre = utilisation · P = cœur performance (tâches lourdes) · E = cœur efficacité (tâches légères, consomme moins) · cliquez sur un cœur pour le détail.',
        'cores.legend.flat': 'Couleur = température · barre = utilisation · cliquez sur un cœur pour le détail.',
        'cores.note': 'Il est normal que certains cœurs soient plus chauds ou plus sollicités que d’autres : le système répartit le travail selon les besoins et déplace la charge d’un cœur à l’autre. Ce n’est pas une panne.',
        'cores.refresh': 'Actualiser toutes les :',
        'cores.none': 'Pas encore de données sur les cœurs…',
        'cores.ghz': 'GHz',
        'cores.usage': 'utilisation',
        'cores.hint': 'Cliquez pour le détail',
        'cores.detail.title': 'Cœur {cpu}',
        'cores.detail.ptype': 'Performance (P)',
        'cores.detail.etype': 'Efficacité (E)',
        'cores.detail.usage': 'Utilisation',
        'cores.detail.freq': 'Fréquence',
        'cores.detail.temp': 'Température',
        'cores.detail.procs': 'Processus sur ce cœur',
        'cores.detail.procs.none': 'Aucun processus actif détecté sur ce cœur pour le moment.',
        'cores.detail.live': 'En direct · mise à jour chaque seconde',
        'cores.detail.col.proc': 'Processus',
        'cores.detail.col.cpu': '% CPU',
      },
      it: {
        'cores.title': 'Core della CPU',
        'cores.subtitle': '{model} · {threads} thread ({phys} core) · {use}% in uso · max {max}°C',
        'cores.ptype': 'Core ad alte prestazioni (P)',
        'cores.etype': 'Core a basso consumo (E)',
        'cores.type': 'Core',
        'cores.legend': 'Colore = temperatura · barra = utilizzo · P = core ad alte prestazioni (per attività pesanti) · E = core a basso consumo (per attività leggere, consuma meno) · clicca su un core per i dettagli.',
        'cores.legend.flat': 'Colore = temperatura · barra = utilizzo · clicca su un core per i dettagli.',
        'cores.note': 'È normale che alcuni core siano più caldi o più usati di altri: il sistema distribuisce il lavoro in base alle necessità e sposta il carico tra i core. Non è un guasto.',
        'cores.refresh': 'Aggiorna ogni:',
        'cores.none': 'Ancora nessun dato sui core…',
        'cores.ghz': 'GHz',
        'cores.usage': 'utilizzo',
        'cores.hint': 'Clicca per i dettagli',
        'cores.detail.title': 'Core {cpu}',
        'cores.detail.ptype': 'Prestazioni (P)',
        'cores.detail.etype': 'Efficienza (E)',
        'cores.detail.usage': 'Utilizzo',
        'cores.detail.freq': 'Frequenza',
        'cores.detail.temp': 'Temperatura',
        'cores.detail.procs': 'Processi su questo core',
        'cores.detail.procs.none': 'Nessun processo attivo rilevato su questo core al momento.',
        'cores.detail.live': 'In tempo reale · si aggiorna ogni secondo',
        'cores.detail.col.proc': 'Processo',
        'cores.detail.col.cpu': '% CPU',
      },
      pt: {
        'cores.title': 'Núcleos da CPU',
        'cores.subtitle': '{model} · {threads} threads ({phys} núcleos) · {use}% em uso · máx {max}°C',
        'cores.ptype': 'Núcleo de desempenho (P)',
        'cores.etype': 'Núcleo de eficiência (E)',
        'cores.type': 'Núcleo',
        'cores.legend': 'Cor = temperatura · barra = utilização · P = núcleo de desempenho (para tarefas pesadas) · E = núcleo de eficiência (para tarefas leves, gasta menos) · clique em um núcleo para ver o detalhe.',
        'cores.legend.flat': 'Cor = temperatura · barra = utilização · clique em um núcleo para ver o detalhe.',
        'cores.note': 'É normal que alguns núcleos estejam mais quentes ou mais usados do que outros: o sistema distribui o trabalho conforme necessário e move a carga entre núcleos. Não é uma falha.',
        'cores.refresh': 'Atualizar a cada:',
        'cores.none': 'Ainda sem dados dos núcleos…',
        'cores.ghz': 'GHz',
        'cores.usage': 'uso',
        'cores.hint': 'Clique para ver o detalhe',
        'cores.detail.title': 'Núcleo {cpu}',
        'cores.detail.ptype': 'Desempenho (P)',
        'cores.detail.etype': 'Eficiência (E)',
        'cores.detail.usage': 'Utilização',
        'cores.detail.freq': 'Frequência',
        'cores.detail.temp': 'Temperatura',
        'cores.detail.procs': 'Processos neste núcleo',
        'cores.detail.procs.none': 'Nenhum processo ativo detectado neste núcleo neste momento.',
        'cores.detail.live': 'Ao vivo · atualiza a cada segundo',
        'cores.detail.col.proc': 'Processo',
        'cores.detail.col.cpu': '% CPU',
      },
      zh: {
        'cores.title': 'CPU 核心',
        'cores.subtitle': '{model} · {threads} 线程（{phys} 核心）· 已用 {use}% · 最高 {max}°C',
        'cores.ptype': '性能核心 (P)',
        'cores.etype': '能效核心 (E)',
        'cores.type': '核心',
        'cores.legend': '颜色 = 温度 · 条形 = 使用率 · P = 性能核心（用于重负载任务）· E = 能效核心（用于轻负载任务，更省电）· 点击核心查看详情。',
        'cores.legend.flat': '颜色 = 温度 · 条形 = 使用率 · 点击核心查看详情。',
        'cores.note': '部分核心比其他核心更热或更忙是正常现象：系统会按需分配任务，并在核心之间迁移负载。这不是故障。',
        'cores.refresh': '刷新间隔：',
        'cores.none': '暂无核心数据…',
        'cores.ghz': 'GHz',
        'cores.usage': '使用率',
        'cores.hint': '点击查看详情',
        'cores.detail.title': '核心 {cpu}',
        'cores.detail.ptype': '性能 (P)',
        'cores.detail.etype': '能效 (E)',
        'cores.detail.usage': '使用率',
        'cores.detail.freq': '频率',
        'cores.detail.temp': '温度',
        'cores.detail.procs': '此核心上的进程',
        'cores.detail.procs.none': '目前未在此核心上检测到活动进程。',
        'cores.detail.live': '实时 · 每秒更新',
        'cores.detail.col.proc': '进程',
        'cores.detail.col.cpu': 'CPU %',
      },
      ja: {
        'cores.title': 'CPUコア',
        'cores.subtitle': '{model} · {threads} スレッド（{phys} コア）· 使用率 {use}% · 最大 {max}°C',
        'cores.ptype': 'パフォーマンスコア (P)',
        'cores.etype': '高効率コア (E)',
        'cores.type': 'コア',
        'cores.legend': '色 = 温度 · バー = 使用率 · P = パフォーマンスコア（重い処理向け）· E = 高効率コア（軽い処理向け、消費電力が少ない）· コアをクリックすると詳細を表示します。',
        'cores.legend.flat': '色 = 温度 · バー = 使用率 · コアをクリックすると詳細を表示します。',
        'cores.note': '一部のコアが他より熱くなったり使用率が高くなったりするのは正常です。システムが必要に応じて処理を割り振り、コア間で負荷を移動させているためで、故障ではありません。',
        'cores.refresh': '更新間隔：',
        'cores.none': 'コアのデータはまだありません…',
        'cores.ghz': 'GHz',
        'cores.usage': '使用率',
        'cores.hint': 'クリックで詳細を表示',
        'cores.detail.title': 'コア {cpu}',
        'cores.detail.ptype': 'パフォーマンス (P)',
        'cores.detail.etype': '高効率 (E)',
        'cores.detail.usage': '使用率',
        'cores.detail.freq': '周波数',
        'cores.detail.temp': '温度',
        'cores.detail.procs': 'このコア上のプロセス',
        'cores.detail.procs.none': '現在、このコアで動作中のプロセスは検出されていません。',
        'cores.detail.live': 'ライブ · 毎秒更新',
        'cores.detail.col.proc': 'プロセス',
        'cores.detail.col.cpu': 'CPU %',
      },
      ko: {
        'cores.title': 'CPU 코어',
        'cores.subtitle': '{model} · 스레드 {threads}개 (코어 {phys}개) · 사용률 {use}% · 최대 {max}°C',
        'cores.ptype': '성능 코어 (P)',
        'cores.etype': '효율 코어 (E)',
        'cores.type': '코어',
        'cores.legend': '색상 = 온도 · 막대 = 사용률 · P = 성능 코어(무거운 작업용) · E = 효율 코어(가벼운 작업용, 전력 소모 적음) · 코어를 클릭하면 상세 정보를 볼 수 있습니다.',
        'cores.legend.flat': '색상 = 온도 · 막대 = 사용률 · 코어를 클릭하면 상세 정보를 볼 수 있습니다.',
        'cores.note': '일부 코어가 다른 코어보다 더 뜨겁거나 더 많이 사용되는 것은 정상입니다. 시스템이 필요에 따라 작업을 분배하고 코어 간에 부하를 이동시키기 때문이며, 고장이 아닙니다.',
        'cores.refresh': '새로고침 주기:',
        'cores.none': '아직 코어 데이터가 없습니다…',
        'cores.ghz': 'GHz',
        'cores.usage': '사용률',
        'cores.hint': '클릭하면 상세 정보 표시',
        'cores.detail.title': '코어 {cpu}',
        'cores.detail.ptype': '성능 (P)',
        'cores.detail.etype': '효율 (E)',
        'cores.detail.usage': '사용률',
        'cores.detail.freq': '주파수',
        'cores.detail.temp': '온도',
        'cores.detail.procs': '이 코어의 프로세스',
        'cores.detail.procs.none': '현재 이 코어에서 실행 중인 프로세스가 감지되지 않았습니다.',
        'cores.detail.live': '실시간 · 1초마다 갱신',
        'cores.detail.col.proc': '프로세스',
        'cores.detail.col.cpu': 'CPU %',
      },
    });
  }

  let modal = null;
  let gridEl = null;
  let subEl = null;
  let legendEl = null;
  let isOpen = false;
  let latest = null;          // stats.cpu del último frame
  let latestProcs = null;     // stats.procs del último frame (top global)
  let latestByCore = null;    // stats.procs_by_core: {cpuLogico: [procs...]}
  // Huella de la última estructura pintada en la rejilla. Si no cambia (mismos
  // cpus + mismo modo hetero), parcheamos las celdas EN SITIO en vez de
  // reconstruir innerHTML cada segundo: así no se pierde el hover/foco ni
  // reaparece el "hint", y gastamos menos CPU.
  let gridKey = '';
  // Refresco LOCAL del modal (no afecta el resto de la app): el stream llega a
  // 1 Hz, pero aquí podemos espaciar el re-render para poder LEER los valores.
  let refreshMs = 1000;
  let lastRenderTs = 0;

  // --- modal de detalle por núcleo ---
  let detail = null;
  let detailOpen = false;
  let detailCpu = null;       // cpu lógico que se está inspeccionando

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function tempClass(temp) {
    if (temp == null) return 'c-na';
    if (temp < 60) return 'c-cold';
    if (temp < 78) return 'c-normal';
    if (temp < 90) return 'c-hot';
    return 'c-crit';
  }

  // core_id que aparece en >=2 hilos => P-core (HyperThreading); 1 hilo => E-core.
  function typeMap(grid) {
    const count = {};
    grid.forEach((c) => { count[c.core_id] = (count[c.core_id] || 0) + 1; });
    return count;
  }

  function isPCore(counts, coreId) {
    return (counts[coreId] || 1) >= 2;
  }

  // Heterogénea = hay P-cores Y E-cores (la CPU distingue tipos). Si todos son
  // iguales, no pintamos badges P/E (degradación elegante).
  function isHetero(grid, counts) {
    let hasP = false;
    let hasE = false;
    grid.forEach((c) => {
      if (isPCore(counts, c.core_id)) hasP = true; else hasE = true;
    });
    return hasP && hasE;
  }

  function ghzText(c) {
    return c.ghz != null ? Number(c.ghz).toFixed(2) : '--';
  }

  function build() {
    if (document.getElementById('cores-modal')) return; // ya construido

    modal = document.createElement('div');
    modal.id = 'cores-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card cores-card">
        <h3 data-i18n="cores.title">${t('cores.title', 'Núcleos de la CPU')}</h3>
        <p class="sub" id="cores-sub"></p>
        <div class="cores-refresh" id="cores-refresh">
          <span class="cores-refresh-label" data-i18n="cores.refresh">${t('cores.refresh', 'Actualizar cada:')}</span>
          <span class="cores-refresh-btns" id="cores-refresh-btns">
            <button class="ghost cores-rb" data-ms="1000">1s</button>
            <button class="ghost cores-rb" data-ms="2000">2s</button>
            <button class="ghost cores-rb" data-ms="3000">3s</button>
            <button class="ghost cores-rb" data-ms="10000">10s</button>
            <button class="ghost cores-rb" data-ms="30000">30s</button>
          </span>
        </div>
        <div class="cores-grid" id="cores-grid"></div>
        <p class="cores-legend" id="cores-legend"></p>
        <p class="cores-note" id="cores-note" data-i18n="cores.note">${t('cores.note', '')}</p>
        <div class="cores-close-row">
          <button class="ghost modal-close" id="cores-close" data-i18n="common.close">${t('common.close', 'Cerrar')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    gridEl = modal.querySelector('#cores-grid');
    subEl = modal.querySelector('#cores-sub');
    legendEl = modal.querySelector('#cores-legend');

    modal.querySelector('#cores-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Selector de refresco (solo afecta a este modal)
    const rbWrap = modal.querySelector('#cores-refresh-btns');
    function markActiveRb() {
      rbWrap.querySelectorAll('.cores-rb').forEach((b) =>
        b.classList.toggle('active', parseInt(b.dataset.ms, 10) === refreshMs));
    }
    rbWrap.addEventListener('click', (e) => {
      const b = e.target.closest('.cores-rb');
      if (!b) return;
      refreshMs = parseInt(b.dataset.ms, 10) || 1000;
      lastRenderTs = 0;        // refrescar ya con el nuevo ritmo
      markActiveRb();
      render();
    });
    markActiveRb();

    // Delegación: clic (o Enter/Espacio con foco) en una celda abre el detalle.
    gridEl.addEventListener('click', (e) => {
      const tile = e.target.closest('.core-tile');
      if (!tile) return;
      const cpu = parseInt(tile.dataset.cpu, 10);
      if (!Number.isNaN(cpu)) openDetail(cpu);
    });
    gridEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const tile = e.target.closest('.core-tile');
      if (!tile) return;
      e.preventDefault();
      const cpu = parseInt(tile.dataset.cpu, 10);
      if (!Number.isNaN(cpu)) openDetail(cpu);
    });

    // --- modal de detalle por núcleo ---
    detail = document.createElement('div');
    detail.id = 'core-detail-modal';
    detail.className = 'modal hidden';
    detail.innerHTML = `
      <div class="modal-card core-detail-card">
        <h3 id="core-detail-title"></h3>
        <p class="sub core-detail-live" id="core-detail-live"></p>
        <div class="core-detail-stats" id="core-detail-stats"></div>
        <h4 class="core-detail-h4" id="core-detail-procs-h" data-i18n="cores.detail.procs">${t('cores.detail.procs', 'Procesos en este núcleo')}</h4>
        <div class="core-detail-procs" id="core-detail-procs"></div>
        <div class="cores-close-row">
          <button class="ghost modal-close" id="core-detail-close" data-i18n="common.close">${t('common.close', 'Cerrar')}</button>
        </div>
      </div>`;
    document.body.appendChild(detail);
    detail.querySelector('#core-detail-close').addEventListener('click', closeDetail);
    detail.addEventListener('click', (e) => { if (e.target === detail) closeDetail(); });
  }

  function openModal() {
    if (!modal) return;
    modal.classList.remove('hidden');
    isOpen = true;
    render();
  }
  function closeModal() {
    if (modal) modal.classList.add('hidden');
    isOpen = false;
    closeDetail();
  }

  function openDetail(cpu) {
    if (!detail) return;
    detailCpu = cpu;
    detail.classList.remove('hidden');
    detailOpen = true;
    renderDetail();
  }
  function closeDetail() {
    if (detail) detail.classList.add('hidden');
    detailOpen = false;
    detailCpu = null;
  }

  function render() {
    if (!isOpen || !gridEl) return;
    const grid = latest && latest.core_grid;
    if (!grid || !grid.length) {
      gridEl.innerHTML = `<p class="sub">${t('cores.none', 'Sin datos de núcleos todavía…')}</p>`;
      gridKey = '';
      if (legendEl) legendEl.textContent = '';
      return;
    }
    const counts = typeMap(grid);
    const hetero = isHetero(grid, counts);
    const temps = grid.map((c) => c.temp).filter((x) => x != null);
    const uses = grid.map((c) => c.usage);
    const maxT = temps.length ? Math.max(...temps) : null;
    const avgU = uses.length ? Math.round(uses.reduce((a, b) => a + b, 0) / uses.length) : 0;
    const phys = Object.keys(counts).length;

    if (subEl) {
      subEl.textContent = t('cores.subtitle', '', {
        model: latest.model || 'CPU',
        threads: grid.length,
        phys: phys,
        use: avgU,
        max: maxT != null ? maxT : '--',
      });
    }
    if (legendEl) {
      legendEl.textContent = hetero
        ? t('cores.legend', '')
        : t('cores.legend.flat', '');
    }

    // ¿Cambió la estructura (cpus o modo hetero)? Solo entonces reconstruimos.
    const key = (hetero ? 'h:' : 'f:') + grid.map((c) => c.cpu).join(',');
    if (key !== gridKey) {
      gridEl.innerHTML = grid.map((c) => {
        const isP = isPCore(counts, c.core_id);
        // Clase de tipo solo si la CPU distingue (degradación elegante).
        const typeClass = hetero ? (isP ? 'core-p' : 'core-e') : 'core-flat';
        const badge = hetero
          ? `<span class="core-badge ${isP ? 'badge-p' : 'badge-e'}" title="${isP ? t('cores.ptype', '') : t('cores.etype', '')}">${isP ? 'P' : 'E'}</span>`
          : '';
        return `
          <div class="core-tile ${typeClass}" data-cpu="${c.cpu}" role="button" tabindex="0">
            ${badge}
            <span class="core-temp"></span>
            <span class="core-num">cpu ${c.cpu}</span>
            <div class="core-bar"><div class="core-bar-fill"></div></div>
            <div class="core-foot">
              <span class="core-usage"></span>
              <span class="core-ghz"><b></b><small>${t('cores.ghz', 'GHz')}</small></span>
            </div>
            <span class="core-hint">${t('cores.hint', 'Clic para ver detalle')}</span>
          </div>`;
      }).join('');
      gridKey = key;
    }

    // Parcheo EN SITIO de los valores dinámicos (no destruye hover/foco).
    const tiles = gridEl.children;
    for (let i = 0; i < grid.length; i++) {
      const c = grid[i];
      const tile = tiles[i];
      if (!tile || tile.dataset.cpu !== String(c.cpu)) { gridKey = ''; return render(); }
      const tc = tempClass(c.temp);
      tile.classList.remove('c-cold', 'c-normal', 'c-hot', 'c-crit', 'c-na');
      tile.classList.add(tc);
      tile.querySelector('.core-temp').textContent = c.temp != null ? c.temp + '°' : '--';
      tile.querySelector('.core-bar-fill').style.width = c.usage + '%';
      tile.querySelector('.core-usage').textContent = c.usage + '%';
      tile.querySelector('.core-ghz b').textContent = ghzText(c);
    }
  }

  function renderDetail() {
    if (!detailOpen || !detail || detailCpu == null) return;
    const grid = (latest && latest.core_grid) || [];
    const c = grid.find((x) => x.cpu === detailCpu);
    const counts = typeMap(grid);
    const hetero = isHetero(grid, counts);
    const isP = c ? isPCore(counts, c.core_id) : false;

    const titleEl = detail.querySelector('#core-detail-title');
    const liveEl = detail.querySelector('#core-detail-live');
    const statsEl = detail.querySelector('#core-detail-stats');
    const procsEl = detail.querySelector('#core-detail-procs');

    const card = detail.querySelector('.core-detail-card');
    if (card) {
      card.classList.remove('core-p', 'core-e', 'core-flat');
      card.classList.add(hetero ? (isP ? 'core-p' : 'core-e') : 'core-flat');
    }

    if (titleEl) {
      const typeTag = hetero
        ? ` · ${isP ? t('cores.detail.ptype', 'Rendimiento (P)') : t('cores.detail.etype', 'Eficiencia (E)')}`
        : '';
      titleEl.textContent = t('cores.detail.title', 'Núcleo {cpu}', { cpu: detailCpu }) + typeTag;
    }
    if (liveEl) liveEl.textContent = t('cores.detail.live', 'En vivo · actualiza cada segundo');

    if (statsEl) {
      const usage = c ? c.usage : null;
      const ghz = c ? ghzText(c) : '--';
      const temp = c && c.temp != null ? c.temp + '°C' : '--';
      const tc = tempClass(c ? c.temp : null);
      statsEl.innerHTML = `
        <div class="cd-stat">
          <span class="cd-k">${t('cores.detail.usage', 'Uso')}</span>
          <span class="cd-v">${usage != null ? usage + '%' : '--'}</span>
          <div class="cd-bar"><div class="cd-bar-fill" style="width:${usage != null ? usage : 0}%"></div></div>
        </div>
        <div class="cd-stat">
          <span class="cd-k">${t('cores.detail.freq', 'Frecuencia')}</span>
          <span class="cd-v">${ghz} <small>${t('cores.ghz', 'GHz')}</small></span>
        </div>
        <div class="cd-stat ${tc}">
          <span class="cd-k">${t('cores.detail.temp', 'Temperatura')}</span>
          <span class="cd-v cd-temp">${temp}</span>
        </div>`;
    }

    if (procsEl) {
      // Preferimos procs_by_core (agrupado en backend sobre TODOS los procesos
      // activos). Si el backend no lo emite (contrato viejo), degradamos a
      // filtrar la lista top global por last_cpu. Las claves JSON son strings.
      let procs = null;
      if (latestByCore) {
        procs = latestByCore[detailCpu] || latestByCore[String(detailCpu)] || [];
      } else {
        procs = (latestProcs || []).filter((p) => p.last_cpu === detailCpu);
      }
      procs = procs.slice().sort((a, b) => (b.cpu || 0) - (a.cpu || 0));
      if (!procs.length) {
        procsEl.innerHTML = `<p class="sub cd-empty">${t('cores.detail.procs.none', 'Sin procesos activos detectados en este núcleo ahora mismo.')}</p>`;
      } else {
        const head = `
          <div class="cd-prow cd-phead">
            <span class="cd-ppid">PID</span>
            <span class="cd-pname">${t('cores.detail.col.proc', 'Proceso')}</span>
            <span class="cd-pcpu">${t('cores.detail.col.cpu', '% CPU')}</span>
          </div>`;
        const rows = procs.map((p) => `
          <div class="cd-prow">
            <span class="cd-ppid">${escapeHtml(p.pid)}</span>
            <span class="cd-pname">${escapeHtml(p.name)}</span>
            <span class="cd-pcpu">${(p.cpu != null ? p.cpu : 0).toFixed(1)}%</span>
          </div>`).join('');
        procsEl.innerHTML = head + rows;
      }
    }
  }

  function onStats(stats) {
    if (stats && stats.cpu && stats.cpu.core_grid) latest = stats.cpu;
    if (stats && stats.procs) latestProcs = stats.procs;
    if (stats && stats.procs_by_core) latestByCore = stats.procs_by_core;
    // Throttle LOCAL: solo redibujar cada refreshMs (1/2/3/10/30 s) para poder leer.
    const now = Date.now();
    if (now - lastRenderTs < refreshMs) return;
    lastRenderTs = now;
    if (isOpen) render();
    if (detailOpen) renderDetail();
  }

  // Re-traducir textos estáticos al cambiar idioma con un modal abierto.
  // Forzamos rebuild de la rejilla (gridKey='') para re-traducir las etiquetas
  // estáticas de cada celda (unidad GHz, hint), no solo los valores dinámicos.
  function onLangChange() {
    gridKey = '';
    if (isOpen) render();
    if (detailOpen) renderDetail();
  }

  function init() {
    build();
    if (window.rog && typeof window.rog.onStats === 'function') {
      window.rog.onStats(onStats);
    }
    if (window.i18n && typeof window.i18n.onChange === 'function') {
      window.i18n.onChange(onLangChange);
    }
    // Escape: cierra primero el detalle, luego la rejilla. Sin tocar app.js.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (detailOpen) { closeDetail(); return; }
      if (isOpen) closeModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.RogCores = { init, open: openModal };
})();
