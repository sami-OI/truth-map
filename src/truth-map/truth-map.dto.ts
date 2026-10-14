/**
 * TRUTH MAP — Query param DTOs
 * All params are optional strings; the service handles NULL coercion
 * before passing to Postgres as bind parameters.
 */

export class AgeCohortsQuery {
  track?: string;        // track_key or undefined = all tracks
}

export class CohortProgressionQuery {
  county?: string;       // canonical county name or undefined = all
  track?: string;        // track_key or undefined = all
  from?: string;         // ISO date string, default '2024-01-01'
}

export class DropoutWatchlistQuery {
  county?: string;
  track?: string;
  limit?: string;        // string because query params always arrive as strings
}

export class InterventionFeedQuery {
  severity?: 'medium' | 'high' | 'critical';
}

export class ActivationFunnelQuery {
  track?: string;
}
