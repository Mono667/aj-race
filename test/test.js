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
  ok('win screen + NEXT RACE', await page.isVisible('#win-screen') && await page.isVisible('#btn-next'));
  await page.screenshot({ path: '../shot-win.png' });
  await page.evaluate(() => { window.__autopilot = false; });
  // ---- LOSS: FORT WILLIAM, AJ stands still -> girls steal all hearts -> LOVESTRUCK ----
  await page.tap('#btn-next'); await W(300);
  st = await until(s => s.gameState === 'racing', 15000); ok('NEXT RACE -> FORT WILLIAM', st.level === 1);
  await page.evaluate(() => { window.__freeze = true; });
  st = await until(s => s.gameState === 'lost', 200000);
  ok(`LOSS: lovestruck (hearts ${st.hearts}/${st.maxHearts})`, st.gameState === 'lost' && st.hearts >= st.maxHearts);
  await W(1500);
  await page.screenshot({ path: '../shot-lovestruck.png' });
  await page.waitForSelector('#lose-screen', { state: 'visible', timeout: 20000 }).catch(() => {});
  ok('LOVESTRUCK screen: ' + await page.textContent('#lose-title'), /LOVESTRUCK/.test(await page.textContent('#lose-title')));
  await page.screenshot({ path: '../shot-lose.png' });
  await page.evaluate(() => { window.__freeze = false; });
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
