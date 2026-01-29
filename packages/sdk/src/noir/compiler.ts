/**
 * Noir Circuit Compiler
 *
 * Handles compilation of Noir circuits to ACIR (Abstract Circuit Intermediate Representation)
 * and manages compiled circuit artifacts for the PrivacyKit SDK.
 */

import { Noir } from '@noir-lang/noir_js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Compiled circuit interface from @noir-lang/types
 * Defined locally for compatibility
 */
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

/**
 * Input map type for circuit execution
 */
export type InputMap = Record<string, string | string[] | number | number[] | bigint | bigint[]>;

/**
 * Circuit metadata for tracking and management
 */
export interface CircuitMetadata {
  name: string;
  description: string;
  publicInputs: string[];
  privateInputs: string[];
  version: string;
  compiledAt?: number;
}

/**
 * Compiled circuit artifact with metadata
 */
export interface CompiledCircuitArtifact {
  circuit: CompiledCircuit;
  metadata: CircuitMetadata;
  bytecodeHash: string;
}

/**
 * Circuit compilation options
 */
export interface CompileOptions {
  /** Enable debug symbols for better error messages */
  debug?: boolean;
  /** Optimization level (0-3) */
  optimization?: number;
  /** Output directory for compiled artifacts */
  outputDir?: string;
}

/**
 * Pre-compiled circuit definitions for PrivacyKit
 * These are the standard circuits included with the SDK
 */
export const CIRCUIT_DEFINITIONS: Record<string, CircuitMetadata> = {
  'private-transfer': {
    name: 'Private Transfer',
    description: 'Proves valid transfer without revealing amount using Pedersen commitments',
    publicInputs: ['input_commitment', 'output_commitment', 'nullifier'],
    privateInputs: ['amount', 'sender_blinding', 'recipient_blinding', 'nullifier_secret'],
    version: '1.0.0',
  },
  'balance-threshold': {
    name: 'Balance Threshold',
    description: 'Proves balance exceeds threshold without revealing actual balance',
    publicInputs: ['threshold', 'commitment'],
    privateInputs: ['balance', 'blinding'],
    version: '1.0.0',
  },
  'ownership-proof': {
    name: 'Ownership Proof',
    description: 'Proves ownership via Merkle inclusion without revealing which asset',
    publicInputs: ['merkle_root', 'nullifier'],
    privateInputs: ['asset', 'owner_secret', 'merkle_path', 'path_indices', 'nullifier_secret'],
    version: '1.0.0',
  },
  'balance-range': {
    name: 'Balance Range',
    description: 'Proves balance is within a specified range',
    publicInputs: ['min_threshold', 'max_threshold', 'commitment'],
    privateInputs: ['balance', 'blinding'],
    version: '1.0.0',
  },
  'multi-transfer': {
    name: 'Multi-Input Transfer',
    description: 'Combines multiple inputs into one output',
    publicInputs: ['input_commitments', 'output_commitment', 'nullifiers', 'num_inputs'],
    privateInputs: ['amounts', 'blindings', 'output_blinding', 'nullifier_secrets'],
    version: '1.0.0',
  },
  'exclusion-proof': {
    name: 'Exclusion Proof',
    description: 'Proves an address is NOT in a set (e.g., sanctions list)',
    publicInputs: ['merkle_root', 'address_commitment'],
    privateInputs: ['address', 'address_blinding', 'merkle_path', 'path_indices'],
    version: '1.0.0',
  },
};

/**
 * NoirCompiler class for compiling and managing Noir circuits
 */
export class NoirCompiler {
  private compiledCircuits: Map<string, CompiledCircuitArtifact> = new Map();
  private circuitsPath: string;
  private outputPath: string;

  constructor(options?: { circuitsPath?: string; outputPath?: string }) {
    // Determine the circuits path relative to this file
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));

    this.circuitsPath = options?.circuitsPath || join(currentDir, '../../circuits');
    this.outputPath = options?.outputPath || join(currentDir, '../../circuits/target');
  }

  /**
   * Load a pre-compiled circuit artifact from disk
   */
  async loadCompiledCircuit(circuitName: string): Promise<CompiledCircuitArtifact> {
    // Check cache first
    const cached = this.compiledCircuits.get(circuitName);
    if (cached) {
      return cached;
    }

    // Try to load from target directory
    const artifactPath = join(this.outputPath, `${circuitName}.json`);

    if (!existsSync(artifactPath)) {
      throw new Error(
        `Compiled circuit not found: ${circuitName}. ` +
        `Please compile the circuit first using 'nargo compile'.`
      );
    }

    const artifactJson = readFileSync(artifactPath, 'utf-8');
    const compiledCircuit = JSON.parse(artifactJson) as CompiledCircuit;

    const metadata = CIRCUIT_DEFINITIONS[circuitName] || {
      name: circuitName,
      description: 'Custom circuit',
      publicInputs: [],
      privateInputs: [],
      version: '0.0.0',
    };

    const artifact: CompiledCircuitArtifact = {
      circuit: compiledCircuit,
      metadata: {
        ...metadata,
        compiledAt: Date.now(),
      },
      bytecodeHash: this.computeBytecodeHash(compiledCircuit.bytecode),
    };

    // Cache the artifact
    this.compiledCircuits.set(circuitName, artifact);

    return artifact;
  }

  /**
   * Load circuit from inline JSON artifact
   * Used for bundled circuits that are embedded in the SDK
   */
  async loadFromArtifact(
    circuitName: string,
    artifact: CompiledCircuit,
    metadata?: Partial<CircuitMetadata>
  ): Promise<CompiledCircuitArtifact> {
    const baseMetadata = CIRCUIT_DEFINITIONS[circuitName] || {
      name: circuitName,
      description: 'Custom circuit',
      publicInputs: [],
      privateInputs: [],
      version: '0.0.0',
    };

    const compiledArtifact: CompiledCircuitArtifact = {
      circuit: artifact,
      metadata: {
        ...baseMetadata,
        ...metadata,
        compiledAt: Date.now(),
      },
      bytecodeHash: this.computeBytecodeHash(artifact.bytecode),
    };

    this.compiledCircuits.set(circuitName, compiledArtifact);
    return compiledArtifact;
  }

  /**
   * Get a compiled circuit by name
   */
  getCircuit(circuitName: string): CompiledCircuitArtifact | undefined {
    return this.compiledCircuits.get(circuitName);
  }

  /**
   * List all loaded circuits
   */
  listLoadedCircuits(): string[] {
    return Array.from(this.compiledCircuits.keys());
  }

  /**
   * Get circuit metadata
   */
  getCircuitMetadata(circuitName: string): CircuitMetadata | undefined {
    const artifact = this.compiledCircuits.get(circuitName);
    if (artifact) {
      return artifact.metadata;
    }
    return CIRCUIT_DEFINITIONS[circuitName];
  }

  /**
   * Validate inputs against circuit definition
   */
  validateInputs(
    circuitName: string,
    publicInputs: InputMap,
    privateInputs: InputMap
  ): { valid: boolean; errors: string[] } {
    const metadata = this.getCircuitMetadata(circuitName);
    if (!metadata) {
      return { valid: false, errors: [`Unknown circuit: ${circuitName}`] };
    }

    const errors: string[] = [];

    // Check public inputs
    for (const input of metadata.publicInputs) {
      if (!(input in publicInputs)) {
        errors.push(`Missing public input: ${input}`);
      }
    }

    // Check private inputs
    for (const input of metadata.privateInputs) {
      if (!(input in privateInputs)) {
        errors.push(`Missing private input: ${input}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Compute a hash of the bytecode for integrity verification
   */
  private computeBytecodeHash(bytecode: string): string {
    // Simple hash for identification purposes
    let hash = 0;
    for (let i = 0; i < bytecode.length; i++) {
      const char = bytecode.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Clear cached circuits
   */
  clearCache(): void {
    this.compiledCircuits.clear();
  }

  /**
   * Export circuit artifact to JSON
   */
  exportCircuit(circuitName: string): string | null {
    const artifact = this.compiledCircuits.get(circuitName);
    if (!artifact) {
      return null;
    }
    return JSON.stringify(artifact, null, 2);
  }
}

/**
 * Default compiler instance
 */
export const defaultCompiler = new NoirCompiler();

/**
 * Create a new compiler with custom options
 */
export function createCompiler(options?: {
  circuitsPath?: string;
  outputPath?: string;
}): NoirCompiler {
  return new NoirCompiler(options);
}

/**
 * Utility to format circuit inputs for the prover
 */
export function formatInputs(
  publicInputs: Record<string, unknown>,
  privateInputs: Record<string, unknown>
): InputMap {
  const formatted: InputMap = {};

  // Process public inputs
  for (const [key, value] of Object.entries(publicInputs)) {
    formatted[key] = formatValue(value);
  }

  // Process private inputs
  for (const [key, value] of Object.entries(privateInputs)) {
    formatted[key] = formatValue(value);
  }

  return formatted;
}

/**
 * Format a single value for circuit input
 */
function formatValue(value: unknown): string | string[] {
  if (typeof value === 'string') {
    // If it's a hex string, convert to field element
    if (value.startsWith('0x')) {
      return BigInt(value).toString();
    }
    return value;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(v => formatValue(v) as string);
  }

  if (value instanceof Uint8Array) {
    return Array.from(value).map(b => b.toString());
  }

  throw new Error(`Unsupported input type: ${typeof value}`);
}
