import { easeCubicInOut } from 'd3';

const enhanced = new WeakSet();
const closingEase = `linear(${Array.from({ length: 101 }, (_, index) =>
  easeCubicInOut(index / 100).toFixed(6)).join(',')})`;

export function enhanceDropdowns(container) {
  if (!CSS.supports('appearance', 'base-select')) return;
  document.documentElement.style.setProperty('--dropdown-close-easing', closingEase);
  container.querySelectorAll('select').forEach(select => {
    if (enhanced.has(select)) return;
    enhanced.add(select);
    const button = document.createElement('button');
    button.type = 'button';
    const current = document.createElement('selectedcontent');
    button.append(current);
    select.prepend(button);
    select.classList.add('motion-select');
    let previous = select.selectedOptions[0]?.textContent || '';
    let outgoing;
    let incoming;
    let oldLabel;

    function remember() {
      previous = select.selectedOptions[0]?.textContent || '';
    }

    select.addEventListener('pointerdown', remember);
    select.addEventListener('keydown', remember);
    select.addEventListener('input', () => {
      const old = previous;
      remember();
      outgoing?.cancel();
      incoming?.cancel();
      oldLabel?.remove();
      if (old === previous || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      oldLabel = document.createElement('span');
      oldLabel.className = 'dropdown-previous';
      oldLabel.setAttribute('aria-hidden', 'true');
      oldLabel.textContent = old;
      button.append(oldLabel);
      const departing = oldLabel;
      outgoing = oldLabel.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 100, easing: 'linear', fill: 'forwards',
      });
      outgoing.onfinish = () => departing.remove();
      incoming = current.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 100, delay: 120, easing: 'linear', fill: 'backwards',
      });
    });
  });
}
