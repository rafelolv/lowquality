import { describe, expect, it } from 'vitest';
import { fitWithin } from '../../src/lib/degradation';
import {
  createDefaultTextLayer,
  getFont,
  approximateTextPixels,
  TEXT_FONTS,
} from '../../src/lib/text';

describe('preview fitting', () => {
  it('leaves images that already fit untouched', () => {
    expect(fitWithin(800, 600, 1400)).toEqual({ width: 800, height: 600, scale: 1 });
    expect(fitWithin(1, 1, 1400)).toEqual({ width: 1, height: 1, scale: 1 });
  });

  it('scales landscape, portrait and extreme images down proportionally', () => {
    expect(fitWithin(2800, 1400, 1400)).toEqual({
      width: 1400,
      height: 700,
      scale: 0.5,
    });
    expect(fitWithin(1400, 2800, 1400)).toEqual({
      width: 700,
      height: 1400,
      scale: 0.5,
    });
    expect(fitWithin(100, 800, 400)).toEqual({ width: 50, height: 400, scale: 0.5 });
  });

  it('never produces zero-sized previews', () => {
    const result = fitWithin(10_000, 1, 100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(1);
    expect(result.scale).toBeCloseTo(0.01, 6);
  });
});

describe('text helpers', () => {
  it('exposes three licensed font choices and a safe fallback', () => {
    expect(TEXT_FONTS.map((font) => font.id)).toEqual(['anton', 'press', 'grotesk']);
    expect(getFont('press').name).toBe('Pixel');
    // @ts-expect-error deliberately exercising the runtime fallback
    expect(getFont('unknown').id).toBe('anton');
  });

  it('creates a visible, editable default layer', () => {
    const layer = createDefaultTextLayer('layer-1');
    expect(layer).toMatchObject({
      id: 'layer-1',
      text: 'MAKE IT WORSE',
      visible: true,
      align: 'center',
      outline: true,
      x: 0.5,
      y: 0.5,
    });
    expect(layer.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(layer.outlineColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('sizes text relative to the shortest image side with a readable floor', () => {
    const layer = createDefaultTextLayer('layer-1');
    expect(approximateTextPixels(layer, 1000, 500)).toBe(45);
    expect(approximateTextPixels({ ...layer, size: 1 }, 100, 100)).toBe(6);
  });
});
