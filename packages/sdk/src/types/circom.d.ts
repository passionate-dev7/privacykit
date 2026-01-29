/**
 * Type declarations for circomlibjs and snarkjs packages
 * These are stub declarations for ZK-SNARK circuit packages
 */

declare module 'circomlibjs' {
  export interface PoseidonFunction {
    (inputs: bigint[]): bigint;
    F: {
      p: bigint;
      e(val: bigint): bigint;
      fromObject(val: bigint): bigint;
      toObject(val: unknown): bigint;
    };
  }

  export interface MimcSpongeFunction {
    hash(xL: bigint, xR: bigint, k: bigint): { xL: bigint; xR: bigint };
    multiHash(arr: bigint[], k: bigint, numOutputs: number): bigint[];
  }

  export interface PedersenFunction {
    hash(msg: Uint8Array): Uint8Array;
    babyJub: {
      F: unknown;
      p: bigint;
      Generator: [bigint, bigint];
      Base8: [bigint, bigint];
      order: bigint;
      subOrder: bigint;
      addPoint(a: [bigint, bigint], b: [bigint, bigint]): [bigint, bigint];
      mulPointEscalar(base: [bigint, bigint], e: bigint): [bigint, bigint];
      packPoint(p: [bigint, bigint]): Uint8Array;
      unpackPoint(buff: Uint8Array): [bigint, bigint];
    };
  }

  export function buildPoseidon(): Promise<PoseidonFunction>;
  export function buildMimcSponge(): Promise<MimcSpongeFunction>;
  export function buildPedersenHash(): Promise<PedersenFunction>;
  export function buildBabyjub(): Promise<PedersenFunction['babyJub']>;
  export function buildEddsa(): Promise<unknown>;
}

declare module 'snarkjs' {
  export namespace groth16 {
    export interface ProofData {
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }

    export function fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<ProofData>;

    export function verify(
      vKey: unknown,
      publicSignals: string[],
      proof: ProofData['proof']
    ): Promise<boolean>;

    export function exportSolidityCallData(
      proof: ProofData['proof'],
      publicSignals: string[]
    ): Promise<string>;
  }

  export namespace plonk {
    export function fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<unknown>;

    export function verify(vKey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  }

  export namespace zKey {
    export function exportVerificationKey(zkeyPath: string): Promise<unknown>;
    export function newZKey(r1csPath: string, ptauPath: string, zkeyPath: string): Promise<void>;
  }

  export namespace wtns {
    export function calculate(
      input: Record<string, unknown>,
      wasmPath: string,
      wtnsPath: string
    ): Promise<void>;
  }
}

declare module 'ffjavascript' {
  export class Scalar {
    static fromString(s: string, radix?: number): bigint;
    static toString(a: bigint, radix?: number): string;
    static e(a: bigint | number | string): bigint;
    static mod(a: bigint, b: bigint): bigint;
    static add(a: bigint, b: bigint): bigint;
    static sub(a: bigint, b: bigint): bigint;
    static mul(a: bigint, b: bigint): bigint;
    static div(a: bigint, b: bigint): bigint;
    static pow(a: bigint, b: bigint): bigint;
    static inv(a: bigint, q: bigint): bigint;
    static neg(a: bigint): bigint;
    static isZero(a: bigint): boolean;
    static eq(a: bigint, b: bigint): boolean;
    static lt(a: bigint, b: bigint): boolean;
    static gt(a: bigint, b: bigint): boolean;
    static leq(a: bigint, b: bigint): boolean;
    static geq(a: bigint, b: bigint): boolean;
  }

  export function buildBn128(): Promise<unknown>;
  export function buildBls12381(): Promise<unknown>;
}
