import { getFirestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

const db = getFirestore();

export async function pollQueuedRequests(
  handler: (id: string) => Promise<void>,
  intervalMs: number = 5000
): Promise<void> {
  // Simple polling loop; replace with EventArc/Firestore triggers if desired
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const snap = await db
        .collection("analysisRequests")
        .where("status", "==", "queued")
        .orderBy("createdAt", "asc")
        .limit(5)
        .get();

      const docs = snap.docs as QueryDocumentSnapshot[];
      for (const doc of docs) {
        await handler(doc.id);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Polling error:", e);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
