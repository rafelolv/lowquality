/// <reference lib="webworker" />
import { GIFEncoder } from "gifenc";
import { prepareGifFrame } from "../lib/gifCodec";
import type {
  VideoGifCommand,
  VideoGifEvent,
  VideoGifStart,
} from "../lib/videoGifWorkerProtocol";

const scope = self as DedicatedWorkerGlobalScope;

interface EncoderState {
  encoder: ReturnType<typeof GIFEncoder>;
  width: number;
  height: number;
  delay: number;
  delays: number[];
  repeat: number;
  frameCount: number;
  reverse: boolean;
  colors: number;
  encoded: number;
  reversedFrames: Uint8ClampedArray[];
}

let state: EncoderState | null = null;

function send(event: VideoGifEvent, transfer: Transferable[] = []) {
  scope.postMessage(event, transfer);
}

function encodeFrame(pixels: Uint8ClampedArray) {
  if (!state) throw new Error("Video GIF encoder is not ready.");
  if (pixels.length !== state.width * state.height * 4) {
    throw new Error("A captured video frame had the wrong dimensions.");
  }
  const prepared = prepareGifFrame(
    pixels,
    state.width,
    state.height,
    state.colors,
  );
  state.encoder.writeFrame(prepared.indices, state.width, state.height, {
    palette: prepared.palette,
    transparent: prepared.transparent,
    transparentIndex: prepared.transparentIndex,
    delay: state.delays[state.encoded] ?? state.delay,
    repeat: state.repeat,
    dispose: prepared.transparent ? 2 : 1,
  });
  state.encoded += 1;
  send({ type: "progress", encoded: state.encoded });
}

function start(message: VideoGifStart) {
  state = {
    encoder: GIFEncoder(),
    width: message.width,
    height: message.height,
    delay: message.delay,
    delays: message.delays,
    repeat: message.repeat,
    frameCount: message.frameCount,
    reverse: message.reverse,
    colors: message.colors,
    encoded: 0,
    reversedFrames: [],
  };
  send({ type: "progress", encoded: 0 });
}

function finish() {
  if (!state) throw new Error("Video GIF encoder is not ready.");
  const current = state;
  if (current.reverse) {
    for (let index = current.reversedFrames.length - 1; index >= 0; index--) {
      const pixels = current.reversedFrames[index];
      if (pixels) encodeFrame(pixels);
    }
    current.reversedFrames = [];
  }
  if (current.encoded === 0) {
    throw new Error("No video frames could be captured.");
  }
  current.encoder.finish();
  const bytes = new Uint8Array(current.encoder.bytes());
  state = null;
  send({ type: "done", bytes: bytes.buffer }, [bytes.buffer]);
}

scope.onmessage = (event: MessageEvent<VideoGifCommand>) => {
  try {
    const message = event.data;
    if (message.type === "start") {
      start(message);
      return;
    }
    if (!state) throw new Error("Video GIF encoder is not ready.");
    if (message.type === "frame") {
      const pixels = new Uint8ClampedArray(message.pixels);
      if (state.reverse) state.reversedFrames.push(pixels);
      else encodeFrame(pixels);
      return;
    }
    if (message.type === "finish") finish();
  } catch (error) {
    state = null;
    send({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "The video GIF encoder failed.",
    });
  }
};
