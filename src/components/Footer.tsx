import { Heart } from 'lucide-react';
import { Mascot } from './Mascot';

function PixelGround() {
  return (
    <svg
      className="footer-ground"
      viewBox="0 0 240 34"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <defs>
        <pattern id="ground-bricks" width="48" height="34" patternUnits="userSpaceOnUse">
          <rect width="48" height="34" fill="#3a1f5f" />
          <rect y="0" width="48" height="8" fill="#77b83e" />
          <rect y="0" width="12" height="4" fill="#96d956" />
          <rect x="20" y="0" width="12" height="4" fill="#8cce49" />
          <rect x="36" y="0" width="8" height="2" fill="#a4e563" />
          <rect x="4" y="8" width="8" height="4" fill="#4b2a75" />
          <rect x="28" y="8" width="8" height="4" fill="#4b2a75" />
          <rect y="14" width="22" height="10" fill="#4c2c70" />
          <rect x="24" y="14" width="24" height="10" fill="#452766" />
          <rect x="10" y="16" width="3" height="3" fill="#2b1547" />
          <rect x="33" y="18" width="4" height="3" fill="#2b1547" />
          <rect x="0" y="26" width="30" height="8" fill="#3c215a" />
          <rect x="32" y="26" width="16" height="8" fill="#4a2b6d" />
          <rect x="14" y="25" width="2" height="3" fill="#5b3788" />
          <rect x="38" y="24" width="2" height="3" fill="#5b3788" />
        </pattern>
      </defs>
      <rect width="240" height="34" fill="url(#ground-bricks)" />
    </svg>
  );
}

interface FooterProps {
  onOpenConverter: () => void;
}

export function Footer({ onOpenConverter }: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="footer-ground-wrap">
        <PixelGround />
      </div>
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <Mascot className="site-footer__mascot" />
          <div>
            <span className="site-footer__logo">LOWQUALITY</span>
            <p>Make your images look worse.</p>
          </div>
        </div>

        <nav className="site-footer__nav" aria-label="Footer navigation">
          <a href="#editor">Editor</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#about">About</a>
        </nav>

        <div className="site-footer__meta">
          <p>
            Built with <Heart size={12} fill="currentColor" aria-hidden="true" />
            <span className="visually-hidden">love</span> for the bitrot age. MIT
            licensed.
          </p>
          <span className="site-footer__fine">
            No servers. No accounts.{" "}
            <button
              type="button"
              className="site-footer__mercy"
              onClick={onOpenConverter}
              title="Psst. Some mercy: convert an image without the damage."
              aria-label="Open the secret image converter"
              data-testid="open-converter"
            >
              No mercy.
            </button>
          </span>
        </div>
      </div>
    </footer>
  );
}
