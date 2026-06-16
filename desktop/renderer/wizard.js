/* ROG Monitor — wizard.js (v10)
   Wizard de primera vez (y repetible). Se ejecuta en el renderer, después de
   app.js pero en su propio ámbito — nunca toca app.js ni update().

   v10: añade PASO 0 "Elige tu idioma" antes de los 5 pasos originales.
   Total: 6 pasos. El paso 0 llama a window.i18n.set() y re-renderiza el wizard
   al instante en el idioma elegido.

   Gate: localStorage.getItem('wizardDone') — si existe, no abre solo.
   Replay: botón #wizard-btn en .controls (siempre visible, pequeño).

   window.rog.onStats() se usa solo para leer el número de ventiladores
   detectados en el paso 2 (antes paso 1); no modifica nada del flujo principal.
*/

(function () {
  'use strict';

  /* ---- idiomas disponibles con nombres nativos ---- */
  const LANG_OPTIONS = [
    { code: 'es', label: 'Español',    flag: '🇪🇸' },
    { code: 'en', label: 'English',    flag: '🇬🇧' },
    { code: 'fr', label: 'Français',   flag: '🇫🇷' },
    { code: 'it', label: 'Italiano',   flag: '🇮🇹' },
    { code: 'pt', label: 'Português',  flag: '🇵🇹' },
    { code: 'zh', label: '中文',       flag: '🇨🇳' },
    { code: 'ja', label: '日本語',     flag: '🇯🇵' },
    { code: 'ko', label: '한국어',     flag: '🇰🇷' },
  ];

  /* ---- constantes de pasos ---- */
  // PASO 0: idioma (nuevo en v10)
  // PASOS 1-5: bienvenida, ventiladores, permisos, benchmark, tour
  const STEPS = [
    'idioma',
    'bienvenida',
    'ventiladores',
    'permisos',
    'benchmark',
    'tour',
  ];
  const TOTAL = STEPS.length; // 6

  /* ---- referencias DOM ---- */
  const modal   = document.getElementById('wizard-modal');
  const body    = document.querySelector('.wizard-body');
  const pips    = document.querySelectorAll('.wizard-step-pip');
  const counter = document.querySelector('.wizard-step-count');
  const btnPrev = document.getElementById('wiz-prev');
  const btnNext = document.getElementById('wiz-next');
  const btnSkip = document.getElementById('wiz-skip');
  const btnReplay = document.getElementById('wizard-btn');

  let current = 0;
  // Los ventiladores detectados se cargan del primer stats que llega
  let detectedFans = [];

  /* ---- helper t() con fallback si i18n no cargó ---- */
  function t(key, vars) {
    try { return window.t ? window.t(key, vars) : key; } catch (_) { return key; }
  }

  /* ---- contenido de cada paso ---- */
  function stepHtml(idx) {
    switch (idx) {

      /* ---- PASO 0 (NUEVO): Elige tu idioma ---- */
      case 0: {
        const activeLang = (window.i18n && window.i18n.get) ? window.i18n.get() : 'es';
        return `
          <h3>${t('wizard.step0_title')}</h3>
          <p>${t('wizard.step0_sub')}</p>
          <div class="wizard-lang-grid">
            ${LANG_OPTIONS.map((l) => `
              <button class="wiz-lang-btn${l.code === activeLang ? ' active' : ''}"
                      data-lang="${l.code}"
                      type="button">
                <span class="wiz-lang-flag">${l.flag}</span>
                <span class="wiz-lang-name">${l.label}</span>
              </button>
            `).join('')}
          </div>`;
      }

      /* ---- PASO 1: Bienvenida ---- */
      case 1:
        return `
          <h3>Bienvenido a ROG Monitor</h3>
          <p>Esta app te da control completo sobre tu laptop: sensores de temperatura,
          ventiladores, iluminación, benchmarks, procesos y más — todo en un panel,
          sin tener que abrir terminales.</p>
          <ul>
            <li><span class="wiz-bullet">01</span><span>Datos en tiempo real de CPU, GPU, RAM y discos — actualizados cada segundo.</span></li>
            <li><span class="wiz-bullet">02</span><span>Curvas y topes de ventiladores editables sin tocar el sistema manualmente.</span></li>
            <li><span class="wiz-bullet">03</span><span>Iluminación Aura integrada con modo música en vivo.</span></li>
            <li><span class="wiz-bullet">04</span><span>Benchmarks térmicos locales para medir el rendimiento real de tu equipo.</span></li>
          </ul>
          <p>Este asistente te guía en 6 pasos rápidos. Puedes saltarlo o repetirlo
          desde el botón <strong>${t('topbar.wizard')}</strong> en la barra superior.</p>`;

      /* ---- PASO 2: Ventiladores detectados ---- */
      case 2: {
        const fanCount = detectedFans.length;
        const fanList  = fanCount > 0
          ? detectedFans.map((f) =>
              `<li><span class="wiz-bullet">${f.label.replace('_fan','').toUpperCase().slice(0,3)}</span>` +
              `<span><strong>${f.label.replace('_fan','').toUpperCase()}</strong> — ${f.rpm > 0 ? f.rpm + ' RPM ahora' : 'parado o en reposo'}</span></li>`
            ).join('')
          : '<li><span class="wiz-bullet">?</span><span>Aún sin datos — conectando con los sensores…</span></li>';
        return `
          <h3>Ventiladores detectados</h3>
          <div class="wizard-live-info" id="wiz-fan-live">
            ${fanCount > 0
              ? `${fanCount} ventilador${fanCount > 1 ? 'es' : ''} encontrado${fanCount > 1 ? 's' : ''}`
              : 'Leyendo sensores…'}
          </div>
          <ul>${fanList}</ul>
          <p>El bloque <strong>03 Ventiladores</strong> (izquierda) muestra las RPM en tiempo real y un ícono giratorio.
          <strong>Haz clic en ese bloque</strong> para abrir el editor de curvas, ajustar el tope de RPM o calibrar.</p>
          <div class="wizard-info-block">
            <div class="wib-title">Tip: calibrar</div>
            <div class="wib-desc">La primera vez que abras el editor de ventiladores, usa el botón
            <strong>CALIBRAR</strong> para que la app mida los RPM reales de cada ventilador en 7 velocidades.
            Sin esa tabla el tope de RPM es un estimado (puede quedar 200-400 RPM arriba).</div>
          </div>`;
      }

      /* ---- PASO 3: Permisos y calibración ---- */
      case 3:
        return `
          <h3>Permisos de administrador</h3>
          <p>Algunas acciones requieren privilegios de sistema (escribir curvas al hardware,
          calibrar ventiladores, cambiar perfil de energía). ROG Monitor usa
          <strong>pkexec</strong> — te pide la contraseña con una ventana segura del
          sistema, igual que cuando instalas una app.</p>
          <div class="wizard-perm-note">
            <strong>Sin contraseña hardcodeada:</strong> la app nunca guarda tu clave.
            Solo la pide en el momento de la acción y de forma visible para ti.
          </div>
          <p>Para configurar los ventiladores haz clic en el bloque <strong>03 Ventiladores</strong>
          y luego pulsa <strong>CALIBRAR (1-3 min)</strong>. Pedirá la contraseña una sola vez
          para instalar el script del sistema.</p>
          <ul>
            <li><span class="wiz-bullet">1</span><span>Abre el bloque Ventiladores (clic en él).</span></li>
            <li><span class="wiz-bullet">2</span><span>Pulsa CALIBRAR — los ventiladores pasarán por 7 velocidades; va a sonar fuerte.</span></li>
            <li><span class="wiz-bullet">3</span><span>Al terminar, ajusta el tope de RPM y pulsa GUARDAR Y APLICAR.</span></li>
          </ul>`;

      /* ---- PASO 4: Benchmarks ---- */
      case 4:
        return `
          <h3>Benchmarks térmicos</h3>
          <p>El bloque <strong>06 Benchmarks</strong> (columna derecha) lanza cargas sintéticas
          para medir el rendimiento real de tu CPU y GPU bajo estrés.</p>
          <ul>
            <li><span class="wiz-bullet">CPU</span><span>Carga todos los núcleos 45 segundos — mide temperatura máxima, watts y eventos de throttling.</span></li>
            <li><span class="wiz-bullet">GPU</span><span>Lanza varias instancias de vkcube o glmark2 — mide temperatura, watts y uso.</span></li>
          </ul>
          <div class="wizard-info-block">
            <div class="wib-title">Cuándo correr el benchmark</div>
            <div class="wib-desc">
              Después de calibrar los ventiladores, corre el benchmark CPU para verificar que el
              tope de RPM se respeta. El resumen dice <strong>respetado ✓</strong> o
              <strong>EXCEDIDO ✗</strong> claramente.
            </div>
          </div>
          <p>Úsalo con el cargador conectado y el equipo en una superficie ventilada.
          Puedes exportar los resultados en JSON desde el modal de Benchmarks.</p>`;

      /* ---- PASO 5: Tour de bloques ---- */
      case 5:
        return `
          <h3>Tour rápido — qué hace cada bloque</h3>
          <div class="wizard-info-block">
            <div class="wib-title">01 CPU · 02 GPU</div>
            <div class="wib-desc">Temperatura en tiempo real, watts, frecuencia, uso de VRAM. Pasa el cursor por las gráficas (05 Historial) para ver valores punto a punto.</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">03 Ventiladores</div>
            <div class="wib-desc">RPM en vivo con ícono giratorio. Haz clic para editar curvas y topes.</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">04 Iluminación (Aura)</div>
            <div class="wib-desc">Efectos y colores del teclado RGB. Modo música: el brillo sigue el audio del sistema en vivo.</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">07 Sistema · 09 Procesos</div>
            <div class="wib-desc">RAM, discos y red. Los top-5 procesos por CPU; clic en uno para cerrarlo.</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">${t('topbar.theme')} · ${t('topbar.alerts')} · ${t('topbar.overlay')}</div>
            <div class="wib-desc">12 paletas de color + modo claro/oscuro. Umbrales de temperatura personalizables. Overlay flotante de stats para usar encima del juego.</div>
          </div>`;

      default:
        return '';
    }
  }

  /* ---- actualiza la UI al cambiar de paso ---- */
  function render() {
    // Re-generar contenido del paso (puede tener datos dinámicos)
    const steps = body.querySelectorAll('.wizard-step');
    steps.forEach((s, i) => {
      s.innerHTML = stepHtml(i);
      s.classList.toggle('active', i === current);
    });

    // Listener para los botones de idioma del paso 0
    if (current === 0) {
      body.querySelectorAll('.wiz-lang-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const code = btn.dataset.lang;
          if (window.i18n && window.i18n.set) {
            window.i18n.set(code);
          }
          // Re-renderizar el paso 0 con el idioma elegido ya marcado
          render();
        });
      });
    }

    // Pips de progreso
    pips.forEach((pip, i) => {
      pip.classList.toggle('done',   i < current);
      pip.classList.toggle('active', i === current);
    });

    // Contador
    if (counter) counter.textContent = `${current + 1} / ${TOTAL}`;

    // Botones nav: aplicar traducciones
    if (btnPrev) {
      btnPrev.style.display = current === 0 ? 'none' : '';
      btnPrev.textContent = t('wizard.prev');
    }
    if (btnNext) {
      btnNext.textContent = current === TOTAL - 1 ? t('wizard.finish') : t('wizard.next');
      btnNext.classList.toggle('primary', current === TOTAL - 1);
    }
    if (btnSkip) btnSkip.textContent = t('wizard.skip');
  }

  /* ---- escucha los primeros stats para rellenar ventiladores ---- */
  function subscribeStats() {
    if (!window.rog || !window.rog.onStats) return;
    window.rog.onStats((stats) => {
      const fans = stats.fans || [];
      if (fans.length > 0 && detectedFans.length === 0) {
        detectedFans = fans;
        // Si el wizard está en el paso de ventiladores (índice 2), re-renderizar
        if (current === 2) render();
      }
    });
  }

  /* ---- abrir / cerrar ---- */
  function open(step) {
    current = typeof step === 'number' ? step : 0;
    modal.classList.remove('hidden');
    render();
  }

  function close() {
    modal.classList.add('hidden');
  }

  function finish() {
    try { localStorage.setItem('wizardDone', '1'); } catch (_) {}
    close();
  }

  /* ---- navegación ---- */
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (current < TOTAL - 1) {
        current++;
        render();
      } else {
        finish();
      }
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (current > 0) { current--; render(); }
    });
  }

  if (btnSkip) {
    btnSkip.addEventListener('click', finish);
  }

  // Cerrar al clic fuera de la tarjeta
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) finish();
    });
  }

  // Botón de replay (siempre disponible)
  if (btnReplay) {
    btnReplay.addEventListener('click', () => open(0));
  }

  // Re-renderizar cuando cambie el idioma (actualiza textos de nav y contenido del paso 0)
  if (window.i18n && window.i18n.onChange) {
    window.i18n.onChange(() => {
      if (!modal.classList.contains('hidden')) render();
    });
  }

  /* ---- lanzar en primera vez ---- */
  subscribeStats();

  if (!localStorage.getItem('wizardDone')) {
    // Pequeño retardo para que app.js termine de pintar antes de mostrar el wizard
    setTimeout(() => open(0), 600);
  }

}());
