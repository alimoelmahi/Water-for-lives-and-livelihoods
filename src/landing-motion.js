export function initLandingMotion(app) {
  initHeroParallax(app);
  const dividers = [...app.querySelectorAll('.shape-divider')].map(element => ({
    element,
    back: element.querySelector('.wave-back'),
    front: element.querySelector('.wave-front'),
    visible: false,
  }));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = !app.inert;
  let origin = performance.now();
  let ambientFrame;

  function wave(base, firstAmplitude, firstLength, firstPhase, secondAmplitude, secondLength, secondPhase) {
    const points = ['M0,169'];
    for (let x = 0; x <= 512; x += 4) {
      const y = base + firstAmplitude * Math.sin(2 * Math.PI * x / firstLength + firstPhase) +
        secondAmplitude * Math.sin(2 * Math.PI * x / secondLength + secondPhase);
      points.push(`L${x},${y.toFixed(3)}`);
    }
    return `${points.join(' ')} L511,169 Z`;
  }

  function drawDivider(divider, seconds) {
    const phase = 2 * Math.PI * (seconds % 4.7) / 4.7;
    divider.back.setAttribute('d', wave(100, 8, 260, phase + 1, 4, 130, -2 * phase));
    divider.front.setAttribute('d', wave(110, 9, 300, -phase, 3.5, 110, 2 * phase + 0.5));
  }

  function animate(now) {
    ambientFrame = undefined;
    if (!ready || motion.matches || document.hidden || !dividers.some(divider => divider.visible)) return;
    const seconds = (now - origin) / 1000;
    for (const divider of dividers) {
      if (divider.visible) drawDivider(divider, seconds);
    }
    ambientFrame = requestAnimationFrame(animate);
  }

  function refreshMotion() {
    cancelAnimationFrame(ambientFrame);
    ambientFrame = undefined;
    if (motion.matches) {
      dividers.forEach(divider => drawDivider(divider, 0));
    } else if (ready && !document.hidden && dividers.some(divider => divider.visible)) {
      ambientFrame = requestAnimationFrame(animate);
    }
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      dividers.find(divider => divider.element === entry.target).visible = entry.isIntersecting;
    }
    refreshMotion();
  });
  dividers.forEach(divider => observer.observe(divider.element));
  document.addEventListener('visibilitychange', refreshMotion);
  document.addEventListener('atlas:ready', () => {
    ready = true;
    origin = performance.now();
    refreshMotion();
  }, { once: true });
  motion.addEventListener('change', refreshMotion);
  dividers.forEach(divider => drawDivider(divider, 0));
}

function initHeroParallax(app) {
  const hero = app.querySelector('.hero');
  const visual = hero.querySelector('.hero-visual');
  const photo = visual.querySelector('.hero-photo');
  const staticScene = matchMedia('(prefers-reduced-motion: reduce), print');
  let ready = !app.inert;
  let visible = false;
  let frame;

  function update() {
    frame = undefined;
    if (!ready || !visible || document.hidden || staticScene.matches) return;
    const distance = Math.max(0, Math.min(scrollY, hero.getBoundingClientRect().bottom + scrollY));
    photo.style.transform = `translate3d(0,${distance * 0.3}px,0)`;
  }

  function queueUpdate() {
    if (frame === undefined && ready && visible && !document.hidden && !staticScene.matches) {
      frame = requestAnimationFrame(update);
    }
  }

  function refresh() {
    cancelAnimationFrame(frame);
    frame = undefined;
    if (staticScene.matches) photo.style.removeProperty('transform');
    else queueUpdate();
  }

  function measure() {
    const bottom = Math.max(0, hero.getBoundingClientRect().bottom + scrollY);
    visual.style.setProperty('--hero-overscan', `${Math.ceil(bottom * 0.3)}px`);
    queueUpdate();
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    refresh();
  }).observe(visual);
  new ResizeObserver(measure).observe(hero);
  addEventListener('scroll', queueUpdate, { passive: true });
  document.addEventListener('visibilitychange', refresh);
  staticScene.addEventListener('change', refresh);
  document.addEventListener('atlas:ready', () => {
    ready = true;
    measure();
    refresh();
  }, { once: true });
  measure();
}
