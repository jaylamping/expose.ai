import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccountPath = './expose-ai-worker-key.json';
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = getFirestore(app);

async function createTestRequest() {
  try {
    // Create a test analysis request
    const testRequest = {
      platform: 'reddit',
      userId: 'test_user_123',
      count: 10,
      includeParent: true,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection('analysisRequests').add(testRequest);
    console.log('✅ Created test request with ID:', docRef.id);
    console.log('📋 Request data:', testRequest);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test request:', error);
    process.exit(1);
  }
}

createTestRequest();
