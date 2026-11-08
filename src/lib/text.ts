import type {
  NormalizedRect,
  TextFontId,
  TextLayer,
  TextOverlay,
} from '../types';

export interface FontOption {
  id: TextFontId;
  name: string;
  stack: string;
  lineHeight: number;
  weight: number;
}

export const TEXT_FONTS: FontOption[] = [
  {
    id: 'anton',
    name: 'Blockbuster',
    stack: '"Anton", "Arial Narrow", Impact, sans-serif',
    lineHeight: 1.06,
    weight: 400,
  },
  {
    id: 'press',
    name: 'Pixel',
    stack: '"Press Start 2P", monospace',
    lineHeight: 1.35,
    weight: 400,
  },
  {
    id: 'grotesk',
    name: 'Clean',
    stack: '"Space Grotesk Variable", "Arial", sans-serif',
    lineHeight: 1.12,
    weight: 700,
  },
];

export const FONT_LOAD_SPECS = [
  '400 64px "Anton"',
  '400 64px "Press Start 2P"',
  '700 64px "Space Grotesk Variable"',
];

export function getFont(fontId: TextFontId): FontOption {
  return TEXT_FONTS.find((font) => font.id === fontId) ?? TEXT_FONTS[0];
}

interface TextBlockLayout {
  font: FontOption;
  fontSize: number;
  lineHeight: number;
  lines: string[];
  widths: number[];
  blockWidth: number;
  blockHeight: number;
  centerX: number;
  centerY: number;
  outlineWidth: number;
  bounds: { x: number; y: number; width: number; height: number };
}

function measureBlock(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: TextLayer,
  imageWidth: number,
  imageHeight: number,
): TextBlockLayout | null {
  if (!layer.visible || layer.text.length === 0) return null;

  const font = getFont(layer.fontId);
  const shortestSide = Math.min(imageWidth, imageHeight);
  const fontSize = Math.max(6, (layer.size / 100) * shortestSide);
  const lineHeight = fontSize * font.lineHeight;
  const lines = layer.text.split('\n');
  context.save();
  context.font = `${font.weight} ${fontSize}px ${font.stack}`;
  context.textBaseline = 'middle';
  const widths = lines.map((line) => context.measureText(line || ' ').width);
  context.restore();

  const blockWidth = Math.max(...widths, 1);
  const blockHeight = Math.max(lineHeight, lines.length * lineHeight);
  const centerX = layer.x * imageWidth;
  const centerY = layer.y * imageHeight;
  const outlineWidth = layer.outline
    ? Math.max(1, (layer.outlineWidth / 100) * fontSize)
    : 0;
  const padding = outlineWidth / 2 + fontSize * 0.08;

  return {
    font,
    fontSize,
    lineHeight,
    lines,
    widths,
    blockWidth,
    blockHeight,
    centerX,
    centerY,
    outlineWidth,
    bounds: {
      x: centerX - blockWidth / 2 - padding,
      y: centerY - blockHeight / 2 - padding,
      width: blockWidth + padding * 2,
      height: blockHeight + padding * 2,
    },
  };
}

function drawBlock(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TextBlockLayout,
  layer: TextLayer,
): void {
  const { font, fontSize, lineHeight, lines, widths, blockWidth } = layout;
  context.save();
  context.font = `${font.weight} ${fontSize}px ${font.stack}`;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.miterLimit = 2;

  const firstLineY =
    layout.centerY - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, index) => {
    let x = layout.centerX;
    if (layer.align === 'left') {
      x = layout.centerX - blockWidth / 2;
      context.textAlign = 'left';
    } else if (layer.align === 'right') {
      x = layout.centerX + blockWidth / 2;
      context.textAlign = 'right';
    } else {
      context.textAlign = 'center';
    }
    // Keep width referenced so empty lines still influence the block layout.
    void widths[index];
    const y = firstLineY + index * lineHeight;

    if (layer.outline && layout.outlineWidth > 0) {
      context.strokeStyle = layer.outlineColor;
      context.lineWidth = layout.outlineWidth * 2;
      context.strokeText(line, x, y);
    }
    context.fillStyle = layer.color;
    context.fillText(line, x, y);
  });

  context.restore();
}

export function measureTextLayers(
  layers: TextLayer[],
  imageWidth: number,
  imageHeight: number,
  enabled = true,
): Array<{ id: string; rect: NormalizedRect }> {
  if (!enabled || imageWidth <= 0 || imageHeight <= 0) return [];
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return [];

  return layers.flatMap((layer) => {
    const layout = measureBlock(context, layer, imageWidth, imageHeight);
    if (!layout) return [];
    return [
      {
        id: layer.id,
        rect: {
          x: layout.bounds.x / imageWidth,
          y: layout.bounds.y / imageHeight,
          width: layout.bounds.width / imageWidth,
          height: layout.bounds.height / imageHeight,
        },
      },
    ];
  });
}

export function renderTextOverlay(
  layers: TextLayer[],
  enabled: boolean,
  imageWidth: number,
  imageHeight: number,
  revision: string,
): TextOverlay | null {
  if (!enabled || layers.length === 0 || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  const activeLayers = layers.filter((layer) => layer.visible && layer.text.length > 0);
  if (activeLayers.length === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, imageWidth, imageHeight);

  for (const layer of activeLayers) {
    const layout = measureBlock(context, layer, imageWidth, imageHeight);
    if (layout) drawBlock(context, layout, layer);
  }

  const imageData = context.getImageData(0, 0, imageWidth, imageHeight);
  return {
    revision,
    width: imageWidth,
    height: imageHeight,
    data: imageData.data,
  };
}

export function createDefaultTextLayer(id: string): TextLayer {
  return {
    id,
    text: 'MAKE IT WORSE',
    fontId: 'anton',
    size: 9,
    color: '#ffffff',
    outline: true,
    outlineColor: '#160b2b',
    outlineWidth: 8,
    align: 'center',
    x: 0.5,
    y: 0.5,
    visible: true,
  };
}

export function approximateTextPixels(
  layer: TextLayer,
  imageWidth: number,
  imageHeight: number,
): number {
  return Math.max(6, Math.round((layer.size / 100) * Math.min(imageWidth, imageHeight)));
}
