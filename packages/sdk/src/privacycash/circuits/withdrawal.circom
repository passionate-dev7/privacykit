/*
 * Privacy Cash Withdrawal Circuit
 *
 * This Circom circuit proves:
 * 1. Knowledge of secret and nullifier that hash to a commitment
 * 2. The commitment exists in a Merkle tree with the given root
 * 3. The nullifierHash is correctly derived from the nullifier
 *
 * Public Inputs:
 * - root: Merkle tree root
 * - nullifierHash: Hash of the nullifier (prevents double-spending)
 * - recipient: Address receiving the withdrawal
 * - relayer: Relayer address (for gasless transactions)
 * - fee: Fee paid to relayer
 * - refund: Refund amount (for change)
 *
 * Private Inputs:
 * - secret: Random secret known only to depositor
 * - nullifier: Random nullifier known only to depositor
 * - pathElements[levels]: Merkle proof siblings
 * - pathIndices[levels]: Merkle proof position bits
 *
 * Circuit ensures:
 * - commitment = Poseidon(secret, nullifier)
 * - nullifierHash = Poseidon(nullifier)
 * - MerkleProof(commitment, pathElements, pathIndices) == root
 */

pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/switcher.circom";

/*
 * Computes Poseidon hash of two inputs
 */
template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== left;
    hasher.inputs[1] <== right;

    hash <== hasher.out;
}

/*
 * Verifies a Merkle proof
 * Uses pathIndices to determine whether element is left or right child
 */
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component selectors[levels];
    component hashers[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // Ensure pathIndices are binary
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        selectors[i] = Switcher();
        selectors[i].sel <== pathIndices[i];
        selectors[i].L <== levelHashes[i];
        selectors[i].R <== pathElements[i];

        hashers[i] = HashLeftRight();
        hashers[i].left <== selectors[i].outL;
        hashers[i].right <== selectors[i].outR;

        levelHashes[i + 1] <== hashers[i].hash;
    }

    root === levelHashes[levels];
}

/*
 * Commitment computation
 * commitment = Poseidon(secret, nullifier)
 */
template CommitmentHasher() {
    signal input secret;
    signal input nullifier;
    signal output commitment;
    signal output nullifierHash;

    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitment <== commitmentHasher.out;

    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;
}

/*
 * Main withdrawal circuit
 */
template Withdraw(levels) {
    // Public inputs
    signal input root;
    signal input nullifierHash;
    signal input recipient;
    signal input relayer;
    signal input fee;
    signal input refund;

    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Compute commitment from secret and nullifier
    component hasher = CommitmentHasher();
    hasher.secret <== secret;
    hasher.nullifier <== nullifier;

    // Verify the nullifierHash matches
    hasher.nullifierHash === nullifierHash;

    // Verify Merkle proof
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // Prevent tampering with recipient/fee by including in constraints
    // These signals are "used" to prevent optimizer from removing them
    signal recipientSquare;
    signal feeSquare;
    signal relayerSquare;
    signal refundSquare;

    recipientSquare <== recipient * recipient;
    feeSquare <== fee * fee;
    relayerSquare <== relayer * relayer;
    refundSquare <== refund * refund;
}

// Main component with 20-level tree (supports ~1M deposits)
component main {public [root, nullifierHash, recipient, relayer, fee, refund]} = Withdraw(20);
