

# Image-to-Text Knowledge Caption + Editable Metadata

## Overview

When an image is uploaded on the Knowledge page, automatically generate a detailed text description using OpenAI's vision model (GPT-4o), store it as a companion document, and index it for vector search. Add a lightweight "Edit caption" button and modal for user revision.

## Architecture

All vision calls go through the Control API (server/index.mjs) using the existing OPENAI_API_KEY. No Supabase keys are exposed to the browser.

```text
Browser uploads image
  -> project_documents row created (existing flow)
  -> UI calls POST /api/documents/:id/caption/generate (new)
     -> Control API reads image from Supabase Storage (public URL)
     -> Calls OpenAI GPT-4o vision with the captioning prompt
     -> Creates companion project_documents row (source_type='note', doc_type='image_analysis')
     -> Calls POST /api/knowledge/ingest with caption text (self-call, fire-and-forget)
     -> Returns caption data to UI
```

## Changes

### 1. Control API: Two new endpoints (server/index.mjs)

**POST /api/documents/:id/caption/generate**

- Requires `x-clawdos-project` header
- Reads the document row from `project_documents` to get `storage_path` and `title`
- Constructs the public URL from Supabase Storage (`clawdos-documents` bucket is public)
- Calls OpenAI Chat Completions (GPT-4o) with the image URL and the structured captioning prompt (using tool calling for strict JSON output)
- Creates a companion `project_documents` row:
  - `title`: "Image: {original title} (analysis)"
  - `source_type`: "note"
  - `doc_type`: "general" (no schema change needed; existing doc_type values work)
  - `content_text`: formatted caption text (caption + extracted_text + tags + entities + key_numbers + dates + why_it_matters)
  - `doc_notes`: `{ image_document_id: "<original id>", caption: "...", tags: [...], entities: [...], ... }`
- Fires POST /api/knowledge/ingest (self-call) with the caption text for vector indexing
- Returns: `{ ok: true, captionDocId, caption, tags, entities, ... }`

**POST /api/documents/:id/caption/update**

- Requires `x-clawdos-project` header
- Body: `{ caption, tags?, entities? }`
- Finds the companion note via `doc_notes->image_document_id = :id`
- Updates `content_text` and `doc_notes` on the companion row
- Re-ingests into knowledge (calls /api/knowledge/ingest with updated text; content_hash will differ so a new source is created, or if same hash, deduped)
- Returns: `{ ok: true }`

### 2. Frontend API helpers (src/lib/api.ts)

Add two new functions:

- `generateImageCaption(documentId: string)`: calls `POST /api/documents/:id/caption/generate` via Control API. Returns caption data.
- `updateImageCaption(documentId: string, caption: string, tags?: string[])`: calls `POST /api/documents/:id/caption/update` via Control API.

### 3. Auto-trigger on image upload (src/components/pages/DocumentsPage.tsx)

In `handleUploadFile`, after a successful upload of an image file (mime starts with `image/` or extension is jpg/png/webp/gif):
- Show toast "Generating image caption..."
- Call `generateImageCaption(docId)` (non-blocking, best-effort)
- On success, show toast "Caption generated" and reload documents
- On failure, show warning toast (non-blocking)

### 4. New component: ImageCaptionModal (src/components/documents/ImageCaptionModal.tsx)

A lightweight Dialog with:
- Textarea for caption text (pre-filled from companion doc's `content_text`)
- Optional tags input (comma-separated, pre-filled from `doc_notes.tags`)
- Save button that calls `updateImageCaption()`, then reloads
- Cancel button

### 5. DocumentList UI addition (src/components/documents/DocumentList.tsx)

For documents where `mimeType` starts with `image/`:
- Show a small "Caption" button (or icon button with a sparkle/wand icon) next to the View/Delete buttons
- If a companion analysis note exists (can be detected by checking if any doc in the list has `doc_notes.image_document_id === doc.id`), the button opens the edit modal pre-filled
- If no companion exists yet, the button triggers caption generation first, then opens the edit modal

### 6. Prompt for vision model

System prompt (used in server/index.mjs):

```
Describe the image for future retrieval in a knowledge base. Be precise and information-dense. Extract all visible text. Include key entities, numbers, dates, and a short 'why this matters' summary.
```

Using OpenAI tool calling to enforce structured output:

```json
{
  "name": "describe_image",
  "parameters": {
    "type": "object",
    "properties": {
      "title_suggestion": { "type": "string" },
      "caption": { "type": "string" },
      "extracted_text": { "type": "string" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "entities": { "type": "array", "items": { "type": "string" } },
      "key_numbers": { "type": "array", "items": { "type": "string" } },
      "dates": { "type": "array", "items": { "type": "string" } },
      "why_it_matters": { "type": "string" }
    },
    "required": ["title_suggestion", "caption", "extracted_text", "tags", "entities", "key_numbers", "dates", "why_it_matters"]
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `server/index.mjs` | Add POST /api/documents/:id/caption/generate and /update endpoints |
| `src/lib/api.ts` | Add `generateImageCaption()` and `updateImageCaption()` helpers |
| `src/components/pages/DocumentsPage.tsx` | Auto-trigger caption on image upload |
| `src/components/documents/DocumentList.tsx` | Add "Caption" button for image docs |
| `src/components/documents/ImageCaptionModal.tsx` | New lightweight edit modal |
| `changes.md` | Document the feature |

## No new secrets, no new DB tables, no schema changes

- Uses existing `OPENAI_API_KEY` (already configured)
- Companion notes stored in existing `project_documents` table
- Knowledge indexing uses existing `/api/knowledge/ingest` pipeline
- `doc_notes` JSON field already exists and is flexible

## Edge cases handled

- If Control API is offline: caption generation silently fails, image is still uploaded normally
- If OpenAI vision call fails: toast error shown, no companion doc created, user can retry via the Caption button
- If image is too large for vision API: OpenAI handles this with its own limits; error surfaced via toast
- Re-generating caption: deletes old companion doc first, creates new one
- Editing caption: updates in-place and re-ingests for search

