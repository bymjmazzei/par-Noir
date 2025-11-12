# Content Ratings Standard
## par Noir - Decentralized Social Media Content Rating System

### Overview

The par Noir content rating system provides a self-explanatory, movie-rating-style classification that enables creators to properly label their content and viewers to filter content within their comfort range. This system is decentralized and user-curated, relying on accurate self-rating and community verification.

### Rating Tiers

#### General Audience (GA)
- **Description**: Content suitable for all ages
- **Content Guidelines**: No mature themes, violence, profanity, or sexual content
- **Age Restriction**: None
- **Comparable Rating**: G (Movies), E (Games)

#### Family Friendly (FF)
- **Description**: Mild content suitable for families
- **Content Guidelines**: Very mild language or thematic elements; no explicit content
- **Age Restriction**: None (parental discretion recommended for very young children)
- **Comparable Rating**: PG (Movies), E10+ (Games)

#### Teen (T13+)
- **Description**: Content suitable for teenagers 13 and older
- **Content Guidelines**: Moderate language, suggestive themes, stylized violence
- **Age Restriction**: 13+ (self-attestation)
- **Comparable Rating**: PG-13 (Movies), T (Games)

#### Young Adult (YA16+)
- **Description**: Content suitable for young adults 16 and older
- **Content Guidelines**: Stronger themes, limited non-graphic violence, moderate profanity
- **Age Restriction**: 16+ (self-attestation)
- **Comparable Rating**: R (Movies), M (Games)

#### Mature (M18+)
- **Description**: Content for mature audiences 18 and older
- **Content Guidelines**: Explicit language, adult themes, potential non-explicit sexual content
- **Age Restriction**: 18+ (age verification required)
- **Comparable Rating**: R/NC-17 (Movies), M (Games)
- **Note**: Not shown to users under 18

#### Not Safe For Work (NSFW)
- **Description**: Adult content not suitable for workplace viewing
- **Content Guidelines**: Strong sexual implications, nudity, graphic violence, explicit adult humor
- **Age Restriction**: 18+ (age verification required)
- **Comparable Rating**: R/NC-17 (Movies), AO (Games)
- **Note**: Always flagged and sandboxed; requires explicit opt-in

#### Explicit (X18+)
- **Description**: Hardcore adult content
- **Content Guidelines**: Hardcore sexual content or extreme violence
- **Age Restriction**: 18+ (enhanced age verification required)
- **Comparable Rating**: X/NC-17 (Movies), AO (Games)
- **Note**: Hidden by default; only shown when viewers explicitly enable

### Warning Tags (Optional)

Creators can add warning tags to provide additional context:
- `violence` - Contains violent content
- `substance-use` - Depicts drug or alcohol use
- `hate-speech` - Contains potentially offensive language
- `graphic-content` - Contains graphic imagery
- `sexual-content` - Contains sexual themes
- `language` - Contains strong language

### Operational Notes

1. **Self-Rating**: Creators must select exactly one rating per file
2. **Mandatory for Public Content**: All public content must have a rating
3. **Age Verification**: 18+ content requires age verification (self-attestation or cryptographic proof)
4. **Client-Side Filtering**: Viewers set their maximum acceptable rating; clients filter accordingly
5. **Community Verification**: Users can flag mis-rated content; reputation systems track rating accuracy
6. **Portability**: Ratings travel with content metadata when syndicated to third-party feeds

### Implementation

Ratings are stored in metadata as:
```json
{
  "contentRating": "M18+",
  "warningTags": ["violence", "language"],
  "ageRestriction": 18,
  "requiresVerification": true
}
```

