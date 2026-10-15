import { mkdirSync } from 'node:fs';
export default async ({ ev, shot, sleep }) => {
  const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
  await ev(`(()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.appendChild(s)})()`);
  await sleep(2500);
  const rect = async (sel) => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const hb = await rect('#history-block');
  console.log('history-block', JSON.stringify(hb));
  await shot(OUT + '/history.png', hb);
  await ev(`document.getElementById('hist-mode')?.click()`); await sleep(1200);
  await shot(OUT + '/history-usage.png', await rect('#history-block'));
  await ev(`document.getElementById('fans-block').click()`); await sleep(2500);
  const open = await ev(`!document.getElementById('fan-modal').classList.contains('hidden')`);
  console.log('fan-modal open', open);
  if (open) {
    const mr = await rect('#fan-modal > div');
    console.log('fan-modal', JSON.stringify(mr));
    await shot(OUT + '/fan-modal.png', mr);
    console.log('fan-curves-svgs', await ev(`document.querySelectorAll('#fan-curves svg').length`));
  }
};
