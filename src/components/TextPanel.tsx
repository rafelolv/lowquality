import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { TextAlign, TextLayer } from "../types";
import { TEXT_FONTS } from "../lib/text";
import { RangeControl } from "./ui/RangeControl";
import { Switch } from "./ui/Switch";

interface TextPanelProps {
  enabled: boolean;
  layers: TextLayer[];
  selectedId: string | null;
  maxLayers: number;
  onToggleEnabled: (enabled: boolean) => void;
  onAddLayer: () => void;
  onRemoveLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onSelectLayer: (id: string) => void;
  onChangeLayer: (id: string, patch: Partial<TextLayer>) => void;
}

const ALIGNMENTS: Array<{
  value: TextAlign;
  label: string;
  Icon: typeof AlignLeft;
}> = [
  { value: "left", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align centre", Icon: AlignCenter },
  { value: "right", label: "Align right", Icon: AlignRight },
];

export function TextPanel({
  enabled,
  layers,
  selectedId,
  maxLayers,
  onToggleEnabled,
  onAddLayer,
  onRemoveLayer,
  onDuplicateLayer,
  onSelectLayer,
  onChangeLayer,
}: TextPanelProps) {
  const [open, setOpen] = useState(false);
  const selected =
    layers.find((layer) => layer.id === selectedId) ?? layers[0] ?? null;

  useEffect(() => {
    if (enabled) setOpen(true);
  }, [enabled]);

  return (
    <section className={`panel text-panel${open ? " text-panel--open" : ""}`}>
      <div className="panel__header text-panel__header">
        <h2 className="panel__title" id="text-heading">
          <Type size={16} aria-hidden="true" />
          Text overlay
        </h2>
        <div className="text-panel__header-actions">
          {layers.length > 0 && (
            <span className="panel__meta">
              {layers.length}/{maxLayers}
            </span>
          )}
          <Switch
            checked={enabled}
            onChange={onToggleEnabled}
            label={enabled ? "Disable text overlay" : "Enable text overlay"}
          />
          <button
            type="button"
            className="icon-button icon-button--small"
            aria-expanded={open}
            aria-controls="text-panel-body"
            aria-label={
              open ? "Collapse text controls" : "Expand text controls"
            }
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown
              className={`advanced-toggle__chevron${open ? " is-open" : ""}`}
              size={16}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="text-panel__body" id="text-panel-body">
          <p className="text-panel__hint">
            Optional. Text is burned into the pixels <strong>before</strong> the
            damage, so it gets destroyed along with everything else.
          </p>

          {!enabled ? (
            <div className="text-panel__off">
              <EyeOff size={16} aria-hidden="true" />
              <span>Text overlay is off. Nothing will be added.</span>
            </div>
          ) : (
            <>
              <div className="text-layer-list" aria-label="Text layers">
                {layers.map((layer) => (
                  <div
                    className={`text-layer-row${
                      selected?.id === layer.id ? " text-layer-row--active" : ""
                    }`}
                    key={layer.id}
                  >
                    <button
                      type="button"
                      className="text-layer-row__select"
                      aria-pressed={selected?.id === layer.id}
                      onClick={() => onSelectLayer(layer.id)}
                    >
                      <span
                        className="text-layer-row__swatch"
                        style={{ background: layer.color }}
                        aria-hidden="true"
                      />
                      <span className="text-layer-row__text">
                        {layer.text.trim() || "Empty layer"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--tiny"
                      aria-label={
                        layer.visible
                          ? "Hide this text layer"
                          : "Show this text layer"
                      }
                      onClick={() =>
                        onChangeLayer(layer.id, { visible: !layer.visible })
                      }
                    >
                      {layer.visible ? (
                        <Eye size={14} aria-hidden="true" />
                      ) : (
                        <EyeOff size={14} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--tiny"
                      aria-label="Duplicate this text layer"
                      disabled={layers.length >= maxLayers}
                      onClick={() => onDuplicateLayer(layer.id)}
                    >
                      <Copy size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--tiny icon-button--danger"
                      aria-label="Delete this text layer"
                      onClick={() => onRemoveLayer(layer.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="button button--ghost button--small text-panel__add"
                onClick={onAddLayer}
                disabled={layers.length >= maxLayers}
                title={
                  layers.length >= maxLayers
                    ? `LowQuality supports up to ${maxLayers} text layers.`
                    : undefined
                }
              >
                <Plus size={14} aria-hidden="true" />
                Add another layer
              </button>

              {selected ? (
                <div className="text-editor">
                  <div className="field">
                    <label htmlFor="text-layer-content">Words to ruin</label>
                    <textarea
                      id="text-layer-content"
                      rows={2}
                      maxLength={80}
                      value={selected.text}
                      onChange={(event) =>
                        onChangeLayer(selected.id, {
                          text: event.currentTarget.value,
                        })
                      }
                      placeholder="MAKE IT WORSE"
                    />
                  </div>

                  <div className="field">
                    <span className="field__label">Typeface</span>
                    <div
                      className="font-picker"
                      role="group"
                      aria-label="Text typeface"
                    >
                      {TEXT_FONTS.map((font) => (
                        <button
                          type="button"
                          key={font.id}
                          className={`font-choice font-choice--${font.id}${
                            selected.fontId === font.id
                              ? " font-choice--active"
                              : ""
                          }`}
                          aria-pressed={selected.fontId === font.id}
                          onClick={() =>
                            onChangeLayer(selected.id, { fontId: font.id })
                          }
                        >
                          <span className="font-choice__sample">Aa</span>
                          <span className="font-choice__name">{font.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-editor__colours">
                    <label className="color-field">
                      <span>Fill</span>
                      <input
                        type="color"
                        value={selected.color}
                        aria-label="Text fill colour"
                        onChange={(event) =>
                          onChangeLayer(selected.id, {
                            color: event.currentTarget.value,
                          })
                        }
                      />
                      <code>{selected.color.toUpperCase()}</code>
                    </label>
                    <div className="outline-field">
                      <label className="outline-field__label">
                        <span>Pixel outline</span>
                        <Switch
                          checked={selected.outline}
                          onChange={(checked) =>
                            onChangeLayer(selected.id, { outline: checked })
                          }
                          label={
                            selected.outline
                              ? "Disable text outline"
                              : "Enable text outline"
                          }
                        />
                      </label>
                      {selected.outline && (
                        <label className="color-field color-field--small">
                          <span>Line</span>
                          <input
                            type="color"
                            value={selected.outlineColor}
                            aria-label="Text outline colour"
                            onChange={(event) =>
                              onChangeLayer(selected.id, {
                                outlineColor: event.currentTarget.value,
                              })
                            }
                          />
                          <code>{selected.outlineColor.toUpperCase()}</code>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="field">
                    <span className="field__label">Alignment</span>
                    <div
                      className="align-picker"
                      role="group"
                      aria-label="Text alignment"
                    >
                      {ALIGNMENTS.map(({ value, label, Icon }) => (
                        <button
                          type="button"
                          key={value}
                          className={`align-choice${
                            selected.align === value
                              ? " align-choice--active"
                              : ""
                          }`}
                          aria-label={label}
                          aria-pressed={selected.align === value}
                          onClick={() =>
                            onChangeLayer(selected.id, { align: value })
                          }
                        >
                          <Icon size={16} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <RangeControl
                    id="text-size"
                    label="Text size"
                    value={selected.size}
                    min={2}
                    max={30}
                    step={0.5}
                    format={(value) => `${value}%`}
                    onChange={(value) =>
                      onChangeLayer(selected.id, { size: value })
                    }
                  />

                  {selected.outline && (
                    <RangeControl
                      id="text-outline-width"
                      label="Outline thickness"
                      value={selected.outlineWidth}
                      min={2}
                      max={24}
                      step={1}
                      format={(value) => `${value}%`}
                      onChange={(value) =>
                        onChangeLayer(selected.id, { outlineWidth: value })
                      }
                    />
                  )}

                  <div className="position-grid">
                    <RangeControl
                      id="text-x"
                      label="Horizontal"
                      value={Math.round(selected.x * 100)}
                      min={0}
                      max={100}
                      format={(value) => `${value}%`}
                      onChange={(value) =>
                        onChangeLayer(selected.id, { x: value / 100 })
                      }
                    />
                    <RangeControl
                      id="text-y"
                      label="Vertical"
                      value={Math.round(selected.y * 100)}
                      min={0}
                      max={100}
                      format={(value) => `${value}%`}
                      onChange={(value) =>
                        onChangeLayer(selected.id, { y: value / 100 })
                      }
                    />
                  </div>
                  <p className="text-editor__drag-hint">
                    Tip: drag the yellow box on the preview to reposition text.
                  </p>
                </div>
              ) : (
                <p className="text-panel__empty">
                  No text layers yet. Add one above to start yelling in pixels.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
