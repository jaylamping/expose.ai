# Expose.AI Worker

Backend worker service for AI text detection using a cascading pipeline approach.

## Features

- **3-Stage Cascading Pipeline**: BPC → ML Models → Parent Context
- **Reddit OAuth Integration**: Higher rate limits for comment fetching
- **Multiple Detection Methods**: BPC, Perplexity, BERT classification
- **Parent Context Analysis**: Fetches parent comments/posts for additional context
- **Composite Scoring**: Weighted combination of all detection methods

## Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Required environment variables**:

   - `REDDIT_CLIENT_ID`: Reddit app client ID
   - `REDDIT_CLIENT_SECRET`: Reddit app client secret
   - `HUGGINGFACE_API_KEY`: HuggingFace API key for ML models
   - `GOOGLE_APPLICATION_CREDENTIALS`: Path to Firebase service account key

4. **Run the worker**:
   ```bash
   npm run dev  # Development mode
   npm run build && npm start  # Production mode
   ```

## API Endpoints

- `GET /healthz` - Health check
- `POST /analyze?requestId=<id>` - Process analysis request
- `GET /analyze?requestId=<id>` - Process analysis request (alternative)

## Detection Pipeline

### Stage 1: BPC Analysis

- Fast, local statistical analysis
- Calculates bits-per-character entropy
- Clear bot (<2.0) or human (>4.5) scores skip ML analysis

### Stage 2: ML Models

- **Perplexity Scoring**: Uses GPT-2 to calculate perplexity
- **BERT Classification**: Uses RoBERTa model for AI detection
- Only runs on inconclusive BPC cases

### Stage 3: Parent Context

- Fetches parent comments/posts for additional context
- Re-runs ML analysis with combined text
- Final tie-breaker for inconclusive cases

## Configuration

The pipeline uses configurable weights and thresholds:

```typescript
const DEFAULT_WEIGHTS = {
  bpc: 0.2, // 20% weight
  perplexity: 0.4, // 40% weight
  bert: 0.4, // 40% weight
};
```

## Monitoring

The worker logs detailed information about each stage:

- Number of comments analyzed at each stage
- Individual model scores and confidence levels
- Final user score and overall confidence

## Error Handling

- Automatic retries with exponential backoff
- Graceful fallback from OAuth to public API
- Individual comment failures don't stop the analysis
- Comprehensive error logging and reporting
