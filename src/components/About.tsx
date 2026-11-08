import { Github, Heart, LockKeyhole, ShieldCheck, TriangleAlert } from 'lucide-react';
import { GITHUB_URL } from '../lib/site';

export function About() {
  return (
    <section className="site-section site-section--about" id="about" aria-labelledby="about-heading">
      <div className="container about-grid">
        <div className="about-copy">
          <p className="eyebrow">About the operation</p>
          <h2 id="about-heading">
            A small tool for <span className="text-yellow">big mistakes.</span>
          </h2>
          <p>
            LowQuality is a free, open-source toy for making images and animations look
            delightfully worse. It was built for the bitrot age: a place where a crisp
            photo can become a crunchy, noisy, pixelated artifact in a few seconds.
          </p>
          <p>
            Everything runs locally with React, Canvas and Web Workers. Text is burned
            into the image before the damage starts, which means it gets compressed,
            noised and glitched along with everything else. No sharp overlays sneaking
            through.
          </p>
          <p>
            The sample artwork is original project work, bundled locally under the same
            MIT license as the code. No stock-photo mysteries, no tracking pixels, no
            accounts.
          </p>

          <div className="about-actions">
            <a
              className="button button--secondary"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Github size={16} aria-hidden="true" />
              View the source
            </a>
            <span className="about-license">
              <Heart size={12} fill="currentColor" aria-hidden="true" />
              MIT licensed
            </span>
          </div>
        </div>

        <div className="about-facts">
          <article className="panel fact-card">
            <span className="fact-card__icon" aria-hidden="true">
              <LockKeyhole size={20} />
            </span>
            <h3>Private by architecture</h3>
            <p>
              File bytes are decoded in your tab. There is no backend, no analytics and
              no remote image service.
            </p>
          </article>

          <article className="panel fact-card">
            <span className="fact-card__icon" aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <h3>Practical limits</h3>
            <p>
              Static files up to 30 MB and 32 megapixels. GIFs up to 25 MB, 240 frames
              and a safe decoded-pixel budget. Oversized GIFs get a scaling chooser.
            </p>
          </article>

          <article className="panel fact-card fact-card--warning">
            <span className="fact-card__icon" aria-hidden="true">
              <TriangleAlert size={20} />
            </span>
            <h3>Formats, honestly</h3>
            <p>
              JPEG, PNG, WebP, BMP, AVIF and SVG in; PNG, JPG, WebP and animated GIF out.
              HEIC is rejected politely because browser support is a lottery.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
