# Expose.AI Worker (Cloud Run)

Local dev

1. Install deps

```bash
npm i
```

2. Run locally

```bash
npm run dev
```

It starts on port 8080.

3. Trigger a run

```bash
curl -X POST http://localhost:8080/analyze -H "Content-Type: application/json" -d '{"requestId":"<firestore-doc-id>"}'
```

Deploy to Cloud Run

Assumes you have a Firebase/Google Cloud project with Firestore and that your service has permission to access it. Ensure a service account with Firestore access is used.

```bash
gcloud builds submit --tag gcr.io/$PROJECT_ID/expose-ai-worker

gcloud run deploy expose-ai-worker \
  --image gcr.io/$PROJECT_ID/expose-ai-worker \
  --platform managed \
  --allow-unauthenticated \
  --region us-central1
```

Set env var in the extension build:

- `VITE_WORKER_URL=https://expose-ai-worker-xxxx-uc.a.run.app`

Next steps

- Implement Firestore listener (poll or EventArc) to process queued requests.
- Implement Reddit fetch + tokenization + scoring.
- Write results back to Firestore and update request status.
