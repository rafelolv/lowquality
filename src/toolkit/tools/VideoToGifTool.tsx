import {
  Clapperboard,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type SyntheticEvent,
} from "react";
import { downloadBlob } from "../../lib/files";
import { formatFileSize } from "../../lib/imageLoader";
import { convertVideoToGif } from "../../lib/videoGifClient";
import {
  buildVideoGifName,
  detectVideoFormat,
  formatVideoTime,
  MAX_VIDEO_FILE_BYTES,
  MAX_VIDEO_GIF_DIMENSION,
  MAX_VIDEO_GIF_SECONDS,
  planVideoGif,
  VIDEO_ACCEPT,
  VIDEO_GIF_PRESETS,
  videoGifPreset,
  type VideoGifPreset,
  type VideoGifPlan,
} from "../../lib/videoGifPlan";

interface VideoMeta {
  width: number;
  height: number;
  duration: number;
}

interface VideoSettings {
  start: number;
  end: number;
  fps: number;
  width: number;
  speed: number;
  colors: number;
  reverse: boolean;
  loop: boolean;
}

interface VideoResult {
  blob: Blob;
  name: string;
  plan: VideoGifPlan;
}

const FPS_OPTIONS = [5, 8, 10, 12, 15, 20, 24, 30];
const COLOR_OPTIONS = [32, 64, 128, 256];
const SPEED_OPTIONS = [0.5, 1, 1.5, 2];
const WIDTH_OPTIONS = [240, 320, 400, 480, 640, 800];

export function VideoToGifTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewClipRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [settings, setSettings] = useState<VideoSettings | null>(null);
  const [preset, setPreset] = useState<VideoGifPreset | "custom">("balanced");
  const [result, setResult] = useState<VideoResult | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const formatInfo = file ? detectVideoFormat(file) : null;

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    if (!result) {
      setResultUrl("");
      return;
    }
    const next = URL.createObjectURL(result.blob);
    setResultUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !settings) return;
    const stopAtEnd = () => {
      if (previewClipRef.current && video.currentTime >= settings.end - 0.01) {
        video.pause();
        previewClipRef.current = false;
      }
    };
    const onPause = () => {
      previewClipRef.current = false;
    };
    video.addEventListener("timeupdate", stopAtEnd);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", stopAtEnd);
      video.removeEventListener("pause", onPause);
    };
  }, [url, settings?.end]);

  const selectFile = useCallback((next: File) => {
    abortRef.current?.abort();
    abortRef.current = null;
    previewClipRef.current = false;
    videoRef.current?.pause();
    const format = detectVideoFormat(next);
    setResult(null);
    setMeta(null);
    setSettings(null);
    setReady(false);
    setProgress(0);
    setStage("");
    if (!format.supported) {
      setFile(null);
      setLoading(false);
      setError(format.reason ?? "That video format is not supported.");
      return;
    }
    if (next.size === 0) {
      setFile(null);
      setLoading(false);
      setError("That file is empty. It may be a placeholder or corrupt.");
      return;
    }
    if (next.size > MAX_VIDEO_FILE_BYTES) {
      setFile(null);
      setLoading(false);
      setError(
        `Videos must be under ${formatFileSize(MAX_VIDEO_FILE_BYTES)}. This one is ${formatFileSize(next.size)}.`,
      );
      return;
    }
    setError("");
    setLoading(true);
    setFile(next);
  }, []);

  const openFilePicker = useCallback(() => {
    if (busy) return;
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }, [busy]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (next && !busy) selectFile(next);
  };

  function handleMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;
    if (
      width < 1 ||
      height < 1 ||
      !Number.isFinite(duration) ||
      duration + 1e-6 < 0.1
    ) {
      setLoading(false);
      setReady(false);
      setMeta(null);
      setSettings(null);
      setFile(null);
      setError(
        "This browser could not read the video dimensions or duration. Try re-exporting it as MP4 (H.264) or WebM.",
      );
      return;
    }
    const end = Math.min(duration, 10);
    const defaults = videoGifPreset("balanced", width, height, 0, end);
    setPreset("balanced");
    setMeta({ width, height, duration });
    setSettings({
      start: 0,
      end,
      ...defaults,
      speed: 1,
      reverse: false,
      loop: true,
    });
    setLoading(false);
  }

  function handleVideoError() {
    const label = formatInfo?.label ?? "this video";
    setLoading(false);
    setReady(false);
    setMeta(null);
    setSettings(null);
    setFile(null);
    setError(
      `This browser could not decode ${label}. Try MP4 (H.264) or WebM; AVI, WMV and MPEG need a desktop transcoder.`,
    );
  }

  const change = (patch: Partial<VideoSettings>) => {
    if (
      patch.fps !== undefined ||
      patch.width !== undefined ||
      patch.colors !== undefined
    )
      setPreset("custom");
    const adjusted =
      preset !== "custom" &&
      meta &&
      settings &&
      (patch.start !== undefined || patch.end !== undefined)
        ? {
            ...patch,
            ...videoGifPreset(
              preset,
              meta.width,
              meta.height,
              patch.start ?? settings.start,
              patch.end ?? settings.end,
            ),
          }
        : patch;
    previewClipRef.current = false;
    videoRef.current?.pause();
    setSettings((current) => (current ? { ...current, ...adjusted } : current));
    setResult(null);
  };

  const changeStart = (value: number) => {
    if (!settings || !meta) return;
    const maximum = Math.max(0, meta.duration - 0.1);
    const start = Math.min(Math.max(0, value), maximum);
    const end = Math.min(
      meta.duration,
      start + MAX_VIDEO_GIF_SECONDS,
      Math.max(settings.end, start + 0.1),
    );
    change({ start, end });
    if (ready && videoRef.current) {
      try {
        videoRef.current.currentTime = start;
      } catch {
        // Keep the current preview frame if seeking is unavailable.
      }
    }
  };

  const changeEnd = (value: number) => {
    if (!settings || !meta) return;
    const minimum = settings.start + 0.1;
    const maximum = Math.min(
      meta.duration,
      settings.start + MAX_VIDEO_GIF_SECONDS,
    );
    const end = Math.min(Math.max(minimum, value), maximum);
    change({ end });
    if (ready && videoRef.current) {
      try {
        videoRef.current.currentTime = end;
      } catch {
        // Keep the current preview frame if seeking is unavailable.
      }
    }
  };

  const planned = useMemo<{ plan: VideoGifPlan | null; error: string }>(() => {
    if (!meta || !settings) return { plan: null, error: "" };
    try {
      return {
        plan: planVideoGif({
          ...settings,
          sourceWidth: meta.width,
          sourceHeight: meta.height,
        }),
        error: "",
      };
    } catch (caught) {
      return {
        plan: null,
        error:
          caught instanceof Error
            ? caught.message
            : "The video settings cannot be encoded.",
      };
    }
  }, [meta, settings]);

  const widthOptions = useMemo(() => {
    if (!meta) return [];
    const maximum = Math.min(meta.width, MAX_VIDEO_GIF_DIMENSION);
    const values = WIDTH_OPTIONS.filter((value) => value <= maximum);
    if (settings?.width) values.push(settings.width);
    if (maximum >= 1) values.push(maximum);
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }, [meta, settings?.width]);

  const previewClip = () => {
    const video = videoRef.current;
    if (!video || !settings) return;
    previewClipRef.current = true;
    video.playbackRate = settings.speed;
    video.currentTime = settings.start;
    void video.play().catch(() => {
      previewClipRef.current = false;
    });
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setProgress(0);
    setStage("");
  };

  const clear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setMeta(null);
    setSettings(null);
    setResult(null);
    setReady(false);
    setLoading(false);
    setBusy(false);
    setProgress(0);
    setStage("");
    setError("");
    previewClipRef.current = false;
    setDragActive(false);
  };

  const run = async () => {
    if (
      !file ||
      !meta ||
      !settings ||
      !planned.plan ||
      !videoRef.current ||
      busy
    ) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setResult(null);
    setError("");
    setProgress(0);
    setStage("Warming up the frame grabber");
    videoRef.current.pause();
    try {
      const blob = await convertVideoToGif(videoRef.current, planned.plan, {
        start: settings.start,
        fps: settings.fps,
        colors: settings.colors,
        reverse: settings.reverse,
        loop: settings.loop,
        signal: controller.signal,
        onProgress: (value, nextStage) => {
          if (controller.signal.aborted || abortRef.current !== controller)
            return;
          setProgress(value);
          setStage(nextStage);
        },
      });
      if (controller.signal.aborted || abortRef.current !== controller) return;
      setResult({
        blob,
        name: buildVideoGifName(file.name),
        plan: planned.plan,
      });
      setProgress(100);
      setStage("GIF ready");
    } catch (caught) {
      if (controller.signal.aborted || abortRef.current !== controller) return;
      if (caught instanceof DOMException && caught.name === "AbortError")
        return;
      setError(
        caught instanceof Error
          ? caught.message
          : "The video could not be converted.",
      );
      setProgress(0);
      setStage("");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    if (!busy) setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    const next = event.dataTransfer.files[0];
    if (next && !busy) selectFile(next);
  };

  return (
    <div
      className={`video-tool${dragActive ? " video-tool--drag" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        id="video-file-input"
        type="file"
        className="visually-hidden"
        accept={VIDEO_ACCEPT}
        onChange={handleFileChange}
        aria-label="Video file"
        data-testid="video-file-input"
      />

      {!file ? (
        <div className="toolkit-stack">
          <label
            htmlFor="video-file-input"
            className={`panel toolkit-box video-dropzone${
              dragActive ? " video-dropzone--active" : ""
            }`}
          >
            <span className="dropzone__icon" aria-hidden="true">
              {loading ? (
                <Loader2 className="spin" size={28} />
              ) : (
                <UploadCloud size={28} />
              )}
            </span>
            <strong>
              {loading ? "Reading the video" : "Drop a video here"}
            </strong>
            <span>
              {loading
                ? "Preparing the local GIF encoder…"
                : "or click to browse. Stays in this tab."}
            </span>
            <span className="dropzone__formats">MP4 · WEBM · M4V · MOV</span>
          </label>
          <p className="video-hint video-hint--center">
            AVI, WMV and MPEG are listed in the picker but need a desktop
            transcoder; browsers do not decode them. Up to{" "}
            {formatFileSize(MAX_VIDEO_FILE_BYTES)}.
          </p>
        </div>
      ) : (
        <div className="toolkit-workspace">
          <div className="toolkit-stack">
            <div className="panel toolkit-box video-panel">
              {url && (
                <video
                  key={url}
                  ref={videoRef}
                  className="video-player"
                  src={url}
                  controls={!busy}
                  playsInline
                  preload="auto"
                  aria-label="Video preview"
                  onLoadedMetadata={handleMetadata}
                  onLoadedData={() => setReady(true)}
                  onCanPlay={() => setReady(true)}
                  onError={handleVideoError}
                />
              )}
              <div className="video-meta">
                <strong title={file.name}>{file.name}</strong>
                <span>
                  {formatInfo?.label ?? "VIDEO"}
                  {meta &&
                    ` · ${meta.width} × ${meta.height}px · ${formatVideoTime(meta.duration)}`}{" "}
                  · {formatFileSize(file.size)}
                </span>
              </div>
              <div className="video-actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={previewClip}
                  disabled={!ready || busy}
                >
                  <Play size={14} aria-hidden="true" />
                  Preview source clip
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={openFilePicker}
                  disabled={busy}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Replace
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={clear}
                  disabled={busy}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remove
                </button>
              </div>
              {loading && (
                <p className="video-loading" role="status">
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                  Reading video metadata…
                </p>
              )}
            </div>
            <div className="panel toolkit-box toolkit-stack">
              <h3>Trim, sample, encode.</h3>
              <p>
                Pick a segment, choose how many frames to sample and let the
                local encoder build the palette. Audio is intentionally left
                behind.
              </p>
              <p className="video-hint">
                Start with a preset, then adjust the clip and output settings.
                Higher FPS makes motion smoother; larger dimensions keep more
                detail. Both usually increase file size.
              </p>
            </div>
          </div>

          <fieldset
            className="panel toolkit-box toolkit-stack"
            disabled={!ready || busy}
          >
            <legend>GIF settings</legend>
            {meta && settings ? (
              <>
                <label className="field">
                  <span className="field__label">GIF preset</span>
                  <select
                    aria-label="GIF preset"
                    value={preset}
                    onChange={(event) => {
                      const next = event.currentTarget.value as
                        | VideoGifPreset
                        | "custom";
                      if (next !== "custom")
                        change(
                          videoGifPreset(
                            next,
                            meta.width,
                            meta.height,
                            settings.start,
                            settings.end,
                          ),
                        );
                      setPreset(next);
                    }}
                  >
                    {VIDEO_GIF_PRESETS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <p className="video-hint">
                  Smaller file uses fewer frames and colors. Smoother motion
                  keeps more frames. Presets adapt to your clip length.
                </p>
                <div className="video-trim">
                  <div className="video-range">
                    <div className="video-range__row">
                      <span className="field__label">Clip start</span>
                      <output>{formatVideoTime(settings.start)}</output>
                    </div>
                    <input
                      className="pixel-range"
                      type="range"
                      aria-label="Clip start"
                      min={0}
                      max={Math.max(0, meta.duration - 0.1)}
                      step={0.1}
                      value={settings.start}
                      onChange={(event) =>
                        changeStart(Number(event.currentTarget.value))
                      }
                    />
                  </div>
                  <div className="video-range">
                    <div className="video-range__row">
                      <span className="field__label">Clip end</span>
                      <output>{formatVideoTime(settings.end)}</output>
                    </div>
                    <input
                      className="pixel-range"
                      type="range"
                      aria-label="Clip end"
                      min={Math.min(meta.duration, settings.start + 0.1)}
                      max={Math.min(
                        meta.duration,
                        settings.start + MAX_VIDEO_GIF_SECONDS,
                      )}
                      step={0.1}
                      value={settings.end}
                      onChange={(event) =>
                        changeEnd(Number(event.currentTarget.value))
                      }
                    />
                  </div>
                  <div className="video-actions">
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() =>
                        change({
                          start: 0,
                          end: Math.min(meta.duration, MAX_VIDEO_GIF_SECONDS),
                        })
                      }
                    >
                      {meta.duration > MAX_VIDEO_GIF_SECONDS
                        ? `First ${MAX_VIDEO_GIF_SECONDS}s`
                        : "Full video"}
                    </button>
                    <span className="video-hint">
                      Clip {formatVideoTime(settings.end - settings.start)}
                    </span>
                  </div>
                </div>

                <div className="toolkit-fields">
                  <label className="field">
                    <span className="field__label">Frames per second</span>
                    <select
                      aria-label="Frames per second"
                      value={settings.fps}
                      onChange={(event) =>
                        change({ fps: Number(event.currentTarget.value) })
                      }
                    >
                      {Array.from(new Set([...FPS_OPTIONS, settings.fps]))
                        .sort((a, b) => a - b)
                        .map((fps) => (
                          <option key={fps} value={fps}>
                            {fps} FPS
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">GIF width</span>
                    <select
                      aria-label="GIF width"
                      value={settings.width}
                      onChange={(event) =>
                        change({ width: Number(event.currentTarget.value) })
                      }
                    >
                      {widthOptions.map((width) => (
                        <option key={width} value={width}>
                          {width}px
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="toolkit-fields">
                  <label className="field">
                    <span className="field__label">Playback speed</span>
                    <select
                      aria-label="Playback speed"
                      value={settings.speed}
                      onChange={(event) =>
                        change({ speed: Number(event.currentTarget.value) })
                      }
                    >
                      {SPEED_OPTIONS.map((speed) => (
                        <option key={speed} value={speed}>
                          {speed}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Palette colors</span>
                    <select
                      aria-label="Palette colors"
                      value={settings.colors}
                      onChange={(event) =>
                        change({ colors: Number(event.currentTarget.value) })
                      }
                    >
                      {COLOR_OPTIONS.map((colors) => (
                        <option key={colors} value={colors}>
                          {colors} colors
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="video-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.reverse}
                      onChange={(event) =>
                        change({ reverse: event.currentTarget.checked })
                      }
                    />
                    Reverse frames
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.loop}
                      onChange={(event) =>
                        change({ loop: event.currentTarget.checked })
                      }
                    />
                    Loop forever
                  </label>
                </div>

                {planned.plan && (
                  <div
                    className="video-plan"
                    role="group"
                    aria-label="GIF output plan"
                  >
                    <div>
                      <span>Output</span>
                      <strong>
                        {planned.plan.width} × {planned.plan.height}px
                      </strong>
                    </div>
                    <div>
                      <span>Frames</span>
                      <strong>{planned.plan.frameCount}</strong>
                    </div>
                    <div>
                      <span>Playback</span>
                      <strong>{formatVideoTime(planned.plan.duration)}</strong>
                    </div>
                    <div>
                      <span>Palette</span>
                      <strong>{planned.plan.colors} colors</strong>
                    </div>
                  </div>
                )}

                {planned.error && (
                  <p className="toolkit-error" role="alert">
                    {planned.error}
                  </p>
                )}

                <button
                  type="button"
                  className="button"
                  onClick={() => void run()}
                  disabled={!planned.plan || busy}
                >
                  <Clapperboard size={16} aria-hidden="true" />
                  Convert to GIF
                </button>
              </>
            ) : (
              <p className="video-hint">
                Pick a video first, then trim it and choose the sampling
                settings.
              </p>
            )}
          </fieldset>
        </div>
      )}

      {busy && (
        <div className="video-progress" role="status" aria-live="polite">
          <p>
            {stage || "Converting"} · {Math.round(progress)}%
          </p>
          <progress value={progress} max={100} />
          <button
            type="button"
            className="button button--ghost"
            onClick={cancel}
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="toolkit-error">
          {error}
        </p>
      )}

      {result && file && (
        <section
          className="panel toolkit-result"
          aria-label="GIF result"
          aria-live="polite"
        >
          <h3>Motion, packaged.</h3>
          <p>
            <strong>{result.name}</strong>
          </p>
          <p>
            {result.plan.width} × {result.plan.height}px ·{" "}
            {result.plan.frameCount} frames ·{" "}
            {formatVideoTime(result.plan.duration)} ·{" "}
            {formatFileSize(result.blob.size)}
          </p>
          <p>
            {formatInfo?.label ?? "Video"} input {formatFileSize(file.size)} ·
            encoded locally
          </p>
          {resultUrl && (
            <img
              src={resultUrl}
              alt="Converted GIF preview"
              className="toolkit-output"
            />
          )}
          <div className="video-actions">
            <button
              type="button"
              className="button"
              onClick={() => downloadBlob(result.blob, result.name)}
            >
              <Download size={16} aria-hidden="true" />
              Download GIF
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
