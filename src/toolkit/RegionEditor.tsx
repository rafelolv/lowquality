import { useRef, useState, type PointerEvent } from "react";
import { clampCrop, type Rect } from "../lib/toolkit/geometry";
interface Props {
  url: string;
  disabled?: boolean;
  width: number;
  height: number;
  crop?: Rect;
  regions?: Rect[];
  aspect: number;
  onChange: (rect: Rect) => void;
}
export function RegionEditor({
  url,
  disabled = false,
  width,
  height,
  crop,
  regions = [],
  aspect,
  onChange,
}: Props) {
  const [draft, setDraft] = useState<Rect | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    rect?: Rect;
    action: string;
  } | null>(null);
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(width, ((event.clientX - box.left) / box.width) * width),
      ),
      y: Math.max(
        0,
        Math.min(height, ((event.clientY - box.top) / box.height) * height),
      ),
    };
  };
  function move(event: PointerEvent<HTMLDivElement>, finish: boolean) {
    const start = drag.current;
    if (!start) return;
    const p = point(event);
    // A tap or a click on a handle should not create or collapse a selection.
    if (finish && Math.abs(p.x - start.x) < 2 && Math.abs(p.y - start.y) < 2) {
      drag.current = null;
      setDraft(null);
      return;
    }
    let rect: Rect;
    if (start.action === "move" && start.rect)
      rect = {
        ...start.rect,
        x: start.rect.x + p.x - start.x,
        y: start.rect.y + p.y - start.y,
      };
    else if (start.action.startsWith("handle") && start.rect) {
      const r = start.rect;
      const corner = start.action.split("-")[1];
      const west = corner.endsWith("w"),
        north = corner.startsWith("n");
      const anchorX = west ? r.x + r.width : r.x,
        anchorY = north ? r.y + r.height : r.y;
      let w = Math.max(1, Math.abs(p.x - anchorX)),
        h = Math.max(1, Math.abs(p.y - anchorY));
      if (aspect) {
        w = Math.min(
          w,
          west ? anchorX : width - anchorX,
          (north ? anchorY : height - anchorY) * aspect,
        );
        h = w / aspect;
      }
      rect = {
        x: west ? anchorX - w : anchorX,
        y: north ? anchorY - h : anchorY,
        width: w,
        height: h,
      };
    } else {
      let w = Math.max(1, Math.abs(p.x - start.x)),
        h = Math.max(1, Math.abs(p.y - start.y));
      if (aspect) {
        w = Math.min(
          w,
          p.x < start.x ? start.x : width - start.x,
          (p.y < start.y ? start.y : height - start.y) * aspect,
        );
        h = w / aspect;
      }
      rect = {
        x: p.x < start.x ? start.x - w : start.x,
        y: p.y < start.y ? start.y - h : start.y,
        width: w,
        height: h,
      };
    }
    if (!crop && !finish) setDraft(clampCrop(rect, width, height));
    if (crop || finish) onChange(clampCrop(rect, width, height));
    if (finish) {
      drag.current = null;
      setDraft(null);
    }
  }
  const style = (r: Rect) => ({
    left: `${(r.x / width) * 100}%`,
    top: `${(r.y / height) * 100}%`,
    width: `${(r.width / width) * 100}%`,
    height: `${(r.height / height) * 100}%`,
  });
  return (
    <div
      className="toolkit-image"
      style={{
        aspectRatio: `${width}/${height}`,
        touchAction: disabled ? "auto" : "none",
      }}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const target = event.target as HTMLElement;
        drag.current = {
          ...point(event),
          rect: crop,
          action: target.dataset.action ?? "draw",
        };
      }}
      onPointerMove={(event) => move(event, false)}
      onPointerUp={(event) => move(event, true)}
      onPointerCancel={() => {
        drag.current = null;
        setDraft(null);
      }}
    >
      <img
        src={url}
        alt={
          disabled
            ? "Source image"
            : "Source image. Drag to select a rectangle."
        }
        draggable={false}
      />
      {crop && (
        <div className="toolkit-crop" style={style(crop)} data-action="move">
          {["nw", "ne", "sw", "se"].map((corner) => (
            <span
              key={corner}
              className={`toolkit-handle toolkit-handle--${corner}`}
              data-action={`handle-${corner}`}
            />
          ))}
          <span className="toolkit-thirds" data-action="move" />
        </div>
      )}
      {draft && <div className="toolkit-region" style={style(draft)} />}
      {regions.map((rect, i) => (
        <div key={i} className="toolkit-region" style={style(rect)}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}
