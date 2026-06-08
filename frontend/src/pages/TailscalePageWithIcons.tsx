import React, { useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OSIcon } from '../components/tailscale/OSIcon';
import { TailscalePage } from './TailscalePage';

const EMOJI_TO_OS: Record<string, string> = {
  '🐧': 'linux',
  '🪟': 'windows',
  '🍎': 'macos',
  '📱': 'ios',
  '🤖': 'android',
  '💻': 'unknown',
};

const enhanceOSIcons = (root: HTMLElement) => {
  root.querySelectorAll<HTMLSpanElement>('span:not([data-os-icon-enhanced])').forEach(span => {
    const text = span.textContent || '';
    const emoji = Object.keys(EMOJI_TO_OS).find(candidate => text.includes(candidate));
    if (!emoji) return;

    const suffix = text.replace(emoji, '').trim();
    span.dataset.osIconEnhanced = 'true';
    span.classList.add('inline-flex', 'items-center', 'gap-1.5');
    span.innerHTML = renderToStaticMarkup(<OSIcon os={EMOJI_TO_OS[emoji]} />);

    if (suffix) span.appendChild(document.createTextNode(suffix));
  });
};

export const TailscalePageWithIcons: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    enhanceOSIcons(root);
    const observer = new MutationObserver(() => enhanceOSIcons(root));
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="contents">
      <TailscalePage />
    </div>
  );
};
