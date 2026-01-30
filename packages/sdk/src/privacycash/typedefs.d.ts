/**
 * Type declarations for external ZK libraries
 */

// Type declarations for circomlibjs
declare module 'circomlibjs' {
  export interface PoseidonF {
    e(value: bigint | string | number): any;
    toString(value: any): string;
    toObject(value: any): bigint;
  }

  export interface Poseidon {
    (inputs: any[]): any;
    F: PoseidonF;
  }

  export function buildPoseidon(): Promise<Poseidon>;
  export function buildMimcSponge(): Promise<any>;
  export function buildBabyjub(): Promise<any>;
  export function buildEddsa(): Promise<any>;
  export function buildPedersenHash(): Promise<any>;
}

// Type declarations for snarkjs
declare module 'snarkjs' {
  export interface Groth16 {
    fullProve(
      input: any,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array
    ): Promise<{
      proof: {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;

    verify(
      vkey: any,
      publicSignals: string[],
      proof: any
    ): Promise<boolean>;

    exportSolidityCallData(
      proof: any,
      publicSignals: string[]
    ): Promise<string>;
  }

  export interface Plonk {
    fullProve(
      input: any,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array
    ): Promise<{
      proof: any;
      publicSignals: string[];
    }>;

    verify(
      vkey: any,
      publicSignals: string[],
      proof: any
    ): Promise<boolean>;
  }

  export interface ZKey {
    exportVerificationKey(zkeyFile: string | Uint8Array): Promise<any>;
    beacon(
      zkeyFile: string | Uint8Array,
      zkeyNew: string,
      name: string,
      entropy: string,
      numIterations: number
    ): Promise<void>;
    contribute(
      zkeyFile: string | Uint8Array,
      zkeyNew: string,
      name: string,
      entropy?: string
    ): Promise<void>;
  }

  export interface Wtns {
    calculate(
      input: any,
      wasmFile: string | Uint8Array
    ): Promise<Uint8Array>;
  }

  export const groth16: Groth16;
  export const plonk: Plonk;
  export const zKey: ZKey;
  export const wtns: Wtns;
}

// Type declarations for ffjavascript
declare module 'ffjavascript' {
  export interface FieldElement {
    toString(): string;
    toArray(): number[];
    eq(other: FieldElement): boolean;
    add(other: FieldElement): FieldElement;
    sub(other: FieldElement): FieldElement;
    mul(other: FieldElement): FieldElement;
    div(other: FieldElement): FieldElement;
    neg(): FieldElement;
    inv(): FieldElement;
    square(): FieldElement;
    sqrt(): FieldElement;
    isZero(): boolean;
  }

  export interface ZqField {
    e(value: bigint | string | number): FieldElement;
    zero: FieldElement;
    one: FieldElement;
    two: FieldElement;
    neg(a: FieldElement): FieldElement;
    inv(a: FieldElement): FieldElement;
    add(a: FieldElement, b: FieldElement): FieldElement;
    sub(a: FieldElement, b: FieldElement): FieldElement;
    mul(a: FieldElement, b: FieldElement): FieldElement;
    div(a: FieldElement, b: FieldElement): FieldElement;
    square(a: FieldElement): FieldElement;
    sqrt(a: FieldElement): FieldElement;
    eq(a: FieldElement, b: FieldElement): boolean;
    isZero(a: FieldElement): boolean;
    random(): FieldElement;
    toObject(a: FieldElement): bigint;
    toString(a: FieldElement): string;
  }

  export class Scalar {
    static e(value: bigint | string | number): bigint;
    static add(a: bigint, b: bigint): bigint;
    static sub(a: bigint, b: bigint): bigint;
    static mul(a: bigint, b: bigint): bigint;
    static div(a: bigint, b: bigint): bigint;
    static mod(a: bigint, b: bigint): bigint;
    static pow(a: bigint, b: bigint): bigint;
    static exp(a: bigint, b: bigint, m: bigint): bigint;
    static inv(a: bigint, m: bigint): bigint;
    static eq(a: bigint, b: bigint): boolean;
    static lt(a: bigint, b: bigint): boolean;
    static gt(a: bigint, b: bigint): boolean;
    static leq(a: bigint, b: bigint): boolean;
    static geq(a: bigint, b: bigint): boolean;
    static isZero(a: bigint): boolean;
    static isNegative(a: bigint): boolean;
    static isOdd(a: bigint): boolean;
    static shiftLeft(a: bigint, n: number): bigint;
    static shiftRight(a: bigint, n: number): bigint;
    static band(a: bigint, b: bigint): bigint;
    static bor(a: bigint, b: bigint): bigint;
    static bxor(a: bigint, b: bigint): bigint;
    static bnot(a: bigint): bigint;
    static bits(a: bigint): number[];
    static fromString(s: string, radix?: number): bigint;
    static toString(a: bigint, radix?: number): string;
    static fromArray(arr: number[], radix?: number): bigint;
    static toArray(a: bigint, radix?: number): number[];
    static fromRprLE(buf: Uint8Array, offset?: number, len?: number): bigint;
    static toRprLE(buf: Uint8Array, offset: number, a: bigint, len?: number): void;
    static fromRprBE(buf: Uint8Array, offset?: number, len?: number): bigint;
    static toRprBE(buf: Uint8Array, offset: number, a: bigint, len?: number): void;
  }

  export function buildBn128(): Promise<{
    Fr: ZqField;
    Fq: ZqField;
    G1: any;
    G2: any;
    F1: ZqField;
    F2: any;
    Gt: any;
  }>;

  export function buildBls12381(): Promise<any>;
  export function getCurveFromName(name: string): Promise<any>;
}
