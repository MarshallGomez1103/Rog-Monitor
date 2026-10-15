// S07 N-C-03: abre #roadmap-btn en es y en, verifica textos v22 / PARCIAL / FUTURO y captura el modal.
// Uso: ROG_APP_ROOT=<raiz> node <cdp.mjs> <este archivo>
import { writeFileSync } from 'node:fs';
const OUT = new URL('.', import.meta.url).pathname;
export default async ({ ev, shot, sleep }) => {
  const res = {};
  const expected = {
    es: { v22: /Ventiladores reactivos en los 3 perfiles/, parcial: /Estado: PARCIAL/, futuro: /Estado: FUTURO — decisión del propietario/, titulo: /gráficas editables/ },
    en: { v22: /Reactive fans in all 3 profiles/, parcial: /Status: PARTIAL/, futuro: /Status: FUTURE — owner/, titulo: /editable charts/ },
  };
  for (const lang of ['es', 'en']) {
    await ev(`window.i18n.set('${lang}')`); await sleep(700);
    await ev(`document.getElementById('roadmap-btn').click()`); await sleep(1200);
    const visible = await ev(`!document.getElementById('roadmap-modal').classList.contains('hidden')`);
    const txt = await ev(`document.getElementById('roadmap-modal').textContent`);
    const pill = await ev(`document.querySelector('.roadmap-status-pill').textContent`);
    const ex = expected[lang];
    res[lang] = {
      modalVisible: visible, pill,
      v22: ex.v22.test(txt), titulo: ex.titulo.test(txt), parcial: ex.parcial.test(txt), futuro: ex.futuro.test(txt),
      guardian20EnHecho: await ev(`[...document.querySelectorAll('#roadmap-done-list li')].some(li=>/Guardi[aáã]n 2\\.0|Guardian 2\\.0/.test(li.textContent))`),
      bateriaPendiente: await ev(`[...document.querySelectorAll('#roadmap-todo-list .roadmap-item-title')].some(t=>/Bater|Batter/.test(t.textContent))`),
    };
    // Expandir la entrada v22 y capturar el modal
    await ev(`(()=>{const it=[...document.querySelectorAll('#roadmap-done-list .roadmap-item')].pop(); it.querySelector('.roadmap-item-head').click(); it.scrollIntoView({block:'start'});})()`); await sleep(500);
    const rect = await ev(`(()=>{const r=document.querySelector('#roadmap-modal .modal-card').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
    await shot(`${OUT}roadmap-${lang}-v22.png`, rect);
    // Expandir Guardian 2.0 / helper / overlay (POR HACER) y capturar
    await ev(`(()=>{const items=[...document.querySelectorAll('#roadmap-todo-list .roadmap-item')]; const pick=items.filter(i=>/Guardi[aáã]n 2\\.0|Guardian 2\\.0|Helper privilegiado|Single privileged|Overlay personalizable|Customizable overlay/.test(i.querySelector('.roadmap-item-title').textContent)); pick.forEach(i=>i.querySelector('.roadmap-item-head').click()); pick[0].scrollIntoView({block:'start'});})()`); await sleep(500);
    await shot(`${OUT}roadmap-${lang}-todo.png`, rect);
    await ev(`document.getElementById('roadmap-close').click()`); await sleep(300);
    res[lang].cerrado = await ev(`document.getElementById('roadmap-modal').classList.contains('hidden')`);
  }
  writeFileSync(`${OUT}check-roadmap-s07.json`, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
};
