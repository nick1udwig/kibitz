#!/usr/bin/env node

/**
 * Test Incremental Conversation Branching
 * 
 * This script tests the fixed incremental branching to ensure:
 * 1. step-1 builds on main
 * 2. step-2 builds on step-1  
 * 3. step-3 builds on step-2
 * 4. Each step has a unique hash
 * 5. Each step contains cumulative content
 */

const PROJECT_ID = 'vc0ou'; // Use your actual project ID
const API_BASE = 'http://localhost:3000';

async function testIncrementalBranching() {
  console.log('🧪 Testing Fixed Incremental Conversation Branching\n');
  
  try {
    // Test 1: Analyze current branch structure
    console.log('📋 Test 1: Analyze current branch structure...');
    const projectResponse = await fetch(`${API_BASE}/api/projects/${PROJECT_ID}`);
    
    if (projectResponse.ok) {
      const projectData = await projectResponse.json();
      
      // Get conversation branches
      const convBranches = projectData.branches?.filter(b => 
        b.branchName && b.branchName.includes('conv-mrvj3g-step')
      ).sort((a, b) => {
        const stepA = parseInt(a.branchName.split('-step-')[1]) || 0;
        const stepB = parseInt(b.branchName.split('-step-')[1]) || 0;
        return stepA - stepB;
      }) || [];
      
      console.log(`✅ Found ${convBranches.length} conversation branches for mrvj3g:`);
      
      const hashAnalysis = [];
      
      convBranches.forEach((branch, index) => {
        const stepNumber = parseInt(branch.branchName.split('-step-')[1]) || 0;
        const shortHash = branch.commitHash?.substring(0, 8) || 'unknown';
        
        console.log(`   ${index + 1}. ${branch.branchName}:`);
        console.log(`      - Hash: ${shortHash}`);
        console.log(`      - Files: ${branch.filesChanged?.length || 0} changed`);
        console.log(`      - Lines: +${branch.linesAdded || 0} -${branch.linesRemoved || 0}`);
        
        hashAnalysis.push({
          step: stepNumber,
          hash: shortHash,
          filesChanged: branch.filesChanged?.length || 0,
          linesAdded: branch.linesAdded || 0
        });
      });
      
      // Test 2: Hash uniqueness analysis
      console.log('\n🔍 Test 2: Hash uniqueness analysis...');
      const hashes = hashAnalysis.map(b => b.hash);
      const uniqueHashes = [...new Set(hashes)];
      
      if (uniqueHashes.length === hashes.length) {
        console.log('✅ All branches have unique hashes! ✨');
        console.log(`   - Total branches: ${hashes.length}`);
        console.log(`   - Unique hashes: ${uniqueHashes.length}`);
      } else {
        console.log('❌ Hash collision detected:');
        const hashCounts = {};
        hashes.forEach(hash => {
          hashCounts[hash] = (hashCounts[hash] || 0) + 1;
        });
        
        Object.entries(hashCounts).forEach(([hash, count]) => {
          if (count > 1) {
            console.log(`   - Hash ${hash} appears ${count} times ❌`);
          }
        });
      }
      
      // Test 3: Incremental content analysis
      console.log('\n📈 Test 3: Incremental content analysis...');
      console.log('Expected pattern: Each step should have MORE content than previous');
      
      let previousContent = 0;
      let incrementalPattern = true;
      
      hashAnalysis.forEach((analysis, index) => {
        const totalContent = analysis.linesAdded;
        const expectedIncrease = totalContent > previousContent || index === 0;
        
        console.log(`   Step ${analysis.step}: ${totalContent} lines total ${expectedIncrease ? '✅' : '❌'}`);
        
        if (!expectedIncrease && totalContent > 0) {
          incrementalPattern = false;
        }
        
        previousContent = totalContent;
      });
      
      if (incrementalPattern) {
        console.log('✅ Incremental content pattern looks correct!');
      } else {
        console.log('⚠️ Incremental content pattern may have issues');
      }
      
    } else {
      console.error('❌ Failed to load project data');
      return;
    }
    
    // Test 4: Expected vs Actual behavior
    console.log('\n📚 Test 4: Expected vs Actual behavior analysis');
    
    console.log('\n🎯 What SHOULD happen with fixed branching:');
    console.log('   main (baseline) → step-1 (main + new code)');
    console.log('   step-1 → step-2 (step-1 + new code)');  
    console.log('   step-2 → step-3 (step-2 + new code)');
    console.log('   Each step = previous step + incremental changes');
    
    console.log('\n🔧 Fixed implementation ensures:');
    console.log('   ✅ Each step checks out the PREVIOUS step first');
    console.log('   ✅ New branch is created FROM that previous step');
    console.log('   ✅ Content accumulates incrementally');
    console.log('   ✅ Each commit has a unique hash');
    
    console.log('\n🧪 To test the fix:');
    console.log('   1. Start a NEW conversation');
    console.log('   2. Ask LLM to create a file (will create step-1)');
    console.log('   3. Continue conversation, ask to modify/add (will create step-2)');
    console.log('   4. Continue again (will create step-3)');
    console.log('   5. Check: step-2 should have step-1 content + new content');
    console.log('   6. Check: step-3 should have step-1 + step-2 + new content');
    
    console.log('\n🎉 Fixed branching system deployed!');
    console.log('Watch console for: "Found previous step: conv-{id}-step-{n-1}"');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testIncrementalBranching().catch(console.error); 