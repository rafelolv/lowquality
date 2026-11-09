import {
  Check,
  Download,
  FileImage,
  Heart,
  Loader2,
  LockKeyhole,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { ExportFormat } from "../types";
import { DEFAULT_ENABLED_EFFECTS, NEUTRAL_SETTINGS } from "../lib/presets";
import {
  decodeStaticImage,
  formatDimensions,
  formatFileSize,
  validateStaticFile,
} from "../lib/imageLoader";
import { buildConvertedName, downloadBlob } from "../lib/files";
import {
  DestroyWorkerClient,
  WorkerJobCancelled,
  type JobHandle,
  type JobProgress,
} from "../lib/workerClient";

type ConvertFormat = Exclude<ExportFormat, "gif">;

interface ConverterDialogProps {
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

const FORMATS: Array<{ id: ConvertFormat; label: string; note: string }> = [
  { id: "png", label: "PNG", note: "Lossless, keeps alpha" },
  { id: "jpeg", label: "JPG", note: "Smaller, white matte" },
  { id: "webp", label: "WebP", note: "Small and modern" },
];

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/avif,image/bmp,image/svg+xml,image/x-icon,.jpg,.jpeg,.jfif,.png,.webp,.avif,.bmp,.svg,.ico";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The converter hit an unexpected pixel problem.";
}

function formatLabel(format: ConvertFormat): string {
  return FORMATS.find((item) => item.id === format)?.label ?? format;
}

export function ConverterDialog({ onClose }: ConverterDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const clientRef = useRef<DestroyWorkerClient | null>(null);
  const initJobRef = useRef<JobHandle<void> | null>(null);
  const exportJobRef = useRef<JobHandle<Blob> | null>(null);
  const tokenRef = useRef(0);

  const [source, setSource] = useState<SourceState | null>(null);
  const [format, setFormat] = useState<ConvertFormat>("png");
  const [busy, setBusy] = useState<"loading" | "converting" | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertedResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const disposeWorker = useCallback(() => {
    tokenRef.current += 1;
    initJobRef.current?.cancel();
    initJobRef.current = null;
    exportJobRef.current?.cancel();
    exportJobRef.current = null;
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
            "Animated GIFs need the main editor, where every frame survives. This converter is stills only.",
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
        setStage("Ready to convert");
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

  const actionDisabled = !source || busy !== null || (!ready && error === null);
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
          aria-label="Close converter"
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
        <p className="eyebrow">A secret act of mercy</p>
        <h2 id="converter-title">Just convert it.</h2>
        <p id="converter-desc" className="dialog__lede">
          No destruction, no noise, no character-building artifacts. Pick an
          image, choose a format, and keep the pixels you came with.
        </p>

        <input
          ref={inputRef}
          id="converter-file-input"
          type="file"
          className="visually-hidden"
          accept={ACCEPT}
          onChange={handleFileChange}
          disabled={busy !== null}
          aria-label="Choose an image to convert"
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
                ? "Preparing the local converter…"
                : "or click to browse. Stills only."}
            </span>
            <span className="dropzone__formats">
              JPG · PNG · WEBP · AVIF · BMP · SVG
            </span>
          </label>
        )}

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
                (busy === "loading" ? "Reading the image" : "Converting")}
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
              else void convert();
            }}
            disabled={actionDisabled}
            data-testid="converter-convert"
          >
            {busy === "converting" ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : (
              <Download size={16} aria-hidden="true" />
            )}
            <span>
              {busy === "converting"
                ? "CONVERTING…"
                : actionIsRetry
                  ? "TRY AGAIN"
                  : "CONVERT & DOWNLOAD"}
            </span>
          </button>
        </div>

        <p className="dialog__privacy">
          <LockKeyhole size={12} aria-hidden="true" />
          Everything stays in this tab. No uploads, no accounts, no damage.
        </p>
      </div>
    </div>
  );
}
