/**
 * TRUTH MAP SERVICE
 * Every function here runs one SQL query against a view in your database.
 * The views (v_tm_county_track, v_fact_enrollment_status, etc.)
 * must already exist — run truth_map_views.sql in pgAdmin first.
 *
 * If a view does not exist yet, that function returns [] and logs a warning.
 * The API stays up — it just returns empty data for that section.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TruthMapService {
  private readonly log = new Logger(TruthMapService.name);

  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  // ── Internal helper ─────────────────────────────────────────────────────
  // Runs any SQL with optional parameters.
  // Returns [] if the view doesn't exist yet (so the server stays up).
  private async run<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    label = '',
  ): Promise<T[]> {
    try {
      return await this.db.query<T[]>(sql, params);
    } catch (err: any) {
      // "relation does not exist" — views not yet created in DB
      if (err?.code === '42P01') {
        this.log.warn(`View not found for [${label}] — run truth_map_views.sql in pgAdmin`);
        return [];
      }
      this.log.error(`Query failed [${label}]: ${err.message}`);
      throw err;
    }
  }

  // ── Q1 · County profiles (bubble chart) ─────────────────────────────────
  // One row per county with every variable the dashboard axis-picker can use.
  async getCountyProfiles() {
    return this.run(`
      SELECT
        r.county,
        rc.livelihood,
        r.total_enrollments,
        r.distinct_learners,
        g.female_pct,
        max(ct.completion_rate)      FILTER (WHERE ct.track_key = 'ai_literacy')         AS ai_completion,
        max(ct.completion_rate)      FILTER (WHERE ct.track_key = 'basic_literacy')      AS basic_completion,
        max(ct.never_logged_in_rate) FILTER (WHERE ct.track_key = 'ai_literacy')         AS never_logged_ai,
        max(ct.completion_rate)      FILTER (WHERE ct.track_key = 'gig_economy')         AS gig_completion,
        max(ct.completion_rate)      FILTER (WHERE ct.track_key = 'digital_agriculture') AS digag_completion,
        max(ct.completion_rate)      FILTER (WHERE ct.track_key = 'it_technician')       AS it_completion,
        max(ct.completion_rate)      FILTER (WHERE ct.track_key = 'creative_economy')    AS creative_completion,
        f.activation_rate                                                                  AS activation_rate_ai,
        f.certified                                                                        AS total_certified,
        ta.alignment_gap
      FROM v_tm_county_reach r
      LEFT JOIN v_tm_county_gender  g  ON g.county      = r.county
      LEFT JOIN v_tm_county_track   ct ON ct.county     = r.county
      LEFT JOIN ref_counties        rc ON rc.county_key = r.county
      LEFT JOIN (
        SELECT county,
               round(100.0 * sum(activated) / NULLIF(sum(enrolled),0), 1) AS activation_rate,
               sum(certified) AS certified
        FROM v_tm_activation_funnel
        GROUP BY county
      ) f  ON f.county  = r.county
      LEFT JOIN v_tm_track_alignment ta ON ta.county    = r.county
      GROUP BY r.county, rc.livelihood, r.total_enrollments,
               r.distinct_learners, g.female_pct,
               f.activation_rate, f.certified, ta.alignment_gap
      ORDER BY r.total_enrollments DESC;
    `, [], 'Q1-county-profiles');
  }

  // ── Q2 · Age cohorts ────────────────────────────────────────────────────
  // track = specific track_key, or null for all tracks
  async getAgeCohorts(track: string | null) {
    return this.run(`
      SELECT track_key, age_cohort, total, completion_rate
      FROM v_tm_age_track
      WHERE ($1::text IS NULL OR track_key = $1)
      ORDER BY track_key,
               array_position(
                 ARRAY['Youth (16-24)', 'Young Adult (25-34)', 'Adult (35+)'],
                 age_cohort
               );
    `, [track], 'Q2-age-cohorts');
  }

  // ── Q3 · County detail (tooltip / pinned panel) ──────────────────────────
  async getCountyDetail(county: string) {
    return this.run(`
      SELECT
        ct.track_key,
        ct.total,
        ct.completed,
        ct.in_progress,
        ct.not_started,
        ct.never_logged_in,
        ct.completion_rate,
        ct.never_logged_in_rate,
        f.enrolled,
        f.activated,
        f.started,
        f.certified,
        round(100.0 * f.activated / NULLIF(f.enrolled,0), 1) AS activation_rate
      FROM v_tm_county_track ct
      JOIN v_tm_activation_funnel f
        ON f.county = ct.county AND f.track_key = ct.track_key
      WHERE ct.county = $1
      ORDER BY ct.total DESC;
    `, [county], 'Q3-county-detail');
  }

  // ── Q4 · Cohort progression curves ──────────────────────────────────────
  async getCohortProgression(
    county: string | null,
    track: string | null,
    fromDate: string,
  ) {
    return this.run(`
      SELECT
        cohort_month,
        months_since,
        sum(cohort_size)                                                       AS cohort_size,
        round(100.0 * sum(completed_cumulative) / NULLIF(sum(cohort_size),0), 1) AS completion_pct
      FROM v_tm_cohort_progression
      WHERE ($1::text IS NULL OR county    = $1)
        AND ($2::text IS NULL OR track_key = $2)
        AND cohort_month >= $3::date
      GROUP BY cohort_month, months_since
      ORDER BY cohort_month, months_since;
    `, [county, track, fromDate], 'Q4-cohort-progression');
  }

  // ── Q5 · At-risk learner watchlist ──────────────────────────────────────
  async getDropoutWatchlist(
    county: string | null,
    track: string | null,
    limit: number,
  ) {
    return this.run(`
      SELECT
        d.user_id,
        u.name,
        u.phone_number,
        d.county,
        d.track_key,
        d.progress_percent,
        d.days_since_last_activity,
        d.risk_score,
        d.risk_band
      FROM v_tm_dropout_risk d
      JOIN "user" u ON u.id = d.user_id
      WHERE d.risk_band IN ('high','medium')
        AND ($1::text IS NULL OR d.county    = $1)
        AND ($2::text IS NULL OR d.track_key = $2)
      ORDER BY d.risk_score DESC, d.days_since_last_activity DESC
      LIMIT $3;
    `, [county, track, limit], 'Q5-dropout-watchlist');
  }

  // ── Q6 · Intervention feed ───────────────────────────────────────────────
  async getInterventionFeed(minSeverity: string) {
    return this.run(`
      SELECT county, trigger_code, metric_value, threshold,
             severity, action_code, rationale
      FROM v_tm_county_interventions
      WHERE array_position(ARRAY['medium','high','critical'], severity)
            >= array_position(ARRAY['medium','high','critical'], $1)
      ORDER BY array_position(ARRAY['critical','high','medium'], severity),
               metric_value DESC;
    `, [minSeverity], 'Q6-interventions');
  }

  // ── Q7 · Activation funnel ───────────────────────────────────────────────
  async getActivationFunnel(track: string | null) {
    return this.run(`
      SELECT county,
             sum(enrolled)  AS enrolled,
             sum(activated) AS activated,
             sum(started)   AS started,
             sum(completed) AS completed,
             sum(certified) AS certified,
             round(100.0 * sum(activated) / NULLIF(sum(enrolled),0), 1) AS activation_rate
      FROM v_tm_activation_funnel
      WHERE ($1::text IS NULL OR track_key = $1)
      GROUP BY county
      ORDER BY enrolled DESC;
    `, [track], 'Q7-activation-funnel');
  }

  // ── Q8 · Track alignment ─────────────────────────────────────────────────
  async getTrackAlignment() {
    return this.run(`
      SELECT county, livelihood,
             foundational_completion, vocational_completion, alignment_gap
      FROM v_tm_track_alignment
      ORDER BY alignment_gap DESC NULLS LAST;
    `, [], 'Q8-track-alignment');
  }

  // ── Q9 · Programme KPIs (sidebar strip) ─────────────────────────────────
  async getKPIs() {
    const rows = await this.run(`
      SELECT
        count(*)                                                             AS total_enrollments,
        count(DISTINCT county)                                               AS counties_reached,
        count(DISTINCT user_id)                                              AS total_learners,
        round(100.0 * count(*) FILTER (WHERE track_key = 'ai_literacy'
              AND progress_status = 'Completed')
            / NULLIF(count(*) FILTER (WHERE track_key = 'ai_literacy'),0), 0)
                                                                             AS ai_completion_pct,
        round(100.0 * count(*) FILTER (WHERE is_vocational
              AND progress_status = 'Completed')
            / NULLIF(count(*) FILTER (WHERE is_vocational),0), 0)            AS vocational_completion_pct,
        round(100.0 * count(*) FILTER (WHERE track_key = 'ai_literacy'
              AND progress_status = 'Never logged in')
            / NULLIF(count(*) FILTER (WHERE track_key = 'ai_literacy'),0), 0)
                                                                             AS never_activated_ai_pct,
        count(*) FILTER (WHERE have_certificate)                             AS total_certified,
        round(100.0 * count(*) FILTER (WHERE gender = 'female')
            / NULLIF(count(*) FILTER (WHERE gender IS NOT NULL),0), 0)       AS female_pct
      FROM v_fact_enrollment_status;
    `, [], 'Q9-kpis');
    return rows[0] ?? {};
  }

  // ── /dashboard — all data in one call ───────────────────────────────────
  // The dashboard HTML calls this single endpoint on load.
  // All queries run in parallel — fast even with 14,000+ rows.
  async getDashboard() {
    const [
      countyProfiles,
      ageCohorts,
      activationFunnel,
      trackAlignment,
      interventionFeed,
      kpis,
    ] = await Promise.all([
      this.getCountyProfiles(),
      this.getAgeCohorts(null),
      this.getActivationFunnel(null),
      this.getTrackAlignment(),
      this.getInterventionFeed('medium'),
      this.getKPIs(),
    ]);

    return {
      meta: {
        generated_at: new Date().toISOString(),
        source: 'live-database',
      },
      countyProfiles,
      ageCohorts,
      activationFunnel,
      trackAlignment,
      interventionFeed,
      kpis,
    };
  }
}
