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

  /* ---- idiomas disponibles: usa LANG_META de i18n.js (sin emoji/banderas).
         Fallback local por si i18n.js aún no cargó (orden de carga). ---- */
  const LANG_OPTIONS = (window.i18n && window.i18n.LANG_META) || [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'zh', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
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
        const activeLang = (window.i18n && window.i18n.get) ? window.i18n.get() : 'en';
        return `
          <h3>${t('wizard.step0_title')}</h3>
          <p>${t('wizard.step0_sub')}</p>
          <div class="wizard-lang-grid">
            ${LANG_OPTIONS.map((l) => `
              <button class="wiz-lang-btn${l.code === activeLang ? ' active' : ''}"
                      data-lang="${l.code}"
                      type="button">
                <span class="wiz-lang-name">${l.native || l.label}</span>
              </button>
            `).join('')}
          </div>`;
      }

      /* ---- PASO 1: Bienvenida ---- */
      case 1:
        return `
          <h3>${t('wizard.step1_title')}</h3>
          <p>${t('wizard.step1_intro')}</p>
          <ul>
            <li><span class="wiz-bullet">01</span><span>${t('wizard.step1_b1')}</span></li>
            <li><span class="wiz-bullet">02</span><span>${t('wizard.step1_b2')}</span></li>
            <li><span class="wiz-bullet">03</span><span>${t('wizard.step1_b3')}</span></li>
            <li><span class="wiz-bullet">04</span><span>${t('wizard.step1_b4')}</span></li>
          </ul>
          <p>${t('wizard.step1_footer', { btn: `<strong>${t('topbar.wizard')}</strong>` })}</p>`;

      /* ---- PASO 2: Ventiladores detectados ---- */
      case 2: {
        const fanCount = detectedFans.length;
        const fanList  = fanCount > 0
          ? detectedFans.map((f) =>
              `<li><span class="wiz-bullet">${f.label.replace('_fan','').toUpperCase().slice(0,3)}</span>` +
              `<span><strong>${f.label.replace('_fan','').toUpperCase()}</strong> — ${f.rpm > 0 ? t('wizard.step2_rpm_now', { rpm: f.rpm }) : t('wizard.step2_stopped')}</span></li>`
            ).join('')
          : `<li><span class="wiz-bullet">?</span><span>${t('wizard.step2_none')}</span></li>`;
        return `
          <h3>${t('wizard.step2_title')}</h3>
          <div class="wizard-live-info" id="wiz-fan-live">
            ${fanCount > 0
              ? t('wizard.step2_found', { n: fanCount })
              : t('wizard.step2_loading')}
          </div>
          <ul>${fanList}</ul>
          <p>${t('wizard.step2_body', { block: `<strong>${t('wizard.step2_block')}</strong>` })}</p>
          <div class="wizard-info-block">
            <div class="wib-title">${t('wizard.step2_tip_title')}</div>
            <div class="wib-desc">${t('wizard.step2_tip_body', { btn: `<strong>${t('wizard.calibrate_btn')}</strong>` })}</div>
          </div>`;
      }

      /* ---- PASO 3: Permisos y calibración ---- */
      case 3:
        return `
          <h3>${t('wizard.step3_title')}</h3>
          <p>${t('wizard.step3_body1', { pk: '<strong>pkexec</strong>' })}</p>
          <div class="wizard-perm-note">
            <strong>${t('wizard.step3_note')}</strong>
          </div>
          <p>${t('wizard.step3_body2', { block: `<strong>${t('wizard.step2_block')}</strong>`, btn: `<strong>${t('wizard.step3_calib_label')}</strong>` })}</p>
          <ul>
            <li><span class="wiz-bullet">1</span><span>${t('wizard.step3_li1')}</span></li>
            <li><span class="wiz-bullet">2</span><span>${t('wizard.step3_li2')}</span></li>
            <li><span class="wiz-bullet">3</span><span>${t('wizard.step3_li3')}</span></li>
          </ul>`;

      /* ---- PASO 4: Benchmarks ---- */
      case 4:
        return `
          <h3>${t('wizard.step4_title')}</h3>
          <p>${t('wizard.step4_body1', { block: `<strong>${t('wizard.step4_block')}</strong>` })}</p>
          <ul>
            <li><span class="wiz-bullet">CPU</span><span>${t('wizard.step4_cpu_desc')}</span></li>
            <li><span class="wiz-bullet">GPU</span><span>${t('wizard.step4_gpu_desc')}</span></li>
          </ul>
          <div class="wizard-info-block">
            <div class="wib-title">${t('wizard.step4_tip_title')}</div>
            <div class="wib-desc">
              ${t('wizard.step4_tip_body', { ok: `<strong>${t('wizard.step4_ok')}</strong>`, bad: `<strong>${t('wizard.step4_bad')}</strong>` })}
            </div>
          </div>
          <p>${t('wizard.step4_footer')}</p>`;

      /* ---- PASO 5: Tour de bloques ---- */
      case 5:
        return `
          <h3>${t('wizard.step5_title')}</h3>
          <div class="wizard-info-block">
            <div class="wib-title">${t('wizard.step5_t1')}</div>
            <div class="wib-desc">${t('wizard.step5_d1')}</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">${t('wizard.step5_t2')}</div>
            <div class="wib-desc">${t('wizard.step5_d2')}</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">${t('wizard.step5_t3')}</div>
            <div class="wib-desc">${t('wizard.step5_d3')}</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">${t('wizard.step5_t4')}</div>
            <div class="wib-desc">${t('wizard.step5_d4')}</div>
          </div>
          <div class="wizard-info-block">
            <div class="wib-title">${t('topbar.theme')} · ${t('topbar.alerts')} · ${t('topbar.overlay')}</div>
            <div class="wib-desc">${t('wizard.step5_d5')}</div>
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
