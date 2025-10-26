import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccountPath = './expose-ai-worker-key.json';
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

console.log('🔍 Diagnosing Firestore connection...');
console.log('📋 Project ID:', serviceAccount.project_id);
console.log('📋 Service Account:', serviceAccount.client_email);

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = getFirestore(app);

async function diagnose() {
  try {
    console.log('\n🔍 Testing basic Firestore connection...');

    // Try to list collections (this will fail if database doesn't exist)
    console.log('📋 Attempting to list collections...');
    const collections = await db.listCollections();
    console.log(
      '✅ Collections found:',
      collections.map((c) => c.id)
    );

    if (collections.length === 0) {
      console.log('⚠️ No collections found. Database exists but is empty.');
    }

    // Try to create a simple test document
    console.log('\n🔍 Testing document creation...');
    const testDoc = {
      test: true,
      timestamp: Date.now(),
      message: 'Diagnostic test document',
    };

    const docRef = await db.collection('_diagnostic').add(testDoc);
    console.log('✅ Successfully created test document:', docRef.id);

    // Clean up
    await docRef.delete();
    console.log('✅ Test document cleaned up');

    console.log('\n🎉 Firestore is working correctly!');
    console.log(
      '💡 The issue is likely that the "analysisRequests" collection doesn\'t exist yet.'
    );
    console.log(
      '💡 This is normal for a new project - collections are created when you add the first document.'
    );
  } catch (error) {
    console.error('\n❌ Firestore diagnosis failed:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);

    if (error.code === 5) {
      console.log('\n🔍 Code 5 (NOT_FOUND) typically means:');
      console.log("1. Firestore database doesn't exist in this project");
      console.log('2. Firestore API is not enabled');
      console.log('3. Wrong project ID or region');
      console.log('\n💡 Solutions:');
      console.log('1. Go to Google Cloud Console → Firestore');
      console.log("2. Create a Firestore database if it doesn't exist");
      console.log('3. Make sure Firestore API is enabled');
    }
  }

  process.exit(0);
}

diagnose();
