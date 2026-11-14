const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 100000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await pause(150);
  }
  throw new Error('Timed out: ' + label);
}
async function run({ window, tryout, libraryRoot, testRound, errors }) {
  const out = path.join(libraryRoot, `verification/${tryout.reportScope}/round-${testRound}`);
  fs.mkdirSync(out, { recursive: true });
  const sampleCount = tryout.samples.length,
    reviewCount = tryout.availability.filter(s => s.status === 'review').length;
  const modeIndex = process.argv.indexOf('--test-mode');
  const mode =
    modeIndex >= 0
      ? process.argv[modeIndex + 1]
      : Number(testRound) === 1
        ? 'regression'
        : Number(testRound) === 3
          ? 'interaction'
          : 'portraits';
  assert(['regression', 'portraits', 'interaction'].includes(mode), 'Unknown batch test mode');
  const report = {
    status: 'running',
    round: Number(testRound),
    mode,
    startedAt: new Date().toISOString(),
    steps: [],
    errors
  };
  const write = () => fs.writeFileSync(path.join(out, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n');
  const step = (name, details = {}) => {
    report.steps.push({ name, at: new Date().toISOString(), ...details });
    write();
  };
  const hash = file => (fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null);
  const build = JSON.parse(
    fs.readFileSync(path.join(libraryRoot, `verification/${tryout.reportScope}/build.json`), 'utf8')
  );
  const protectedFiles = build.protectedFiles.map(row => ({
    file: row.file,
    sha256: hash(path.join(libraryRoot, row.file))
  }));
  const local = script => tryout.window.webContents.executeJavaScript(script);
  const remote = script => tryout.model.contents.executeJavaScript(script);
  const gallery = script => window.webContents.executeJavaScript(script);
  const click = id => local(`document.getElementById(${JSON.stringify(id)}).click()`);
  // Long runs share the desktop: if the player was minimized from outside, restore it and note it.
  const restored = [];
  async function ready(id) {
    return until(
      () => {
        if (tryout.model.state.phase === 'error')
          throw new Error(tryout.model.state.error + ': ' + tryout.model.state.message);
        if (tryout.window && (tryout.window.isMinimized() || !tryout.window.isVisible())) {
          restored.push({ id, at: new Date().toISOString() });
          tryout.window.restore();
          tryout.window.show();
        }
        return tryout.model.state.phase === 'ready' && tryout.model.state.sampleId === id;
      },
      'model ready ' + id,
      210000
    );
  } // two 30 s stalls with reloads + 90 s deadline
  async function paint() {
    await local('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    await pause(150);
  }
  async function capture(name) {
    await paint();
    const wc = tryout.model.contents;
    fs.writeFileSync(path.join(out, `${name}-model.png`), (await wc.capturePage()).toPNG());
    fs.writeFileSync(path.join(out, `${name}-shell.png`), (await tryout.window.webContents.capturePage()).toPNG());
    return { model: name + '-model.png', shell: name + '-shell.png', bounds: tryout.model.bounds };
  }
  async function choose(id) {
    await click('choose-skin');
    await until(() => local('document.getElementById("skin-picker").open'), 'picker open', 4000);
    assert.equal(tryout.model.occluded, true);
    await local(
      `(()=>{document.getElementById('skin-search').value='';document.getElementById('skin-year').value='all';document.getElementById('skin-search').dispatchEvent(new Event('input'));document.querySelector('#samples .sample-choice[data-skin-id="${id}"]').click();})()`
    );
    await until(() => local(`document.body.dataset.skinId===${JSON.stringify(id)}`), 'selection applied', 5000);
    await ready(id);
    assert.equal(tryout.model.occluded, false);
  }
  const pointer = async p => {
    const wc = tryout.model.contents;
    tryout.window.focus();
    wc.focus();
    wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    wc.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await pause(120);
    wc.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  };
  async function silent() {
    let since = 0;
    await until(
      () => {
        if (tryout.model.contents.isCurrentlyAudible()) {
          since = 0;
          return false;
        }
        since ||= Date.now();
        return Date.now() - since > 700;
      },
      'previous audio ends',
      50000
    );
  }
  async function touchHead(sample) {
    // Centers of the actual colored head regions, read from round-2 screenshots.
    // Those PNGs are 1332 x 823 pixels for this 1065 x 658 DIP model viewport.
    const points = {
      '818011': [0.582, 0.529],
      '205162': [0.615, 0.345],
      '499053': [0.563, 0.362],
      '307083': [0.659, 0.388],
      '205161': [0.691, 0.516],
      '305103': [0.565, 0.386],
      '403143': [0.545, 0.429],
      '237031': [0.589, 0.382]
    };
    assert(
      Math.abs(tryout.model.bounds.width - 1065) <= 2 && Math.abs(tryout.model.bounds.height - 658) <= 2,
      'Reobserve touch targets when the viewport changes'
    );
    await silent();
    await remote(`document.querySelector('button[aria-label="触摸区域"]:not([aria-pressed="true"])')?.click()`);
    await pause(350);
    const p = (
      tryout.batch >= 2
        ? JSON.parse(
            fs.readFileSync(path.join(libraryRoot, `verification/${tryout.reportScope}/head-points.json`), 'utf8')
          )
        : points
    )[sample.onlineId];
    assert(p, 'No visually verified head target: ' + sample.onlineId);
    const point = { x: Math.round(p[0] * tryout.model.bounds.width), y: Math.round(p[1] * tryout.model.bounds.height) };
    const capabilityFile = path.join(libraryRoot, `verification/${tryout.reportScope}/head-capabilities.json`);
    const capability = fs.existsSync(capabilityFile)
      ? JSON.parse(fs.readFileSync(capabilityFile, 'utf8'))[sample.onlineId]
      : null;
    if (capability?.expectedVoice === false) {
      // The source defines a head motion but no corresponding normal/extra voice line.
      const sourceFile = path.resolve(libraryRoot, `verification/${tryout.reportScope}`, capability.sourceFile);
      assert.equal(hash(sourceFile), capability.sourceSha256);
      const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
      const skin = source.ship.skins.find(s => String(s.id) === sample.onlineId);
      assert(skin.l2dAnimations.includes('touch_head'));
      assert(![...skin.words, ...skin.extraWords].some(w => w.l2dAction === 'touch_head'));
      await remote(
        `(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='动作');if(button?.getAttribute('aria-expanded')!=='true')button?.click();})()`
      );
      const motion = () =>
        remote(
          `(()=>{const list=document.querySelector('.live2d-action-list');return {name:list?.querySelector('.spine-action-item.active .spine-action-name')?.textContent.trim()||'',playing:!!list?.classList.contains('has-animation-progress'),progress:Number(list?.style.getPropertyValue('--spine-animation-progress')||-1)};})()`
        );
      const before = await motion();
      assert.notEqual(before.name, 'touch_head');
      await pointer(point);
      const observed = await until(
        async () => {
          const m = await motion();
          return m.name === 'touch_head' && m.playing && m.progress >= 0 ? m : false;
        },
        'native head animation ' + sample.onlineId,
        10000
      );
      // The 2026-11 site refreshes its progress value less often; allow up to 3 s for it to move.
      const advanced = await until(
        async () => {
          const m = await motion();
          assert.equal(m.name, 'touch_head');
          return m.progress > observed.progress ? m : false;
        },
        'Head animation advances after canvas click',
        3000
      );
      const audible = tryout.model.contents.isCurrentlyAudible();
      assert.equal(audible, false);
      const headCapture = await capture('head-' + sample.onlineId);
      const audioFallback = await action('touch_body');
      assert(audioFallback.dialogue.includes('普通触摸'));
      step('native-head-touch', {
        sampleId: sample.id,
        onlineId: sample.onlineId,
        point,
        expectedVoice: false,
        audible,
        headAnimation: { before, observed, advanced },
        capture: headCapture,
        audioFallback,
        capabilitySource: capability.sourceFile
      });
      return;
    }
    await pointer(point);
    await until(() => tryout.model.contents.isCurrentlyAudible(), 'native head audio ' + sample.onlineId, 15000);
    const dialogue = await until(
      async () => {
        const value = await remote("document.querySelector('.dialogue-toast')?.innerText||''");
        return value.includes('摸头') ? value : false;
      },
      'head-specific dialogue ' + sample.onlineId,
      10000
    );
    step('native-head-touch', {
      sampleId: sample.id,
      onlineId: sample.onlineId,
      point,
      audible: true,
      dialogue,
      capture: await capture('head-' + sample.onlineId)
    });
  }
  async function action(label, { tolerant = false } = {}) {
    const rect = label =>
      remote(
        `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().replace(/^\\d+\\s*/,'')===${JSON.stringify(label)}&&!b.disabled&&b.getBoundingClientRect().height>0);if(!b)return null;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),expanded:b.getAttribute('aria-expanded')}})()`
      );
    // Some models keep playing sound (ambient loops); in the bulk release that is recorded
    // and the greeting is then checked through the started motion and new dialogue.
    let continuousAudio = false;
    try {
      await silent();
    } catch (error) {
      if (!tolerant) throw error;
      continuousAudio = true;
    }
    const header = await until(() => rect('动作'), 'action menu', 7000);
    if (header.expanded !== 'true') {
      await pointer(header);
      await pause(350);
    }
    const before = await remote("document.querySelector('.dialogue-toast')?.innerText||''");
    const point = await until(() => rect(label), 'motion ' + label, 7000);
    await pointer(point);
    if (continuousAudio) {
      const dialogue = await until(
        async () => {
          const text = await remote("document.querySelector('.dialogue-toast')?.innerText||''");
          return text && text !== before ? text : false;
        },
        'new dialogue ' + label,
        30000
      );
      return { label, point, audible: true, continuousAudio: true, dialogue };
    }
    // Voice files download on first use, so allow 30 s. The site's motion item toggles play/pause,
    // so it is pressed only once. In the bulk release a miss is recorded for a separate re-check.
    const audible = () => tryout.model.contents.isCurrentlyAudible();
    try {
      await until(audible, 'audio ' + label, 30000);
    } catch (error) {
      if (!tolerant) throw error;
      const active = await remote(
        "document.querySelector('.spine-action-item.active')?.textContent.trim().replace(/^\\d+\\s*/,'')||''"
      );
      return {
        label,
        point,
        audible: false,
        motionActive: active === label,
        dialogue: await remote("document.querySelector('.dialogue-toast')?.innerText||''")
      };
    }
    const dialogue = await until(
      async () => {
        const text = await remote("document.querySelector('.dialogue-toast')?.innerText||''");
        return text && text !== before ? text : false;
      },
      'new dialogue ' + label,
      8000
    );
    return { label, point, audible: true, dialogue };
  }
  try {
    window.show();
    step('runtime', { libraryRoot, executable: process.execPath, versions: process.versions });
    step('resource-probe', {
      results: await gallery(
        "Promise.all(['l2d://gallery/data/skins-data.js','l2d://gallery/desktop/renderer.js'].map(async url=>{try{const r=await fetch(url);return {url,status:r.status,headers:[...r.headers],text:(await r.text()).slice(0,200)};}catch(e){return {url,error:e.message}}}))"
      )
    });
    await until(() => gallery('document.documentElement.dataset.desktopReady==="true"'), 'gallery', 12000);
    await until(
      () =>
        gallery(
          `document.querySelectorAll('[data-tryout]').length===${sampleCount}&&document.querySelectorAll('[data-model-status]').length===${tryout.availability.length - sampleCount}`
        ),
      'gallery availability badges',
      12000
    );
    const original = await gallery(
      "({cards:document.querySelectorAll('.card').length,originals:document.querySelectorAll('[data-open-artwork]').length,guides:document.querySelectorAll('.badge-guide').length})"
    );
    // The catalog keeps growing through cloud sync; compare with the loaded catalog, not a fixed size.
    const catalogSize = tryout.availability.length,
      guideCount = tryout.availability.filter(s => s.guidePath).length;
    assert.deepEqual(original, { cards: catalogSize, originals: catalogSize, guides: guideCount });
    await gallery(
      "document.getElementById('search').value='午夜频道';document.getElementById('search').dispatchEvent(new Event('input',{bubbles:true}));"
    );
    await until(() => gallery('document.querySelectorAll("[data-tryout]").length===1'), 'filtered entry', 4000);
    await gallery("document.getElementById('clearSearch').click()");
    await until(
      () => gallery(`document.querySelectorAll('[data-tryout]').length===${sampleCount}`),
      'entries after search',
      4000
    );
    step('gallery-regression', original);
    await gallery(`document.querySelector('[data-tryout="${tryout.samples[0].id}"]').click()`);
    await until(() => tryout.window && !tryout.window.isDestroyed(), 'player window', 10000);
    await until(() => local('document.documentElement.dataset.tryoutReady==="true"'), 'player shell', 12000);
    step('player-window', {
      visible: tryout.window.isVisible(),
      focused: tryout.window.isFocused(),
      minimized: tryout.window.isMinimized(),
      bounds: tryout.model.bounds
    });
    await pause(4000);
    step('initial-model-state', {
      nativeVisible: tryout.model.view?.getVisible(),
      occluded: tryout.model.occluded,
      body: await remote('document.body.innerText.slice(0,2200)'),
      viewport: await remote('({width:innerWidth,height:innerHeight,visibility:document.visibilityState})')
    });
    await ready(tryout.samples[0].id);
    await click('choose-skin');
    await until(() => local('document.getElementById("skin-picker").open'), 'skin picker', 5000);
    const counts = await local(
      "({playable:document.querySelectorAll('#samples .sample-choice:not(:disabled)').length,listed:document.querySelectorAll('#samples .sample-choice').length,text:document.getElementById('mapping-summary').textContent})"
    );
    assert.equal(counts.playable, sampleCount);
    assert.equal(counts.listed, tryout.availability.length);
    // Search results must equal exactly the playable skins whose "character name" text contains the query,
    // and always keep the accepted same-character skins apart.
    const matching = query =>
      tryout.samples
        .filter(s => `${s.character} ${s.name}`.toLocaleLowerCase().includes(query))
        .map(s => s.id)
        .sort();
    await local(
      "document.getElementById('skin-search').value='狮';document.getElementById('skin-search').dispatchEvent(new Event('input'));"
    );
    const lionIds = await local(
      "[...document.querySelectorAll('#samples .sample-choice')].map(e=>e.dataset.skinId).sort()"
    );
    assert.deepEqual(lionIds, matching('狮'));
    for (const id of ['azl-24a8b69272bcc3f0', 'azl-789bced6e0969a71']) assert(lionIds.includes(id));
    await local(
      "document.getElementById('skin-search').value='信浓';document.getElementById('skin-search').dispatchEvent(new Event('input'));"
    );
    const shinanoIds = await local(
      "[...document.querySelectorAll('#samples .sample-choice')].map(e=>e.dataset.skinId).sort()"
    );
    assert.deepEqual(shinanoIds, matching('信浓'));
    assert(shinanoIds.includes('azl-7f76cef9141cdab6'));
    if (tryout.batch >= 4) {
      await local(
        "document.getElementById('skin-search').value='腓特烈·卡尔';document.getElementById('skin-search').dispatchEvent(new Event('input'));"
      );
      assert.deepEqual(
        await local("[...document.querySelectorAll('#samples .sample-choice')].map(e=>e.dataset.skinId).sort()"),
        ['azl-604a37a57691b511', 'azl-9b55443b7f67aba2'].sort()
      );
    }
    await local(
      "document.getElementById('skin-search').value='';document.getElementById('skin-search').dispatchEvent(new Event('input'));"
    );
    // Skins that cannot be played yet stay listed, disabled, after the playable ones.
    assert.equal(
      await local("document.querySelectorAll('#samples .sample-choice:disabled').length"),
      tryout.availability.length - sampleCount
    );
    const notOpen = tryout.availability.find(s => s.status !== 'playable')?.id || 'azl-0000000000000000';
    const denied = await local(`window.l2dTryout.select(${JSON.stringify(notOpen)}).then(()=>false,()=>true)`);
    assert.equal(denied, true);
    const year = tryout.samples[0].releaseDate.slice(0, 4);
    await local(
      `document.getElementById('skin-year').value='${year}';document.getElementById('skin-year').dispatchEvent(new Event('change'));`
    );
    assert.equal(
      await local("document.querySelectorAll('#samples .sample-choice').length"),
      tryout.availability.filter(s => s.releaseDate.startsWith(year + '-')).length
    );
    await local(
      "document.getElementById('skin-year').value='all';document.getElementById('skin-year').dispatchEvent(new Event('change'));"
    );
    await paint();
    fs.writeFileSync(path.join(out, 'picker.png'), (await tryout.window.webContents.capturePage()).toPNG());
    await click('close-picker');
    await until(() => !tryout.model.occluded, 'picker restored model', 3000);
    step('search-filter-and-review-guard', counts);
    const deep = mode === 'regression';
    const regressionAnchors = [
      'azl-e6548902747dbc36',
      'azl-24a8b69272bcc3f0',
      'azl-604a37a57691b511',
      'azl-406b71d0160fadb4'
    ];
    const coveredIds =
      deep && tryout.batch >= 4
        ? [...regressionAnchors, ...tryout.release.newIds].filter((id, i, all) => all.indexOf(id) === i)
        : deep
          ? tryout.release.enabledIds
          : tryout.release.newIds;
    let subjects = tryout.batch ? tryout.samples.filter(s => coveredIds.includes(s.id)) : tryout.samples;
    const onlyIndex = process.argv.indexOf('--test-only-skin');
    if (onlyIndex >= 0) {
      const id = process.argv[onlyIndex + 1];
      assert(
        subjects.some(s => s.id === id),
        'Unknown diagnostic skin'
      );
      subjects = subjects.filter(s => s.id === id);
    }
    step('coverage-plan', {
      available: sampleCount,
      testedIds: subjects.map(s => s.id),
      newIds: tryout.release.newIds,
      method:
        deep && tryout.batch >= 4
          ? 'All new skins plus four accepted regression anchors'
          : 'Full batch or new-only according to mode'
    });
    for (let index = 0; index < subjects.length; index++) {
      const sample = subjects[index];
      if (tryout.selected.id !== sample.id) await choose(sample.id);
      const load = {
        sampleId: sample.id,
        character: sample.character,
        skinName: sample.name,
        url: sample.url,
        milliseconds: tryout.model.state.readyMs,
        autoRetry: tryout.model.attempt.autoRetry || null,
        autoRetries: (tryout.model.attempt.autoRetries || []).length,
        ui: tryout.model.attempt.observations.at(-1)
      };
      assert(tryout.model.retired.every(row => row.destroyed));
      if (deep) {
        // Not every skin lists a login motion; use the first voiced greeting the model offers.
        // The motion list can render a moment after the model reports ready.
        const motions = await until(
          async () => {
            const list = await remote(
              "[...document.querySelectorAll('.spine-action-item')].map(e=>e.textContent.trim().replace(/^\\d+\\s*/,''))"
            );
            return list.length ? list : false;
          },
          'motion list ' + sample.id,
          10000
        ).catch(() => []);
        const greeting = ['login', 'home', 'main_1', 'mail'].find(name => motions.includes(name));
        assert(greeting, 'No greeting motion: ' + motions.slice(0, 12).join(','));
        load.action = await action(greeting, { tolerant: tryout.batch >= 5 });
        if (!load.action.audible)
          assert.equal(load.action.motionActive, true, 'greeting motion did not start: ' + sample.id);
        await remote(`document.querySelector('button[aria-label="触摸区域"]:not([aria-pressed="true"])')?.click()`);
        await pause(350);
        load.capture = await capture(`skin-${sample.onlineId}`);
        await remote(`document.querySelector('button[aria-label="触摸区域"][aria-pressed="true"]')?.click()`);
        if (sample.guidePath) {
          await until(() => local('document.getElementById("small-image").naturalWidth>1000'), 'guide image', 8000);
          load.guideWidth = await local('document.getElementById("small-image").naturalWidth');
        } else assert.equal(await local('document.getElementById("sidebar").hidden'), true);
      }
      if (mode === 'interaction') await touchHead(sample);
      if (!deep) {
        await silent();
        await remote(`document.querySelector('button[aria-label="触摸区域"]:not([aria-pressed="true"])')?.click()`);
        await pause(500);
        load.capture = await capture('idle-' + sample.onlineId);
      }
      if (sample.forms?.length > 1 && mode !== 'interaction') {
        // Dual-form skin: switch to the Spine form through the player, then back to Live2D.
        assert.equal(await local('document.getElementById("form-switch").hidden'), false);
        const formReady = onlineId =>
          until(() => {
            if (tryout.model.state.phase === 'error')
              throw new Error(tryout.model.state.error + ': ' + tryout.model.state.message);
            return tryout.model.state.phase === 'ready' && tryout.model.sample?.onlineId === onlineId;
          }, 'form ready ' + onlineId);
        await local('document.querySelector(\'#form-switch [data-form-index="1"]\').click()');
        await formReady(sample.forms[1].onlineId);
        const spineLabel = await remote(
          "document.querySelector('.model-settings-inline')?.textContent.trim().slice(0,40)||''"
        );
        assert.equal(/SPINE #(\d+)/.exec(spineLabel)?.[1], sample.forms[1].onlineId, spineLabel); // the site may prefix a short costume tag
        load.spine = {
          onlineId: sample.forms[1].onlineId,
          readyMs: tryout.model.state.readyMs,
          label: spineLabel,
          capture: await capture('spine-' + sample.forms[1].onlineId)
        };
        await local('document.querySelector(\'#form-switch [data-form-index="0"]\').click()');
        await formReady(sample.forms[0].onlineId);
        load.backToLive2d = tryout.model.state.readyMs;
      } else if (mode !== 'interaction')
        assert.equal(await local('document.getElementById("form-switch").hidden'), true);
      const prefs = tryout.model.contents.getLastWebPreferences();
      assert.equal(prefs.sandbox, true);
      assert.equal(prefs.nodeIntegration, false);
      assert.deepEqual(await remote('({require:typeof window.require,notes:typeof window.l2dTryout})'), {
        require: 'undefined',
        notes: 'undefined'
      });
      step('skin-verified', load);
    }
    if (deep) {
      await choose(tryout.samples[0].id);
      await click('expand-guide');
      await until(() => local('document.getElementById("guide-dialog").open'), 'guide dialog', 3000);
      assert.equal(tryout.model.occluded, true);
      await click('close-guide');
      await until(() => !tryout.model.occluded, 'model restored', 3000);
      // The guide panel collapses to a rail and the stage widens; the rail brings it back.
      const stageWidth = () => local("document.getElementById('stage').getBoundingClientRect().width");
      const withGuide = await stageWidth();
      await click('collapse-guide');
      await until(
        () => local("!document.getElementById('guide-rail').hidden&&document.getElementById('sidebar').hidden"),
        'guide collapsed',
        3000
      );
      const collapsedWidth = await stageWidth();
      assert(collapsedWidth > withGuide + 250, `stage did not widen: ${withGuide} -> ${collapsedWidth}`);
      await click('guide-rail');
      await until(
        () => local("!document.getElementById('sidebar').hidden&&document.getElementById('guide-rail').hidden"),
        'guide restored',
        3000
      );
      // The site's left column hides inside the model view and the model takes its width.
      const siteLayout = () =>
        remote(
          "(()=>{const s=document.querySelector('.app-shell section.sidebar');const w=document.querySelector('.model-workspace').getBoundingClientRect();return {column:s?getComputedStyle(s).display:'missing',left:Math.round(w.left),width:Math.round(w.width)};})()"
        );
      const columnShown = await siteLayout();
      await click('toggle-actions');
      const columnHidden = await until(
        async () => {
          const v = await siteLayout();
          return v.column === 'none' && v.left <= 8 ? v : false;
        },
        'action column hidden',
        4000
      );
      assert(
        columnHidden.width > columnShown.width + 150,
        `model did not widen: ${JSON.stringify([columnShown, columnHidden])}`
      );
      await click('collapse-guide');
      await until(() => local("document.getElementById('sidebar').hidden"), 'guide collapsed for capture', 3000);
      await pause(1500);
      const bothCollapsed = await capture('collapsed-both');
      const toolbarLeft = await remote(
        "Math.round(document.querySelector('.browser-page-toolbar')?.getBoundingClientRect().left??-1)"
      );
      assert(toolbarLeft <= 8, 'site toolbar still offset: ' + toolbarLeft);
      await click('guide-rail');
      await click('toggle-actions');
      await until(
        async () => {
          const v = await siteLayout();
          return v.column !== 'none' && v.left > 8;
        },
        'action column restored',
        4000
      );
      step('guide-and-action-column-collapse', {
        withGuide,
        collapsedWidth,
        columnShown,
        columnHidden,
        bothCollapsed,
        toolbarLeft
      });
      await click('mute');
      await until(() => tryout.model.contents.isAudioMuted(), 'mute', 3000);
      await click('mute');
      tryout.window.setContentSize(1120, 740);
      await pause(600);
      const layout = await local(
        "({overflow:document.body.scrollWidth>innerWidth,stage:document.getElementById('stage').getBoundingClientRect().toJSON(),sidebar:document.getElementById('sidebar').getBoundingClientRect().toJSON()})"
      );
      assert.equal(layout.overflow, false);
      assert(layout.stage.width > 500 && layout.stage.height > 350);
      step('guide-mute-and-minimum-window', layout);
      tryout.window.setContentSize(1527, 944);
      await pause(500);
      const generation = tryout.model.generation;
      tryout.model.session.webRequest.onBeforeRequest({ urls: ['https://l2d.su/*'] }, (_d, cb) => cb({ cancel: true }));
      await click('retry');
      await until(() => tryout.model.attempt?.generation > generation, 'retry attempt', 5000);
      await until(() => tryout.model.state.phase === 'error', 'error shown', 7000);
      await until(
        () => !tryout.model.contents && tryout.model.retired.every(row => row.destroyed),
        'failed renderer released',
        4000
      );
      assert.equal(await local('document.getElementById("failure-actions").hidden'), false);
      tryout.model.session.webRequest.onBeforeRequest(null);
      await click('stage-retry');
      await until(() => tryout.model.state.phase !== 'error', 'retry starts', 5000);
      await ready(tryout.samples[0].id);
      step('failure-retry-and-release', { method: 'Request failure in isolated test session' });
      await click('back-gallery');
      await until(() => !tryout.window, 'player closed', 8000);
      await tryout.open(tryout.samples[0].id);
      await until(() => local('document.documentElement.dataset.tryoutReady==="true"'), 'reopen', 12000);
      await ready(tryout.samples[0].id);
      // Recently played skins are offered first in the picker after reopening.
      await click('choose-skin');
      await until(() => local('document.getElementById("skin-picker").open'), 'picker after reopen', 5000);
      const recent = await local(
        "[...document.querySelectorAll('#recent-list .sample-choice')].map(e=>e.dataset.skinId)"
      );
      assert.equal(recent[0], tryout.samples[0].id);
      await click('close-picker');
      await until(() => !tryout.model.occluded, 'picker closed', 3000);
      step('close-reopen-and-recent', { recent });
    }
    await tryout.model.stop();
    assert(tryout.model.retired.every(row => row.destroyed));
    for (const row of protectedFiles) assert.equal(hash(path.join(libraryRoot, row.file)), row.sha256, row.file);
    step('accepted-build-and-user-notes-preserved', { protectedFiles });
    const greeted = report.steps.filter(s => s.name === 'skin-verified' && s.action);
    if (greeted.length)
      step('greeting-voice-summary', {
        checked: greeted.length,
        audible: greeted.filter(s => s.action.audible).length,
        missed: greeted
          .filter(s => !s.action.audible)
          .map(s => ({ id: s.sampleId, character: s.character, skin: s.skinName, motion: s.action.label }))
      });
    step('window-restores', { count: restored.length, restored });
    report.status = 'passed';
    report.finishedAt = new Date().toISOString();
    write();
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    report.finishedAt = new Date().toISOString();
    try {
      report.galleryUI = await gallery(
        '({url:location.href,ready:document.documentElement.dataset.desktopReady,bridge:typeof window.l2dDesktop,text:document.body.innerText.slice(0,3500),scripts:[...document.scripts].map(s=>s.src)})'
      );
      fs.writeFileSync(path.join(out, 'gallery-failure.png'), (await window.webContents.capturePage()).toPNG());
    } catch {}
    try {
      report.failureUI = await remote('document.body.innerText.slice(-6000)');
      await capture('failure');
    } catch {}
    write();
    throw error;
  }
}
module.exports = { run };
