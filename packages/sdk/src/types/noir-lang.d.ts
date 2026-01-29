/**
 * Type declarations for @noir-lang packages
 * These are stub declarations for packages with native dependencies
 */

declare module '@noir-lang/noir_js' {
  export interface CompiledCircuit {
    bytecode: string;
    abi: {
      parameters: Array<{
        name: string;
        type: { kind: string };
        visibility: string;
      }>;
      return_type: { kind: string } | null;
    };
    debug_symbols?: string;
  }

  export type InputMap = Record<string, string | string[] | number | number[] | bigint | bigint[]>;

  export interface ExecutionResult {
    witness: Uint8Array;
    returnValue?: unknown;
  }

  export class Noir {
    constructor(circuit: CompiledCircuit);
    execute(inputs: InputMap): Promise<ExecutionResult>;
    destroy(): Promise<void>;
  }
}

declare module '@noir-lang/backend_barretenberg' {
  import type { CompiledCircuit } from '@noir-lang/noir_js';

  export interface ProofData {
    proof: Uint8Array;
    publicInputs: string[];
  }

  export interface BackendOptions {
    threads?: number;
    memory?: { maximum?: number };
  }

  export class BarretenbergBackend {
    constructor(circuit: CompiledCircuit, options?: BackendOptions);
    generateProof(witness: Uint8Array): Promise<ProofData>;
    verifyProof(proofData: ProofData): Promise<boolean>;
    getVerificationKey(): Promise<Uint8Array>;
    destroy(): Promise<void>;
  }
}

declare module '@noir-lang/types' {
  export interface CompiledCircuit {
    bytecode: string;
    abi: {
      parameters: Array<{
        name: string;
        type: { kind: string };
        visibility: string;
      }>;
      return_type: { kind: string } | null;
    };
    debug_symbols?: string;
  }

  export type InputMap = Record<string, string | string[] | number | number[] | bigint | bigint[]>;
}
