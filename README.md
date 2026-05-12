# Shery Ai

Backend API for the SheryAI learning companion.

## Video AI Feature

This server supports two reusable learning-video paths:

- Uploaded video/audio files are saved to Firebase Storage in production, with a local disk fallback in development.
- YouTube lessons ingest available captions directly from YouTube.

After ingestion, AI chat, summaries, quizzes, starter questions, captions, and chapters read from transcript chunks stored in Firestore. They do not need to read the original video file again.

## Main Endpoints

- `POST /api/lessons/upload` receives multipart form data with `file`, `courseId`, `title`, optional `moduleId`, `description`, `language`, and `order`.
- `POST /api/lessons/ingest-youtube` receives `youtubeUrl`, `courseId`, `title`, optional `moduleId`, `description`, and `order`.
- `POST /api/lessons/ingest-url` receives a public `sourceUrl` for Google Drive, Zoom/direct recording links, or other readable media URLs.
- `GET /api/lessons/:lessonId/status` returns processing state and progress.
- `GET /api/lessons/:lessonId/video` redirects to cloud storage or streams the local file with HTTP Range support.
- `GET /api/lessons/:lessonId/transcript` returns ordered transcript chunks for captions/subtitles.
- `POST /api/lessons/:lessonId/regenerate-chapters` regenerates chapter markers from saved transcript chunks.
- `GET /api/lessons?courseId=...` returns dashboard lessons and hides failed lessons by default.
- `GET /api/lessons/failed?courseId=...` returns only failed lessons plus a total count for the failed section.
- `DELETE /api/lessons/failed?courseId=...` deletes all failed lessons for a course, including transcript chunks and stored video files when present.
- `DELETE /api/lessons/:lessonId/failed` deletes one failed lesson.
- `POST /api/chat/stream` streams tutor responses as Server-Sent Events.
- `POST /api/chat/summary` creates a transcript-grounded summary.
- `POST /api/chat/quiz` creates transcript-grounded MCQs.

## Required Environment

```bash
ASSEMBLYAI_API_KEY=...
FIREBASE_STORAGE_BUCKET=...
NVIDIA_API_KEY=...
```

Firebase credentials can be provided either as one JSON value:

```bash
FIREBASE_SERVICE_ACCOUNT='{"project_id":"...","client_email":"...","private_key":"..."}'
```

or as split variables:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

Optional:

```bash
NVIDIA_MODEL=nvidia/nemotron-3-nano-30b-a3b
CORS_ORIGINS=http://localhost:5173,https://your-frontend.example
FRONTEND_URL=http://localhost:5173
ALLOW_VERCEL_PREVIEWS=true
```

## Frontend Contract

Use `GET /api/lessons?courseId=...` for the main dashboard grid. It excludes `status: "failed"` records so broken uploads do not pollute the primary learning experience.

Use `GET /api/lessons/failed?courseId=...` for a separate failed section. The response includes:

```json
{
  "total": 2,
  "lessons": []
}
```

Use `DELETE /api/lessons/failed?courseId=...` for "clear all failed" and `DELETE /api/lessons/:lessonId/failed` for a single failed card delete action.

For uploaded videos, point the native `<video>` source to `/api/lessons/:lessonId/video`. That endpoint supports browser seeking through `Range` requests.

For YouTube lessons, use `lesson.youtubeVideoId` in a YouTube iframe with `enablejsapi=1`.

For Google Drive or public meeting recordings, submit:

```json
{
  "courseId": "course-id",
  "title": "Meeting recording",
  "description": "Optional",
  "sourceUrl": "https://drive.google.com/file/d/.../view",
  "language": "auto"
}
```

The URL must be public/readable. Google Drive file links are converted to download URLs. Zoom links usually need to be public direct recording/download URLs, not password-protected share pages.

Use `GET /api/lessons/:lessonId/transcript` for captions and `lesson.topicSegments` for the chapter bar. Chat timestamps should call the same `seekTo(seconds)` function used by chapter clicks.

`POST /api/chat/stream` accepts:

```json
{
  "lessonId": "lesson-id",
  "sessionId": "stable-client-session-id",
  "message": "Explain this part",
  "currentTime": 120
}
```

If `sessionId` is omitted, the server generates one and sends it as both an `X-Chat-Session-Id` response header and an SSE event:

```text
data: {"type":"session","sessionId":"..."}
data: {"type":"token","content":"..."}
data: {"type":"followUps","items":["..."]}
data: {"type":"done"}
```

## Production Notes

- Local file fallback is for development and persistent-server environments only. Use Firebase Storage, persistent VPS disk, NFS, EFS, or another durable volume for production.
- `multer.memoryStorage()` is still intentionally capped at 500 MB. For very large files, replace it with direct-to-object-storage uploads or streamed disk uploads.
- Transcript chunks are keyword-ranked with BM25-style scoring. For very long lectures, add vector embeddings beside the existing chunk repository.
- YouTube ingestion returns immediately and processes captions in the background. Videos without captions will move to `failed`; use the failed section so users can see and delete those attempts.
