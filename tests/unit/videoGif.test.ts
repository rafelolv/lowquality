import { describe, expect, it } from "vitest";
import {
  buildVideoGifName,
  defaultVideoGifWidth,
  detectVideoFormat,
  formatVideoTime,
  MAX_VIDEO_GIF_SECONDS,
  planVideoGif,
} from "../../src/lib/videoGifPlan";

function videoFile(name: string, type = ""): File {
  return new File([new Uint8Array(4)], name, { type });
}

describe("video GIF planning", () => {
  it("recognises browser-decodable containers and explains the rest", () => {
    for (const name of ["clip.mp4", "clip.M4V", "clip.mov", "clip.webm"]) {
      expect(detectVideoFormat(videoFile(name)).supported).toBe(true);
    }
    expect(detectVideoFormat(videoFile("clip.mp4", "video/mp4"))).toEqual({
      supported: true,
      label: "MP4",
    });
    const avi = detectVideoFormat(videoFile("clip.avi", "video/x-msvideo"));
    expect(avi.supported).toBe(false);
    expect(avi.reason).toMatch(/desktop transcoder/);
    expect(detectVideoFormat(videoFile("clip.xyz")).supported).toBe(false);
  });

  it("formats clip time with tenth-second precision", () => {
    expect(formatVideoTime(0)).toBe("0:00.0");
    expect(formatVideoTime(9.94)).toBe("0:09.9");
    expect(formatVideoTime(61.25)).toBe("1:01.3");
    expect(formatVideoTime(3661.4)).toBe("1:01:01.4");
    expect(formatVideoTime(Number.NaN)).toBe("0:00.0");
  });

  it("plans a landscape GIF with a safe frame budget", () => {
    const plan = planVideoGif({
      start: 0,
      end: 10,
      fps: 12,
      colors: 128,
      speed: 1,
      width: 480,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    expect(plan).toMatchObject({
      width: 480,
      height: 270,
      frameCount: 120,
      delay: 80,
      duration: 9.6,
      colors: 128,
    });
  });

  it("never exceeds the 800px ceiling or the decoded-pixel budget", () => {
    const plan = planVideoGif({
      start: 0,
      end: 2,
      fps: 10,
      colors: 64,
      speed: 1,
      width: 1920,
      sourceWidth: 1080,
      sourceHeight: 1920,
    });
    expect(plan.height).toBe(800);
    expect(plan.width).toBeLessThanOrEqual(800);
    expect(plan.width * plan.height * plan.frameCount).toBeLessThanOrEqual(
      24_000_000,
    );
  });

  it("rejects trims that are empty, too long, or too dense", () => {
    const base = {
      start: 0,
      end: 10,
      fps: 12,
      colors: 128,
      speed: 1,
      width: 320,
      sourceWidth: 640,
      sourceHeight: 360,
    };
    expect(() => planVideoGif({ ...base, end: 0 })).toThrow(/end point/);
    expect(() =>
      planVideoGif({ ...base, end: MAX_VIDEO_GIF_SECONDS + 1 }),
    ).toThrow(/capped/);
    expect(() =>
      planVideoGif({
        ...base,
        end: 20,
        fps: 30,
        width: 800,
        sourceWidth: 1920,
        sourceHeight: 1080,
      }),
    ).toThrow(/safe limit/);
  });

  it("adjusts delay for playback speed and clamps the palette", () => {
    const plan = planVideoGif({
      start: 0,
      end: 2,
      fps: 10,
      colors: 999,
      speed: 2,
      width: 160,
      sourceWidth: 160,
      sourceHeight: 90,
    });
    expect(plan.delay).toBe(50);
    expect(plan.colors).toBe(256);
  });

  it("suggests a default width that fits the pixel budget", () => {
    expect(defaultVideoGifWidth(1920, 1080, 0, 10, 12)).toBe(480);
    expect(defaultVideoGifWidth(1080, 1920, 0, 10, 12)).toBe(320);
    expect(defaultVideoGifWidth(160, 90, 0, 10, 12)).toBe(160);
  });

  it("builds a local GIF filename", () => {
    expect(buildVideoGifName("holiday clip.MOV")).toBe(
      "holiday clip-lowquality.gif",
    );
    expect(buildVideoGifName(".mp4")).toBe("video-lowquality.gif");
  });
});
