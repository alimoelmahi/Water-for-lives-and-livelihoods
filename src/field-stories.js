import { easeCubicInOut } from 'd3';
import { escapeHTML as esc } from './model.js';

export function projectEvidence(project, partners) {
  return `<span class="pill evidence-pill">${esc(project.evidence)}</span>
    <p>${project.beneficiaries === null ? 'Beneficiary count not reported.' : `<strong>${project.beneficiaries.toLocaleString()}</strong> ${esc(project.beneficiaryUnit)}`}</p>
    <h3>What was delivered</h3><ul>${project.outputs.map(output => `<li>${esc(output)}</li>`).join('')}</ul>
    <h3>What changed / what is expected</h3><ul>${project.outcomes.map(outcome => `<li>${esc(outcome)}</li>`).join('')}</ul>
    <p><strong>Partners:</strong> ${esc(partners)}</p>
    <div class="location-disclosure"><strong>Location precision</strong><p>${esc(project.coordinatePrecision)}. Coordinates are navigation aids, not verified implementation locations.</p></div>
    <p class="source-note"><strong>Source:</strong> ${esc(project.source)}</p>`;
}

export function createFieldStories(app, projects, cases, photoById, partnerNames, explore) {
  const list = app.querySelector('#main');
  const slider = app.querySelector('.story-slider');
  const featured = new Map(cases.map(story => [story.projectId, story]));
  const routes = new Map(projects.map(project => [`#/stories/${encodeURIComponent(project.id)}`, project]));
  const title = document.title;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const staticStories = matchMedia('(prefers-reduced-motion: reduce), print, (max-height: 640px)');
  const skip = document.querySelector('.skip-link');
  const alt = photo => esc(photoById.get(photo)?.alt || 'Photograph from the UNDP Sudan publication');
  const scenesHTML = projects.map((project, index) => {
    const story = featured.get(project.id);
    return `<article class="story-scene" style="--index:${index}" aria-hidden="${index !== 0}" ${index ? 'inert' : ''}>
        <div class="story-card-copy"><span class="story-index">${String(index + 1).padStart(2, '0')}</span>
          <span class="story-tag">${esc(project.state)} / ${esc(project.locality)}</span>
          <a class="story-card" href="#/stories/${encodeURIComponent(project.id)}" data-story="${esc(project.id)}" aria-labelledby="story-title-${esc(project.id)}">
          <h3 id="story-title-${esc(project.id)}">${esc(story?.title || project.name)}</h3>
          <p class="story-summary">${esc(story?.description || project.outputs.join('. '))}</p><span class="story-read">Read the story <span aria-hidden="true">&rarr;</span></span></a></div>
        <div class="story-image-wrap"><a class="story-photo" href="#/stories/${encodeURIComponent(project.id)}" tabindex="-1"><img src="images/${esc(project.mediaReferences[0])}.webp" alt="${alt(project.mediaReferences[0])}" style="object-position:${esc(story?.photoPosition || '50% 50%')}" loading="${index < 2 ? 'eager' : 'lazy'}" width="600" height="400"></a></div>
      </article>`;
  }).join('');
  slider.innerHTML = `<div class="story-stage">
    <div class="story-stage-inner page-width">
      <div class="story-rail"><span class="story-rail-label">STORY</span>
        <div class="story-number-window" aria-hidden="true"><div class="story-numbers">${projects.map((_, index) =>
          `<span>${String(index + 1).padStart(2, '0')}</span>`).join('')}</div></div>
        <div class="story-progress" role="progressbar" aria-label="Field stories progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
      </div>
      <div class="story-scenes">${scenesHTML}</div>
    </div>
    <nav class="story-controls page-width" aria-label="Field story navigation">
      <button data-story-previous disabled>&larr; Previous story</button><span class="story-position" role="status" aria-live="polite">Story 1 of ${projects.length}</span>
      <button data-story-next>Next story &rarr;</button><a href="#evidence">Continue to results &darr;</a>
    </nav></div>`;
  const stage = slider.querySelector('.story-stage');
  const scenes = [...slider.querySelectorAll('.story-scene')];
  const cards = scenes.map(scene => scene.querySelector('.story-card'));
  const photos = [...slider.querySelectorAll('.story-photo img')];
  const previous = slider.querySelector('[data-story-previous]');
  const next = slider.querySelector('[data-story-next]');
  const position = slider.querySelector('.story-position');
  const progressBar = slider.querySelector('.story-progress');
  const detail = document.createElement('main');
  detail.id = 'story-detail';
  detail.className = 'story-detail page-width';
  detail.hidden = true;
  list.after(detail);
  const curtain = document.createElement('div');
  curtain.id = 'page-transition';
  curtain.hidden = true;
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<div class="page-transition-panel"><img src="images/image2.webp" alt="" width="40" height="81"></div>';
  document.body.append(curtain);
  const panel = curtain.firstElementChild;
  let ready = !app.inert;
  let detailShown = false;
  let activeHash = location.hash;
  let savedY;
  let savedCard;
  let navigating = false;
  let pending;
  let queued;
  let transitionFrame;
  let storyFrame;
  let storyStep = 0;
  let requested = 0;
  let current = 0;
  let staticView = false;
  let committed = false;
  history.scrollRestoration = 'manual';

  const clamp = value => Math.max(0, Math.min(1, value));

  function renderStories(step) {
    storyStep = step;
    const progress = step / (scenes.length - 1);
    const active = Math.round(step);
    slider.style.setProperty('--story-step', step);
    slider.style.setProperty('--story-progress', progress);
    slider.style.setProperty('--story-copy-opacity', 1 - 2 * Math.abs(step - active));
    progressBar.setAttribute('aria-valuenow', Math.round(progress * 100));
    scenes.forEach((scene, index) => {
      scene.inert = !staticView && index !== active;
      scene.setAttribute('aria-hidden', String(!staticView && index !== active));
      if (staticView || Math.abs(index - active) <= 1) photos[index].loading = 'eager';
    });
    if (active !== current) position.textContent = `Story ${active + 1} of ${scenes.length}`;
    current = active;
    previous.disabled = requested === 0;
    next.disabled = requested === scenes.length - 1;
  }

  function selectStory(index, instant = false) {
    requested = index;
    cancelAnimationFrame(storyFrame);
    if (instant || staticView || motion.matches) {
      renderStories(index);
      return;
    }
    const bounds = stage.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > innerHeight) {
      slider.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
    const from = storyStep;
    const began = performance.now();
    function tick(now) {
      const progress = clamp((now - began) / 400);
      renderStories(from + (index - from) * easeCubicInOut(progress));
      if (progress < 1) storyFrame = requestAnimationFrame(tick);
    }
    storyFrame = requestAnimationFrame(tick);
  }

  function measureStories() {
    if (list.hidden) return;
    if (!staticStories.matches) slider.classList.remove('is-static');
    staticView = staticStories.matches || stage.offsetHeight > innerHeight + 1;
    slider.classList.toggle('is-static', staticView);
    if (staticView) selectStory(requested, true);
    else renderStories(storyStep);
  }

  new ResizeObserver(measureStories).observe(stage);
  addEventListener('resize', measureStories);
  staticStories.addEventListener('change', measureStories);
  previous.addEventListener('click', () => selectStory(Math.max(0, requested - 1)));
  next.addEventListener('click', () => selectStory(Math.min(scenes.length - 1, requested + 1)));

  function returnCard(options) {
    return options.restore ? savedCard :
      options.history && cards.find(card => card.dataset.story === history.state?.atlasListCard);
  }

  function focusView(options) {
    const section = detailShown ? null : document.getElementById(activeHash.slice(1));
    const restoredCard = returnCard(options);
    const heading = ['', '#', '#main'].includes(activeHash) ? list.querySelector('h1') : section?.querySelector('h2');
    const target = detailShown ? detail.querySelector('h1') :
      restoredCard?.isConnected ? restoredCard : heading || document.querySelector('#field-stories-title');
    if (target && !target.matches('a, button, [tabindex]')) target.tabIndex = -1;
    target?.focus({ preventScroll: true });
  }

  function show(hash, options = {}) {
    detailShown = hash.startsWith('#/stories/');
    list.hidden = detailShown;
    list.inert = detailShown;
    detail.hidden = !detailShown;
    skip.href = detailShown ? '#story-detail' : '#main';
    const project = routes.get(hash);
    if (detailShown) {
      document.title = project ? `${project.name} | UNDP Sudan` : `Story not found | UNDP Sudan`;
      const story = project && featured.get(project.id);
      detail.innerHTML = `<a class="text-button story-back" href="#stories" data-story-back>&larr; Back to field impact stories</a>
        ${project ? `<article><header class="story-detail-heading"><p class="eyebrow">${esc(project.state)} / ${esc(project.locality)}</p>
          <h1 tabindex="-1">${esc(story?.title || project.name)}</h1>${story ? `<p>${esc(story.description)}</p>` : ''}</header>
          <figure><img class="story-detail-photo" src="images/${esc(project.mediaReferences[0])}.webp" alt="${alt(project.mediaReferences[0])}" style="object-position:${esc(story?.photoPosition || '50% 50%')}" width="1440" height="960">
          <figcaption>${esc(photoById.get(project.mediaReferences[0])?.caption || 'Publication photograph')}. &copy; UNDP Sudan.</figcaption></figure>
          <div class="story-detail-evidence">${projectEvidence(project, partnerNames(project))}
          <button class="button primary" data-story-map="${esc(project.id)}">Explore ${esc(project.state)} on the map &rarr;</button></div></article>` :
          '<div role="alert"><h1 tabindex="-1">Story not found</h1><p>This story link is not available. Return to the field impact stories to choose a documented story.</p></div>'}`;
      scrollTo({ top: 0, behavior: 'instant' });
    } else {
      document.title = title;
      if (options.explore) explore(options.explore);
      const restored = options.restore ? savedY : options.history && history.state?.atlasListY;
      if (Number.isFinite(restored)) scrollTo({ top: restored, behavior: 'instant' });
      else if (hash === '' || hash === '#') scrollTo({ top: 0, behavior: 'instant' });
      else document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
      measureStories();
      const card = returnCard(options);
      if (card?.closest('.story-scene')?.inert) selectStory(cards.indexOf(card), true);
      if (card) {
        const bounds = card.getBoundingClientRect();
        if (bounds.top < 0 || bounds.bottom > innerHeight) card.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }
    activeHash = hash;
  }

  function commit() {
    if (committed) return;
    committed = true;
    const { hash, options } = pending;
    if (options.push) history.pushState({}, '', hash);
    else if (location.hash !== hash) history.replaceState(history.state, '', hash);
    show(hash, options);
  }

  function finish() {
    cancelAnimationFrame(transitionFrame);
    commit();
    curtain.hidden = true;
    navigating = false;
    app.inert = !ready;
    if (ready) app.removeAttribute('aria-busy');
    if (queued) {
      const next = queued;
      queued = undefined;
      if (next.hash !== activeHash) navigate(next.hash, next.options);
      else focusView(next.options);
    } else focusView(pending.options);
  }

  function navigate(hash, options = {}) {
    if (navigating) {
      queued = { hash, options };
      return;
    }
    if (hash === activeHash) {
      focusView(options);
      return;
    }
    if (!detailShown && hash.startsWith('#/stories/')) {
      savedY = scrollY;
      savedCard = options.trigger || document.activeElement?.closest('.story-card');
      if (!options.history) history.replaceState({
        ...history.state, atlasListY: savedY, atlasListCard: savedCard?.dataset.story,
      }, '', location.href);
    }
    pending = { hash, options };
    committed = false;
    if (!ready) {
      commit();
      return;
    }
    navigating = true;
    if (motion.matches) {
      finish();
      return;
    }
    app.inert = true;
    app.setAttribute('aria-busy', 'true');
    curtain.hidden = false;
    panel.style.transform = 'translateX(-100%)';
    const began = performance.now();
    function tick(now) {
      const elapsed = now - began;
      const fraction = (offset, duration) => Math.max(0, Math.min(1, (elapsed - offset) / duration));
      const x = elapsed < 600 ? -100 * (1 - easeCubicInOut(fraction(100, 400))) :
        100 * easeCubicInOut(fraction(600, 450));
      panel.style.transform = `translateX(${x}%)`;
      if (elapsed >= 500) commit();
      if (elapsed < 1050) transitionFrame = requestAnimationFrame(tick);
      else finish();
    }
    transitionFrame = requestAnimationFrame(tick);
  }

  app.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const mapButton = event.target.closest('[data-story-map]');
    if (mapButton) {
      event.preventDefault();
      navigate('#atlas', { push: true, explore: projects.find(project => project.id === mapButton.dataset.storyMap) });
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (!link || (!link.matches('.story-card, .story-photo') && !detailShown)) return;
    event.preventDefault();
    navigate(link.getAttribute('href'), {
      push: true, restore: link.hasAttribute('data-story-back'),
      trigger: link.closest('.story-scene')?.querySelector('.story-card') || link,
    });
  });
  app.addEventListener('error', event => {
    const image = event.target;
    if (!image.matches('.story-photo img, .story-detail-photo')) return;
    console.error('A field story photograph could not be loaded.', image.src);
    const message = document.createElement('p');
    message.className = 'story-photo-error';
    message.setAttribute('role', 'alert');
    message.textContent = 'This photograph could not be loaded. The story text remains available.';
    image.insertAdjacentElement('afterend', message);
  }, true);
  skip.addEventListener('click', event => {
    if (!detailShown && !navigating) return;
    event.preventDefault();
    if (!navigating) {
      detail.querySelector('h1')?.focus({ preventScroll: true });
      scrollTo({ top: 0, behavior: 'instant' });
    }
  });
  curtain.addEventListener('wheel', event => event.preventDefault(), { passive: false });
  curtain.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  document.addEventListener('keydown', event => {
    if (navigating && [' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) event.preventDefault();
  });
  addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/stories/') || detailShown || navigating) {
      navigate(location.hash, { history: true });
    } else activeHash = location.hash;
  });
  motion.addEventListener('change', () => {
    if (motion.matches && navigating) finish();
  });
  document.addEventListener('atlas:ready', () => {
    ready = true;
    if (detailShown) focusView({});
    else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  }, { once: true });
  show(location.hash);
  measureStories();
}
