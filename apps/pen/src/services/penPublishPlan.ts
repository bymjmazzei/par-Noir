/** Publish tier Pen encodes for; the server decides the plan it enforces. */
export const PEN_PUBLISH_PLAN_ID = 'floor';

/** Same code the API and browse uploads use when a video runs past the plan's limit. */
export const EXCEEDS_TIER_MAX_DURATION = 'exceeds_tier_max_duration';

export class PageTooLongError extends Error {
  constructor(
    readonly durationSec: number,
    readonly maxDurationSec: number
  ) {
    super(EXCEEDS_TIER_MAX_DURATION);
  }
}
