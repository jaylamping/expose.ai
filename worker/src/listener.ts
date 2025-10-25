import type {
  QueryDocumentSnapshot,
  Firestore,
} from 'firebase-admin/firestore';

export async function pollQueuedRequests(
  db: Firestore,
  handler: (id: string) => Promise<void>,
  intervalMs: number = 5000
): Promise<void> {
  // Simple polling loop; replace with EventArc/Firestore triggers if desired
  while (true) {
    try {
      const snap = await db
        .collection('analysisRequests')
        .where('status', '==', 'queued')
        .orderBy('createdAt', 'asc')
        .limit(5)
        .get();

      const docs = snap.docs as QueryDocumentSnapshot[];
      for (const doc of docs) {
        await handler(doc.id);
      }
    } catch (e) {
      console.error('Polling error:', e);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
