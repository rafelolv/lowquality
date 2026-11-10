import { describe, expect, it } from 'vitest';
import {
  compressionTargets,
  defaultCompressionTarget,
  reductionPercent,
} from '../../src/lib/compression';

const KB = 1024;
const MB = 1024 * KB;

describe('compression targets', () => {
  it('offers sensible presets and a 50% option', () => {
    const targets = compressionTargets(4 * MB);
    expect(targets.map((target) => target.bytes)).toEqual([
      2 * MB,
      MB,
      500 * KB,
      250 * KB,
      100 * KB,
    ]);
    expect(targets[0]?.label).toBe('50% · 2.0 MB');
    expect(targets[1]?.label).toBe('1.0 MB');
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

  it('falls back to half the file for images below the lowest preset', () => {
    const targets = compressionTargets(40 * KB);
    expect(targets).toEqual([{ bytes: 20 * KB, label: '50% · 20 KB' }]);
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
