#!/usr/bin/env bun
/**
 * Check different Arcium cluster offsets on devnet
 * Including the one used by Pythia Markets
 */

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function main() {
  console.log('Checking different Arcium cluster offsets on devnet:\n');

  // Import Arcium SDK
  const arcium = await import('@arcium-hq/client');

  // Check different cluster offsets
  // 456 = DEVNET_V063 (our default)
  // 768109697 = Pythia Markets' cluster
  const offsets = [456, 768109697, 0, 1, 500];

  for (const offset of offsets) {
    console.log(`Cluster offset: ${offset}`);

    try {
      const mempoolAddr = arcium.getMempoolAccAddress(offset);
      const clusterAddr = arcium.getClusterAccAddress(offset);
      const execPoolAddr = arcium.getExecutingPoolAccAddress(offset);

      const [mempoolInfo, clusterInfo, execPoolInfo] = await Promise.all([
        connection.getAccountInfo(mempoolAddr),
        connection.getAccountInfo(clusterAddr),
        connection.getAccountInfo(execPoolAddr),
      ]);

      console.log(`  Mempool: ${mempoolAddr.toBase58().slice(0, 20)}... - ${mempoolInfo ? 'EXISTS' : 'not found'}`);
      console.log(`  Cluster: ${clusterAddr.toBase58().slice(0, 20)}... - ${clusterInfo ? 'EXISTS' : 'not found'}`);
      console.log(`  ExecPool: ${execPoolAddr.toBase58().slice(0, 20)}... - ${execPoolInfo ? 'EXISTS' : 'not found'}`);

      // If cluster exists, try to get more info
      if (clusterInfo) {
        console.log(`  Cluster data size: ${clusterInfo.data.length} bytes`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
    console.log('');
  }

  // Check MXE using Arcium program ID
  console.log('='.repeat(50));
  console.log('MXE Account Check:');
  console.log('='.repeat(50));

  const arciumProgramId = arcium.getArciumProgramId();
  console.log(`Arcium Program ID: ${arciumProgramId.toBase58()}`);

  const mxeAddr = arcium.getMXEAccAddress(arciumProgramId);
  console.log(`MXE Address: ${mxeAddr.toBase58()}`);

  const mxeInfo = await connection.getAccountInfo(mxeAddr);
  console.log(`MXE Account: ${mxeInfo ? 'EXISTS (' + mxeInfo.data.length + ' bytes)' : 'NOT FOUND'}`);

  if (mxeInfo && mxeInfo.data.length > 45) {
    // Try to extract MXE public key manually from account data
    // Account layout: [discriminator(8)] [status(1)] [node_count(4)] [x25519_pubkey(32)] ...
    const x25519Key = mxeInfo.data.slice(13, 45);
    console.log(`MXE X25519 Key (raw): ${Buffer.from(x25519Key).toString('hex')}`);
  }

  // Also check if getMXEPublicKey works with AnchorProvider
  console.log('\nTrying getMXEPublicKey with different approaches...');

  // The Pythia example uses getMXEPublicKey(provider, program.programId)
  // where program.programId is THEIR program ID, not Arcium's
  // This suggests the MXE public key might be stored differently

  // Let's see what the getArciumEnv returns
  if (arcium.getArciumEnv) {
    try {
      const env = arcium.getArciumEnv();
      console.log('\ngetArciumEnv() result:', JSON.stringify(env, null, 2));
    } catch (e: any) {
      console.log(`getArciumEnv error: ${e.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log('='.repeat(50));
  console.log(`
  Pythia Markets uses cluster offset: 768109697
  Our default (DEVNET_V063) is: 456

  The MXE account at ${mxeAddr.toBase58().slice(0, 20)}...
  ${mxeInfo ? 'EXISTS on devnet!' : 'does NOT exist on devnet'}

  This means ${mxeInfo ? 'MXE IS available' : 'we need to check different configurations'}
  `);
}

main().catch(console.error);
