import { useEffect, useRef, useState } from "react";
import { defaults, type Options, type Result } from "../lib/toolkit/protocol";
import { downloadBlob } from "../lib/files";
import { startJob } from "./client";
import { NumberField, OutputControls } from "./controls";
import { ResultCard } from "./ResultCard";
interface Entry {
  id: number;
  file: File;
  progress: number;
  status: string;
  result?: Result;
}
export function Batch() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [options, setOptions] = useState<Options>({
    ...defaults,
    tool: "batch",
    format: "webp",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<ReturnType<typeof startJob> | null>(null);
  const active = useRef<number | null>(null);
  const token = useRef(0);
  const mounted = useRef(true);
  const counter = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      token.current++;
      current.current?.cancel();
    };
  }, []);
  const update = (id: number, patch: Partial<Entry>) => {
    if (mounted.current)
      setEntries((list) =>
        list.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
  };
  function add(files: File[]) {
    setEntries((list) => [
      ...list,
      ...files.map((file) => ({
        id: ++counter.current,
        file,
        progress: 0,
        status: "Queued",
      })),
    ]);
  }
  async function run() {
    setBusy(true);
    setError("");
    const version = ++token.current;
    for (const item of entriesRef.current.filter((item) => !item.result)) {
      if (version !== token.current) break;
      if (!entriesRef.current.some((entry) => entry.id === item.id)) continue;
      active.current = item.id;
      update(item.id, { status: "Processing", progress: 1 });
      const job = startJob({ file: item.file, options }, (progress) =>
        update(item.id, { progress }),
      );
      current.current = job;
      try {
        const result = await job.promise;
        update(item.id, { result, status: "Done", progress: 100 });
      } catch (e) {
        update(item.id, {
          status:
            e instanceof DOMException && e.name === "AbortError"
              ? "Cancelled"
              : e instanceof Error
                ? e.message
                : "Failed",
          progress: 0,
        });
      } finally {
        if (current.current === job) current.current = null;
      }
    }
    active.current = null;
    if (mounted.current) setBusy(false);
  }
  async function downloadAll() {
    setBusy(true);
    setError("");
    const job = startJob({
      options,
      files: entries.flatMap((item) =>
        item.result ? [{ name: item.result.name, blob: item.result.blob }] : [],
      ),
    });
    current.current = job;
    try {
      const result = await job.promise;
      downloadBlob(result.blob, result.name);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "ZIP failed.");
    } finally {
      current.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="toolkit-stack">
      <div
        className="panel toolkit-box toolkit-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add([...e.dataTransfer.files]);
        }}
      >
        <label className="field">
          <span>
            Drop images here. One job at a time. Files stay in this tab.
          </span>
          <input
            aria-label="Batch files"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/svg+xml,.png,.jpg,.jpeg,.webp,.avif,.bmp,.svg"
            multiple
            onChange={(e) => {
              add([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <fieldset disabled={busy} className="panel toolkit-box toolkit-stack">
        <legend>Shared settings</legend>
        <OutputControls
          options={options}
          change={(patch) => setOptions((o) => ({ ...o, ...patch }))}
        />
        <div className="toolkit-fields">
          <NumberField
            label="Resize width (0 = original)"
            value={options.width}
            min={0}
            onChange={(width) => setOptions((o) => ({ ...o, width }))}
          />
          <NumberField
            label="Resize height (0 = original)"
            value={options.height}
            min={0}
            onChange={(height) => setOptions((o) => ({ ...o, height }))}
          />
          <NumberField
            label="Resolution cap (0 = original)"
            value={options.maxDimension}
            min={0}
            onChange={(maxDimension) =>
              setOptions((o) => ({ ...o, maxDimension }))
            }
          />
          <NumberField
            label="Target KB (0 = off)"
            min={0}
            max={30720}
            value={options.targetBytes / 1024}
            onChange={(value) =>
              setOptions((o) => ({ ...o, targetBytes: value * 1024 }))
            }
          />
          <NumberField
            label="Quality floor (%)"
            min={30}
            max={95}
            value={options.qualityFloor * 100}
            onChange={(value) =>
              setOptions((o) => ({ ...o, qualityFloor: value / 100 }))
            }
          />
        </div>
        <p>
          Target compression: JPG/WebP only. Resolution can shrink when the
          quality floor cannot meet the target.
        </p>
      </fieldset>
      <div className="toolkit-actions">
        <button
          className="button"
          disabled={busy || !entries.length}
          onClick={() => void run()}
        >
          Process queue
        </button>
        <button
          className="button button--ghost"
          disabled={!busy}
          onClick={() => {
            token.current++;
            current.current?.cancel();
          }}
        >
          Cancel queue
        </button>
        <button
          className="button"
          disabled={busy || !entries.some((item) => item.result)}
          onClick={() => void downloadAll()}
        >
          Download all (.zip)
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {entries.map((item) => (
        <article className="panel toolkit-box toolkit-stack" key={item.id}>
          <p>
            {item.file.name} · {item.status}
          </p>
          <progress
            value={item.progress}
            max={100}
            aria-label={`Progress ${item.file.name}`}
          />
          <div className="toolkit-actions">
            <button
              className="button button--ghost"
              onClick={() => {
                if (active.current === item.id) current.current?.cancel();
                setEntries((list) =>
                  list.filter((entry) => entry.id !== item.id),
                );
              }}
            >
              Remove {item.file.name}
            </button>
            {active.current === item.id && (
              <button
                className="button button--ghost"
                onClick={() => current.current?.cancel()}
              >
                Cancel file
              </button>
            )}
          </div>
          {item.result && (
            <ResultCard result={item.result} before={item.file.size} />
          )}
        </article>
      ))}
    </section>
  );
}
