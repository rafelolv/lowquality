import type { Result } from "../../lib/toolkit/protocol";
export function MetadataTool({ source }: { source: Result }) {
  return (
    <>
      <h3>Before</h3>
      <dl>
        {Object.entries(source.metadata ?? {}).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {!Object.keys(source.metadata ?? {}).length && (
        <p>No common EXIF/GPS fields detected. Other metadata may exist.</p>
      )}
      <p>
        Local reencoding strips embedded source metadata while preserving visual
        orientation. PNG avoids additional lossy encoding. This cannot recover
        previously redacted pixels.
      </p>
    </>
  );
}
