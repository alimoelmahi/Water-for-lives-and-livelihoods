import { easeCubicInOut, easeCubicOut } from 'd3';

export function createPreloader(app) {
  const screen = document.querySelector('#preloader');
  const number = screen.querySelector('.preloader-number');
  const progress = screen.querySelector('[role="progressbar"]');
  const fill = screen.querySelector('.preloader-fill');
  const skipLink = document.querySelector('.skip-link');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const started = performance.now();
  let contentReady = false;
  let finished = false;
  let frame;
  let revealTimer;
  let targets = [];

  skipLink.inert = true;
  const fraction = (time, start, duration) => Math.max(0, Math.min(1, (time - start) / duration));

  function percentage(value) {
    number.textContent = `${value}%`;
    progress.setAttribute('aria-valuenow', value);
    fill.style.width = `${value}%`;
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clearTimeout(revealTimer);
    motion.removeEventListener('change', motionChanged);
    document.body.classList.remove('preloading');
    targets.forEach(target => {
      target.style.removeProperty('opacity');
      target.style.removeProperty('transform');
    });
    screen.remove();
    app.inert = false;
    app.removeAttribute('aria-busy');
    skipLink.inert = false;
    document.dispatchEvent(new Event('atlas:ready'));
  }

  function reveal() {
    const began = performance.now();
    targets = [...app.querySelectorAll('.hero-copy, .hero-visual')];
    function tick(now) {
      const elapsed = now - began;
      const curtain = easeCubicInOut(fraction(elapsed, 0, 550));
      const page = easeCubicOut(fraction(elapsed, 50, 600));
      screen.style.transform = `translateY(${-100 * curtain}%)`;
      targets.forEach(target => {
        target.style.opacity = page;
        target.style.transform = `translateY(${14 * (1 - page)}px)`;
      });
      if (elapsed < 650) frame = requestAnimationFrame(tick);
      else finish();
    }
    frame = requestAnimationFrame(tick);
  }

  function scheduleReveal() {
    percentage(100);
    revealTimer = setTimeout(reveal, Math.max(0, 2300 - (performance.now() - started)));
  }

  function count(now) {
    const elapsed = now - started;
    const value = Math.round(100 * easeCubicOut(fraction(elapsed, 250, 1850)));
    percentage(contentReady ? value : Math.min(99, value));
    if (elapsed < 2100) frame = requestAnimationFrame(count);
    else if (contentReady) scheduleReveal();
  }

  function motionChanged() {
    cancelAnimationFrame(frame);
    if (motion.matches) {
      if (contentReady) finish();
    } else {
      frame = requestAnimationFrame(count);
    }
  }
  motion.addEventListener('change', motionChanged);
  if (!motion.matches) frame = requestAnimationFrame(count);

  return {
    ready() {
      contentReady = true;
      if (motion.matches) finish();
      else if (performance.now() - started >= 2100) {
        cancelAnimationFrame(frame);
        scheduleReveal();
      }
    },
    fail: finish,
  };
}
