import { useMemo } from "react";
import { clsx } from "clsx";

interface QRCodeProps {
  data: string;
  size?: number;
  className?: string;
}

export default function QRCode({ data, size = 160, className }: QRCodeProps) {
  const svg = useMemo(() => generateQRCodeSVG(data), [data]);

  return (
    <div
      className={clsx("inline-block bg-white rounded-lg p-2", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ width: size + 16, height: size + 16 }}
    />
  );
}

function generateQRCodeSVG(data: string): string {
  const size = 21;
  const segments = calculateSegments(data);
  const matrix = placeModules(segments, size);
  const moduleSize = 3;

  const rects: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col]) {
        const x = col * moduleSize;
        const y = row * moduleSize;
        rects.push(`<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="#000"/>`);
      }
    }
  }

  const totalSize = size * moduleSize;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">${rects.join("")}</svg>`;
}

function calculateSegments(data: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    if (code < 128) {
      result.push(code);
    } else if (code < 2048) {
      result.push(192 | (code >> 6), 128 | (code & 63));
    } else {
      result.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
    }
  }
  return result;
}

function placeModules(_segments: number[], size: number): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const finderPattern = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];

  const applyPattern = (offsetRow: number, offsetCol: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        matrix[offsetRow + r][offsetCol + c] = finderPattern[r][c] === 1;
      }
    }
  };

  applyPattern(0, 0);
  applyPattern(0, size - 7);
  applyPattern(size - 7, 0);

  const separator = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r < 7 && c < 7 && matrix[r][c]) continue;
      if (r < 8 && c < 8) matrix[r][c] = separator[r][c] === 1;
      if (r < 8 && c >= size - 8 && c < size) matrix[r][c] = separator[r][c - (size - 8)] === 1;
      if (r >= size - 8 && r < size && c < 8) matrix[r][c] = separator[r - (size - 8)][c] === 1;
    }
  }

  const dataBits: boolean[] = [];
  for (const byte of _segments) {
    for (let i = 7; i >= 0; i--) {
      dataBits.push(((byte >> i) & 1) === 1);
    }
  }

  let bitIndex = 0;
  const totalModules = (size - 8) * (size - 8) - 7 - 7;
  const dataLength = Math.min(dataBits.length, totalModules);

  const positions: [number, number][] = [];
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col <= 6) col--;

    for (let row = 0; row < size; row++) {
      for (const c of [col, col - 1]) {
        if (c < 0) continue;
        if ((col > 6 || col < size - 7) && (c > 6 || c < size - 7)) {
          positions.push([row, c]);
        }
      }
    }
  }

  positions.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });

  for (const [row, col] of positions) {
    if (bitIndex < dataLength) {
      matrix[row][col] = dataBits[bitIndex];
      bitIndex++;
    }
  }

  return matrix;
}
