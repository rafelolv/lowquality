import { ToolboxPage } from "./toolkit/ToolboxPage";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { AlertTriangle } from "lucide-react";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { UploadCard } from "./components/UploadCard";
import { QualitySlider } from "./components/QualitySlider";
import { PresetGrid } from "./components/PresetGrid";
import { AdvancedControls } from "./components/AdvancedControls";
import { TextPanel } from "./components/TextPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { EmptyState } from "./components/EmptyState";
import { ExportBar } from "./components/ExportBar";
import { ConverterDialog } from "./components/ConverterDialog";
import { ToolsSection } from "./components/ToolsSection";
import { HowItWorks } from "./components/HowItWorks";
import { About } from "./components/About";
import { ToastStack } from "./components/ToastStack";
import {
  GifScaleDialog,
  type GifScalePending,
} from "./components/GifScaleDialog";
import type {
  DegradationSettings,
  EffectKey,
  ExportFormat,
  GifSession,
  ImageSession,
  NoticeMessage,
  PreviewResult,
  PresetId,
  SettingsOverrides,
  StaticSession,
  TextLayer,
  ToolMode,
  ViewMode,
} from "./types";
import {
  INITIAL_PRESET_ID,
  INITIAL_QUALITY,
  getPreset,
  resolveEnabled,
  resolveSettings,
} from "./lib/presets";
import {
  MAX_GIF_FILE_BYTES,
  MAX_GIF_FRAMES,
  requiredGifLoadScale,
} from "./lib/constants";
import {
  buildDownloadName,
  checkBrowserSupport,
  copyBlobToClipboard,
  downloadBlob,
  supportsClipboardImages,
} from "./lib/files";
import {
  decodeStaticImage,
  fetchSampleImage,
  formatFileSize,
  isGifFile,
  isHeicFile,
  validateStaticFile,
} from "./lib/imageLoader";
import { probeGif } from "./lib/gifProbe";
import {
  createDefaultTextLayer,
  measureTextLayers,
  renderTextOverlay,
} from "./lib/text";
import {
  DestroyWorkerClient,
  WorkerJobCancelled,
  WorkerJobError,
  type JobHandle,
  type JobProgress,
} from "./lib/workerClient";
import { useFontsReady } from "./hooks/useFontsReady";

const MAX_TEXT_LAYERS = 3;
const COPY_SUPPORTED = supportsClipboardImages();

interface LoadingState {
  label: string;
  progress: number;
}

function disposePreview(result: PreviewResult | null): void {
  if (!result) return;
  for (const frame of result.frames) frame.bitmap.close();
}

function disposeSession(session: ImageSession | null): void {
  if (!session) return;
  if (session.kind === "static") {
    session.originalBitmap.close();
  } else {
    URL.revokeObjectURL(session.originalUrl);
  }
}

function sessionId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof WorkerJobError || error instanceof Error)
    return error.message;
  return "Something went wrong while destroying the pixels.";
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const isToolbox = hash === "#toolbox" || hash.startsWith("#toolbox/");
  const support = useMemo(() => checkBrowserSupport(), []);
  const fontsReady = useFontsReady();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<DestroyWorkerClient | null>(null);
  const previewJobRef = useRef<JobHandle<unknown> | null>(null);
  const loadJobRef = useRef<JobHandle<unknown> | null>(null);
  const exportJobRef = useRef<JobHandle<Blob> | null>(null);
  const previewRef = useRef<PreviewResult | null>(null);
  const sessionRef = useRef<ImageSession | null>(null);
  const loadTokenRef = useRef(0);
  const exportTokenRef = useRef(0);
  const dragDepthRef = useRef(0);
  const overlayRevisionRef = useRef(0);
  const noticeIdRef = useRef(0);
  const handleFileRef = useRef<(file: File) => void>(() => {});

  const [workerReady, setWorkerReady] = useState(false);
  const [workerFailed, setWorkerFailed] = useState(false);
  const [session, setSession] = useState<ImageSession | null>(null);
  const [loading, setLoading] = useState<LoadingState | null>(null);
  const [gifScalePending, setGifScalePending] =
    useState<GifScalePending | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [quality, setQuality] = useState(INITIAL_QUALITY);
  const [presetId, setPresetId] = useState<PresetId>(INITIAL_PRESET_ID);
  const [overrides, setOverrides] = useState<SettingsOverrides>({});
  const [disabledEffects, setDisabledEffects] = useState<Set<EffectKey>>(
    () => new Set(),
  );

  const [textEnabled, setTextEnabled] = useState(false);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewStage, setPreviewStage] = useState("");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("result");

  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exporting, setExporting] = useState(false);
  const [exportAction, setExportAction] = useState<"download" | "copy" | null>(
    null,
  );
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState("");

  const [notices, setNotices] = useState<NoticeMessage[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode | null>(null);

  const settings = useMemo(
    () => resolveSettings(quality, presetId, overrides),
    [quality, presetId, overrides],
  );
  const enabled = useMemo(
    () => resolveEnabled(disabledEffects),
    [disabledEffects],
  );

  const textRects = useMemo(() => {
    if (!session || !textEnabled || !fontsReady) return [];
    return measureTextLayers(textLayers, session.width, session.height, true);
  }, [session, textEnabled, textLayers, fontsReady]);

  const pushNotice = useCallback(
    (kind: NoticeMessage["kind"], message: string) => {
      noticeIdRef.current += 1;
      const notice: NoticeMessage = {
        id: noticeIdRef.current,
        kind,
        message,
      };
      setNotices((previous) => [...previous, notice].slice(-4));
    },
    [],
  );

  const dismissNotice = useCallback((id: number) => {
    setNotices((previous) => previous.filter((notice) => notice.id !== id));
  }, []);

  const openConverter = useCallback(() => setToolMode("convert"), []);
  const openCompressor = useCallback(() => setToolMode("compress"), []);
  const openTool = useCallback((mode: ToolMode) => setToolMode(mode), []);
  const closeTool = useCallback(() => setToolMode(null), []);

  const replacePreview = useCallback((next: PreviewResult | null) => {
    const previous = previewRef.current;
    previewRef.current = next;
    setPreview(next);
    if (previous) disposePreview(previous);
  }, []);

  // Create the worker once. StrictMode may mount twice in development; the cleanup
  // terminates the first worker cleanly.
  useEffect(() => {
    if (!support.supported) return;
    let client: DestroyWorkerClient;
    try {
      client = new DestroyWorkerClient();
    } catch {
      setWorkerFailed(true);
      return;
    }
    workerRef.current = client;
    setWorkerReady(true);
    return () => {
      workerRef.current = null;
      setWorkerReady(false);
      client.dispose();
    };
  }, [support.supported]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Release source pixels when a session is replaced or the app unmounts.
  useEffect(() => {
    return () => {
      disposeSession(session);
    };
  }, [session]);

  useEffect(() => {
    return () => {
      disposePreview(previewRef.current);
    };
  }, []);

  // Clear stale preview state when switching sources.
  useEffect(() => {
    previewJobRef.current?.cancel();
    previewJobRef.current = null;
    replacePreview(null);
    setPreviewBusy(false);
    setPreviewProgress(0);
    setPreviewStage("");
    setOverlayId(null);
    setViewMode("result");
    if (session) {
      setExportFormat(session.kind === "gif" ? "gif" : "png");
      // The landing content collapses after upload. Re-anchor the workspace so
      // the old upload-button scroll position does not hide the new preview.
      const target = window.matchMedia("(max-width: 1024px)").matches
        ? document.querySelector<HTMLElement>(".editor-studio")
        : document.getElementById("editor");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start", behavior: "instant" });
    }
    // replacePreview is stable; session identity is intentionally the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId]);

  // Text is rasterised on the main thread and sent to the worker before previews.
  useEffect(() => {
    if (!session || !fontsReady || !workerRef.current) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || !workerRef.current) return;
      overlayRevisionRef.current += 1;
      const revision = `overlay-${session.sessionId}-${overlayRevisionRef.current}`;
      try {
        const overlay = renderTextOverlay(
          textEnabled ? textLayers : [],
          textEnabled,
          session.width,
          session.height,
          revision,
        );
        workerRef.current.setOverlay(overlay);
        if (!cancelled) setOverlayId(overlay ? overlay.revision : "none");
      } catch (error) {
        if (!cancelled) {
          pushNotice("error", `Text overlay failed: ${errorMessage(error)}`);
          setOverlayId("none");
        }
      }
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session, textEnabled, textLayers, fontsReady, pushNotice]);

  // Debounced preview pipeline. A new settings value supersedes the old preview.
  useEffect(() => {
    if (!session || overlayId === null || !workerReady || !workerRef.current)
      return;
    const client = workerRef.current;
    let cancelled = false;
    let job: JobHandle<unknown> | null = null;
    const delay = session.kind === "gif" ? 320 : 150;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setPreviewBusy(true);
      setPreviewProgress(0);
      setPreviewStage("Warming up the degrader");

      const onProgress = (progress: JobProgress) => {
        if (cancelled) return;
        setPreviewProgress(progress.progress);
        setPreviewStage(progress.stage);
      };

      const finish = (result: PreviewResult) => {
        if (cancelled || sessionRef.current?.sessionId !== session.sessionId) {
          disposePreview(result);
          return;
        }
        replacePreview(result);
        setPreviewBusy(false);
        setPreviewProgress(100);
        setPreviewStage("Preview ready");
      };

      const fail = (error: unknown) => {
        if (cancelled || error instanceof WorkerJobCancelled) return;
        setPreviewBusy(false);
        if (error instanceof WorkerJobError && error.code === "cancelled")
          return;
        pushNotice("error", errorMessage(error));
      };

      if (session.kind === "static") {
        const handle = client.previewStatic(
          {
            overlayId,
            settings,
            enabled,
            maxDimension: 1400,
          },
          onProgress,
        );
        job = handle;
        previewJobRef.current = handle;
        handle.promise
          .then((result) => {
            finish({
              kind: "static",
              width: result.width,
              height: result.height,
              frames: [{ bitmap: result.bitmap, delay: 0 }],
              revision: Date.now(),
            });
          })
          .catch(fail)
          .finally(() => {
            if (previewJobRef.current === handle) previewJobRef.current = null;
          });
      } else {
        const handle = client.previewGif(
          {
            overlayId,
            settings,
            enabled,
            maxDimension: 900,
            pixelBudget: 14_000_000,
          },
          onProgress,
        );
        job = handle;
        previewJobRef.current = handle;
        handle.promise
          .then((result) => {
            finish({
              kind: "gif",
              width: result.width,
              height: result.height,
              frames: result.frames,
              revision: Date.now(),
            });
          })
          .catch(fail)
          .finally(() => {
            if (previewJobRef.current === handle) previewJobRef.current = null;
          });
      }
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (job) {
        job.cancel();
        if (previewJobRef.current === job) previewJobRef.current = null;
      }
    };
  }, [
    session,
    overlayId,
    workerReady,
    settings,
    enabled,
    previewNonce,
    replacePreview,
    pushNotice,
  ]);

  const cancelExport = useCallback(() => {
    exportTokenRef.current += 1;
    exportJobRef.current?.cancel();
    exportJobRef.current = null;
    setExporting(false);
    setExportAction(null);
    setExportProgress(0);
    setExportStage("");
  }, []);

  const cancelPreviewWork = useCallback(() => {
    previewJobRef.current?.cancel();
    previewJobRef.current = null;
    setPreviewBusy(false);
    setPreviewProgress(0);
    setPreviewStage("");
  }, []);

  const cancelLoadWork = useCallback(() => {
    loadJobRef.current?.cancel();
    loadJobRef.current = null;
  }, []);

  const commitStaticSession = useCallback(
    (
      file: File,
      format: string,
      decoded: Awaited<ReturnType<typeof decodeStaticImage>>,
    ) => {
      const next: StaticSession = {
        kind: "static",
        sessionId: sessionId("static"),
        name: file.name,
        type: file.type,
        size: file.size,
        format,
        width: decoded.width,
        height: decoded.height,
        hasAlpha: decoded.hasAlpha,
        originalBitmap: decoded.bitmap,
      };
      setOverlayId(null);
      setSession(next);
    },
    [],
  );

  const startStaticLoad = useCallback(
    async (file: File, token: number) => {
      setLoading({ label: "Reading the image", progress: 6 });
      let decoded: Awaited<ReturnType<typeof decodeStaticImage>> | null = null;
      try {
        const formatInfo = validateStaticFile(file);
        decoded = await decodeStaticImage(file);
        if (token !== loadTokenRef.current) {
          decoded.bitmap.close();
          return;
        }
        if (!workerRef.current)
          throw new Error("The local processor is not ready yet.");
        setLoading({ label: "Handing pixels to the worker", progress: 38 });
        const pixels = new Uint8ClampedArray(decoded.pixels);
        const job = workerRef.current.initStatic(
          decoded.width,
          decoded.height,
          pixels.buffer,
          (progress) => {
            if (token !== loadTokenRef.current) return;
            setLoading({
              label: progress.stage || "Preparing source",
              progress: Math.max(38, progress.progress),
            });
          },
        );
        loadJobRef.current = job;
        await job.promise;
        if (token !== loadTokenRef.current) {
          decoded.bitmap.close();
          return;
        }
        setLoading({ label: "Ready to ruin", progress: 100 });
        commitStaticSession(file, formatInfo.format, decoded);
      } catch (error) {
        if (decoded) decoded.bitmap.close();
        if (token === loadTokenRef.current) {
          pushNotice("error", errorMessage(error));
          setPreviewNonce((value) => value + 1);
        }
      } finally {
        if (token === loadTokenRef.current) {
          loadJobRef.current = null;
          setLoading(null);
        }
      }
    },
    [commitStaticSession, pushNotice],
  );

  const startGifLoad = useCallback(
    async (file: File, buffer: ArrayBuffer, scale: number, token: number) => {
      if (!workerRef.current) {
        pushNotice(
          "error",
          "The local processor is not ready yet. Try again in a moment.",
        );
        setLoading(null);
        return;
      }
      setLoading({ label: "Reading animated GIF", progress: 2 });
      try {
        const job = workerRef.current.decodeGif(buffer, scale, (progress) => {
          if (token !== loadTokenRef.current) return;
          setLoading({
            label: progress.stage || "Decoding GIF",
            progress: Math.max(2, progress.progress),
          });
        });
        loadJobRef.current = job;
        const meta = await job.promise;
        if (token !== loadTokenRef.current) return;

        const next: GifSession = {
          kind: "gif",
          sessionId: sessionId("gif"),
          name: file.name,
          type: file.type,
          size: file.size,
          format: "GIF",
          width: meta.width,
          height: meta.height,
          sourceWidth: meta.sourceWidth,
          sourceHeight: meta.sourceHeight,
          frameCount: meta.frameCount,
          durationMs: meta.durationMs,
          delays: meta.delays,
          loopCount: meta.loopCount,
          wasScaled: meta.wasScaled,
          originalUrl: URL.createObjectURL(file),
        };
        setOverlayId(null);
        setSession(next);
        setViewMode("result");
      } catch (error) {
        if (
          token === loadTokenRef.current &&
          !(error instanceof WorkerJobCancelled)
        ) {
          pushNotice("error", errorMessage(error));
          setPreviewNonce((value) => value + 1);
        }
      } finally {
        if (token === loadTokenRef.current) {
          loadJobRef.current = null;
          setLoading(null);
        }
      }
    },
    [pushNotice],
  );

  const handleFile = useCallback(
    async (file: File) => {
      dragDepthRef.current = 0;
      setDragActive(false);
      setGifScalePending(null);
      const token = loadTokenRef.current + 1;
      loadTokenRef.current = token;
      cancelLoadWork();
      setLoading(null);

      if (!support.supported) {
        pushNotice("error", support.reason);
        return;
      }
      if (workerFailed) {
        pushNotice(
          "error",
          "The local worker could not start. Try reloading the page in a modern browser.",
        );
        return;
      }
      if (file.size === 0) {
        pushNotice(
          "error",
          "That file is empty. It may be a placeholder or corrupt.",
        );
        return;
      }

      if (isHeicFile(file)) {
        pushNotice(
          "error",
          "HEIC/HEIF is not supported by this browser. Export the photo as JPEG or PNG first.",
        );
        return;
      }

      if (isGifFile(file)) {
        if (file.size > MAX_GIF_FILE_BYTES) {
          pushNotice(
            "error",
            `This GIF is ${formatFileSize(file.size)}. The safe limit is ${formatFileSize(
              MAX_GIF_FILE_BYTES,
            )}.`,
          );
          return;
        }
        setLoading({ label: "Inspecting GIF structure", progress: 2 });
        let buffer: ArrayBuffer;
        try {
          buffer = await file.arrayBuffer();
        } catch {
          if (token === loadTokenRef.current) {
            pushNotice("error", "That GIF could not be read from disk.");
            setLoading(null);
          }
          return;
        }
        if (token !== loadTokenRef.current) return;

        let probe;
        try {
          probe = probeGif(buffer);
        } catch (error) {
          if (token === loadTokenRef.current) {
            pushNotice("error", errorMessage(error));
            setLoading(null);
          }
          return;
        }
        if (probe.frameCount > MAX_GIF_FRAMES) {
          pushNotice(
            "error",
            `This animation has ${probe.frameCount} frames. LowQuality can safely handle ${MAX_GIF_FRAMES}.`,
          );
          setLoading(null);
          return;
        }
        const requiredScale = requiredGifLoadScale(
          probe.width,
          probe.height,
          probe.frameCount,
        );
        if (requiredScale < 0.999) {
          setLoading(null);
          setGifScalePending({
            file,
            buffer,
            probe,
            requiredScale,
          });
          return;
        }
        cancelPreviewWork();
        cancelExport();
        await startGifLoad(file, buffer, 1, token);
        return;
      }

      cancelPreviewWork();
      cancelExport();
      await startStaticLoad(file, token);
    },
    [
      cancelExport,
      cancelLoadWork,
      cancelPreviewWork,
      pushNotice,
      startGifLoad,
      startStaticLoad,
      support.reason,
      support.supported,
      workerFailed,
    ],
  );

  useEffect(() => {
    handleFileRef.current = (file: File) => {
      void handleFile(file);
    };
  }, [handleFile]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isToolbox) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      handleFileRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isToolbox]);

  const openFilePicker = useCallback(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }, []);

  const handleTrySample = useCallback(async () => {
    const token = loadTokenRef.current;
    setLoading({ label: "Fetching the locally bundled sample", progress: 2 });
    try {
      const file = await fetchSampleImage();
      if (loadTokenRef.current !== token) return;
      await handleFile(file);
    } catch (error) {
      if (loadTokenRef.current === token) {
        setLoading(null);
        pushNotice("error", errorMessage(error));
      }
    }
  }, [handleFile, pushNotice]);

  const handleReset = useCallback(() => {
    loadTokenRef.current += 1;
    cancelLoadWork();
    cancelPreviewWork();
    cancelExport();
    const worker = workerRef.current;
    if (worker) void worker.reset().promise.catch(() => undefined);
    replacePreview(null);
    setSession(null);
    setGifScalePending(null);
    setLoading(null);
    setQuality(INITIAL_QUALITY);
    setPresetId(INITIAL_PRESET_ID);
    setOverrides({});
    setDisabledEffects(new Set());
    setTextEnabled(false);
    setTextLayers([]);
    setSelectedTextId(null);
    setOverlayId(null);
    setViewMode("result");
    setExportFormat("png");
    setExporting(false);
    setExportAction(null);
    setExportProgress(0);
    setExportStage("");
    setDragActive(false);
  }, [cancelExport, cancelLoadWork, cancelPreviewWork, replacePreview]);

  const handleResetEdits = useCallback(() => {
    cancelExport();
    cancelPreviewWork();
    setQuality(0);
    setPresetId("original");
    setOverrides({});
    setDisabledEffects(new Set());
    setTextEnabled(false);
    setTextLayers([]);
    setSelectedTextId(null);
    setPreviewNonce((value) => value + 1);
  }, [cancelExport, cancelPreviewWork]);

  const handlePresetSelect = useCallback((id: PresetId) => {
    const preset = getPreset(id);
    setPresetId(id);
    setQuality(preset.defaultQuality);
    setOverrides({});
    setDisabledEffects(new Set());
  }, []);

  const handleOverride = useCallback(
    <K extends keyof DegradationSettings>(
      key: K,
      value: DegradationSettings[K],
    ) => {
      setOverrides((previous) => ({ ...previous, [key]: value }));
    },
    [],
  );

  const handleEffectEnabledChange = useCallback(
    (key: EffectKey, nextEnabled: boolean) => {
      setDisabledEffects((previous) => {
        const next = new Set(previous);
        if (nextEnabled) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );

  const resetAdvanced = useCallback(() => {
    setOverrides({});
    setDisabledEffects(new Set());
  }, []);

  const addTextLayer = useCallback(() => {
    setTextLayers((previous) => {
      if (previous.length >= MAX_TEXT_LAYERS) return previous;
      const id = `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const layer = createDefaultTextLayer(id);
      setSelectedTextId(id);
      setTextEnabled(true);
      return [...previous, layer];
    });
  }, []);

  const handleToggleText = useCallback(
    (nextEnabled: boolean) => {
      setTextEnabled(nextEnabled);
      if (nextEnabled && textLayers.length === 0) {
        addTextLayer();
      }
    },
    [addTextLayer, textLayers.length],
  );

  const handleChangeTextLayer = useCallback(
    (id: string, patch: Partial<TextLayer>) => {
      setTextLayers((previous) =>
        previous.map((layer) =>
          layer.id === id ? { ...layer, ...patch } : layer,
        ),
      );
    },
    [],
  );

  const handleDuplicateTextLayer = useCallback(
    (id: string) => {
      if (textLayers.length >= MAX_TEXT_LAYERS) return;
      const source = textLayers.find((layer) => layer.id === id);
      if (!source) return;
      const duplicate = {
        ...source,
        id: sessionId("text"),
        x: Math.min(1, source.x + 0.04),
        y: Math.min(1, source.y + 0.04),
      };
      setTextLayers((previous) => [...previous, duplicate]);
      setSelectedTextId(duplicate.id);
    },
    [textLayers],
  );

  const handleRemoveTextLayer = useCallback(
    (id: string) => {
      const remaining = textLayers.filter((layer) => layer.id !== id);
      setTextLayers(remaining);
      if (selectedTextId === id) {
        setSelectedTextId(remaining[0]?.id ?? null);
      }
    },
    [selectedTextId, textLayers],
  );

  const handleMoveText = useCallback(
    (id: string, x: number, y: number) => {
      handleChangeTextLayer(id, { x, y });
    },
    [handleChangeTextLayer],
  );

  const runExport = useCallback(
    async (action: "download" | "copy") => {
      if (!session || !workerRef.current || overlayId === null || exporting)
        return;
      const client = workerRef.current;
      const format: ExportFormat = action === "copy" ? "png" : exportFormat;
      if (session.kind === "static" && format === "gif") return;

      const token = ++exportTokenRef.current;
      setExporting(true);
      setExportAction(action);
      setExportProgress(0);
      setExportStage(
        action === "copy" ? "Preparing clipboard" : "Warming up the exporter",
      );

      const onProgress = (progress: JobProgress) => {
        if (token !== exportTokenRef.current) return;
        setExportProgress(progress.progress);
        setExportStage(progress.stage);
      };

      try {
        // Capture current editable text synchronously. The debounced preview may
        // still contain the previous text when Download is clicked immediately.
        const overlay = renderTextOverlay(
          textLayers,
          textEnabled,
          session.width,
          session.height,
          sessionId("export-overlay"),
        );
        client.setOverlay(overlay);
        const exportOverlayId = overlay?.revision ?? "none";
        let job: JobHandle<Blob>;
        if (session.kind === "static") {
          if (format === "gif") return;
          job = client.exportStatic(
            {
              overlayId: exportOverlayId,
              settings,
              enabled,
              format,
            },
            onProgress,
          );
        } else if (format === "gif") {
          job = client.exportGif(
            {
              overlayId: exportOverlayId,
              settings,
              enabled,
              outputScale: 1,
            },
            onProgress,
          );
        } else {
          job = client.exportGifStill(
            {
              overlayId: exportOverlayId,
              settings,
              enabled,
              format,
              outputScale: 1,
            },
            onProgress,
          );
        }

        exportJobRef.current = job;
        const blob = await job.promise;
        if (token !== exportTokenRef.current) return;
        if (action === "copy") {
          await copyBlobToClipboard(blob);
          pushNotice("success", "The destroyed PNG is on your clipboard.");
        } else {
          const filename = buildDownloadName(session, format);
          downloadBlob(blob, filename);
          pushNotice("success", `Disaster downloaded: ${filename}`);
        }
      } catch (error) {
        if (
          token === exportTokenRef.current &&
          !(error instanceof WorkerJobCancelled)
        ) {
          pushNotice(
            "error",
            action === "copy"
              ? `Could not copy the image: ${errorMessage(error)}`
              : errorMessage(error),
          );
        }
      } finally {
        if (token === exportTokenRef.current) {
          setExporting(false);
          setExportAction(null);
          exportJobRef.current = null;
          setExportProgress(0);
          setExportStage("");
        }
      }
    },
    [
      enabled,
      exportFormat,
      exporting,
      overlayId,
      pushNotice,
      session,
      settings,
      textEnabled,
      textLayers,
    ],
  );

  const handleGifScaleConfirm = useCallback(
    (scale: number) => {
      const pending = gifScalePending;
      if (!pending) return;
      setGifScalePending(null);
      const token = loadTokenRef.current + 1;
      loadTokenRef.current = token;
      cancelLoadWork();
      cancelPreviewWork();
      cancelExport();
      void startGifLoad(pending.file, pending.buffer, scale, token);
    },
    [
      cancelExport,
      cancelLoadWork,
      cancelPreviewWork,
      gifScalePending,
      startGifLoad,
    ],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const loadingLabel = loading?.label ?? "Working locally";
  const editorBusy = Boolean(loading) || exporting;
  const workerUnavailable = !support.supported || workerFailed;

  return (
    <div className={`app${session ? " app--editing" : " app--empty"}`}>
      <a
        className="skip-link"
        href={isToolbox ? "#toolbox" : "#editor"}
        onClick={(event) => {
          // A skip link should move focus, not navigate between hash routes.
          event.preventDefault();
          const target = document.getElementById(
            isToolbox ? "toolbox" : "editor",
          );
          target?.focus();
          target?.scrollIntoView();
        }}
      >
        {isToolbox ? "Skip to the toolbox" : "Skip to the editor"}
      </a>
      <Header toolbox={isToolbox} />

      <div className="ticker" aria-hidden="true" hidden={isToolbox}>
        <div className="ticker__track">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index}>
              STAYS LOCAL <b>✦</b> NO ACCOUNTS <b>✦</b> NO MERCY <b>✦</b> PIXELS
              WERE HARMED <b>✦</b>
            </span>
          ))}
        </div>
      </div>

      {isToolbox && <ToolboxPage hash={hash} onOpenTool={openTool} />}
      <main hidden={isToolbox}>
        <div className="container">
          <section className="hero" aria-labelledby="hero-heading">
            <div className="hero__copy">
              <p className="eyebrow">
                The internet&apos;s quality control department
              </p>
              <h1 id="hero-heading">
                Make your images
                <span className="hero__worse"> look worse.</span>
              </h1>
              <p className="hero__lede">
                A free, privacy-friendly playground for compression, pixelation,
                noise and deeply questionable taste. Drop in a photo or animated
                GIF and crank the damage. Everything happens in your browser.
              </p>
              <div className="hero__badges">
                <span className="hero-badge">No sign-up</span>
                <span className="hero-badge">GIF-friendly</span>
                <span className="hero-badge">Open source</span>
              </div>
            </div>

            <aside className="hero__stamp" aria-label="Certified low quality">
              <span className="hero__stamp-top">CERTIFIED</span>
              <span className="hero__stamp-main">
                LOW
                <br />
                QUALITY
              </span>
              <span className="hero__stamp-bottom">EST. 2026 · NO REFUNDS</span>
              <span className="hero__stamp-star" aria-hidden="true">
                ✦
              </span>
            </aside>
          </section>

          {workerUnavailable && (
            <div className="browser-warning" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>This browser cannot run LowQuality.</strong>
                <p>
                  {support.reason ||
                    "The local image worker failed to start. Try a recent Chrome, Firefox, Safari or Edge."}
                </p>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="visually-hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/svg+xml,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,.svg,.heic,.heif"
            onChange={handleInputChange}
            aria-label="Choose an image or GIF"
            data-testid="file-input"
          />

          <section
            id="editor"
            tabIndex={-1}
            className="editor-section"
            aria-labelledby="editor-heading"
            aria-busy={editorBusy}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="editor-section__intro">
              <div>
                <p className="eyebrow">The destruction console</p>
                <h2 id="editor-heading">Your image, minus the dignity.</h2>
              </div>
              <p className="editor-section__tip">
                {session
                  ? "Changes preview automatically. Advanced tweaks stay put when the slider moves."
                  : "Start with a file, a paste, or the sample. Then make it worse."}
              </p>
            </div>

            <div
              className={`editor-grid${session ? "" : " editor-grid--empty"}`}
            >
              {session ? (
                <>
                  <div className="editor-source">
                    <UploadCard
                      session={session}
                      loading={Boolean(loading)}
                      loadingLabel={loadingLabel}
                      dragActive={dragActive}
                      onPickFile={openFilePicker}
                      onTrySample={() => void handleTrySample()}
                      onReset={handleReset}
                      onResetEdits={handleResetEdits}
                      onDropFile={(file) => void handleFile(file)}
                    />
                  </div>
                  <div
                    className="editor-studio"
                    tabIndex={-1}
                    role="region"
                    aria-label="Image workspace"
                  >
                    <PreviewPanel
                      session={session}
                      preview={preview}
                      busy={previewBusy}
                      progress={previewProgress}
                      stage={previewStage}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      textEnabled={textEnabled}
                      textLayers={textLayers}
                      textRects={textRects}
                      selectedTextId={selectedTextId}
                      onSelectText={setSelectedTextId}
                      onMoveText={handleMoveText}
                      dragActive={dragActive}
                      onDropFile={(file) => {
                        void handleFile(file);
                      }}
                    />
                    <QualitySlider
                      compact
                      value={quality}
                      onChange={setQuality}
                      disabled={editorBusy}
                    />
                    <ExportBar
                      session={session}
                      format={exportFormat}
                      onFormatChange={setExportFormat}
                      onDownload={() => void runExport("download")}
                      onCopy={() => void runExport("copy")}
                      onCancel={cancelExport}
                      exporting={exporting}
                      exportAction={exportAction}
                      progress={exportProgress}
                      stage={exportStage}
                      copySupported={COPY_SUPPORTED}
                      disabled={
                        !workerReady ||
                        overlayId === null ||
                        Boolean(loading) ||
                        !fontsReady
                      }
                    />
                  </div>
                  <div className="editor-controls">
                    <PresetGrid
                      activePreset={presetId}
                      onSelect={handlePresetSelect}
                    />
                    <AdvancedControls
                      settings={settings}
                      enabled={enabled}
                      overrides={overrides}
                      onOverride={handleOverride}
                      onEffectEnabledChange={handleEffectEnabledChange}
                      onReset={resetAdvanced}
                    />
                    <TextPanel
                      enabled={textEnabled}
                      layers={textLayers}
                      selectedId={selectedTextId}
                      maxLayers={MAX_TEXT_LAYERS}
                      onToggleEnabled={handleToggleText}
                      onAddLayer={addTextLayer}
                      onDuplicateLayer={handleDuplicateTextLayer}
                      onRemoveLayer={handleRemoveTextLayer}
                      onSelectLayer={setSelectedTextId}
                      onChangeLayer={handleChangeTextLayer}
                    />
                  </div>
                </>
              ) : (
                <div className="editor-studio">
                  <EmptyState
                    loading={Boolean(loading)}
                    loadingLabel={loadingLabel}
                    dragActive={dragActive}
                    onPickFile={openFilePicker}
                    onTrySample={() => void handleTrySample()}
                    onDropFile={(file) => void handleFile(file)}
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        <ToolsSection onOpenTool={openTool} />
        <HowItWorks />
        <About />
      </main>

      <Footer
        onOpenConverter={openConverter}
        onOpenCompressor={openCompressor}
      />
      <ToastStack notices={notices} onDismiss={dismissNotice} />

      {gifScalePending && (
        <GifScaleDialog
          pending={gifScalePending}
          onCancel={() => setGifScalePending(null)}
          onConfirm={handleGifScaleConfirm}
        />
      )}

      {toolMode && (
        <ConverterDialog initialMode={toolMode} onClose={closeTool} />
      )}
    </div>
  );
}
