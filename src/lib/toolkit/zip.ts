const encoder = new TextEncoder();
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const safe =
      name
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^[-.]+/, "")
        .slice(0, 100) || "image";
    const dot = safe.lastIndexOf(".");
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : "";
    let candidate = safe;
    let index = 2;
    while (used.has(candidate.toLowerCase()))
      candidate = `${base}-${index++}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
export function crc32(data: Uint8Array): number {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
/** Store-only ZIP, UTF-8 filenames, CRC-32; no runtime dependency. */
export async function zip(
  files: { name: string; blob: Blob }[],
): Promise<Blob> {
  if (
    files.length > 65535 ||
    files.reduce((total, file) => total + file.blob.size + 512, 0) > 0xffffffff
  )
    throw new Error(
      "Archive exceeds ZIP size limits. Download smaller groups.",
    );
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  const names = uniqueNames(files.map((file) => file.name));
  for (let i = 0; i < files.length; i++) {
    const data = new Uint8Array(await files[i].blob.arrayBuffer());
    const name = encoder.encode(names[i]);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    const header = new Uint8Array(46 + name.length);
    const c = new DataView(header.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    header.set(name, 46);
    parts.push(local, data);
    central.push(header);
    offset += local.length + data.length;
    centralSize += header.length;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
