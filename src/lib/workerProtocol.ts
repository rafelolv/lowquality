import type {
  DegradationSettings,
  EnabledEffects,
  ExportFormat,
  GifDecodeMeta,
  WorkerErrorCode,
} from '../types';

export interface InitStaticRequest {
  type: 'init-static';
  jobId: string;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface DecodeGifRequest {
  type: 'decode-gif';
  jobId: string;
  buffer: ArrayBuffer;
  scale: number;
}

export interface SetOverlayRequest {
  type: 'overlay';
  overlayId: string;
  width: number;
  height: number;
  buffer: ArrayBuffer | null;
}

export interface CancelRequest {
  type: 'cancel';
  jobId: string;
}

export interface ResetRequest {
  type: 'reset';
  jobId: string;
}

interface ProcessingBase {
  jobId: string;
  overlayId: string;
  settings: DegradationSettings;
  enabled: EnabledEffects;
}

export interface ProcessStaticPreviewRequest extends ProcessingBase {
  type: 'process-static-preview';
  maxDimension: number;
}

export interface ExportStaticRequest extends ProcessingBase {
  type: 'export-static';
  format: Exclude<ExportFormat, 'gif'>;
}

export interface ProcessGifPreviewRequest extends ProcessingBase {
  type: 'process-gif-preview';
  maxDimension: number;
  pixelBudget: number;
}

export interface ExportGifRequest extends ProcessingBase {
  type: 'export-gif';
  outputScale: number;
}

export interface ExportGifStillRequest extends ProcessingBase {
  type: 'export-gif-still';
  format: Exclude<ExportFormat, 'gif'>;
  outputScale: number;
}

export type WorkerRequest =
  | InitStaticRequest
  | DecodeGifRequest
  | SetOverlayRequest
  | CancelRequest
  | ResetRequest
  | ProcessStaticPreviewRequest
  | ExportStaticRequest
  | ProcessGifPreviewRequest
  | ExportGifRequest
  | ExportGifStillRequest;

export interface ReadyStaticResponse {
  type: 'ready-static';
  jobId: string;
}

export interface ReadyGifResponse {
  type: 'ready-gif';
  jobId: string;
  meta: GifDecodeMeta;
}

export interface PreviewStaticResponse {
  type: 'preview-static';
  jobId: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

export interface PreviewGifResponse {
  type: 'preview-gif';
  jobId: string;
  width: number;
  height: number;
  frames: Array<{ bitmap: ImageBitmap; delay: number }>;
}

export interface ExportBlobResponse {
  type: 'export-blob';
  jobId: string;
  blob: Blob;
  mime: string;
}

export interface ProgressResponse {
  type: 'progress';
  jobId: string;
  progress: number;
  stage: string;
}

export interface ErrorResponse {
  type: 'error';
  jobId: string;
  code: WorkerErrorCode;
  message: string;
}

export interface CancelledResponse {
  type: 'cancelled';
  jobId: string;
}

export interface ResetDoneResponse {
  type: 'reset-done';
  jobId: string;
}

export type WorkerResponse =
  | ReadyStaticResponse
  | ReadyGifResponse
  | PreviewStaticResponse
  | PreviewGifResponse
  | ExportBlobResponse
  | ProgressResponse
  | ErrorResponse
  | CancelledResponse
  | ResetDoneResponse;
