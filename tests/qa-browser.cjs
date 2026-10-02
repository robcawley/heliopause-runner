const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/pwt/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.HOME+'/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--enable-unsafe-webgpu','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(process.env.QA_URL || 'http://localhost:5173');await page.waitForSelector('body.ready');
  await page.evaluate(()=>__game.engine.renderer.setAnimationLoop(null));
  await page.click('#launch');await page.click('[data-go="chart"]');
  for(const width of [1440,1180,390]) {
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
    const bad=await page.evaluate(async()=>{
      const {renderChart}=await import('/src/tycoon/board-chart.js');const {TOWNS}=await import('/src/tycoon/career.js');const c=__career();const h={esc:String,cr:n=>n.toLocaleString('en-GB'),art:'',top:()=>'',back:''};const bad=[];
      for(const town of Object.keys(TOWNS).filter(t=>TOWNS[t].needs?.town!==null)) {
        const copy={...c,town,offers:Object.keys(TOWNS).filter(t=>t!==town).map(to=>({to,cargo:'Reactor coolant',pay:10800,tons:6,job:'Coolant'}))};document.querySelector('#board').innerHTML=renderChart(copy,h);
        const a=[...document.querySelectorAll('.chart-name,.chart-pay,.chart-note')].map(e=>({text:e.textContent,r:e.getBoundingClientRect()}));
        for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const x=a[i].r,y=a[j].r;if(x.left<y.right&&y.left<x.right&&x.top<y.bottom&&y.top<x.bottom)bad.push([town,a[i].text,a[j].text])}
      }return bad;
    });assert.deepEqual(bad,[],`chart overlaps at ${width}`);
  }
  await page.reload();await page.waitForSelector('body.ready');await page.evaluate(()=>__game.engine.renderer.setAnimationLoop(null));await page.click('#launch');await page.click('[data-go="chart"]');
  await page.locator('.chart-town[data-t="1"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.chart-town[data-t="1"]').getAttribute('aria-pressed'),'true');assert(await page.locator('.chart-town[data-t="1"]').evaluate(e=>e===document.activeElement));
  const result=await page.evaluate(async()=>{
    const {newCareer,loadCareer,applyLoadout,tripOf}=await import('/src/tycoon/career.js');const {hire}=await import('/src/tycoon/crew.js');
    const old=newCareer();delete old.loyalty;delete old.fallen;old.crew=['teo'];localStorage.setItem('heliopause-career-v1',JSON.stringify(old));const loaded=loadCareer();if(tripOf(loaded.offers[0],loaded).wing[0].loyalty!==55)throw Error('old loyalty');
    const c=__career();c.credits=100000;c.owned.quarters=true;c.owned.pip=true;for(const id of ['teo','sparks','krug','tanaka'])hire(c,id);applyLoadout(__game.run.config,c);
    const {run,engine}=__game;run.config.lane.coreRepair=0;run.config.lane.gateRepair=0;run.start(tripOf(c.offers[0],c));engine.renderer.render=()=>{};
    const d=run.debug();d.g.mode='flying';d.g.hull=50;d.g.sinceHit=0;d.g.phaseTime=100;d.ship.pos.set(0,0,-1800);
    for(let i=0;i<80;i++)run.frame(0.05,i*.05);const before=d.g.hull;
    for(let i=80;i<340;i++)run.frame(0.05,i*.05);const repaired=d.g.pipPatch;
    d.g.hull=40;for(let i=340;i<440;i++)run.frame(0.05,i*.05);const capped=d.g.hull;
    Object.defineProperty(d.dz,'rulesOff',{get:()=>true});Object.defineProperty(d.dz,'phase',{get:()=> 'fight'});
    const w=d.wing.members[0];w.hull=1;const p=d.dz.fire.fire('lance',w.pos,w.vel.clone().set(0,0,0),null);p.prev.copy(w.pos);d.wing.update(0,0,true);
    const gone=!c.crew.includes(w.id)&&c.fallen.includes(w.id);
    run.restart(tripOf(c.offers[0],c));const retry=run.debug().wing.members.map(w=>w.id);
    return {before,repaired,capped,gone,retry,backend:engine.backend};
  });assert.equal(result.before,50);assert.equal(result.repaired,30);assert.equal(result.capped,40);assert(result.gone);assert(!result.retry.includes('teo'));assert.equal(result.backend,'WebGPU');
  // Native WebAudio endings must release effect graphs too, not just the test clock.
  const audio=await page.evaluate(async()=>{
    const {createWingVoice}=await import('/src/modes/belt-run/wingVoice.js');const {createSfx}=await import('/src/modes/belt-run/sfx.js');const {makeConfig}=await import('/src/modes/belt-run/config.js');
    const ctx=new AudioContext();await ctx.resume();const a={ctx,sfx:ctx.createGain(),noise:ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate)};a.sfx.connect(ctx.destination);
    const voice=createWingVoice(a),sfx=createSfx(a,makeConfig());sfx.start();for(let i=0;i<40;i++)voice.pew(0,1);voice.talk({pitch:150,formant:1},'On your wing.');voice.boom(0,1);sfx.update(70,0);sfx.update(70,0.8);
    await new Promise(r=>setTimeout(r,3500));const active=[voice.activeCount,sfx.activeCount];voice.reset();sfx.dispose();await ctx.close();return active;
  });assert.deepEqual(audio,[0,0]);assert.deepEqual(errors,[]);console.log('WebGPU: chart at 1440/1180/390, keyboard focus, old saves, PIP 4 s/30 hull, permanent loss/retry and native audio cleanup passed.',result);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
