export interface CompressedCandidate {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
}
const COMPRESS_BASE_QUALITY = 0.82;
const COMPRESS_MAX_QUALITY = 0.95;
const COMPRESS_MIN_MAX_DIMENSION = 240;
export async function searchCompression(
  width: number,
  height: number,
  options: { targetBytes: number; qualityFloor: number; maxDimension: number },
  encode: (scale: number, quality: number) => Promise<CompressedCandidate>,
  onProgress?: (progress: number) => void,
) {
  const target = Math.max(64, Math.round(options.targetBytes));
  const floor = Math.min(
    COMPRESS_MAX_QUALITY,
    Math.max(0.3, options.qualityFloor),
  );
  const baseQuality = Math.max(COMPRESS_BASE_QUALITY, floor);
  const sourceMax = Math.max(width, height);
  const startScale =
    options.maxDimension > 0
      ? Math.min(1, options.maxDimension / sourceMax)
      : 1;
  let attempts = 0;
  let smallest: CompressedCandidate | null = null;

  const tryQuality = async (
    scale: number,
    quality: number,
  ): Promise<CompressedCandidate> => {
    attempts += 1;
    onProgress?.(Math.min(92, 6 + attempts * 8));
    const candidate = await encode(scale, quality);
    if (!smallest || candidate.blob.size < smallest.blob.size) {
      smallest = candidate;
    }
    return candidate;
  };

  const searchHighestQuality = async (
    scale: number,
    lowQuality: number,
    lowCandidate: CompressedCandidate,
    highQuality: number,
  ): Promise<CompressedCandidate> => {
    if (highQuality - lowQuality < 0.01) return lowCandidate;
    let low = lowQuality;
    let high = highQuality;
    let best = lowCandidate;
    for (let step = 0; step < 5; step += 1) {
      const quality = (low + high) / 2;
      const next = await tryQuality(scale, quality);
      if (next.blob.size <= target) {
        best = next;
        low = quality;
      } else {
        high = quality;
      }
    }
    return best;
  };

  let scale = startScale;
  let hit: CompressedCandidate | null = null;

  for (let round = 0; round < 9; round += 1) {
    const candidate = await tryQuality(scale, baseQuality);
    if (candidate.blob.size <= target) {
      hit = await searchHighestQuality(
        scale,
        baseQuality,
        candidate,
        COMPRESS_MAX_QUALITY,
      );
      break;
    }

    // The comfortable quality is too heavy. Use the floor before shrinking.
    let floorCandidate = candidate;
    if (baseQuality > floor) {
      floorCandidate = await tryQuality(scale, floor);
      if (floorCandidate.blob.size <= target) {
        hit = await searchHighestQuality(
          scale,
          floor,
          floorCandidate,
          baseQuality,
        );
        break;
      }
    }

    const currentMaxDimension = sourceMax * scale;
    if (currentMaxDimension <= COMPRESS_MIN_MAX_DIMENSION) break;
    const estimated = Math.sqrt(target / floorCandidate.blob.size) * 1.03;
    const factor = Math.max(0.7, Math.min(0.9, estimated));
    scale *= factor;
  }

  const chosen = hit ?? smallest;
  if (!chosen) throw new Error("The image could not be compressed.");
  return { ...chosen, attempts, hitTarget: hit !== null };
}
