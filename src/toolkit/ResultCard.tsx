import { useEffect, useState } from "react";
import type { Result } from "../lib/toolkit/protocol";
import { formatFileSize } from "../lib/imageLoader";
import { downloadBlob } from "../lib/files";
import { Check, Download } from "lucide-react";
export function ResultCard({
  result,
  before,
}: {
  result: Result;
  before: number;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(result.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result]);
  const format =
    {
      "image/png": "PNG",
      "image/jpeg": "JPG",
      "image/webp": "WebP",
      "application/zip": "ZIP archive",
    }[result.blob.type] ?? result.blob.type;
  const saved =
    before > 0 ? Math.round((1 - result.blob.size / before) * 100) : 0;
  return (
    <section
      className="panel toolkit-result"
      aria-label="Result"
      aria-live="polite"
    >
      <div className="toolkit-result__heading">
        <div>
          <p className="eyebrow">
            <Check size={14} aria-hidden="true" /> Ready to keep
          </p>
          <h3>Mercy delivered.</h3>
        </div>
        <span className="toolkit-result__badge">
          {saved > 0
            ? `${saved}% smaller`
            : saved < 0
              ? `${Math.abs(saved)}% larger`
              : "Same size"}
        </span>
      </div>
      <p className="toolkit-result__filename">
        <strong>{result.name}</strong>
      </p>
      <dl className="toolkit-result__stats">
        <div>
          <dt>Original</dt>
          <dd>{formatFileSize(before)}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{formatFileSize(result.blob.size)}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{format}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>
            {result.width} × {result.height} px
          </dd>
        </div>
      </dl>
      <p className="toolkit-upload-hint">
        Input {result.sourceWidth} × {result.sourceHeight} px · Original file
        untouched
      </p>
      {result.hitTarget === false && (
        <p>Target not reached at this quality floor. Smallest result shown.</p>
      )}
      {result.blob.type.startsWith("image/") && url && (
        <img src={url} alt="Processed result" className="toolkit-output" />
      )}
      <button
        type="button"
        className="button"
        onClick={() => downloadBlob(result.blob, result.name)}
      >
        <Download size={16} aria-hidden="true" />
        Download result
      </button>
    </section>
  );
}
