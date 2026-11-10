import { useEffect, useState } from "react";
import type { Result } from "../lib/toolkit/protocol";
import { formatFileSize } from "../lib/imageLoader";
import { downloadBlob } from "../lib/files";
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
  return (
    <section
      className="panel toolkit-result"
      aria-label="Result"
      aria-live="polite"
    >
      <h3>Mercy delivered.</h3>
      <p>
        <strong>{result.name}</strong>
      </p>
      <p>
        Format {format} · Output {result.width} × {result.height} px
      </p>
      <p>
        Input {result.sourceWidth} × {result.sourceHeight} px
      </p>
      <p>
        {formatFileSize(before)} before · {formatFileSize(result.blob.size)}{" "}
        after
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
        Download result
      </button>
    </section>
  );
}
