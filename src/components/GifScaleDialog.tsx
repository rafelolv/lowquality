import { AlertTriangle, ImageDown, LockKeyhole, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GifPreflight } from '../types';
import {
  MAX_GIF_FRAMES,
  MAX_GIF_TOTAL_PIXELS,
  fitScaleOptions,
} from '../lib/constants';
import { formatFileSize, formatFrameCount } from '../lib/imageLoader';

export interface GifScalePending {
  file: File;
  buffer: ArrayBuffer;
  probe: GifPreflight;
  requiredScale: number;
}

interface GifScaleDialogProps {
  pending: GifScalePending;
  onCancel: () => void;
  onConfirm: (scale: number) => void;
}

export function GifScaleDialog({ pending, onCancel, onConfirm }: GifScaleDialogProps) {
  const options = useMemo(
    () => fitScaleOptions(pending.requiredScale),
    [pending.requiredScale],
  );
  const [selectedScale, setSelectedScale] = useState(options[0] ?? pending.requiredScale);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setSelectedScale(options[0] ?? pending.requiredScale);
  }, [pending, options]);

  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel]);

  const selectedWidth = Math.max(1, Math.round(pending.probe.width * selectedScale));
  const selectedHeight = Math.max(1, Math.round(pending.probe.height * selectedScale));
  const selectedPixels = selectedWidth * selectedHeight * pending.probe.frameCount;
  const percent = Math.round(selectedScale * 100);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gif-dialog-title"
        aria-describedby="gif-dialog-desc"
        ref={dialogRef}
        tabIndex={-1}
      >
        <button
          type="button"
          className="dialog__close icon-button"
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={16} aria-hidden="true" />
        </button>

        <span className="dialog__icon" aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <p className="eyebrow">Big animation detected</p>
        <h2 id="gif-dialog-title">This GIF needs a diet.</h2>
        <p id="gif-dialog-desc" className="dialog__lede">
          <strong>{pending.file.name}</strong> is too large to destroy safely at full
          size. Pick a working scale and we will keep every frame, delay and loop.
        </p>

        <dl className="dialog__stats">
          <div>
            <dt>Source</dt>
            <dd>
              {pending.probe.width} × {pending.probe.height}
            </dd>
          </div>
          <div>
            <dt>Frames</dt>
            <dd>
              {pending.probe.frameCount} / {MAX_GIF_FRAMES}
            </dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>{formatFileSize(pending.file.size)}</dd>
          </div>
          <div>
            <dt>Decoded budget</dt>
            <dd>
              {(pending.probe.totalPixels / 1_000_000).toFixed(1)}M /{' '}
              {(MAX_GIF_TOTAL_PIXELS / 1_000_000).toFixed(0)}M px
            </dd>
          </div>
        </dl>

        <fieldset className="scale-options">
          <legend>Working size</legend>
          {options.map((scale) => {
            const width = Math.max(1, Math.round(pending.probe.width * scale));
            const height = Math.max(1, Math.round(pending.probe.height * scale));
            const active = Math.abs(scale - selectedScale) < 0.001;
            return (
              <label
                key={scale}
                className={`scale-option${active ? ' scale-option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="gif-scale"
                  value={scale}
                  checked={active}
                  onChange={() => setSelectedScale(scale)}
                />
                <span className="scale-option__radio" aria-hidden="true" />
                <span className="scale-option__size">
                  {width} × {height}
                </span>
                <span className="scale-option__percent">
                  {Math.round(scale * 100)}%
                  {Math.abs(scale - pending.requiredScale) < 0.002 && ' · safest'}
                </span>
              </label>
            );
          })}
        </fieldset>

        <p className="dialog__summary">
          <ImageDown size={14} aria-hidden="true" />
          <span>
            {selectedWidth} × {selectedHeight} ·{' '}
            {formatFrameCount(pending.probe.frameCount)} ·{' '}
            {(selectedPixels / 1_000_000).toFixed(1)}M decoded pixels
          </span>
        </p>

        <div className="dialog__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            ref={cancelRef}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => onConfirm(selectedScale)}
          >
            Shrink & continue
          </button>
        </div>

        <p className="dialog__privacy">
          <LockKeyhole size={12} aria-hidden="true" />
          Still entirely in your browser. Working at {percent}% size.
        </p>
      </div>
    </div>
  );
}
