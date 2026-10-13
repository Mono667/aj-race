const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const S = () => page.evaluate(() => RACE.state());
  const W = (ms) => page.waitForTimeout(ms);
  let fails = 0;
  const ok = (name, cond) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const st = await S(); if (fn(st)) return st; await W(250); } return S(); };
  await page.addInitScript(() => { window.__noAdapt = true; });
  await page.goto('http://localhost:' + (process.env.PORT || 8766) + '/index.html?seed=' + (process.env.SEED || '4242'));
  await W(2500);
  const vp = page.viewportSize();
  const fits = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); const r = [...e.querySelectorAll('*')].reduce((m, c) => Math.max(m, c.getBoundingClientRect().bottom), 0); return { bottom: Math.round(r), h: innerHeight }; }, sel);
  let f = await fits('#start-screen'); ok('start screen fits ' + JSON.stringify(f), f.bottom <= f.h);
  const labels = await page.$$eval('.lvl-btn', b => b.map(x => x.textContent));
  ok('level select = WESTFORT / FORT WILLIAM / PORT ARTHUR ' + labels.join(' | '), /WESTFORT/.test(labels[0]) && /FORT WILLIAM/.test(labels[1]) && /PORT ARTHUR/.test(labels[2]));
  await page.tap('.lvl-btn[data-race="2"]'); await W(150);
  ok('blurb updates: ' + await page.textContent('#blurb'), /Cumberland/.test(await page.textContent('#blurb')));
  await page.tap('.lvl-btn[data-race="0"]'); await W(150);
  await page.screenshot({ path: '../shot-start.png' });
  await page.tap('#btn-howto'); await W(300);
  f = await fits('#howto-screen'); ok('how-to fits ' + JSON.stringify(f), f.bottom <= f.h);
  await page.screenshot({ path: '../shot-howto.png' });
  await page.tap('#btn-howto-back'); await W(200);
  // ---- WESTFORT: controls ----
  await page.tap('#btn-start'); await W(300);
  let st = await S(); ok('countdown shown', st.gameState === 'countdown' && await page.isVisible('#countdown'));
  st = await until(s => s.gameState === 'racing', 15000); ok('GO -> racing', st.gameState === 'racing');
  await page.evaluate(() => RACE.freezeGirls(true));
  const cdp = await ctx.newCDPSession(page);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const jx = 140, jy = vp.height - 110;
  const d0 = (await S()).d;
  await T('touchStart', [{ x: jx, y: jy, id: 1 }]);
  for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: jx + i * 7, y: jy, id: 1 }]); await W(40); }
  await W(700);
  const dR = (await S()).d;
  await T('touchEnd', []); await W(200);
  ok(`joystick steers right (${d0} -> ${dR})`, dR > d0 + 0.5);
  const box = async (id) => { const b = await page.$(id).then(e => e.boundingBox()); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const bb = await box('#btn-run'); const stam0 = (await S()).stam;
  await T('touchStart', [{ x: bb.x, y: bb.y, id: 3 }]); await W(1500); const sb = await S(); await T('touchEnd', []);
  ok(`BOOST drains stamina (${stam0} -> ${sb.stam}) speeds up (${sb.v})`, sb.stam < stam0 && sb.v > 9);
  await page.tap('#btn-jump'); const sj = await until(s => s.y > 0.3, 3000); ok('JUMP lifts AJ y=' + sj.y, sj.y > 0.3);
  await W(800);
  await page.tap('#btn-hit'); { let sl = false; for (let i = 0; i < 20 && !sl; i++) { sl = await page.evaluate(() => AJ.slide > 0); await W(50); } ok('SLIDE triggers', sl); }
  // power-ups
  await page.evaluate(() => RACE.power('scooter')); await W(600);
  st = await S(); ok('SCOOTER power-up active + HUD', st.pu === 'scooter' && await page.isVisible('#pu-box') && await page.evaluate(() => scooterMesh.visible));
  await page.screenshot({ path: '../shot-scooter.png' });
  await page.evaluate(() => RACE.power('shoes')); await W(300);
  await page.tap('#btn-jump'); const sh = await until(s => s.y > 2.3, 3000);
  ok('FANCY SHOES: gold shoes + higher jump y=' + sh.y, sh.pu === 'shoes' && sh.y > 2.3 && await page.evaluate(() => shoeMeshes[0].visible));
  const c0 = (await S()).stam;
  await page.evaluate(() => { AJ.stam = 20; RACE.power('can'); }); ok('energy drink refills boost', (await S()).stam >= 60);
  // tag -> heart, then invulnerability
  await W(1200);
  st = await S();
  await page.evaluate((s) => { AJ.invuln = 0; RACE.girlTo(0, s.s, s.d); RACE.freezeGirls(false); }, st);
  await W(400);
  await page.evaluate(() => RACE.freezeGirls(true));
  st = await S(); ok('girl tag adds heart ' + st.hearts + '/' + st.maxHearts, st.hearts === 1 && await page.evaluate(() => AJ.invuln > 0));
  await page.evaluate((s) => { RACE.girlTo(1, s.s, s.d); RACE.freezeGirls(false); }, st); await W(300); await page.evaluate(() => RACE.freezeGirls(true));
  ok('invulnerable right after a tag', (await S()).hearts === 1);
  // race screenshot: girls right behind AJ
  await page.evaluate(() => { const s = AJ.s; racers.forEach((r, i) => { r.s = s - 2.5 - (i % 3) * 1.5; r.d = (i % 3 - 1) * 2 + (i > 2 ? 0.8 : 0); }); say(racers[1], 'chase', true); AJ.invuln = 3; });
  await W(500);
  await page.screenshot({ path: '../shot-race.png' });
  // ---- panty toss: a HIT (AJ pukes, slows, no heart) ----
  const TS = () => page.evaluate(() => ({ ...window.__throwStats }));
  await W(2600);
  let h0 = (await S()).hearts, ts0 = await TS(), ts1;
  await page.evaluate(() => { AJ.invuln = 0; AJ.vd = 0; AJ.boostT = 0; boosting = false; AJ.pu = null; setPowerVisual(null); racers.forEach((r, i) => { r.s = AJ.s - 30 - i; }); RACE.girlTo(0, AJ.s - 6, AJ.d); RACE.throwAt(0, { count: 1, golden: false }); });
  ok('telegraph "!" over thrower', await page.evaluate(() => racers[0].bang && racers[0].bang.visible));
  for (let i = 0; i < 40; i++) { if (await page.evaluate(() => projectiles.length > 0)) break; await W(60); }
  await W(150);
  await page.screenshot({ path: '../shot-throw.png' });
  ts1 = ts0; for (let i = 0; i < 60; i++) { ts1 = await TS(); if (ts1.hits + ts1.dodges > ts0.hits + ts0.dodges) break; await W(100); }
  const blehOk = await page.evaluate(() => (__throwStats.bleh || 0) > 0 && /BLEH/.test($('bleh').textContent));
  await W(100);
  await page.screenshot({ path: '../shot-puke.png' });
  st = await S();
  ok(`throw HIT -> puke + slow, no heart lost (hits ${ts1.hits}, hearts ${h0}->${st.hearts})`, ts1.hits === ts0.hits + 1 && st.hearts === h0 && await page.evaluate(() => AJ.gag > 0));
  ok('BLEH! popup + puke', blehOk);
  const pd = (await page.evaluate(() => RACE.puddles()))[0];
  ok('puke puddle left on track', !!pd);
  if (pd) { await page.evaluate((pd) => { RACE.girlTo(1, pd.s, pd.d); }, pd); await W(400); }
  ok('girl slips in puddle', (await page.evaluate(() => RACE.slipState(1))).slipT > 0 && (await TS()).slips >= 1);
  await page.screenshot({ path: '../shot-slip.png' });
  // ---- a DODGE by steering away with the joystick ----
  await W(2600);
  ts0 = await TS();
  await page.evaluate(() => { AJ.invuln = 0; AJ.d = -3; AJ.vd = 0; RACE.girlTo(0, AJ.s - 6, -3); RACE.throwAt(0, { count: 1, golden: false }); });
  for (let i = 0; i < 40; i++) { if ((await TS()).thrown > ts0.thrown) break; await W(50); }
  await T('touchStart', [{ x: jx, y: jy, id: 1 }]);
  for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: jx + i * 12, y: jy, id: 1 }]); await W(30); }
  for (let i = 0; i < 60; i++) { ts1 = await TS(); if (ts1.hits + ts1.dodges > ts0.hits + ts0.dodges) break; await W(100); }
  await T('touchEnd', []);
  ok(`steer-DODGE (dodges ${ts0.dodges}->${ts1.dodges}, hits ${ts0.hits}->${ts1.hits})`, ts1.dodges === ts0.dodges + 1 && ts1.hits === ts0.hits);
  // GOLDEN pair -> GOLDEN BOOST worn as a sparkly hat, removed when it ends
  await W(400); ts0 = await TS();
  await page.evaluate(() => { AJ.invuln = 0; AJ.gag = 0; AJ.d = 0; AJ.vd = 0; RACE.girlTo(0, AJ.s - 6, 0); RACE.throwAt(0, { count: 1, golden: true }); });
  for (let i = 0; i < 60; i++) { ts1 = await TS(); if (ts1.hits + ts1.dodges + (ts1.golden || 0) > ts0.hits + ts0.dodges + (ts0.golden || 0)) break; await W(100); }
  let g = await page.evaluate(() => RACE.gold());
  ok(`GOLDEN pair -> boost + gold hat (t ${g.t.toFixed(1)}), no puke`, g.t > 0 && g.hat && ts1.hits === ts0.hits);
  await page.evaluate(() => { racers.forEach(r => r.s = AJ.s - 40); }); await W(300);
  await page.screenshot({ path: '../shot-golden.png' });
  await page.evaluate(() => { AJ.goldT = 0.05; }); await W(500);
  ok('gold hat removed when boost ends', !(await page.evaluate(() => RACE.gold())).hat);
  // ---- SPECIAL: near-miss fills meter; CRAIG + BINO take one for the team ----
  await page.evaluate(() => { RACE.special(0); AJ.invuln = 0; racers.forEach(r => r.s = AJ.s - 40); RACE.girlTo(2, AJ.s - 0.3, AJ.d + 1.5); });
  await W(300);
  await page.evaluate(() => { RACE.girlTo(2, AJ.s - 8, AJ.d + 1.5); });
  await W(400);
  ok('near miss fills SPECIAL (' + (await page.evaluate(() => RACE.special().meter)) + ')', (await page.evaluate(() => RACE.special().meter)) > 0);
  await page.evaluate(() => RACE.special(100)); await W(300);
  ok('SPECIAL button lit when full', await page.evaluate(() => $('btn-special').classList.contains('ready')));
  const spb = await box('#btn-special');
  await T('touchStart', [{ x: spb.x, y: spb.y, id: 5 }]); await W(80); await T('touchEnd', []);
  await W(900);
  let spc = await page.evaluate(() => RACE.special());
  ok('SPECIAL activates, CRAIG + BINO arrive', spc.active && spc.visible.every(Boolean));
  ok('buddies shout TAKING ONE FOR THE TEAM!', await page.evaluate(() => buddies.every(b => b.bubble && +b.bubble.style.opacity > 0 && /TAKING ONE FOR THE TEAM/.test(b.bubble.textContent))));
  let hb = (await S()).hearts, tk0 = await page.evaluate(() => window.__tackles || 0);
  await page.evaluate(() => { RACE.freezeGirls(false); AJ.invuln = 0; RACE.girlTo(3, AJ.s - 2, AJ.d); RACE.girlTo(4, AJ.s - 7, AJ.d); RACE.throwAt(4, { count: 1, golden: false }); });
  await W(300);
  await page.screenshot({ path: '../shot-special.png' });
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => (__throwStats.blocked || 0) > 0)) break; await W(100); }
  await page.evaluate(() => RACE.freezeGirls(true));
  ok('buddy tackles chasing girl, no heart lost', (await page.evaluate(() => window.__tackles || 0)) > tk0 && (await S()).hearts === hb);
  ok('buddy absorbs a throw', await page.evaluate(() => (__throwStats.blocked || 0) > 0));
  for (let i = 0; i < 60; i++) { spc = await page.evaluate(() => RACE.special()); if (!spc.active && !spc.leaving) break; await W(150); }
  ok('buddies run off after ~4s', !spc.active && spc.visible.every(v => !v));
  // ---- SCORE + coin-flip penalty on a catch ----
  { const ticks = () => page.evaluate(() => (window.__scoreLog || []).filter(e => e[0] === 1).length); const t0 = await ticks(); await W(2500);
    ok('score +1/s ticks while running (' + t0 + ' -> ' + await ticks() + ', log ' + JSON.stringify(await page.evaluate(() => (window.__scoreLog||[]).slice(-6))) + ')', (await ticks()) > t0);
    ok('score in HUD', /\d/.test(await page.textContent('#score')));
    const sc1 = await page.evaluate(() => RACE.score()), hh = (await S()).hearts;
    await page.evaluate(() => { RACE.freezeGirls(false); AJ.invuln = 0; RACE.girlTo(5, AJ.s, AJ.d); }); await W(300); await page.evaluate(() => RACE.freezeGirls(true));
    await W(1100);
    const pen = await page.evaluate(() => (window.__penalties || []).slice(-1)[0]);
    ok('catch -> coin flip penalty "' + pen + '" -15', (await S()).hearts === hh + 1 && /MET HER PARENTS|RELATIONSHIP STATUS/.test(await page.textContent('#coin-card')) && (await page.evaluate(() => RACE.score())) <= sc1 - 14);
    await page.screenshot({ path: '../shot-coinflip.png' });
    await page.evaluate(() => { AJ.invuln = 3; });
  }
  // escalation banner at 33%
  await page.evaluate(() => { RACE.tp(TR.len * 0.75, 0); });
  for (let i = 0; i < 30 && !(await page.evaluate(() => $('desperate').classList.contains('on'))); i++) await W(100);
  console.log('stage', await page.evaluate(() => RACE.stage()));
  ok('escalation: final stage + DESPERATE banner', (await page.evaluate(() => RACE.stage())) === 2 && await page.evaluate(() => $('desperate').classList.contains('on')));
  await page.evaluate(() => { AJ.invuln = 3; });
  // pause menu
  await page.tap('#btn-pause'); await W(300);
  ok('pause menu open', (await S()).gameState === 'paused' && await page.isVisible('#pause-screen'));
  const ps = (await S()).s; await W(800); ok('paused: frozen', (await S()).s === ps);
  await page.tap('#btn-pause-howto'); await W(200); ok('how-to from pause', await page.isVisible('#howto-screen'));
  await page.tap('#btn-howto-back'); await W(200);
  await page.tap('#btn-resume'); await W(400); ok('resume', (await S()).gameState === 'racing');
  // ---- full race WIN (autopilot steering through the real course) ----
  await page.evaluate(() => RACE.freezeGirls(false));
  await page.tap('#btn-pause'); await W(200);   for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt === 1) { await page.tap('#btn-restart'); } else { await page.waitForSelector('#lose-screen', { state: 'visible', timeout: 20000 }); await page.tap('#btn-retry'); console.log('retrying win attempt', attempt); }
    await W(300);
  await page.evaluate(() => { window.__autopilot = true; window.__log = []; const o = showToast; showToast = (t, c) => { __log.push(Math.round(AJ.s) + ':' + t); o(t, c); }; });
  { const t0 = Date.now(); while (Date.now() - t0 < 400000) { st = await S(); if (process.env.TRACE) console.log(st.gameState, st.s, st.d, st.v, st.hearts, st.girls.join(',')); if (st.gameState === 'won') { await W(700); await page.screenshot({ path: '../shot-finish.png' }); break; } if (st.gameState === 'lost') break; await W(st.len - st.s < 60 ? 150 : 2000); } }
  if (st.gameState !== 'won') console.log(await page.evaluate(() => __log.join(' | ')));
    if (st.gameState === 'won') break;
  }
  ok(`full WESTFORT race WON (${st.gameState}, hearts ${st.hearts}/${st.maxHearts}, place ${st.place})`, st.gameState === 'won');
  await page.waitForSelector('#win-screen', { state: 'visible', timeout: 20000 }).catch(() => {});
  ok('win screen + NEXT RACE + final score/best', await page.isVisible('#win-screen') && await page.isVisible('#btn-next') && /SCORE/.test(await page.textContent('#win-stats')) && /BEST/.test(await page.textContent('#win-stats')) && Object.keys(await page.evaluate(() => RACE.best())).includes('westfort'));
  await page.screenshot({ path: '../shot-win.png' });
  await page.evaluate(() => { window.__autopilot = false; });
  // ---- LOSS: FORT WILLIAM, AJ stands still -> girls steal all hearts -> LOVESTRUCK ----
  await page.tap('#btn-next'); await W(300);
  st = await until(s => s.gameState === 'racing', 15000); ok('NEXT RACE -> FORT WILLIAM', st.level === 1);
  await page.evaluate(() => { window.__freeze = true; window.__noThrows = true; });
  st = await until(s => s.gameState === 'lost', 200000);
  ok(`LOSS: lovestruck (hearts ${st.hearts}/${st.maxHearts})`, st.gameState === 'lost' && st.hearts >= st.maxHearts);
  await W(1900);
  await page.evaluate(() => { document.querySelectorAll('.bubble,#coin-wrap,.spop').forEach(e => e.style.display = 'none'); });
  await page.screenshot({ path: '../shot-hearteyes.png' });
  await W(1200);
  await page.screenshot({ path: '../shot-lovestruck.png' });
  await page.waitForSelector('#lose-screen', { state: 'visible', timeout: 20000 }).catch(() => {});
  ok('LOVESTRUCK screen + score: ' + await page.textContent('#lose-title'), /LOVESTRUCK/.test(await page.textContent('#lose-title')) && /SCORE/.test(await page.textContent('#lose-stats')));
  await page.screenshot({ path: '../shot-lose.png' });
  await page.evaluate(() => { window.__freeze = false; window.__noThrows = false; });
  await page.tap('#btn-retry'); await W(300);
  st = await S(); ok('retry restarts race', st.gameState === 'countdown' && st.hearts === 0 && st.level === 1);
  // ---- CAUGHT: a girl reaches SAFE SPACE first ----
  await until(s => s.gameState === 'racing', 15000);
  await page.evaluate(() => { racers[2].s = TR.len - 1; });
  st = await until(s => s.gameState === 'lost', 20000);
  ok('CAUGHT when a girl reaches SAFE SPACE first', st.gameState === 'lost' && /CAUGHT/.test(await page.textContent('#lose-title')));
  // ---- PORT ARTHUR loads ----
  await page.waitForSelector('#lose-screen', { state: 'visible', timeout: 20000 }).catch(() => {});
  await page.tap('#lose-screen .btn-menu'); await W(300);
  await page.tap('.lvl-btn[data-race="2"]'); await page.tap('#btn-start'); await W(300);
  st = await until(s => s.gameState === 'racing', 15000); ok('PORT ARTHUR race starts (' + st.names.join(' > ') + ')', st.level === 2);
  await page.evaluate(() => { RACE.freezeGirls(true); RACE.tp(TR.segStart[4] + 40, -1); AJ.invuln = 99; });
  await W(1500); await page.screenshot({ path: '../shot-portarthur.png' });
  await page.evaluate(() => { RACE.tp(TR.segStart[2] + 30, 0); });
  await W(1500); await page.screenshot({ path: '../shot-bayst.png' });
  ok('zero console errors ' + JSON.stringify(errors.slice(0, 5)), errors.length === 0);
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
})();
