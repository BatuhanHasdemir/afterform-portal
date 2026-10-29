import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Audio is generated instead of committed, so the repository holds no binary files.

const SAMPLE_FILES = [
  { name: 'sample-417hz.mp3', frequency: 417, seconds: 6 },
  { name: 'sample-333hz.mp3', frequency: 333, seconds: 9 },
];

// MPEG-1 Layer III, 48 kHz, mono, constant 128 kbit/s: 1152 samples in exactly 384 bytes per
// frame, so no frame needs a padding byte.
const SAMPLE_RATE = 48_000;
const FRAME_BYTES = 384;
const FRAME_HEADER = [0xff, 0xfb, 0x94, 0xc0];
const GRANULE_SAMPLES = 576;

// Without an encoder, the tone is written straight into the spectrum. The first 18 of a
// granule's 576 lines belong to the lowest subband; an even line held at the same value in
// every granule makes the decoder's overlapping blocks add up to a steady sine of
// line * 48000 / 1152 Hz. The decoder's alias reduction leaks lines from 10 upwards into the
// next subband: about -50 dB at line 10, audibly more above it, so tones stop at line 10.
const LINE_HZ = SAMPLE_RATE / 1152;
const MIN_LINE = 2;
const MAX_LINE = 10;

// A line of value 1 decodes to an amplitude of 2^((gain - 210) / 4): about 0.3 of full scale.
const GLOBAL_GAIN = 203;

/**
 * A steady sine as an MP3 file; the frequency is rounded to the nearest multiple of 83 1/3 Hz
 * between 83 and 417 Hz.
 */
export function toneMp3({ frequency, seconds }) {
  const line = Math.min(MAX_LINE, Math.max(MIN_LINE, 2 * Math.round(frequency / LINE_HZ / 2)));
  const toneGranules = Math.max(1, Math.round((seconds * SAMPLE_RATE) / GRANULE_SAMPLES));
  // A silent granule after the tone lets the last block fade out instead of stopping dead,
  // and one more silent frame flushes the decoder's filter bank.
  const frames = Math.ceil((toneGranules + 1) / 2) + 1;
  const mp3 = Buffer.alloc(frames * FRAME_BYTES);

  for (let frame = 0; frame < frames; frame += 1) {
    const write = bitWriter(mp3, frame * FRAME_BYTES);
    for (const byte of FRAME_HEADER) write(byte, 8);
    // main_data_begin 0 (no bit reservoir), private bits, scfsi.
    write(0, 9 + 5 + 4);
    const tones = [0, 1].map((granule) => frame * 2 + granule < toneGranules);
    for (const tone of tones) {
      write(tone ? lineBits(line) : 0, 12);
      // big_values 0: every coded value sits in the count1 region.
      write(0, 9);
      write(tone ? GLOBAL_GAIN : 0, 8);
      // scalefac_compress, window switching, table selects, region counts, preflag and
      // scalefac_scale are all zero: no scale factors, one long block.
      write(0, 4 + 1 + 15 + 4 + 3 + 1 + 1);
      // count1 table B.
      write(1, 1);
    }
    for (const tone of tones) if (tone) writeLine(write, line);
  }
  return mp3;
}

// Count1 table B codes four values of 0 or 1 as their bits inverted, then one sign bit for
// every value that is not zero.
function writeLine(write, line) {
  for (let quad = 0; quad < Math.floor(line / 4); quad += 1) write(0b1111, 4);
  write(15 - (8 >> line % 4), 4);
  write(0, 1);
}

function lineBits(line) {
  return 4 * (Math.floor(line / 4) + 1) + 1;
}

function bitWriter(buffer, byteOffset) {
  let bit = byteOffset * 8;
  return (value, count) => {
    for (let i = count - 1; i >= 0; i -= 1) {
      if ((value >>> i) & 1) buffer[bit >> 3] |= 0x80 >> (bit & 7);
      bit += 1;
    }
  };
}

export function writeSampleFiles(outDir) {
  mkdirSync(outDir, { recursive: true });
  return SAMPLE_FILES.map(({ name, ...tone }) => {
    const path = join(outDir, name);
    writeFileSync(path, toneMp3(tone));
    return path;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = process.argv[2] ?? fileURLToPath(new URL('./.data/fixtures/', import.meta.url));
  for (const path of writeSampleFiles(outDir)) console.log(path);
}
