import { FaviconTool } from "./tools/FaviconTool";
import { MetadataTool } from "./tools/MetadataTool";
import { GifTool } from "./tools/GifTool";
import { RedactTool } from "./tools/RedactTool";
import { ResizeTool } from "./tools/ResizeTool";
import { VideoToGifTool } from "./tools/VideoToGifTool";
import { useEffect, useRef, useState } from "react";
import { tools, ToolboxCards } from "./ToolboxCards";
import { defaults, type Options, type Result } from "../lib/toolkit/protocol";
import {
  squareCrop,
  aspectCrop,
  dimension,
  type Rect,
} from "../lib/toolkit/geometry";
import { UploadCloud, ArrowLeft } from "lucide-react";
import { ImageTools } from "./ImageTools";
import { formatFileSize } from "../lib/imageLoader";
import { startJob } from "./client";
import { Batch } from "./Batch";
import { OutputControls } from "./controls";
import { RegionEditor } from "./RegionEditor";
import { ResultCard } from "./ResultCard";
import "./toolkit.css";
export function ToolboxPage({
  hash,
  file,
  onFileChange,
}: {
  hash: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  const activeTool = tools.find((item) => `#toolbox/${item.id}` === hash);
  const tool = activeTool?.id;
  const inspectedFile = useRef<File | null>(null);
  const [source, setSource] = useState<Result | null>(null);
  const [options, setOptions] = useState<Options>(defaults);
  const [result, setResult] = useState<Result | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [locked, setLocked] = useState(true);
  const [cropLocked, setCropLocked] = useState(false);
  const [preset, setPreset] = useState("Custom");
  const [regionDraft, setRegionDraft] = useState<Rect>({
    x: 0,
    y: 0,
    width: 32,
    height: 32,
  });
  const mainRef = useRef<HTMLElement>(null);
  const jobRef = useRef<ReturnType<typeof startJob> | null>(null);
  const version = useRef(0);
  const change = (patch: Partial<Options>) => {
    setOptions((o) => {
      const next = { ...o, ...patch };
      if (
        cropLocked &&
        source &&
        (patch.width !== undefined ||
          patch.height !== undefined ||
          patch.rotation !== undefined)
      ) {
        next.crop = aspectCrop(
          next.crop ?? {
            x: 0,
            y: 0,
            width: source.width,
            height: source.height,
          },
          source.width,
          source.height,
          next.rotation % 180
            ? next.height / next.width
            : next.width / next.height,
        );
      }
      return next;
    });
    setResult(null);
  };
  useEffect(() => {
    version.current++;
    jobRef.current?.cancel();
    jobRef.current = null;
    setBusy(false);
    setResult(null);
    setError("");
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current
      ?.querySelector('.toolkit-nav [aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
    // A hash change is this app's navigation. Start each tool at the top so
    // the site header and the toolbox tabs stay reachable.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // A GIF inspection includes frames; static inspections cannot be reused by GIF Kit.
    if (
      file &&
      tool &&
      !["convert", "compress", "batch", "video"].includes(tool) &&
      (!source ||
        inspectedFile.current !== file ||
        Boolean(source.frames) !== (tool === "gif"))
    ) {
      void load(file);
    }
    if (!file) {
      inspectedFile.current = null;
      setSource(null);
    }
  }, [tool, file]);
  useEffect(
    () => () => {
      version.current++;
      jobRef.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (!source) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(source.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [source]);
  async function load(next: File) {
    const token = ++version.current;
    jobRef.current?.cancel();
    setBusy(true);
    setError("");
    setResult(null);
    inspectedFile.current = null;
    setSource(null);
    setProgress(0);
    const job = startJob(
      {
        file: next,
        options: {
          ...defaults,
          tool:
            tool === "convert" || tool === "compress"
              ? "resize"
              : (tool ?? "resize"),
        },
        inspect: true,
      },
      (value) => {
        if (token === version.current) setProgress(value);
      },
    );
    jobRef.current = job;
    try {
      const value = await job.promise;
      if (token !== version.current) return;
      inspectedFile.current = next;
      setSource(value);
      setOptions({ ...defaults, width: value.width, height: value.height });
      setPreset("Custom");
      setLocked(true);
      setCropLocked(false);
    } catch (e) {
      if (
        token === version.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : "Could not read this image.");
    } finally {
      if (token === version.current) {
        setBusy(false);
        jobRef.current = null;
      }
    }
  }
  async function run(extract = false) {
    if (!file || !tool || tool === "convert" || tool === "compress") return;
    const token = ++version.current;
    jobRef.current?.cancel();
    setBusy(true);
    setResult(null);
    setError("");
    setProgress(0);
    const resizeOnly = tool === "resize";
    const job = startJob(
      {
        file,
        options: {
          ...options,
          tool,
          extract,
          ...(resizeOnly
            ? {}
            : {
                crop: tool === "favicon" ? options.crop : undefined,
                rotation: 0,
                flipX: false,
                flipY: false,
                width: tool === "gif" ? options.width : 0,
                height: tool === "gif" ? options.height : 0,
              }),
        },
      },
      (value) => {
        if (token === version.current) setProgress(value);
      },
    );
    jobRef.current = job;
    try {
      const value = await job.promise;
      if (token === version.current) setResult(value);
    } catch (e) {
      if (
        token === version.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : "Processing failed.");
    } finally {
      if (token === version.current) {
        setBusy(false);
        jobRef.current = null;
      }
    }
  }
  function size(axis: "width" | "height", value: number) {
    const ratio = options.width / Math.max(1, options.height);
    change({
      [axis]: value,
      ...(locked
        ? axis === "width"
          ? { height: dimension(value / ratio) }
          : { width: dimension(value * ratio) }
        : {}),
    });
    setPreset("Custom");
  }
  function cropChange(crop: Rect) {
    change({
      crop:
        source && cropLocked
          ? aspectCrop(
              crop,
              source.width,
              source.height,
              options.rotation % 180
                ? options.height / options.width
                : options.width / options.height,
            )
          : crop,
    });
  }
  const iconCrop = source
    ? aspectCrop(
        options.crop ?? squareCrop(source.width, source.height),
        source.width,
        source.height,
        1,
      )
    : undefined;
  return (
    <main
      ref={mainRef}
      tabIndex={-1}
      className="container toolkit"
      id="toolbox"
    >
      <div
        className={`toolkit-heading${tool ? " toolkit-heading--active" : ""}`}
      >
        <p className="eyebrow">The mercy department · Stays local</p>
        <h1>
          LowQuality <span className="text-yellow">Toolbox</span>
        </h1>
        <p>Good tools. Bad attitude. Give your files a little mercy.</p>
      </div>
      <nav className="toolkit-nav" aria-label="Toolbox navigation">
        <a
          className="button button--ghost"
          href="#toolbox"
          aria-current={!tool ? "page" : undefined}
        >
          All tools
        </a>
        {tools.map((item) => (
          <a
            key={item.id}
            className={`button ${tool === item.id ? "" : "button--ghost"}`}
            href={`#toolbox/${item.id}`}
            aria-current={tool === item.id ? "page" : undefined}
          >
            <item.icon size={15} aria-hidden="true" />
            {item.name}
          </a>
        ))}
      </nav>
      {!tool ? (
        <>
          <div className="toolkit-intro">
            <div>
              <p className="eyebrow">Small fixes. Big relief.</p>
              <h2>What do your pixels need?</h2>
            </div>
            <p>
              Pick a tool, adjust the details, save your file. Everything
              happens right here in your browser.
            </p>
          </div>
          {file && (
            <div className="panel toolkit-box toolkit-source-summary">
              <p>
                <span className="field__label">Current image</span> {file.name}{" "}
                · {formatFileSize(file.size)}
              </p>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => onFileChange(null)}
              >
                Remove image
              </button>
            </div>
          )}
          <ToolboxCards />
        </>
      ) : (
        <section
          className="toolkit-tool-shell"
          aria-labelledby="toolkit-tool-title"
        >
          <a className="toolkit-back" href="#toolbox">
            <ArrowLeft size={15} aria-hidden="true" /> All tools
          </a>
          <header className="toolkit-tool-heading">
            {activeTool && (
              <span className="dialog__icon" aria-hidden="true">
                <activeTool.icon size={24} />
              </span>
            )}
            <div className="toolkit-tool-heading__copy">
              <p className="eyebrow">The mercy department · Stays local</p>
              <h2 id="toolkit-tool-title">{activeTool?.name}</h2>
              <p>{activeTool?.description}</p>
            </div>
          </header>
          {tool === "convert" || tool === "compress" ? (
            <ImageTools mode={tool} file={file} onFileChange={onFileChange} />
          ) : tool === "batch" ? (
            <Batch />
          ) : tool === "video" ? (
            <VideoToGifTool />
          ) : (
            <div className="toolkit-stack">
              <div
                className="panel toolkit-box toolkit-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const next = e.dataTransfer.files[0];
                  if (next) onFileChange(next);
                }}
              >
                <label className="field">
                  <span className="toolkit-upload-heading">
                    <UploadCloud size={24} aria-hidden="true" />
                    {file
                      ? "Try another image"
                      : "Drop an image or choose a file"}
                  </span>
                  <span className="toolkit-upload-hint">
                    {tool === "gif"
                      ? "Animated GIF · Frames stay local"
                      : "PNG, JPG, WebP, AVIF, BMP or SVG · Shared between image tools"}
                  </span>
                  <input
                    aria-label="Toolbox image"
                    type="file"
                    accept={
                      tool === "gif"
                        ? "image/gif,.gif"
                        : "image/jpeg,image/png,image/webp,image/avif,image/bmp,image/svg+xml,.jpg,.jpeg,.png,.webp,.avif,.bmp,.svg"
                    }
                    onChange={(e) => {
                      const next = e.target.files?.[0];
                      if (next) onFileChange(next);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {file && (
                <div className="toolkit-source-summary">
                  <p>
                    <span className="field__label">Source</span> {file.name}
                    {source &&
                      inspectedFile.current === file &&
                      ` · ${source.width} × ${source.height} px · ${formatFileSize(file.size)}`}
                  </p>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => onFileChange(null)}
                  >
                    Remove image
                  </button>
                </div>
              )}
              {!file && (
                <div className="toolkit-start">
                  <span aria-hidden="true">01 / 02 / 03</span>
                  <h3>A little care for your files.</h3>
                  <p>
                    Choose an image to unlock the preview and settings. Your
                    original file stays untouched.
                  </p>
                </div>
              )}
              {source && inspectedFile.current === file && (
                <div className="toolkit-workspace">
                  <div className="toolkit-stack">
                    {url && (
                      <RegionEditor
                        url={url}
                        disabled={
                          busy ||
                          (tool === "favicon" && options.padding) ||
                          (tool !== "resize" &&
                            tool !== "redact" &&
                            tool !== "favicon")
                        }
                        width={source.width}
                        height={source.height}
                        crop={
                          tool === "resize"
                            ? (options.crop ?? {
                                x: 0,
                                y: 0,
                                width: source.width,
                                height: source.height,
                              })
                            : tool === "favicon" && !options.padding
                              ? iconCrop
                              : undefined
                        }
                        regions={tool === "redact" ? options.regions : []}
                        aspect={
                          tool === "favicon"
                            ? 1
                            : cropLocked
                              ? options.rotation % 180
                                ? options.height / options.width
                                : options.width / options.height
                              : 0
                        }
                        onChange={(rect) =>
                          tool === "resize"
                            ? cropChange(rect)
                            : tool === "favicon" && !options.padding
                              ? change({ crop: rect })
                              : tool === "redact"
                                ? change({
                                    regions: [...options.regions, rect],
                                  })
                                : undefined
                        }
                      />
                    )}
                    {tool === "gif" && source.frames && (
                      <FramePreviews frames={source.frames} />
                    )}
                    {tool === "resize" && (
                      <p>
                        Drag crop or handles. Numeric fields also work with
                        keyboard.
                      </p>
                    )}
                  </div>
                  <fieldset
                    className="panel toolkit-box toolkit-stack"
                    disabled={busy}
                  >
                    <legend>Tool settings</legend>
                    <p className="eyebrow">Adjust. Preview. Save.</p>
                    {tool === "resize" && (
                      <ResizeTool
                        options={options}
                        source={source}
                        change={change}
                        locked={locked}
                        setLocked={setLocked}
                        cropLocked={cropLocked}
                        setCropLocked={setCropLocked}
                        preset={preset}
                        setPreset={setPreset}
                        size={size}
                        cropChange={cropChange}
                      />
                    )}
                    {tool === "redact" && (
                      <RedactTool
                        options={options}
                        source={source}
                        change={change}
                        regionDraft={regionDraft}
                        setRegionDraft={setRegionDraft}
                      />
                    )}
                    {tool === "gif" && (
                      <GifTool
                        options={options}
                        source={source}
                        change={change}
                        run={run}
                      />
                    )}
                    {tool === "metadata" && <MetadataTool source={source} />}
                    {tool === "favicon" && (
                      <FaviconTool
                        options={options}
                        source={source}
                        change={change}
                      />
                    )}
                    {tool !== "favicon" && tool !== "gif" && (
                      <OutputControls options={options} change={change} />
                    )}
                    <p>
                      PNG/WebP preserve alpha. JPG uses white. JPG/WebP
                      reencoding can be lossy.
                    </p>
                    <button className="button" onClick={() => void run()}>
                      Process image
                    </button>
                  </fieldset>
                </div>
              )}
              {busy && (
                <div role="status">
                  <p>Working locally… {progress}%</p>
                  <progress value={progress} max={100} />
                  <button
                    className="button button--ghost"
                    onClick={() => {
                      version.current++;
                      jobRef.current?.cancel();
                      setBusy(false);
                    }}
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
                <>
                  <ResultCard result={result} before={file.size} />
                  {tool === "metadata" && (
                    <div className="panel toolkit-box">
                      <h3>After</h3>
                      <p>
                        {Object.keys(result.metadata ?? {}).length
                          ? JSON.stringify(result.metadata)
                          : "No common EXIF/GPS fields detected in the reencoded file."}
                      </p>
                    </div>
                  )}
                  {tool === "favicon" && result.icons && (
                    <IconPreviews icons={result.icons} />
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function IconPreviews({ icons }: { icons: NonNullable<Result["icons"]> }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = icons.map((frame) => URL.createObjectURL(frame.blob));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [icons]);
  return (
    <div className="panel toolkit-box toolkit-icon-previews">
      {urls.map((url, i) => (
        <figure key={url}>
          <img
            src={url}
            width={icons[i].size}
            height={icons[i].size}
            alt={`${icons[i].size}px icon`}
          />
          <figcaption>{icons[i].size}px</figcaption>
        </figure>
      ))}
    </div>
  );
}

function FramePreviews({ frames }: { frames: NonNullable<Result["frames"]> }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = frames.map((frame) => URL.createObjectURL(frame.blob));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [frames]);
  return (
    <div className="toolkit-frames">
      {urls.map((url, i) => (
        <figure key={url}>
          <img src={url} alt={`Frame ${i + 1}`} />
          <figcaption>
            {i + 1}: {frames[i].delay}ms
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
