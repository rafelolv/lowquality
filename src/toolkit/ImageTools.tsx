import {
  Check,
  Download,
  FileImage,
  Loader2,
  RefreshCw,
  UploadCloud,
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

interface ImageToolsProps {
  mode: ToolMode;
}

interface SourceState {
  preview: Blob;
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

export function ImageTools({ mode }: ImageToolsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<DestroyWorkerClient | null>(null);
  const initJobRef = useRef<JobHandle<void> | null>(null);
  const exportJobRef = useRef<JobHandle<Blob> | null>(null);
  const compressJobRef = useRef<JobHandle<CompressStaticResult> | null>(null);
  const tokenRef = useRef(0);
  const operationRef = useRef(0);

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
  const dimensions = source
    ? dimensionOptions(source.width, source.height)
    : [];
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
    operationRef.current += 1;
    initJobRef.current?.cancel();
    initJobRef.current = null;
    exportJobRef.current?.cancel();
    exportJobRef.current = null;
    compressJobRef.current?.cancel();
    compressJobRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
  }, []);

  useEffect(() => () => disposeWorker(), [disposeWorker]);

  // Keep decoded source between these routes; cancel only the outgoing job.
  useEffect(() => {
    operationRef.current += 1;
    exportJobRef.current?.cancel();
    compressJobRef.current?.cancel();
    setBusy((current) => (current === "loading" ? current : null));
    setResult(null);
    setCompressed(null);
    setError(null);
  }, [mode]);

  const [sourceUrl, setSourceUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const outputBlob = result?.blob ?? compressed?.blob;
  useEffect(() => {
    if (!source) {
      setSourceUrl("");
      return;
    }
    const url = URL.createObjectURL(source.preview);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  useEffect(() => {
    setShowOriginal(false);
    if (!outputBlob) {
      setResultUrl("");
      return;
    }
    const url = URL.createObjectURL(outputBlob);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [outputBlob]);

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
        // Preview decoded pixels so SVG references never enter an <img>.
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare image preview.");
        context.drawImage(image.bitmap, 0, 0);
        const preview = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(new Error("Could not prepare image preview.")),
            "image/png",
          ),
        );
        if (token !== tokenRef.current) {
          image.bitmap.close();
          return;
        }
        setSource({
          preview,
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
    const operation = ++operationRef.current;
    const route = window.location.hash;
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
          if (
            token !== tokenRef.current ||
            operation !== operationRef.current ||
            window.location.hash !== route
          )
            return;
          setProgress(update.progress);
          setStage(update.stage);
        },
      );
      exportJobRef.current = job;
      const blob = await job.promise;
      if (
        token !== tokenRef.current ||
        operation !== operationRef.current ||
        window.location.hash !== route
      )
        return;

      const name = buildConvertedName(source.file.name, format);
      downloadBlob(blob, name);
      setResult({ blob, name, format });
      setBusy(null);
      setProgress(100);
      setStage("Converted");
    } catch (caught) {
      if (
        token !== tokenRef.current ||
        operation !== operationRef.current ||
        window.location.hash !== route ||
        caught instanceof WorkerJobCancelled
      ) {
        return;
      }
      setBusy(null);
      setProgress(0);
      setStage("");
      setError(errorMessage(caught));
    } finally {
      if (
        token === tokenRef.current &&
        operation === operationRef.current &&
        window.location.hash === route
      )
        exportJobRef.current = null;
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
    const operation = ++operationRef.current;
    const route = window.location.hash;
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
          if (
            token !== tokenRef.current ||
            operation !== operationRef.current ||
            window.location.hash !== route
          )
            return;
          setProgress(update.progress);
          setStage(update.stage);
        },
      );
      compressJobRef.current = job;
      const output = await job.promise;
      if (
        token !== tokenRef.current ||
        operation !== operationRef.current ||
        window.location.hash !== route
      )
        return;

      const name = buildCompressedName(source.file.name, compressFormat);
      downloadBlob(output.blob, name);
      setCompressed({ ...output, name, format: compressFormat });
      setBusy(null);
      setProgress(100);
      setStage("Compressed");
    } catch (caught) {
      if (
        token !== tokenRef.current ||
        operation !== operationRef.current ||
        window.location.hash !== route ||
        caught instanceof WorkerJobCancelled
      ) {
        return;
      }
      setBusy(null);
      setProgress(0);
      setStage("");
      setError(errorMessage(caught));
    } finally {
      if (
        token === tokenRef.current &&
        operation === operationRef.current &&
        window.location.hash === route
      )
        compressJobRef.current = null;
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
    (mode === "compress" && (customTargetInvalid || !targetBytes));
  const actionIsRetry = Boolean(source && !ready && error);

  return (
    <div className="image-tools toolkit-workspace" data-testid="image-tools">
      <div className="toolkit-stack">
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

        <section className="toolkit-preview" aria-label="Image preview">
          <div className="toolkit-preview__bar">
            <span className="field__label">
              {resultUrl && !showOriginal ? "Result" : "Original"}
            </span>
            {resultUrl && (
              <div
                className="toolkit-preview__switch"
                role="group"
                aria-label="Preview comparison"
              >
                <button
                  type="button"
                  aria-pressed={showOriginal}
                  onClick={() => setShowOriginal(true)}
                >
                  Original
                </button>
                <button
                  type="button"
                  aria-pressed={!showOriginal}
                  onClick={() => setShowOriginal(false)}
                >
                  Result
                </button>
              </div>
            )}
          </div>
          <div className="toolkit-preview__canvas">
            {sourceUrl ? (
              <img
                src={resultUrl && !showOriginal ? resultUrl : sourceUrl}
                alt={
                  resultUrl && !showOriginal
                    ? "Processed result"
                    : "Original image"
                }
              />
            ) : (
              <div className="toolkit-preview__empty">
                <FileImage size={44} aria-hidden="true" />
                <h3>Your pixels go here.</h3>
                <p>Choose an image. Preview the change. Keep what works.</p>
              </div>
            )}
          </div>
          {source && (
            <p className="toolkit-preview__caption">
              {formatDimensions(source.width, source.height)} · Original{" "}
              {formatFileSize(source.file.size)}
              {outputBlob ? ` · Result ${formatFileSize(outputBlob.size)}` : ""}
            </p>
          )}
        </section>
      </div>
      <div className="panel toolkit-box toolkit-stack image-tools__settings">
        <div className="toolkit-settings-heading">
          <span className="eyebrow">Make it yours</span>
          <h3>
            {mode === "convert"
              ? "Choose your format."
              : "Less file. More freedom."}
          </h3>
          <p>
            {mode === "convert"
              ? "PNG keeps every pixel. JPG and WebP trade some detail for smaller files."
              : "Set your size budget. We search for the best quality that fits."}
          </p>
        </div>
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
                    <span className="converter-format__label">
                      {item.label}
                    </span>
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
                      <span className="converter-format__note">
                        {item.note}
                      </span>
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
                        {formatFileSize(target.bytes)}
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

        {compressed && !compressed.hitTarget && (
          <p className="converter-hint">
            Target not reached at this quality floor. This is the smallest
            result found. Try a larger target or lower the minimum quality.
          </p>
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

        <div className="toolkit-actions">
          {(busy === "converting" || busy === "compressing") && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                operationRef.current += 1;
                exportJobRef.current?.cancel();
                compressJobRef.current?.cancel();
                setBusy(null);
                setProgress(0);
                setStage("");
              }}
            >
              Cancel
            </button>
          )}
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
      </div>
    </div>
  );
}
