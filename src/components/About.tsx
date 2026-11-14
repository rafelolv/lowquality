import {
  AppWindow,
  Github,
  Heart,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { GITHUB_URL } from "../lib/site";

export function About() {
  return (
    <section
      className="site-section site-section--about"
      id="about"
      aria-labelledby="about-heading"
    >
      <div className="container about-grid">
        <div className="about-copy">
          <p className="eyebrow">About the operation</p>
          <h2 id="about-heading">
            A small app for <span className="text-yellow">big mistakes.</span>
          </h2>
          <p>
            LowQuality has two workspaces: Destroy adds compression, noise and
            glitches to photos and animated GIFs. Toolbox handles practical
            edits such as conversion, resizing, compression and redaction.
          </p>
          <p>
            Everything runs locally with React, Canvas and Web Workers. In
            Destroy, text is burned into the image before the damage starts, so
            it gets compressed, noised and glitched along with everything else.
            No sharp overlays sneaking through.
          </p>
          <p>
            The sample artwork is original project work, bundled locally under
            the same MIT license as the code. No stock-photo mysteries, no
            tracking pixels, no accounts.
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
              <AppWindow size={20} />
            </span>
            <h3>Destroy & Toolbox</h3>
            <p>
              Toolbox image tools share one original file as you switch between
              them. Destroy keeps its own image and settings.
            </p>
          </article>

          <article className="panel fact-card">
            <span className="fact-card__icon" aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <h3>Practical limits</h3>
            <p>
              Images: up to 30 MB and 32 megapixels. GIF input: up to 25 MB and
              240 frames; Destroy offers scaling for oversized GIFs. Video to
              GIF accepts up to 250 MB, with separate clip and frame limits.
            </p>
          </article>

          <article className="panel fact-card fact-card--warning">
            <span className="fact-card__icon" aria-hidden="true">
              <TriangleAlert size={20} />
            </span>
            <h3>Formats, honestly</h3>
            <p>
              Destroy accepts still images and animated GIFs. Toolbox adds MP4,
              WebM, M4V and MOV video input, plus icon and ZIP exports. Each
              tool lists its supported formats; HEIC/HEIF is not supported.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
