import { Request, Response, NextFunction } from 'express';
import * as zlib from 'node:zlib';

export type CompressionAlgorithm = 'br' | 'gzip' | 'deflate';

export interface CompressionConfig {
  level?: number;
  threshold?: number;
  filter?: (req: Request, res: Response) => boolean;
  algorithms?: CompressionAlgorithm[];
  chunkSize?: number;
}

const DEFAULT_THRESHOLD = 1024;
const DEFAULT_ALGORITHMS: CompressionAlgorithm[] = ['br', 'gzip', 'deflate'];

function negotiateEncoding(
  acceptEncoding: string,
  algorithms: CompressionAlgorithm[],
): CompressionAlgorithm | null {
  const parsed = acceptEncoding
    .split(',')
    .map((s) => {
      const [enc, q] = s.trim().split(';q=');
      return { encoding: enc!.trim(), q: q ? parseFloat(q) : 1 };
    })
    .filter((e) => algorithms.includes(e.encoding as CompressionAlgorithm))
    .sort((a, b) => b.q - a.q);

  return (parsed[0]?.encoding as CompressionAlgorithm) ?? null;
}

function getCompressor(algorithm: CompressionAlgorithm, level?: number) {
  const options = level !== undefined ? { level } : {};
  switch (algorithm) {
    case 'br':
      return zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]:
            level ?? zlib.constants.BROTLI_DEFAULT_QUALITY,
        },
      });
    case 'gzip':
      return zlib.createGzip({ level: level ?? zlib.constants.Z_DEFAULT_COMPRESSION });
    case 'deflate':
      return zlib.createDeflate({ level: level ?? zlib.constants.Z_DEFAULT_COMPRESSION });
  }
}

function getContentEncoding(algorithm: CompressionAlgorithm): string {
  switch (algorithm) {
    case 'br':
      return 'br';
    case 'gzip':
      return 'gzip';
    case 'deflate':
      return 'deflate';
  }
}

export function createCompressionMiddleware(config: CompressionConfig = {}) {
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  const algorithms = config.algorithms ?? DEFAULT_ALGORITHMS;
  const filter = config.filter ?? (() => true);
  const level = config.level;
  const chunkSize = config.chunkSize ?? 16384;

  return (req: Request, res: Response, next: NextFunction): void => {
    const acceptEncoding = req.headers['accept-encoding'];
    if (!acceptEncoding) {
      next();
      return;
    }

    const algorithm = negotiateEncoding(acceptEncoding, algorithms);
    if (!algorithm || !filter(req, res)) {
      next();
      return;
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const originalWriteHead = res.writeHead.bind(res);

    let chunks: Buffer[] = [];
    let totalSize = 0;
    let headersWritten = false;

    res.writeHead = function (this, ...args: any[]): any {
      const [statusCode, ...rest] = args;
      let status: number;
      let headers: Record<string, string | string[] | undefined>;

      if (typeof statusCode === 'number') {
        status = statusCode;
        headers = (rest[0] as Record<string, any>) ?? {};
      } else {
        status = 200;
        headers = statusCode as any;
        rest.unshift(statusCode);
      }

      if (headers['content-encoding']) {
        headersWritten = true;
        return originalWriteHead(...args);
      }

      headers['content-encoding'] = getContentEncoding(algorithm);

      if (typeof statusCode === 'number') {
        return originalWriteHead(status, headers);
      }
      return originalWriteHead(headers);
    } as typeof res.writeHead;

    res.write = function (this, chunk: any, ...args: any[]): any {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8');
      chunks.push(buf);
      totalSize += buf.length;
      return true;
    } as typeof res.write;

    res.end = function (this, chunk?: any, ...args: any[]): any {
      if (chunk) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8');
        chunks.push(buf);
        totalSize += buf.length;
      }

      if (totalSize < threshold || headersWritten) {
        const full = Buffer.concat(chunks);
        originalWriteHead(res.statusCode, res.getHeaders() as any);
        originalWrite(full);
        return originalEnd();
      }

      const compressor = getCompressor(algorithm, level);
      const compressed: Buffer[] = [];

      compressor.on('data', (data: Buffer) => compressed.push(data));
      compressor.on('end', () => {
        const result = Buffer.concat(compressed);
        if (!res.headersSent) {
          res.setHeader('content-encoding', getContentEncoding(algorithm));
          res.setHeader('vary', 'Accept-Encoding');
          originalWriteHead(res.statusCode, res.getHeaders() as any);
        }
        originalWrite(result);
        originalEnd();
      });
      compressor.on('error', (err) => {
        const full = Buffer.concat(chunks);
        originalWriteHead(res.statusCode, res.getHeaders() as any);
        originalWrite(full);
        originalEnd(err);
      });

      for (const chunk of chunks) {
        compressor.write(chunk);
      }
      compressor.end();
    } as typeof res.end;

    next();
  };
}
