/** Bounded local EXIF reader. Unknown maker notes remain deliberately opaque. */
export function readMetadata(buffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const result: Record<string, string> = {};
  const text = (offset: number, length: number) =>
    new TextDecoder()
      .decode(bytes.subarray(offset, offset + length))
      .replace(/\0+$/, "")
      .slice(0, 2048);
  let start = -1,
    end = bytes.length;
  if (view.byteLength < 8) return result;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 4 <= bytes.length; ) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const size = view.getUint16(offset + 2);
      if (size < 2 || offset + size + 2 > bytes.length) break;
      if (marker === 0xe1 && text(offset + 4, 6) === "Exif") {
        start = offset + 10;
        end = offset + 2 + size;
        break;
      }
      if (marker === 0xe1) result["XMP / application data"] = "Present";
      if (marker === 0xed) result["IPTC / Photoshop data"] = "Present";
      offset += 2 + size;
    }
  } else if (text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const size = view.getUint32(offset + 4, true);
      if (offset + 8 + size > bytes.length) break;
      if (text(offset, 4) === "EXIF") {
        start = offset + 8;
        end = start + size;
        if (text(start, 6) === "Exif") start += 6;
        break;
      }
      if (text(offset, 4) === "XMP ") result.XMP = "Present";
      offset += 8 + size + (size % 2);
    }
  } else if (bytes[0] === 0x89 && text(1, 3) === "PNG") {
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const size = view.getUint32(offset);
      if (offset + 12 + size > bytes.length) break;
      const type = text(offset + 4, 4);
      if (type === "eXIf") {
        start = offset + 8;
        end = start + size;
        break;
      }
      if (["tEXt", "iTXt", "zTXt"].includes(type))
        result["Text metadata"] = "Present";
      offset += 12 + size;
    }
  }
  if (start < 0 || start + 8 > end) return result;
  result.EXIF = "Present";
  try {
    const little = text(start, 2) === "II";
    if (!little && text(start, 2) !== "MM") return result;
    const valid = (offset: number, length: number) =>
      offset >= start && length >= 0 && offset + length <= end;
    const u16 = (offset: number) => {
      if (!valid(offset, 2)) throw new Error("bounds");
      return view.getUint16(offset, little);
    };
    const u32 = (offset: number) => {
      if (!valid(offset, 4)) throw new Error("bounds");
      return view.getUint32(offset, little);
    };
    if (u16(start + 2) !== 42) return result;
    const seen = new Set<number>();
    const gps: Record<number, string | number[]> = {};
    const names: Record<number, string> = {
      271: "Camera make",
      272: "Camera model",
      274: "Orientation",
      306: "Date",
      33434: "Exposure (seconds)",
      33437: "Aperture",
      34855: "ISO",
      36867: "Date taken",
      37386: "Focal length (mm)",
      42036: "Lens",
    };
    function directory(relative: number, isGps = false, depth = 0) {
      const offset = start + relative;
      if (seen.has(offset) || depth > 3 || !valid(offset, 2)) return;
      seen.add(offset);
      const count = Math.min(u16(offset), 512);
      for (let i = 0; i < count; i++) {
        const entry = offset + 2 + i * 12;
        if (!valid(entry, 12)) break;
        const tag = u16(entry),
          type = u16(entry + 2),
          length = u32(entry + 4);
        if (tag === 34665 || tag === 34853) {
          directory(u32(entry + 8), tag === 34853, depth + 1);
          continue;
        }
        const stride = (
          { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<
            number,
            number
          >
        )[type];
        if (!stride || length > 4096) continue;
        const size = stride * length;
        const data = size <= 4 ? entry + 8 : start + u32(entry + 8);
        if (!valid(data, size)) continue;
        let value: string | number[] = "";
        if (type === 2) value = text(data, length);
        else {
          const numbers: number[] = [];
          for (let j = 0; j < Math.min(length, 32); j++) {
            const at = data + j * stride;
            numbers.push(
              type === 3
                ? u16(at)
                : type === 5
                  ? u32(at) / (u32(at + 4) || 1)
                  : type === 4
                    ? u32(at)
                    : bytes[at],
            );
          }
          value = numbers;
        }
        if (isGps) gps[tag] = value;
        else if (names[tag])
          result[names[tag]] = Array.isArray(value) ? value.join(", ") : value;
      }
    }
    directory(u32(start + 4));
    if (Object.keys(gps).length) result.GPS = "Present";
    for (const [tag, ref, label] of [
      [2, 1, "GPS latitude"],
      [4, 3, "GPS longitude"],
    ] as const) {
      const parts = gps[tag];
      if (Array.isArray(parts) && parts.length === 3) {
        const sign = ["S", "W"].includes(String(gps[ref])) ? -1 : 1;
        result[label] = String(
          sign * (parts[0] + parts[1] / 60 + parts[2] / 3600),
        );
      }
    }
  } catch {
    result["EXIF reader"] = "Some fields could not be read.";
  }
  return result;
}
