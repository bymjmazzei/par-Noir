# Metadata Fields Classification

## Static/Auto-Extracted Fields (Not Editable)

These fields are automatically populated from the file itself or system context:

### System-Generated
- `fileId` - Unique identifier generated on upload
- `googleDriveFileId` - Google Drive file ID
- `uploadedAt` / `datePublished` - Timestamp set on upload
- `backend` - Storage backend identifier
- `owner.did` - Creator's DID (from authenticated user)
- `owner.identifier` - pN identifier (derived from credentials)

### Auto-Extracted from File
- `mimeType` / `encodingFormat` - Detected from file
- `fileSize` / `size` - File size in bytes
- `originalName` - Original filename before encryption

### Auto-Extracted from Media (if implemented)
- `width` / `height` - Image/video dimensions (extracted from file)
- `duration` - Video/audio duration (extracted from file)
- `bitrate` - Audio/video bitrate (extracted from file)
- `frameRate` - Video frame rate (extracted from file)
- `audioSampleRate` - Audio sample rate (extracted from file)
- `videoQuality` - Video resolution (extracted from file, e.g., "1080p", "4K")

### Auto-Generated
- `thumbnail` - Auto-generated preview (or actual file displayed at smaller size)
- `publicToken` - Share token generated on upload
- `engagement` - Engagement metrics (initialized to 0, updated by interactions)

### Auto-Populated from Context
- `prov:wasGeneratedBy` - Upload activity (auto-created)
- `prov:wasAttributedTo` - Creator DID (auto-set from authenticated user)
- `creator` / `author` - Auto-populated from authenticated user
- `dc:creator` / `dc:publisher` - Auto-populated from authenticated user

## User-Editable Fields

These fields can be edited by the user through the dashboard:

### Basic Metadata (Currently Editable)
- `name` / `title` / `dc:title` - User-defined title
- `description` / `dc:description` - User-defined description
- `tags` / `keywords` / `dc:subject` - User-defined tags/keywords

### Content Classification (Should be Editable)
- `genre` - Content genre (e.g., "photography", "art", "documentation")
- `category` - Main category
- `about` - Subjects/topics the content is about
- `foaf:topic` - FOAF topics

### Location (Should be Editable)
- `locationCreated` - Where the content was created
  - `name` - Place name
  - `address` - Full address
  - `geo` - GPS coordinates (latitude, longitude)

### Rights & Licensing (Should be Editable)
- `license` / `dc:rights` - License URI or text (e.g., "CC BY 4.0", "All Rights Reserved")
- `copyrightHolder` / `dc:rightsHolder` - Copyright holder DID/name
- `copyrightNotice` - Copyright notice text
- `usageInfo` - Usage rights description

### Language (Should be Editable)
- `inLanguage` / `dc:language` - Content language (ISO 639-1, e.g., "en", "es", "fr")

### Accessibility (Should be Editable)
- `accessibilityFeature` - Features like "captions", "audioDescription", "textAlternative"
- `accessibilityHazard` - Hazards like "noFlashing", "noMotionSimulation"
- `accessibilitySummary` - Accessibility summary text

### Content Relationships (Should be Editable)
- `inReplyTo` / `as:inReplyTo` - Reply to another post/resource
- `repostOf` - Repost of another post/resource
- `isPartOf` - Part of a collection/series/curated feed
- `hasPart` - Resources that are part of this resource
- `citation` - Citations/references

### Extended Metadata (Optional - Advanced Users)
- `alternativeHeadline` - Alternative title
- `headline` - Main headline
- `abstract` - Abstract/summary
- `text` - Full text content (for documents)
- `dc:coverage` - Spatial/temporal coverage
- `dc:source` - Source URI
- `dc:relation` - Related resource URIs
- `sameAs` - Same resource in other systems
- `foaf:depicts` - Things depicted in the content
- `prov:wasDerivedFrom` - Source resources
- `prov:wasInfluencedBy` - Influencing resources

## Recommendation

**Current Implementation:**
- Only `name`, `description`, and `tags` are editable
- All other fields are optional and static

**Recommended Implementation:**
1. **Auto-extract technical metadata** on upload (width, height, duration, etc.) - these become static
2. **Make essential fields editable**: genre, category, location, license, language
3. **Keep advanced fields optional**: Most users won't need PROV-O, FOAF advanced features, but they're available for power users
4. **Auto-populate what we can**: Creator, dates, provenance from upload context

This way:
- Most users can edit: name, description, tags, genre, location, license
- Power users can add: advanced semantic web metadata
- System handles: technical metadata extraction, provenance tracking, engagement metrics

