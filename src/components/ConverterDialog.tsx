import {
  ArrowLeftRight,
  Check,
  Download,
  FileImage,
  Heart,
  Loader2,
  LockKeyhole,
  Minimize2,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { CompressFormat, ExportFormat, ToolMode } from "../types";
import { DEFAULT_ENABLED_EFFECTS, NEUTRAL_SETTINGS } from "../lib/presets";
import {
  decodeStaticImage,
  formatDimensions,
  formatFileSize,
  validateStaticFile,
} from "../lib/imageLoader";
import {
  buildCompressedName,
  buildConvertedName,
  downloadBlob,
} from "../lib/files";
import {
  compressionTargets,
  defaultCompressionTarget,
  dimensionOptions,
  formatTargetMb,
  parseTargetMb,
  reductionPercent,
} from "../lib/compression";
import {
  DestroyWorkerClient,
  WorkerJobCancelled,
  type CompressStaticResult,
  type JobHandle,
  type JobProgress,
} from "../lib/workerClient";

type ConvertFormat = Exclude<ExportFormat, "gif">;

type RangeStyle = CSSProperties & { "--range-progress": string };

interface ConverterDialogProps {
  initialMode?: ToolMode;
  onClose: () => void;
}

interface SourceState {
  file: File;
  format: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

interface ConvertedResult {
  blob: Blob;
  name: string;
  format: ConvertFormat;
}

interface CompressedResult extends CompressStaticResult {
  name: string;
  format: CompressFormat;
}

const FORMATS: Array<{ id: ConvertFormat; label: string; note: string }> = [
  { id: "png", label: "PNG", note: "Lossless, keeps alpha" },
  { id: "jpeg", label: "JPG", note: "Smaller, white matte" },
  { id: "webp", label: "WebP", note: "Small and modern" },
];

const COMPRESS_FORMATS: Array<{
  id: CompressFormat;
  label: string;
  note: string;
}> = [
  { id: "webp", label: "WebP", note: "Best size, keeps alpha" },
  { id: "jpeg", label: "JPG", note: "Universal, white matte" },
];

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/avif,image/bmp,image/svg+xml,image/x-icon,.jpg,.jpeg,.jfif,.png,.webp,.avif,.bmp,.svg,.ico";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The image tool hit an unexpected pixel problem.";
}

function formatLabel(format: ConvertFormat): string {
  return FORMATS.find((item) => item.id === format)?.label ?? format;
}

export function ConverterDialog({
  initialMode = "convert",
  onClose,
}: ConverterDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const clientRef = useRef<DestroyWorkerClient | null>(null);
  const initJobRef = useRef<JobHandle<void> | null>(null);
  const exportJobRef = useRef<JobHandle<Blob> | null>(null);
  const compressJobRef = useRef<JobHandle<CompressStaticResult> | null>(null);
  const tokenRef = useRef(0);

  const [mode, setMode] = useState<ToolMode>(initialMode);
  const [source, setSource] = useState<SourceState | null>(null);
  const [format, setFormat] = useState<ConvertFormat>("png");
  const [compressFormat, setCompressFormat] = useState<CompressFormat>("webp");
  const [targetBytes, setTargetBytes] = useState(0);
  const [customTarget, setCustomTarget] = useState("");
  const [maxDimension, setMaxDimension] = useState(0);
  const [qualityFloor, setQualityFloor] = useState(0.6);
  const [busy, setBusy] = useState<
    "loading" | "converting" | "compressing" | null
  >(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertedResult | null>(null);
  const [compressed, setCompressed] = useState<CompressedResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const targets = source ? compressionTargets(source.file.size) : [];
  const dimensions = source ? dimensionOptions(source.width, source.height) : [];
  const customTargetBytes = source
    ? parseTargetMb(customTarget, source.file.size)
    : null;
  const customTargetInvalid = Boolean(
    source && customTarget.trim() !== "" && customTargetBytes === null,
  );
  const floorPercent = Math.round(qualityFloor * 100);
  const floorStyle: RangeStyle = { "--range-progress": `${floorPercent}%` };

  const disposeWorker = useCallback(() => {
    tokenRef.current += 1;
    initJobRef.current?.cancel();
    initJobRef.current = null;
    exportJobRef.current?.cancel();
    exportJobRef.current = null;
    compressJobRef.current?.cancel();
    compressJobRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    disposeWorker();
    onClose();
  }, [disposeWorker, onClose]);

  useEffect(() => {
    return () => {
      disposeWorker();
    };
  }, [disposeWorker]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;
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

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [handleClose]);

  const loadSource = useCallback(
    async (file: File) => {
      disposeWorker();
      const token = tokenRef.current;
      setBusy("loading");
      setReady(false);
      setSource(null);
      setResult(null);
      setCompressed(null);
      setError(null);
      setProgress(4);
      setStage("Reading the image");

      let decoded: Awaited<ReturnType<typeof decodeStaticImage>> | null = null;
      try {
        if (file.size === 0) {
          throw new Error(
            "That file is empty. It may be a placeholder or corrupt.",
          );
        }
        const info = validateStaticFile(file);
        if (info.animated) {
          throw new Error(
            "Animated GIFs need the main editor, where every frame survives. These tools are stills only.",
          );
        }

        decoded = await decodeStaticImage(file);
        if (token !== tokenRef.current) {
          decoded.bitmap.close();
          return;
        }

        const image = decoded;
        setSource({
          file,
          format: info.format,
          width: image.width,
          height: image.height,
          hasAlpha: image.hasAlpha,
        });
        setTargetBytes(defaultCompressionTarget(file.size));
        setCustomTarget("");
        setMaxDimension(0);
        setProgress(32);
        setStage("Warming up the converter");

        const client = new DestroyWorkerClient();
        clientRef.current = client;
        const job = client.initStatic(
          image.width,
          image.height,
          image.pixels.buffer as ArrayBuffer,
          (update: JobProgress) => {
            if (token !== tokenRef.current) return;
            setProgress(Math.max(32, update.progress));
            setStage(update.stage || "Preparing source pixels");
          },
        );
        initJobRef.current = job;
        await job.promise;
        image.bitmap.close();
        decoded = null;

        if (token !== tokenRef.current) return;
        initJobRef.current = null;
        setReady(true);
        setBusy(null);
        setProgress(100);
        setStage("Ready when you are");
      } catch (caught) {
        decoded?.bitmap.close();
        if (
          token !== tokenRef.current ||
          caught instanceof WorkerJobCancelled
        ) {
          return;
        }
        setBusy(null);
        setReady(false);
        setProgress(0);
        setStage("");
        setError(errorMessage(caught));
        disposeWorker();
      }
    },
    [disposeWorker],
  );

  const convert = useCallback(async () => {
    if (!source || !ready || busy || !clientRef.current) return;
    const client = clientRef.current;
    const token = tokenRef.current;
    setBusy("converting");
    setError(null);
    setResult(null);
    setCompressed(null);
    setProgress(0);
    setStage("Warming up the encoder");

    try {
      const job = client.exportStatic(
        {
          overlayId: "none",
          settings: NEUTRAL_SETTINGS,
          enabled: DEFAULT_ENABLED_EFFECTS,
          format,
        },
        (update: JobProgress) => {
          if (token !== tokenRef.current) return;
          setProgress(update.progress);
          setStage(update.stage);
        },
      );
      exportJobRef.current = job;
      const blob = await job.promise;
      if (token !== tokenRef.current) return;

      const name = buildConvertedName(source.file.name, format);
      downloadBlob(blob, name);
      setResult({ blob, name, format });
      setBusy(null);
      setProgress(100);
      setStage("Converted");
    } catch (caught) {
      if (token !== tokenRef.current || caught instanceof WorkerJobCancelled) {
        return;
      }
      setBusy(null);
      setProgress(0);
      setStage("");
      setError(errorMessage(caught));
    } finally {
      if (token === tokenRef.current) exportJobRef.current = null;
    }
  }, [busy, format, ready, source]);

  const compress = useCallback(async () => {
    if (
      !source ||
      !ready ||
      busy ||
      !clientRef.current ||
      !targetBytes ||
      customTargetInvalid
    ) {
      return;
    }
    const client = clientRef.current;
    const token = tokenRef.current;
    setBusy("compressing");
    setError(null);
    setResult(null);
    setCompressed(null);
    setProgress(0);
    setStage("Measuring the pixels");

    try {
      const job = client.compressStatic(
        {
          targetBytes,
          format: compressFormat,
          maxDimension,
          qualityFloor,
        },
        (update: JobProgress) => {
          if (token !== tokenRef.current) return;
          setProgress(update.progress);
          setStage(update.stage);
        },
      );
      compressJobRef.current = job;
      const output = await job.promise;
      if (token !== tokenRef.current) return;

      const name = buildCompressedName(source.file.name, compressFormat);
      downloadBlob(output.blob, name);
      setCompressed({ ...output, name, format: compressFormat });
      setBusy(null);
      setProgress(100);
      setStage("Compressed");
    } catch (caught) {
      if (token !== tokenRef.current || caught instanceof WorkerJobCancelled) {
        return;
      }
      setBusy(null);
      setProgress(0);
      setStage("");
      setError(errorMessage(caught));
    } finally {
      if (token === tokenRef.current) compressJobRef.current = null;
    }
  }, [
    busy,
    compressFormat,
    customTargetInvalid,
    maxDimension,
    qualityFloor,
    ready,
    source,
    targetBytes,
  ]);

  const switchMode = useCallback(
    (next: ToolMode) => {
      if (busy) return;
      setMode(next);
      setResult(null);
      setCompressed(null);
      setError(null);
      setProgress(0);
      setStage("");
    },
    [busy],
  );

  const openFilePicker = useCallback(() => {
    if (busy) return;
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }, [busy]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file && !busy) void loadSource(file);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) void loadSource(file);
  };

  const retry = () => {
    if (source && !busy) void loadSource(source.file);
  };

  const actionDisabled =
    !source ||
    busy !== null ||
    (!ready && error === null) ||
    (mode === 'compress' && (customTargetInvalid || !targetBytes));
  const actionIsRetry = Boolean(source && !ready && error);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        className="dialog converter-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="converter-title"
        aria-describedby="converter-desc"
        aria-busy={busy !== null}
        ref={dialogRef}
        tabIndex={-1}
        data-testid="converter-dialog"
      >
        <button
          type="button"
          className="dialog__close icon-button"
          onClick={handleClose}
          aria-label="Close image tools"
          ref={closeRef}
        >
          <X size={16} aria-hidden="true" />
        </button>

        <span
          className="dialog__icon converter-dialog__icon"
          aria-hidden="true"
        >
          <Heart size={24} />
        </span>

        <div className="tool-switch" role="group" aria-label="Image tool">
          <button
            type="button"
            className={`tool-switch__button${
              mode === "convert" ? " tool-switch__button--active" : ""
            }`}
            aria-pressed={mode === "convert"}
            onClick={() => switchMode("convert")}
            disabled={busy !== null}
            data-testid="tool-tab-convert"
          >
            <ArrowLeftRight size={13} aria-hidden="true" />
            Convert
          </button>
          <button
            type="button"
            className={`tool-switch__button${
              mode === "compress" ? " tool-switch__button--active" : ""
            }`}
            aria-pressed={mode === "compress"}
            onClick={() => switchMode("compress")}
            disabled={busy !== null}
            data-testid="tool-tab-compress"
          >
            <Minimize2 size={13} aria-hidden="true" />
            Compress
          </button>
        </div>

        <p className="eyebrow">The mercy department</p>
        <h2 id="converter-title">
          {mode === "convert" ? "Just convert it." : "Squeeze it gently."}
        </h2>
        <p id="converter-desc" className="dialog__lede">
          {mode === "convert"
            ? "No destruction, no noise, no character-building artifacts. Pick an image, choose a format, and keep the pixels you came with."
            : "Same image, less weight. Pick a target size and we keep the highest quality that still fits, only shrinking dimensions when the pixels demand it."}
        </p>

        <input
          ref={inputRef}
          id="converter-file-input"
          type="file"
          className="visually-hidden"
          accept={ACCEPT}
          onChange={handleFileChange}
          disabled={busy !== null}
          aria-label="Choose an image to convert or compress"
          data-testid="converter-file-input"
        />

        {source ? (
          <div className="converter-source">
            <div className="file-card">
              <span className="file-card__icon" aria-hidden="true">
                <FileImage size={20} />
              </span>
              <div className="file-card__copy">
                <span className="file-card__name" title={source.file.name}>
                  {source.file.name}
                </span>
                <span className="file-card__meta">
                  {source.format} ·{" "}
                  {formatDimensions(source.width, source.height)} ·{" "}
                  {formatFileSize(source.file.size)}
                  {source.hasAlpha ? " · alpha" : ""}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={openFilePicker}
              disabled={busy !== null}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Replace
            </button>
          </div>
        ) : (
          <label
            htmlFor="converter-file-input"
            className={`dropzone converter-drop${
              dragActive ? " dropzone--active" : ""
            }${busy === "loading" ? " dropzone--busy" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <span className="dropzone__icon" aria-hidden="true">
              {busy === "loading" ? (
                <Loader2 className="spin" size={30} />
              ) : (
                <UploadCloud size={30} />
              )}
            </span>
            <strong>
              {busy === "loading" ? "Reading the image" : "Drop an image here"}
            </strong>
            <span>
              {busy === "loading"
                ? "Preparing the local tools…"
                : "or click to browse. Stills only."}
            </span>
            <span className="dropzone__formats">
              JPG · PNG · WEBP · AVIF · BMP · SVG
            </span>
          </label>
        )}

        {mode === "convert" ? (
          <fieldset className="converter-formats">
            <legend>Output format</legend>
            <div className="converter-formats__grid">
              {FORMATS.map((item) => {
                const active = format === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`converter-format${
                      active ? " converter-format--active" : ""
                    }`}
                    aria-pressed={active}
                    onClick={() => {
                      setFormat(item.id);
                      setResult(null);
                    }}
                    disabled={!ready || busy !== null}
                    data-testid={`converter-format-${item.id}`}
                  >
                    <span className="converter-format__label">{item.label}</span>
                    <span className="converter-format__note">{item.note}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <>
            <fieldset className="converter-formats">
              <legend>Compression format</legend>
              <div className="converter-formats__grid">
                {COMPRESS_FORMATS.map((item) => {
                  const active = compressFormat === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`converter-format${
                        active ? " converter-format--active" : ""
                      }`}
                      aria-pressed={active}
                      onClick={() => {
                        setCompressFormat(item.id);
                        setCompressed(null);
                      }}
                      disabled={!ready || busy !== null}
                      data-testid={`compressor-format-${item.id}`}
                    >
                      <span className="converter-format__label">
                        {item.label}
                      </span>
                      <span className="converter-format__note">{item.note}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="converter-formats">
              <legend>Target size</legend>
              <div
                className="converter-formats__grid converter-formats__grid--targets"
                data-testid="compressor-targets"
              >
                {targets.map((target) => {
                  const active = targetBytes === target.bytes;
                  const reduction = source
                    ? reductionPercent(source.file.size, target.bytes)
                    : 0;
                  return (
                    <button
                      type="button"
                      key={target.bytes}
                      className={`converter-format${
                        active ? " converter-format--active" : ""
                      }`}
                      aria-pressed={active}
                      onClick={() => {
                        setTargetBytes(target.bytes);
                        setCustomTarget("");
                        setCompressed(null);
                      }}
                      disabled={!ready || busy !== null}
                      data-testid={`compressor-target-${target.bytes}`}
                    >
                      <span className="converter-format__label">
                        {target.label}
                      </span>
                      <span className="converter-format__note">
                        {reduction}% smaller
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="converter-custom-target">
                <label
                  className="converter-custom-target__field"
                  htmlFor="compressor-custom-target"
                >
                  <span className="field__label">Custom target</span>
                  <span className="converter-custom-target__control">
                    <input
                      id="compressor-custom-target"
                      type="number"
                      inputMode="decimal"
                      min="0.0001"
                      step="0.01"
                      placeholder={
                        targetBytes > 0 ? formatTargetMb(targetBytes) : "0.75"
                      }
                      value={customTarget}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setCustomTarget(value);
                        setCompressed(null);
                        if (!source) return;
                        if (value.trim() === "") {
                          setTargetBytes(
                            defaultCompressionTarget(source.file.size),
                          );
                          return;
                        }
                        const bytes = parseTargetMb(value, source.file.size);
                        if (bytes !== null) setTargetBytes(bytes);
                      }}
                      disabled={!ready || busy !== null}
                      aria-invalid={customTargetInvalid}
                      aria-describedby="compressor-custom-hint"
                      data-testid="compressor-custom-target"
                    />
                    <span aria-hidden="true">MB</span>
                  </span>
                </label>
                <p
                  className={`converter-hint${
                    customTargetInvalid ? " converter-hint--error" : ""
                  }`}
                  id="compressor-custom-hint"
                  aria-live="polite"
                  data-testid="compressor-custom-hint"
                >
                  {customTargetInvalid
                    ? "Use a size below the original. Tiny files accept decimals too."
                    : customTargetBytes && source
                      ? `${formatFileSize(customTargetBytes)} target · ${reductionPercent(
                          source.file.size,
                          customTargetBytes,
                        )}% smaller`
                      : "Optional. Overrides the presets when filled."}
                </p>
              </div>
            </fieldset>

            <details className="converter-advanced">
              <summary>
                <span>Fine-tuning</span>
                <span className="converter-advanced__note">
                  Resolution cap and quality floor
                </span>
              </summary>
              <div className="converter-advanced__body">
                <fieldset className="converter-formats">
                  <legend>Max resolution</legend>
                  <div
                    className="converter-formats__grid converter-formats__grid--dimensions"
                    data-testid="compressor-dimensions"
                  >
                    {dimensions.map((option) => {
                      const active = maxDimension === option.value;
                      return (
                        <button
                          type="button"
                          key={option.value}
                          className={`converter-format${
                            active ? " converter-format--active" : ""
                          }`}
                          aria-pressed={active}
                          onClick={() => {
                            setMaxDimension(option.value);
                            setCompressed(null);
                          }}
                          disabled={!ready || busy !== null}
                          data-testid={`compressor-dimension-${option.value}`}
                        >
                          <span className="converter-format__label">
                            {option.label}
                          </span>
                          <span className="converter-format__note">
                            {option.value === 0
                              ? "No hard cap"
                              : `${option.value}px max`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="converter-hint">
                    A hard ceiling for the longest side. The encoder still only
                    shrinks when the target needs it.
                  </p>
                </fieldset>

                <fieldset className="converter-formats">
                  <legend>Minimum quality</legend>
                  <div className="converter-floor">
                    <span className="converter-floor__value">
                      {floorPercent}%
                    </span>
                    <input
                      className="pixel-range"
                      type="range"
                      min={30}
                      max={90}
                      step={5}
                      value={floorPercent}
                      style={floorStyle}
                      onChange={(event) => {
                        setQualityFloor(
                          Number(event.currentTarget.value) / 100,
                        );
                        setCompressed(null);
                      }}
                      disabled={!ready || busy !== null}
                      aria-label="Minimum encoder quality"
                      data-testid="compressor-quality-floor"
                    />
                  </div>
                  <p className="converter-hint">
                    The search refuses to go below this. Raise it to protect
                    fine detail; lower it when every kilobyte counts.
                  </p>
                </fieldset>
              </div>
            </details>
          </>
        )}

        {busy !== null && (
          <div
            className="export-progress converter-progress"
            role="status"
            aria-live="polite"
          >
            <div className="export-progress__track">
              <span style={{ width: `${Math.max(3, progress)}%` }} />
            </div>
            <span className="export-progress__stage">
              {stage ||
                (busy === "loading"
                  ? "Reading the image"
                  : mode === "compress"
                    ? "Compressing"
                    : "Converting")}
            </span>
            <span className="export-progress__percent">
              {Math.round(progress)}%
            </span>
          </div>
        )}

        {error && (
          <p className="converter-error" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="converter-result" role="status">
            <Check size={18} aria-hidden="true" />
            <div className="converter-result__copy">
              <strong title={result.name}>{result.name}</strong>
              <span>
                {formatLabel(result.format)} ·{" "}
                {formatFileSize(result.blob.size)} · saved
              </span>
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => downloadBlob(result.blob, result.name)}
              disabled={busy !== null}
            >
              <Download size={14} aria-hidden="true" />
              Download again
            </button>
          </div>
        )}

        {compressed && source && (
          <div
            className="converter-result converter-result--compressed"
            role="status"
            data-testid="compressor-result"
          >
            <Check size={18} aria-hidden="true" />
            <div className="converter-result__copy">
              <strong title={compressed.name}>{compressed.name}</strong>
              <span>
                {formatFileSize(source.file.size)} →{" "}
                {formatFileSize(compressed.blob.size)} ·{" "}
                {reductionPercent(source.file.size, compressed.blob.size)}%
                smaller
              </span>
              <span className="converter-result__detail">
                {formatLabel(compressed.format)} · quality{" "}
                {Math.round(compressed.quality * 100)}% ·{" "}
                {formatDimensions(compressed.width, compressed.height)} ·{" "}
                {compressed.attempts}{" "}
                {compressed.attempts === 1 ? "try" : "tries"}
                {compressed.hitTarget ? "" : " · best effort"}
              </span>
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => downloadBlob(compressed.blob, compressed.name)}
              disabled={busy !== null}
            >
              <Download size={14} aria-hidden="true" />
              Download again
            </button>
          </div>
        )}

        <div className="dialog__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={handleClose}
          >
            Close
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              if (actionIsRetry) retry();
              else if (mode === "convert") void convert();
              else void compress();
            }}
            disabled={actionDisabled}
            data-testid={
              mode === "convert" ? "converter-convert" : "compressor-compress"
            }
          >
            {busy === "converting" || busy === "compressing" ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : (
              <Download size={16} aria-hidden="true" />
            )}
            <span>
              {busy === "converting"
                ? "CONVERTING…"
                : busy === "compressing"
                  ? "COMPRESSING…"
                  : actionIsRetry
                    ? "TRY AGAIN"
                    : mode === "convert"
                      ? "CONVERT & DOWNLOAD"
                      : "COMPRESS & DOWNLOAD"}
            </span>
          </button>
        </div>

        <p className="dialog__privacy">
          <LockKeyhole size={12} aria-hidden="true" />
          Everything stays in this tab. No server uploads, no accounts, no
          damage.
        </p>
      </div>
    </div>
  );
}
