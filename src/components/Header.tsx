import { Github } from 'lucide-react';
import { Mascot } from './Mascot';
import { HeaderArt } from './HeaderArt';
import { GITHUB_URL } from '../lib/site';

const navigation = [
  { href: '#editor', label: 'Editor', active: true },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#about', label: 'About' },
];

export function Header() {
  return (
    <header className="site-header">
      <HeaderArt />
      <div className="site-header__grain" aria-hidden="true" />
      <div className="container site-header__inner">
        <a className="header-github" href={GITHUB_URL} target="_blank" rel="noreferrer">
          <Github size={17} strokeWidth={2.5} aria-hidden="true" />
          <span>GitHub</span>
        </a>

        <a className="brand" href="#editor" aria-label="LowQuality — go to the editor">
          <Mascot className="brand__mascot" />
          <span className="brand__copy">
            <span className="brand__name" aria-label="LowQuality">
              LOWQUALITY
            </span>
            <span className="brand__tagline">Make your images look worse.</span>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`pixel-nav-link${item.active ? ' pixel-nav-link--active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
