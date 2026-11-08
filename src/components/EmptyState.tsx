import {
  ArrowRight,
  Check,
  FileWarning,
  Loader2,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { publicAsset } from '../lib/files';

interface EmptyStateProps {
  loading: boolean;
  loadingLabel: string;
  dragActive: boolean;
  onPickFile: () => void;
  onTrySample: () => void;
  onDropFile: (file: File) => void;
}

const formats = ['JPEG', 'PNG', 'WebP', 'AVIF', 'BMP', 'SVG', 'Animated GIF'];

export function EmptyState({
  loading,
  loadingLabel,
  dragActive,
  onPickFile,
  onTrySample,
  onDropFile,
}: EmptyStateProps) {
  return (
    <div className="empty-studio">
      <section className="panel empty-hero" aria-labelledby="empty-heading">
        <div className="panel__header">
          <h2 className="panel__title" id="empty-heading">
            <FileWarning size={16} aria-hidden="true" />
            No disaster loaded
          </h2>
          <span className="status-chip status-chip--demo">Demo ready</span>
        </div>

        <div className="empty-hero__body">
          <p className="eyebrow">Step 1: choose a victim</p>
          <h3 className="empty-hero__title">
            Feed it something
            <span className="text-yellow"> beautiful.</span>
          </h3>
          <p className="empty-hero__lede">
            We will handle the terrible part. Drop a photo or animated GIF, push the
            badness slider, and download the evidence.
          </p>

          <button
            type="button"
            className={`empty-upload${dragActive ? ' empty-upload--active' : ''}`}
            onClick={onPickFile}
            disabled={loading}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const file = event.dataTransfer.files[0];
              if (file) onDropFile(file);
            }}
          >
            <span className="empty-upload__icon" aria-hidden="true">
              {loading ? (
                <Loader2 className="spin" size={32} />
              ) : (
                <UploadCloud size={32} />
              )}
            </span>
            <span className="empty-upload__main">
              {loading ? loadingLabel : 'Drop it. Click it. Regret it.'}
            </span>
            <span className="empty-upload__sub">
              {loading
                ? 'Processing stays right here in your browser.'
                : 'JPG, PNG, WebP, AVIF, BMP, SVG or animated GIF'}
            </span>
          </button>

          <div className="empty-hero__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={onTrySample}
              disabled={loading}
            >
              <Sparkles size={16} aria-hidden="true" />
              Try sample image
            </button>
          </div>

          <ul className="format-list" aria-label="Supported formats">
            {formats.map((format) => (
              <li key={format}>
                <Check size={11} strokeWidth={3} aria-hidden="true" />
                {format}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel sample-demo" aria-labelledby="demo-heading">
        <div className="panel__header">
          <h2 className="panel__title" id="demo-heading">
            The before / after
          </h2>
          <span className="sample-demo__tag">Exhibit A</span>
        </div>
        <div className="sample-demo__grid">
          <figure className="sample-frame sample-frame--original">
            <div className="sample-frame__image">
              <img
                src={publicAsset('samples/sample-original.png')}
                alt="Original pixel artwork of a cat watching a neon city at sunset."
                width={600}
                height={450}
                loading="lazy"
              />
            </div>
            <figcaption>
              <span className="sample-frame__label">Before</span>
              <span className="sample-frame__note">Actually rather nice.</span>
            </figcaption>
          </figure>

          <span className="sample-demo__arrow" aria-hidden="true">
            <ArrowRight size={22} />
          </span>

          <figure className="sample-frame sample-frame--destroyed">
            <div className="sample-frame__image">
              <img
                src={publicAsset('samples/sample-destroyed.png')}
                alt="The same pixel artwork after heavy compression, noise, pixelation and glitching."
                width={600}
                height={450}
                loading="lazy"
              />
            </div>
            <figcaption>
              <span className="sample-frame__label">After</span>
              <span className="sample-frame__note">Several bad decisions.</span>
            </figcaption>
          </figure>
        </div>
        <p className="sample-demo__foot">
          Original sample artwork, bundled locally and licensed with this project. No
          uploads, no stock-photo mystery.
        </p>
      </section>
    </div>
  );
}
