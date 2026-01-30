/**
 * Merkle Tree Implementation with Poseidon Hash
 *
 * Production-ready incremental Merkle tree for Privacy Cash protocol.
 * Uses Poseidon hash function for ZK-SNARK friendly operations.
 *
 * Tree structure:
 * - 20 levels deep (supports 2^20 = ~1M leaves)
 * - Binary tree with Poseidon(left, right) for internal nodes
 * - Zero values for empty leaves (precomputed)
 */

import {
  poseidonHash,
  SNARK_FIELD_SIZE,
  bytesToField,
  fieldToHex,
  hexToField,
  initPoseidon,
} from './poseidon';
import type { MerkleProof } from './types';

// Re-export for convenience
export type { MerkleProof };

/**
 * Default Merkle tree depth
 * 20 levels = 2^20 = 1,048,576 possible leaves
 */
export const DEFAULT_TREE_DEPTH = 20;

/**
 * Precomputed zero values for each level
 * zeros[0] = H(0), zeros[1] = H(zeros[0], zeros[0]), etc.
 * These are computed lazily and cached
 */
let ZERO_VALUES: bigint[] | null = null;

/**
 * Initialize zero values for the Merkle tree
 */
export async function initZeroValues(depth: number = DEFAULT_TREE_DEPTH): Promise<bigint[]> {
  if (ZERO_VALUES && ZERO_VALUES.length >= depth + 1) {
    return ZERO_VALUES;
  }

  const zeros: bigint[] = [BigInt(0)];

  for (let i = 0; i < depth; i++) {
    zeros.push(await poseidonHash(zeros[i], zeros[i]));
  }

  ZERO_VALUES = zeros;
  return zeros;
}

/**
 * Get zero value for a specific level
 */
export async function getZeroValue(level: number): Promise<bigint> {
  const zeros = await initZeroValues(Math.max(level + 1, DEFAULT_TREE_DEPTH));
  return zeros[level];
}

/**
 * Incremental Merkle Tree
 *
 * An append-only binary Merkle tree that efficiently updates
 * when new leaves are added. Uses the "filled subtrees" optimization
 * to minimize hash computations.
 */
export class IncrementalMerkleTree {
  /** Tree depth */
  readonly depth: number;

  /** Number of leaves currently in the tree */
  private nextIndex: number = 0;

  /** Filled subtrees for efficient updates */
  private filledSubtrees: bigint[];

  /** Current Merkle root */
  private currentRoot: bigint;

  /** All leaves in order */
  private leaves: bigint[] = [];

  /** Historical roots */
  private roots: bigint[] = [];

  /** Zero values for each level */
  private zeros: bigint[] = [];

  /** Maximum number of historical roots to keep */
  private maxRootsHistory: number = 30;

  /**
   * Create a new incremental Merkle tree
   */
  constructor(depth: number = DEFAULT_TREE_DEPTH) {
    if (depth < 1 || depth > 32) {
      throw new Error('Tree depth must be between 1 and 32');
    }
    this.depth = depth;
    this.filledSubtrees = [];
    this.currentRoot = BigInt(0);
  }

  /**
   * Initialize the tree (must be called before use)
   */
  async initialize(): Promise<void> {
    this.zeros = await initZeroValues(this.depth);
    this.filledSubtrees = [...this.zeros.slice(0, this.depth)];
    this.currentRoot = this.zeros[this.depth];
    this.roots.push(this.currentRoot);
  }

  /**
   * Get the current Merkle root
   */
  getRoot(): bigint {
    return this.currentRoot;
  }

  /**
   * Get the next available leaf index
   */
  getNextIndex(): number {
    return this.nextIndex;
  }

  /**
   * Get all historical roots
   */
  getRoots(): bigint[] {
    return [...this.roots];
  }

  /**
   * Check if a root is valid (current or historical)
   */
  isKnownRoot(root: bigint): boolean {
    return this.roots.includes(root);
  }

  /**
   * Insert a new leaf into the tree
   * Returns the leaf index
   */
  async insert(leaf: bigint): Promise<number> {
    if (this.nextIndex >= Math.pow(2, this.depth)) {
      throw new Error('Merkle tree is full');
    }

    const leafIndex = this.nextIndex;
    let currentIndex = leafIndex;
    let currentLevelHash = leaf;
    let left: bigint;
    let right: bigint;

    // Update filled subtrees and compute new root
    for (let level = 0; level < this.depth; level++) {
      if (currentIndex % 2 === 0) {
        // Current node is a left child
        left = currentLevelHash;
        right = this.zeros[level];
        this.filledSubtrees[level] = currentLevelHash;
      } else {
        // Current node is a right child
        left = this.filledSubtrees[level];
        right = currentLevelHash;
      }

      currentLevelHash = await poseidonHash(left, right);
      currentIndex = Math.floor(currentIndex / 2);
    }

    // Update state
    this.currentRoot = currentLevelHash;
    this.leaves.push(leaf);
    this.nextIndex++;

    // Maintain root history
    this.roots.push(this.currentRoot);
    if (this.roots.length > this.maxRootsHistory) {
      this.roots.shift();
    }

    return leafIndex;
  }

  /**
   * Generate a Merkle proof for a leaf at the given index
   */
  async generateProof(leafIndex: number): Promise<MerkleProof> {
    if (leafIndex < 0 || leafIndex >= this.nextIndex) {
      throw new Error(`Leaf index ${leafIndex} out of range [0, ${this.nextIndex})`);
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

      // Get sibling value
      let sibling: bigint;
      // For level 0, check against number of leaves
      // For higher levels, the sibling might be a computed node or zero
      if (level === 0) {
        sibling = siblingIndex < this.leaves.length ? this.leaves[siblingIndex] : this.zeros[0];
      } else {
        sibling = await this.getNodeAtLevel(siblingIndex, level);
      }

      pathElements.push(sibling);
      pathIndices.push(currentIndex % 2);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      root: this.currentRoot,
      pathElements,
      pathIndices,
      leafIndex,
    };
  }

  /**
   * Get node value at a specific level
   * Level 0 = leaves, Level depth = root
   */
  private async getNodeAtLevel(index: number, level: number): Promise<bigint> {
    if (level === 0) {
      return index < this.leaves.length ? this.leaves[index] : this.zeros[0];
    }

    const leftChildIndex = index * 2;
    const rightChildIndex = index * 2 + 1;

    // Calculate how many nodes exist at this level based on number of leaves
    const nodesAtPrevLevel = Math.ceil(this.nextIndex / Math.pow(2, level - 1));

    // If the left child index is beyond what we have, return zero for this level
    if (leftChildIndex >= nodesAtPrevLevel) {
      return this.zeros[level];
    }

    const left = await this.getNodeAtLevel(leftChildIndex, level - 1);
    const right = await this.getNodeAtLevel(rightChildIndex, level - 1);

    return poseidonHash(left, right);
  }

  /**
   * Verify a Merkle proof
   */
  async verifyProof(leaf: bigint, proof: MerkleProof): Promise<boolean> {
    let currentHash = leaf;

    for (let i = 0; i < proof.pathElements.length; i++) {
      const sibling = proof.pathElements[i];
      const isLeft = proof.pathIndices[i] === 0;

      if (isLeft) {
        currentHash = await poseidonHash(currentHash, sibling);
      } else {
        currentHash = await poseidonHash(sibling, currentHash);
      }
    }

    return currentHash === proof.root || this.isKnownRoot(currentHash);
  }

  /**
   * Get tree statistics
   */
  getStats(): {
    depth: number;
    leaves: number;
    capacity: number;
    utilizationPercent: number;
  } {
    const capacity = Math.pow(2, this.depth);
    return {
      depth: this.depth,
      leaves: this.nextIndex,
      capacity,
      utilizationPercent: (this.nextIndex / capacity) * 100,
    };
  }

  /**
   * Export tree state for persistence
   */
  exportState(): {
    depth: number;
    nextIndex: number;
    leaves: string[];
    roots: string[];
    filledSubtrees: string[];
  } {
    return {
      depth: this.depth,
      nextIndex: this.nextIndex,
      leaves: this.leaves.map(fieldToHex),
      roots: this.roots.map(fieldToHex),
      filledSubtrees: this.filledSubtrees.map(fieldToHex),
    };
  }

  /**
   * Import tree state from persistence
   */
  async importState(state: {
    depth: number;
    nextIndex: number;
    leaves: string[];
    roots: string[];
    filledSubtrees: string[];
  }): Promise<void> {
    if (state.depth !== this.depth) {
      throw new Error(`Depth mismatch: expected ${this.depth}, got ${state.depth}`);
    }

    await this.initialize();

    this.nextIndex = state.nextIndex;
    this.leaves = state.leaves.map(hexToField);
    this.roots = state.roots.map(hexToField);
    this.filledSubtrees = state.filledSubtrees.map(hexToField);

    if (this.roots.length > 0) {
      this.currentRoot = this.roots[this.roots.length - 1];
    }
  }
}

/**
 * Create a new initialized Merkle tree
 */
export async function createMerkleTree(
  depth: number = DEFAULT_TREE_DEPTH
): Promise<IncrementalMerkleTree> {
  const tree = new IncrementalMerkleTree(depth);
  await tree.initialize();
  return tree;
}

/**
 * Verify a standalone Merkle proof (without tree instance)
 */
export async function verifyMerkleProof(
  leaf: bigint,
  proof: MerkleProof
): Promise<boolean> {
  let currentHash = leaf;

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i];
    const isLeft = proof.pathIndices[i] === 0;

    if (isLeft) {
      currentHash = await poseidonHash(currentHash, sibling);
    } else {
      currentHash = await poseidonHash(sibling, currentHash);
    }
  }

  return currentHash === proof.root;
}

/**
 * Compute Merkle root from leaf and proof
 */
export async function computeRootFromProof(
  leaf: bigint,
  proof: MerkleProof
): Promise<bigint> {
  let currentHash = leaf;

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i];
    const isLeft = proof.pathIndices[i] === 0;

    if (isLeft) {
      currentHash = await poseidonHash(currentHash, sibling);
    } else {
      currentHash = await poseidonHash(sibling, currentHash);
    }
  }

  return currentHash;
}

/**
 * Batch insert multiple leaves efficiently
 */
export async function batchInsert(
  tree: IncrementalMerkleTree,
  leaves: bigint[]
): Promise<number[]> {
  const indices: number[] = [];
  for (const leaf of leaves) {
    const index = await tree.insert(leaf);
    indices.push(index);
  }
  return indices;
}
