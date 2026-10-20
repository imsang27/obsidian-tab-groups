// 💡 gifenc에는 타입 정의가 없어, 데모 녹화에 쓰는 부분만 적어 둡니다.
declare module 'gifenc' {
    export type Palette = number[][];

    export interface FrameOptions {
        palette?: Palette;
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        repeat?: number;
    }

    export interface Encoder {
        writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
        finish(): void;
        bytes(): Uint8Array;
    }

    const gifenc: {
        GIFEncoder: () => Encoder;
        quantize: (rgba: Uint8Array | Uint8ClampedArray, maxColors: number) => Palette;
        applyPalette: (rgba: Uint8Array | Uint8ClampedArray, palette: Palette) => Uint8Array;
    };
    export default gifenc;
}
