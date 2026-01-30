// Ownership Proof Circuit for PrivacyKit SDK
// Proves ownership of an asset via Merkle tree inclusion without revealing which asset
//
// Public Inputs:
// - merkle_root: Root of the Merkle tree containing all valid assets
// - nullifier: Prevents double-spending/claiming
//
// Private Inputs:
// - asset: The asset identifier (leaf value)
// - merkle_path: Sibling hashes along the path to root
// - path_indices: Direction bits for each level (0 = left, 1 = right)
// - nullifier_secret: Secret used to generate nullifier

use std::hash::poseidon::bn254::hash_2;
use std::hash::poseidon::bn254::hash_3;
use std::hash::pedersen_hash;

// Tree depth determines the maximum number of assets: 2^TREE_DEPTH
global TREE_DEPTH: u32 = 20;  // Supports up to 1,048,576 assets

/// Compute leaf hash from asset data
/// Uses Poseidon for efficient in-circuit hashing
fn compute_leaf(asset: Field, owner_secret: Field) -> Field {
    hash_2([asset, owner_secret])
}

/// Compute nullifier to prevent double-claiming
/// Nullifier = H(nullifier_secret || asset)
fn compute_nullifier(nullifier_secret: Field, asset: Field) -> Field {
    hash_2([nullifier_secret, asset])
}

/// Compute parent hash from two children
/// Uses Poseidon hash for Merkle tree construction
fn hash_pair(left: Field, right: Field) -> Field {
    hash_2([left, right])
}

/// Verify Merkle proof of inclusion
/// Returns true if the proof is valid
fn verify_merkle_proof(
    leaf: Field,
    root: Field,
    path: [Field; 20],       // Sibling hashes
    indices: [u1; 20]        // Path direction bits (0 = left, 1 = right)
) -> bool {
    let mut current = leaf;

    for i in 0..TREE_DEPTH {
        let sibling = path[i];
        let is_right = indices[i] as bool;

        // If index bit is 1, current is on the right
        current = if is_right {
            hash_pair(sibling, current)
        } else {
            hash_pair(current, sibling)
        };
    }

    current == root
}

/// Main ownership proof circuit
/// Proves ownership of an asset in a Merkle tree without revealing which asset
fn main(
    // Public inputs
    merkle_root: pub Field,
    nullifier: pub Field,

    // Private inputs
    asset: Field,
    owner_secret: Field,
    merkle_path: [Field; 20],
    path_indices: [u1; 20],
    nullifier_secret: Field
) {
    // 1. Compute the leaf from asset and owner secret
    let leaf = compute_leaf(asset, owner_secret);

    // 2. Verify Merkle inclusion proof
    let is_valid = verify_merkle_proof(leaf, merkle_root, merkle_path, path_indices);
    assert(is_valid, "Invalid Merkle proof");

    // 3. Verify nullifier is correctly computed
    let computed_nullifier = compute_nullifier(nullifier_secret, asset);
    assert(computed_nullifier == nullifier, "Invalid nullifier");
}

/// Ownership proof with additional asset metadata
/// Proves ownership AND certain properties of the asset
fn ownership_with_metadata(
    // Public inputs
    merkle_root: pub Field,
    nullifier: pub Field,
    asset_type_commitment: pub Field,  // Commitment to asset type

    // Private inputs
    asset: Field,
    asset_type: Field,
    owner_secret: Field,
    type_blinding: Field,
    merkle_path: [Field; 20],
    path_indices: [u1; 20],
    nullifier_secret: Field
) {
    // Compute leaf including asset type
    let leaf = hash_3([asset, asset_type, owner_secret]);

    // Verify Merkle proof
    let is_valid = verify_merkle_proof(leaf, merkle_root, merkle_path, path_indices);
    assert(is_valid, "Invalid Merkle proof");

    // Verify asset type commitment
    let computed_type_commitment = pedersen_hash([asset_type, type_blinding]);
    assert(computed_type_commitment == asset_type_commitment, "Invalid asset type commitment");

    // Verify nullifier
    let computed_nullifier = compute_nullifier(nullifier_secret, asset);
    assert(computed_nullifier == nullifier, "Invalid nullifier");
}

/// Multi-asset ownership proof
/// Proves ownership of multiple assets simultaneously
fn multi_ownership_proof(
    // Public inputs
    merkle_root: pub Field,
    nullifiers: pub [Field; 4],
    num_assets: pub u8,

    // Private inputs
    assets: [Field; 4],
    owner_secrets: [Field; 4],
    merkle_paths: [[Field; 20]; 4],
    path_indices: [[u1; 20]; 4],
    nullifier_secrets: [Field; 4]
) {
    for i in 0..4 {
        if (i as u8) < num_assets {
            // Compute leaf
            let leaf = compute_leaf(assets[i], owner_secrets[i]);

            // Verify Merkle proof
            let is_valid = verify_merkle_proof(
                leaf,
                merkle_root,
                merkle_paths[i],
                path_indices[i]
            );
            assert(is_valid, "Invalid Merkle proof");

            // Verify nullifier
            let computed_nullifier = compute_nullifier(nullifier_secrets[i], assets[i]);
            assert(computed_nullifier == nullifiers[i], "Invalid nullifier");
        }
    }
}

/// Exclusion proof - prove an address is NOT in a set (e.g., sanctions list)
/// Uses sparse Merkle tree with default values
fn exclusion_proof(
    // Public inputs
    merkle_root: pub Field,
    address_commitment: pub Field,

    // Private inputs
    address: Field,
    address_blinding: Field,
    merkle_path: [Field; 20],
    path_indices: [u1; 20]
) {
    // Verify address commitment
    let computed_commitment = pedersen_hash([address, address_blinding]);
    assert(computed_commitment == address_commitment, "Invalid address commitment");

    // For exclusion, we prove that the leaf at this address's position is the default value
    // Default value for empty leaf in sparse Merkle tree
    let default_leaf: Field = 0;

    // Verify the leaf at this position is empty (address not in tree)
    let is_valid = verify_merkle_proof(default_leaf, merkle_root, merkle_path, path_indices);
    assert(is_valid, "Address found in exclusion set");
}

/// NFT ownership proof with royalty commitment
/// Proves ownership of NFT and commitment to pay royalties
fn nft_ownership_with_royalty(
    // Public inputs
    merkle_root: pub Field,
    nullifier: pub Field,
    royalty_commitment: pub Field,

    // Private inputs
    nft_id: Field,
    owner_secret: Field,
    royalty_amount: Field,
    royalty_blinding: Field,
    merkle_path: [Field; 20],
    path_indices: [u1; 20],
    nullifier_secret: Field
) {
    // Compute NFT leaf
    let leaf = compute_leaf(nft_id, owner_secret);

    // Verify Merkle proof
    let is_valid = verify_merkle_proof(leaf, merkle_root, merkle_path, path_indices);
    assert(is_valid, "Invalid Merkle proof - NFT ownership not verified");

    // Verify royalty commitment
    let computed_royalty = pedersen_hash([royalty_amount, royalty_blinding]);
    assert(computed_royalty == royalty_commitment, "Invalid royalty commitment");

    // Verify nullifier for single-use transfer
    let computed_nullifier = compute_nullifier(nullifier_secret, nft_id);
    assert(computed_nullifier == nullifier, "Invalid nullifier");

    // Range check royalty (0-100%)
    assert(royalty_amount as u64 as Field == royalty_amount, "Royalty overflow");
    let royalty_u64 = royalty_amount as u64;
    assert(royalty_u64 <= 10000, "Royalty exceeds 100%");  // Basis points
}

/// Whitelist membership proof
/// Proves an address is on a whitelist without revealing which one
fn whitelist_membership(
    // Public inputs
    whitelist_root: pub Field,
    address_nullifier: pub Field,

    // Private inputs
    address: Field,
    membership_secret: Field,
    merkle_path: [Field; 20],
    path_indices: [u1; 20],
    nullifier_secret: Field
) {
    // Compute leaf from address and membership secret
    let leaf = compute_leaf(address, membership_secret);

    // Verify membership
    let is_valid = verify_merkle_proof(leaf, whitelist_root, merkle_path, path_indices);
    assert(is_valid, "Address not on whitelist");

    // Compute nullifier (prevents replay)
    let computed_nullifier = compute_nullifier(nullifier_secret, address);
    assert(computed_nullifier == address_nullifier, "Invalid nullifier");
}

/// Utility: compute Merkle root from leaves
/// Useful for tree construction
fn compute_merkle_root(leaves: [Field; 8]) -> Field {
    // Level 1: hash pairs of leaves
    let level1: [Field; 4] = [
        hash_pair(leaves[0], leaves[1]),
        hash_pair(leaves[2], leaves[3]),
        hash_pair(leaves[4], leaves[5]),
        hash_pair(leaves[6], leaves[7])
    ];

    // Level 2: hash pairs
    let level2: [Field; 2] = [
        hash_pair(level1[0], level1[1]),
        hash_pair(level1[2], level1[3])
    ];

    // Root
    hash_pair(level2[0], level2[1])
}

#[test]
fn test_simple_merkle_proof() {
    // Create a small tree with 2 leaves for testing
    let asset: Field = 12345;
    let owner_secret: Field = 67890;
    let nullifier_secret: Field = 11111;

    let leaf = compute_leaf(asset, owner_secret);
    let sibling: Field = 99999;

    // Compute root (leaf is on left)
    let root = hash_pair(leaf, sibling);

    // Create path (only first element matters for depth 1)
    let mut path: [Field; 20] = [0; 20];
    path[0] = sibling;

    let mut indices: [u1; 20] = [0; 20];
    // leaf is on left, so index is 0

    let nullifier = compute_nullifier(nullifier_secret, asset);

    // Verify the proof
    let is_valid = verify_merkle_proof(leaf, root, path, indices);
    assert(is_valid, "Simple Merkle proof should be valid");
}

#[test]
fn test_leaf_computation() {
    let asset: Field = 12345;
    let owner_secret: Field = 67890;

    let leaf1 = compute_leaf(asset, owner_secret);
    let leaf2 = compute_leaf(asset, owner_secret);

    assert(leaf1 == leaf2, "Same inputs should produce same leaf");

    // Different inputs should produce different leaves
    let leaf3 = compute_leaf(asset, owner_secret + 1);
    assert(leaf1 != leaf3, "Different inputs should produce different leaves");
}

#[test]
fn test_nullifier_uniqueness() {
    let asset1: Field = 12345;
    let asset2: Field = 12346;
    let nullifier_secret: Field = 11111;

    let null1 = compute_nullifier(nullifier_secret, asset1);
    let null2 = compute_nullifier(nullifier_secret, asset2);

    assert(null1 != null2, "Different assets should have different nullifiers");
}
