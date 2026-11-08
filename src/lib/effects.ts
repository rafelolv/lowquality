import { applyPalette, quantize } from "gifenc";

const clampByte = (value: number): number =>
  value < 0 ? 0 : value > 255 ? 255 : value;

/**
 * Lose chroma resolution while retaining luminance detail, like over-compressed
 * colour subsampling. Bilinear reconstruction bleeds colour across edges without
 * turning the entire image into nearest-neighbour blocks.
 */
export function bleedChroma(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(source);
  if (amount <= 0 || width < 2 || height < 2) return output;
  const strength = Math.min(1, amount / 100);
  const block = Math.max(
    2,
    Math.round((Math.max(width, height) * strength) / 140),
  );
  const columns = Math.ceil(width / block);
  const rows = Math.ceil(height / block);
  const redChroma = new Float32Array(columns * rows);
  const blueChroma = new Float32Array(columns * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let weight = 0;
      let red = 0;
      let blue = 0;
      for (
        let y = row * block;
        y < Math.min(height, (row + 1) * block);
        y += 1
      ) {
        for (
          let x = column * block;
          x < Math.min(width, (column + 1) * block);
          x += 1
        ) {
          const index = (y * width + x) * 4;
          const alpha = source[index + 3] / 255;
          const luma =
            0.299 * source[index] +
            0.587 * source[index + 1] +
            0.114 * source[index + 2];
          red += (source[index] - luma) * alpha;
          blue += (source[index + 2] - luma) * alpha;
          weight += alpha;
        }
      }
      const index = row * columns + column;
      redChroma[index] = weight ? red / weight : 0;
      blueChroma[index] = weight ? blue / weight : 0;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(rows - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const top = Math.floor(cy);
    const bottom = Math.min(rows - 1, top + 1);
    const fy = cy - top;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] === 0) continue;
      const cx = Math.min(columns - 1, Math.max(0, (x + 0.5) / block - 0.5));
      const left = Math.floor(cx);
      const right = Math.min(columns - 1, left + 1);
      const fx = cx - left;
      const a = top * columns + left;
      const b = top * columns + right;
      const c = bottom * columns + left;
      const d = bottom * columns + right;
      const red =
        (redChroma[a] * (1 - fx) + redChroma[b] * fx) * (1 - fy) +
        (redChroma[c] * (1 - fx) + redChroma[d] * fx) * fy;
      const blue =
        (blueChroma[a] * (1 - fx) + blueChroma[b] * fx) * (1 - fy) +
        (blueChroma[c] * (1 - fx) + blueChroma[d] * fx) * fy;
      const luma =
        0.299 * source[index] +
        0.587 * source[index + 1] +
        0.114 * source[index + 2];
      const cr = (source[index] - luma) * (1 - strength) + red * strength;
      const cb = (source[index + 2] - luma) * (1 - strength) + blue * strength;
      output[index] = clampByte(luma + cr);
      output[index + 1] = clampByte(luma - (0.299 * cr + 0.114 * cb) / 0.587);
      output[index + 2] = clampByte(luma + cb);
    }
  }
  return output;
}

/** Small, fast deterministic PRNG so animated previews and exports remain stable. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hasTransparency(
  data: Uint8ClampedArray,
  alphaThreshold = 255,
): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < alphaThreshold) return true;
  }
  return false;
}

/** Combined contrast + saturation pass. Values are percentages around neutral. */
export function adjustColor(
  source: Uint8ClampedArray,
  contrast: number,
  saturation: number,
): Uint8ClampedArray<ArrayBuffer> {
  const contrastFactor = contrast / 100;
  const saturationFactor = saturation / 100;
  if (contrastFactor === 1 && saturationFactor === 1) {
    return new Uint8ClampedArray(source);
  }

  const output = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    let r = clampByte(128 + (source[i] - 128) * contrastFactor);
    let g = clampByte(128 + (source[i + 1] - 128) * contrastFactor);
    let b = clampByte(128 + (source[i + 2] - 128) * contrastFactor);

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = clampByte(luma + (r - luma) * saturationFactor);
    g = clampByte(luma + (g - luma) * saturationFactor);
    b = clampByte(luma + (b - luma) * saturationFactor);

    output[i] = r;
    output[i + 1] = g;
    output[i + 2] = b;
    output[i + 3] = source[i + 3];
  }
  return output;
}

export function addNoise(
  source: Uint8ClampedArray,
  amount: number,
  seed: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (amount <= 0) return new Uint8ClampedArray(source);

  const output = new Uint8ClampedArray(source);
  const random = mulberry32(seed);
  // A softer response keeps low noise from looking like dust and high noise
  // from being so uniform that it turns grey.
  const strength = Math.pow(amount / 100, 0.8) * 92;

  for (let i = 0; i < output.length; i += 4) {
    if (output[i + 3] === 0) continue;
    const mono = (random() * 2 - 1) * strength;
    const shot = random() < 0.018 ? (random() * 2 - 1) * strength * 1.5 : 0;
    output[i] = clampByte(output[i] + mono + shot);
    output[i + 1] = clampByte(output[i + 1] + mono + shot);
    output[i + 2] = clampByte(output[i + 2] + mono - shot);
  }
  return output;
}

/**
 * Deliberately excessive unsharp mask. A 5-tap Laplacian is enough to create
 * the characteristic halos of an image that has been "enhanced" too many times.
 */
export function sharpenImage(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (amount <= 0 || width < 3 || height < 3) {
    return new Uint8ClampedArray(source);
  }

  const output = new Uint8ClampedArray(source);
  const strength = (amount / 100) * 1.45;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] === 0) continue;

      const left = index - 4;
      const right = index + 4;
      const up = index - width * 4;
      const down = index + width * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel];
        const edge =
          center * 4 -
          source[left + channel] -
          source[right + channel] -
          source[up + channel] -
          source[down + channel];
        output[index + channel] = clampByte(center + edge * strength);
      }
    }
  }
  return output;
}

/**
 * Reproduces the look of a failing signal: horizontal tears, shifted rows and
 * misaligned colour channels. Transparency is carried through unchanged.
 */
export function applyGlitch(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  seed: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (amount <= 0 || width === 0 || height === 0) {
    return new Uint8ClampedArray(source);
  }

  const random = mulberry32(seed);
  const output = new Uint8ClampedArray(source);
  const intensity = amount / 100;
  const maxShift = Math.max(2, Math.round(width * 0.13 * intensity));
  const bandCount = Math.max(1, Math.round(1 + intensity * 9));

  // Horizontal displacement bands.
  for (let band = 0; band < bandCount; band += 1) {
    const bandHeight = Math.max(
      2,
      Math.round((random() * 0.1 + 0.008) * height),
    );
    const startY = Math.floor(random() * Math.max(1, height - bandHeight));
    const shift = Math.round((random() * 2 - 1) * maxShift);

    for (let y = startY; y < Math.min(height, startY + bandHeight); y += 1) {
      const row = y * width;
      if (shift === 0) continue;
      for (let x = 0; x < width; x += 1) {
        const sourceX = x - shift;
        const targetIndex = (row + x) * 4;
        if (sourceX < 0 || sourceX >= width) {
          // Smear the nearest edge instead of leaving a hole.
          const edgeX = sourceX < 0 ? 0 : width - 1;
          const edgeIndex = (row + edgeX) * 4;
          output[targetIndex] = source[edgeIndex];
          output[targetIndex + 1] = source[edgeIndex + 1];
          output[targetIndex + 2] = source[edgeIndex + 2];
          output[targetIndex + 3] = source[edgeIndex + 3];
        } else {
          const sourceIndex = (row + sourceX) * 4;
          output[targetIndex] = source[sourceIndex];
          output[targetIndex + 1] = source[sourceIndex + 1];
          output[targetIndex + 2] = source[sourceIndex + 2];
          output[targetIndex + 3] = source[sourceIndex + 3];
        }
      }
    }
  }

  // Chromatic misalignment affects a subset of rows, like a loose composite cable.
  const colourShift = Math.max(1, Math.round(maxShift * 0.55));
  const ribbonSize = Math.max(
    4,
    Math.round((14 - intensity * 9) * height * 0.02),
  );
  const ribbonCount = Math.max(1, Math.round(intensity * 5));

  for (let ribbon = 0; ribbon < ribbonCount; ribbon += 1) {
    const y0 = Math.floor(random() * Math.max(1, height - ribbonSize));
    const y1 = Math.min(height, y0 + ribbonSize);
    const direction = random() < 0.5 ? -1 : 1;
    const offset = colourShift * direction;

    for (let y = y0; y < y1; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const targetIndex = (row + x) * 4;
        const redX = Math.min(width - 1, Math.max(0, x + offset));
        const blueX = Math.min(width - 1, Math.max(0, x - offset));
        output[targetIndex] = source[(row + redX) * 4];
        output[targetIndex + 2] = source[(row + blueX) * 4 + 2];
      }
    }
  }

  // Keep the original alpha mask. Colour channels may tear and shift, but a
  // transparent pixel must never become opaque or vice versa.
  for (let i = 3; i < output.length; i += 4) {
    output[i] = source[i];
  }

  return output;
}

/**
 * Real palette reduction using gifenc's pairwise nearest-neighbour quantiser.
 * This shares the same colour maths as the GIF encoder, which keeps the look of
 * static previews and exported GIFs close together.
 */
export function reduceColors(
  source: Uint8ClampedArray,
  colorCount: number,
): Uint8ClampedArray<ArrayBuffer> {
  const maxColors = Math.max(2, Math.min(256, Math.round(colorCount)));
  if (maxColors >= 256) return new Uint8ClampedArray(source);

  // gifenc reads the bytes of the RGBA array as a Uint32Array. Make a tightly
  // aligned copy so the buffer cannot include an offset from getImageData().
  const rgba = new Uint8ClampedArray(source);
  const transparent = hasTransparency(rgba);
  const format = transparent ? "rgba4444" : "rgb565";
  const palette = quantize(rgba, maxColors, {
    format,
    clearAlpha: transparent,
    oneBitAlpha: false,
  });
  const indices = applyPalette(rgba, palette, format);
  const output = new Uint8ClampedArray(rgba.length);

  for (let i = 0; i < indices.length; i += 1) {
    const color = palette[indices[i]];
    const offset = i * 4;
    output[offset] = color[0];
    output[offset + 1] = color[1];
    output[offset + 2] = color[2];
    output[offset + 3] = color.length > 3 ? color[3] : rgba[offset + 3];
  }
  return output;
}

/** A tiny helper used by the worker when restoring alpha after JPEG passes. */
export function preserveAlpha(
  rgbOrRgba: Uint8ClampedArray,
  alphaSource: Uint8ClampedArray,
): void {
  const length = Math.min(rgbOrRgba.length, alphaSource.length);
  for (let i = 3; i < length; i += 4) {
    rgbOrRgba[i] = alphaSource[i];
  }
}
