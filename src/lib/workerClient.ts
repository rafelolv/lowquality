import type {
  DegradationSettings,
  EnabledEffects,
  ExportFormat,
  GifDecodeMeta,
  TextOverlay,
  WorkerErrorCode,
} from '../types';
import type {
  DecodeGifRequest,
  ExportGifRequest,
  ExportGifStillRequest,
  ExportStaticRequest,
  InitStaticRequest,
  ProcessGifPreviewRequest,
  ProcessStaticPreviewRequest,
  SetOverlayRequest,
  WorkerRequest,
  WorkerResponse,
} from './workerProtocol';

export interface JobProgress {
  progress: number;
  stage: string;
}

export interface JobHandle<T> {
  jobId: string;
  promise: Promise<T>;
  cancel: () => void;
}

export class WorkerJobError extends Error {
  readonly code: WorkerErrorCode;

  constructor(message: string, code: WorkerErrorCode) {
    super(message);
    this.name = 'WorkerJobError';
    this.code = code;
  }
}

export class WorkerJobCancelled extends Error {
  constructor() {
    super('Processing cancelled');
    this.name = 'WorkerJobCancelled';
  }
}

interface PendingJob {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (progress: JobProgress) => void;
}

export interface StaticPreviewPayload {
  overlayId: string;
  settings: DegradationSettings;
  enabled: EnabledEffects;
  maxDimension: number;
}

export interface GifPreviewPayload extends StaticPreviewPayload {
  pixelBudget: number;
}

export interface ExportStaticPayload {
  overlayId: string;
  settings: DegradationSettings;
  enabled: EnabledEffects;
  format: Exclude<ExportFormat, 'gif'>;
}

export interface ExportGifPayload {
  overlayId: string;
  settings: DegradationSettings;
  enabled: EnabledEffects;
  outputScale: number;
}

export interface ExportGifStillPayload {
  overlayId: string;
  settings: DegradationSettings;
  enabled: EnabledEffects;
  format: Exclude<ExportFormat, 'gif'>;
  outputScale: number;
}

export interface PreviewStaticResult {
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

export interface PreviewGifResult {
  width: number;
  height: number;
  frames: Array<{ bitmap: ImageBitmap; delay: number }>;
}

function requestId(): string {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class DestroyWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingJob>();
  private disposed = false;

  constructor() {
    this.worker = new Worker(
      new URL('../workers/destroy.worker.ts', import.meta.url),
      { type: 'module', name: 'lowquality-processor' },
    );
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleWorkerError);
  }

  private handleMessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data;
    if (response.type === 'progress') {
      this.pending.get(response.jobId)?.onProgress?.({
        progress: response.progress,
        stage: response.stage,
      });
      return;
    }

    const job = this.pending.get(response.jobId);
    if (!job) return;
    this.pending.delete(response.jobId);

    switch (response.type) {
      case 'ready-static':
      case 'reset-done':
        job.resolve(undefined);
        break;
      case 'ready-gif':
        job.resolve(response.meta);
        break;
      case 'preview-static':
        job.resolve({
          width: response.width,
          height: response.height,
          bitmap: response.bitmap,
        } satisfies PreviewStaticResult);
        break;
      case 'preview-gif':
        job.resolve({
          width: response.width,
          height: response.height,
          frames: response.frames,
        } satisfies PreviewGifResult);
        break;
      case 'export-blob':
        job.resolve(response.blob);
        break;
      case 'error':
        job.reject(new WorkerJobError(response.message, response.code));
        break;
      case 'cancelled':
        job.reject(new WorkerJobCancelled());
        break;
    }
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    const error = new WorkerJobError(
      event.message || 'The local image processor stopped unexpectedly.',
      'processing-failed',
    );
    for (const job of this.pending.values()) {
      job.reject(error);
    }
    this.pending.clear();
  };

  private post(request: WorkerRequest, transfer: Transferable[] = []): void {
    if (this.disposed) {
      throw new WorkerJobError('The image processor is no longer available.', 'processing-failed');
    }
    this.worker.postMessage(request, transfer);
  }

  private startJob<T>(
    buildRequest: (jobId: string) => WorkerRequest,
    transfer: Transferable[],
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<T> {
    const jobId = requestId();
    const request = buildRequest(jobId);
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(jobId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress,
      });
    });

    try {
      this.post(request, transfer);
    } catch (error) {
      this.pending.delete(jobId);
      throw error;
    }

    return {
      jobId,
      promise,
      cancel: () => this.cancel(jobId),
    };
  }

  initStatic(
    width: number,
    height: number,
    buffer: ArrayBuffer,
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<void> {
    return this.startJob<void>(
      (jobId) => ({
        type: 'init-static',
        jobId,
        width,
        height,
        buffer,
      } satisfies InitStaticRequest),
      [buffer],
      onProgress,
    );
  }

  decodeGif(
    buffer: ArrayBuffer,
    scale: number,
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<GifDecodeMeta> {
    return this.startJob<GifDecodeMeta>(
      (jobId) => ({
        type: 'decode-gif',
        jobId,
        buffer,
        scale,
      } satisfies DecodeGifRequest),
      [buffer],
      onProgress,
    );
  }

  setOverlay(overlay: TextOverlay | null): void {
    if (!overlay) {
      const payload: SetOverlayRequest = {
        type: 'overlay',
        overlayId: 'none',
        width: 0,
        height: 0,
        buffer: null,
      };
      this.post(payload);
      return;
    }

    const copy = new Uint8ClampedArray(overlay.data);
    const payload: SetOverlayRequest = {
      type: 'overlay',
      overlayId: overlay.revision,
      width: overlay.width,
      height: overlay.height,
      buffer: copy.buffer,
    };
    this.post(payload, [copy.buffer]);
  }

  previewStatic(
    payload: StaticPreviewPayload,
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<PreviewStaticResult> {
    return this.startJob<PreviewStaticResult>(
      (jobId) => ({
        type: 'process-static-preview',
        jobId,
        ...payload,
      } satisfies ProcessStaticPreviewRequest),
      [],
      onProgress,
    );
  }

  previewGif(
    payload: GifPreviewPayload,
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<PreviewGifResult> {
    return this.startJob<PreviewGifResult>(
      (jobId) => ({
        type: 'process-gif-preview',
        jobId,
        ...payload,
      } satisfies ProcessGifPreviewRequest),
      [],
      onProgress,
    );
  }

  exportStatic(
    payload: ExportStaticPayload,
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<Blob> {
    return this.startJob<Blob>(
      (jobId) => ({
        type: 'export-static',
        jobId,
        ...payload,
      } satisfies ExportStaticRequest),
      [],
      onProgress,
    );
  }

  exportGif(
    payload: ExportGifPayload,
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<Blob> {
    return this.startJob<Blob>(
      (jobId) => ({
        type: 'export-gif',
        jobId,
        ...payload,
      } satisfies ExportGifRequest),
      [],
      onProgress,
    );
  }

  exportGifStill(
    payload: ExportGifStillPayload,
    onProgress?: (progress: JobProgress) => void,
  ): JobHandle<Blob> {
    return this.startJob<Blob>(
      (jobId) => ({
        type: 'export-gif-still',
        jobId,
        ...payload,
      } satisfies ExportGifStillRequest),
      [],
      onProgress,
    );
  }

  reset(): JobHandle<void> {
    return this.startJob<void>(
      (jobId) => ({ type: 'reset', jobId }) satisfies WorkerRequest,
      [],
    );
  }

  cancel(jobId: string): void {
    if (this.disposed) return;
    this.worker.postMessage({ type: 'cancel', jobId } satisfies WorkerRequest);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleWorkerError);
    this.worker.terminate();
    for (const job of this.pending.values()) {
      job.reject(new WorkerJobCancelled());
    }
    this.pending.clear();
  }
}
