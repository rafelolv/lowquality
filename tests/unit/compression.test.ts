import { describe, expect, it } from 'vitest';
import {
  compressionTargets,
  defaultCompressionTarget,
  dimensionOptions,
  formatTargetMb,
  parseTargetMb,
  reductionPercent,
} from '../../src/lib/compression';

const KB = 1024;
const MB = 1024 * KB;

describe('compression targets', () => {
  it('offers sensible presets and percentage options', () => {
    const targets = compressionTargets(4 * MB);
    expect(targets.map((target) => target.bytes)).toEqual([
      3 * MB,
      2 * MB,
      MB,
      500 * KB,
      250 * KB,
      100 * KB,
      50 * KB,
    ]);
    expect(targets[0]?.label).toBe('75% · 3.0 MB');
    expect(targets[1]?.label).toBe('2.0 MB');
  });

  it('never offers a target larger than the source', () => {
    for (const source of [40 * KB, 300 * KB, 1.4 * MB, 9 * MB]) {
      const targets = compressionTargets(source);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.bytes).toBeLessThan(source);
      }
    }
  });

  it('falls back to percentages for images below the lowest preset', () => {
    const targets = compressionTargets(40 * KB);
    expect(targets).toEqual([
      { bytes: 30 * KB, label: '75% · 30 KB' },
      { bytes: 20 * KB, label: '50% · 20 KB' },
      { bytes: 10 * KB, label: '25% · 10 KB' },
    ]);
  });

  it('defaults near a 45% reduction', () => {
    expect(defaultCompressionTarget(8 * MB)).toBe(4 * MB);
    expect(defaultCompressionTarget(300 * KB)).toBe(150 * KB);
    expect(defaultCompressionTarget(4 * MB)).toBe(2 * MB);
  });

  it('reports savings without going negative', () => {
    expect(reductionPercent(1_000_000, 400_000)).toBe(60);
    expect(reductionPercent(1_000_000, 1_200_000)).toBe(0);
    expect(reductionPercent(0, 10)).toBe(0);
  });
});

describe('compression fine-tuning', () => {
  it('only offers resolution caps that constrain the source', () => {
    expect(dimensionOptions(600, 450)).toEqual([
      { value: 0, label: 'Original' },
    ]);
    expect(dimensionOptions(4000, 3000).map((option) => option.label)).toEqual([
      'Original',
      '4K',
      '2K',
      '1080p',
      '720p',
    ]);
    expect(dimensionOptions(1500, 1000).map((option) => option.value)).toEqual([
      0, 1280,
    ]);
  });

  it('parses custom MB targets, including tiny files', () => {
    const source = 2 * MB;
    expect(parseTargetMb('0.5', source)).toBe(512 * KB);
    expect(parseTargetMb('0,25', source)).toBe(256 * KB);
    expect(parseTargetMb('1.9', source)).toBe(Math.round(1.9 * MB));
    expect(parseTargetMb('2', source)).toBeNull();
    expect(parseTargetMb('0', source)).toBeNull();
    expect(parseTargetMb('nope', source)).toBeNull();
    expect(parseTargetMb('', source)).toBeNull();
    expect(parseTargetMb('0.0002', 500)).toBe(210);
    expect(parseTargetMb('0.00001', 500)).toBeNull();
  });

  it('formats MB targets for the input without losing tiny values', () => {
    expect(formatTargetMb(2 * MB)).toBe('2');
    expect(formatTargetMb(1.5 * MB)).toBe('1.5');
    expect(formatTargetMb(500 * KB)).toBe('0.49');
    expect(formatTargetMb(563)).toBe('0.00054');
    expect(formatTargetMb(32)).toBe('0.00003');
  });
});
