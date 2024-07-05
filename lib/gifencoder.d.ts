declare module 'gifencoder' {
    import { Readable } from 'stream';
  
    interface Options {
      highWaterMark?: number;
      lowWaterMark?: number;
    }
  
    class GIFEncoder {
      constructor(width: number, height: number, options?: Options);
      createReadStream(): Readable;
      createWriteStream(): Readable;
      start(): void;
      setRepeat(repeat: number): void;
      setDelay(ms: number): void;
      setQuality(quality: number): void;
      addFrame(ctx: CanvasRenderingContext2D | ImageData): void;
      finish(): void;
    }
  
    export default GIFEncoder;
  }
  