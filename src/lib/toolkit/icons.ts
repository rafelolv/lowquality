/** ICO directory containing PNG images, supported by modern icon consumers. */
export async function makeIco(
  images: { size: number; blob: Blob }[],
): Promise<Blob> {
  const header = new Uint8Array(6 + images.length * 16);
  const view = new DataView(header.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = header.length;
  images.forEach(({ size, blob }, i) => {
    const at = 6 + i * 16;
    header[at] = size;
    header[at + 1] = size;
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, blob.size, true);
    view.setUint32(at + 12, offset, true);
    offset += blob.size;
  });
  return new Blob([header, ...images.map((image) => image.blob)], {
    type: "image/x-icon",
  });
}
export const ICON_HTML = `<link rel="icon" href="favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="manifest" href="manifest.webmanifest">`;
