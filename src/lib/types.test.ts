import { describe, it, expect } from 'vitest';
import {
    bytesToAscii,
    bytesToHex,
    bytesToString,
    createStreamDecoder,
    hexToBytes,
} from './types';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('hexToBytes', () => {
    it('parses lowercase hex', () => {
        expect(Array.from(hexToBytes('48656c6c6f'))).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it('parses uppercase hex', () => {
        expect(Array.from(hexToBytes('48656C6C6F'))).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it('ignores whitespace, commas, colons and dashes', () => {
        expect(Array.from(hexToBytes('48 65 6C'))).toEqual([0x48, 0x65, 0x6c]);
        expect(Array.from(hexToBytes('48,65,6C'))).toEqual([0x48, 0x65, 0x6c]);
        expect(Array.from(hexToBytes('48:65:6C'))).toEqual([0x48, 0x65, 0x6c]);
        expect(Array.from(hexToBytes('48-65-6C'))).toEqual([0x48, 0x65, 0x6c]);
        expect(Array.from(hexToBytes('  48\n65\t6C  '))).toEqual([0x48, 0x65, 0x6c]);
    });

    it('returns an empty array for empty input', () => {
        expect(hexToBytes('')).toEqual(new Uint8Array(0));
        expect(hexToBytes('   ')).toEqual(new Uint8Array(0));
    });

    it('throws on non-hex characters instead of silently truncating', () => {
        // parseInt('1g', 16) === 1, so this used to emit 0x01.
        expect(() => hexToBytes('1g')).toThrow(/Invalid hex string/);
        expect(() => hexToBytes('zz')).toThrow(/Invalid hex string/);
        expect(() => hexToBytes('48 6g 6C')).toThrow(/Invalid hex string/);
        expect(() => hexToBytes('0x48')).toThrow(/Invalid hex string/);
    });

    it('throws on odd-length input', () => {
        expect(() => hexToBytes('486')).toThrow(/odd number/);
        expect(() => hexToBytes('4')).toThrow(/odd number/);
    });
});

describe('bytesToHex', () => {
    it('formats bytes as uppercase space-separated pairs', () => {
        expect(bytesToHex(new Uint8Array([0x00, 0x0f, 0xff]))).toBe('00 0F FF');
    });

    it('returns an empty string for empty input', () => {
        expect(bytesToHex(new Uint8Array(0))).toBe('');
    });

    it('round-trips with hexToBytes', () => {
        const bytes = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xff]);
        expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
    });
});

describe('bytesToAscii', () => {
    it('keeps printable ASCII and replaces the rest with a dot', () => {
        expect(bytesToAscii(new Uint8Array([0x41, 0x42, 0x00, 0x1f, 0x7f, 0xc3]))).toBe('AB....');
    });

    it('renders a space as a space (0x20 is printable)', () => {
        expect(bytesToAscii(new Uint8Array([0x20, 0x7e]))).toBe(' ~');
    });
});

describe('bytesToString', () => {
    it('decodes UTF-8', () => {
        expect(bytesToString(encode('héllo €'))).toBe('héllo €');
    });

    it('decodes an empty buffer to an empty string', () => {
        expect(bytesToString(new Uint8Array(0))).toBe('');
    });

    it('mangles a multibyte character that is split across buffers (why createStreamDecoder exists)', () => {
        const bytes = encode('€');
        expect(bytesToString(bytes.subarray(0, 2))).toContain('\ufffd');
    });
});

describe('createStreamDecoder', () => {
    it('decodes a 3-byte character split across two chunks', () => {
        const decode = createStreamDecoder();
        const bytes = encode('€'); // E2 82 AC
        expect(decode(bytes.subarray(0, 2))).toBe('');
        expect(decode(bytes.subarray(2))).toBe('€');
    });

    it('decodes a 4-byte emoji split across two chunks', () => {
        const decode = createStreamDecoder();
        const bytes = encode('🚀');
        const first = decode(bytes.subarray(0, 3));
        const second = decode(bytes.subarray(3));
        expect(first + second).toBe('🚀');
        expect(first + second).not.toContain('\ufffd');
    });

    it('decodes sequential chunks with no replacement characters', () => {
        const decode = createStreamDecoder();
        const whole = 'AT+NAME=🚀\r\n€nd';
        const bytes = encode(whole);
        let out = '';
        for (let i = 0; i < bytes.length; i += 3) {
            out += decode(bytes.subarray(i, i + 3));
        }
        expect(out).toBe(whole);
        expect(out).not.toContain('\ufffd');
    });

    it('keeps decoders independent', () => {
        const a = createStreamDecoder();
        const b = createStreamDecoder();
        const bytes = encode('€');
        expect(a(bytes.subarray(0, 2))).toBe('');
        expect(b(encode('ok'))).toBe('ok');
        expect(a(bytes.subarray(2))).toBe('€');
    });

    it('decodes ASCII passthrough unchanged', () => {
        const decode = createStreamDecoder();
        expect(decode(encode('hello'))).toBe('hello');
        expect(decode(encode(' world'))).toBe(' world');
    });
});
