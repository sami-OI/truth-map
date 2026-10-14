/**
 * TRUTH MAP CONTROLLER
 * Defines all the URL routes. Each function calls the service
 * which runs the SQL and returns the data as JSON.
 *
 * Routes (all prefixed with /api because of global prefix in main.ts):
 *
 *   GET /api/truth-map/dashboard         ← main one (loads everything)
 *   GET /api/truth-map/county-profiles
 *   GET /api/truth-map/age-cohorts?track=ai_literacy
 *   GET /api/truth-map/county-detail/:county
 *   GET /api/truth-map/cohort-progression?county=Busia&track=ai_literacy&from=2024-01-01
 *   GET /api/truth-map/dropout-watchlist?county=Turkana&limit=20
 *   GET /api/truth-map/intervention-feed?severity=high
 *   GET /api/truth-map/activation-funnel?track=ai_literacy
 *   GET /api/truth-map/track-alignment
 *   GET /api/truth-map/kpis
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { TruthMapService } from './truth-map.service';
@UseGuards(ApiKeyGuard)
// @Controller('truth-map')
// export class TruthMapController { ... }
@Controller('truth-map')   // becomes /api/truth-map/...
export class TruthMapController {
  constructor(private readonly svc: TruthMapService) {}

  // ── Single endpoint — loads all dashboard data at once ──────────────────
  // This is what the dashboard HTML fetches on page load.
  @Get('dashboard')
  dashboard() {
    return this.svc.getDashboard();
  }

  // ── Individual endpoints — for filtering or future use ──────────────────
  @Get('county-profiles')
  countyProfiles() {
    return this.svc.getCountyProfiles();
  }

  @Get('age-cohorts')
  ageCohorts(@Query('track') track?: string) {
    return this.svc.getAgeCohorts(track ?? null);
  }

  @Get('county-detail/:county')
  countyDetail(@Param('county') county: string) {
    return this.svc.getCountyDetail(county);
  }

  @Get('cohort-progression')
  cohortProgression(
    @Query('county') county?: string,
    @Query('track')  track?: string,
    @Query('from')   from?: string,
  ) {
    return this.svc.getCohortProgression(
      county ?? null,
      track  ?? null,
      from   ?? '2024-01-01',
    );
  }

  @Get('dropout-watchlist')
  dropoutWatchlist(
    @Query('county') county?: string,
    @Query('track')  track?: string,
    @Query('limit')  limit?: string,
  ) {
    return this.svc.getDropoutWatchlist(
      county ?? null,
      track  ?? null,
      parseInt(limit ?? '25', 10),
    );
  }

  @Get('intervention-feed')
  interventionFeed(@Query('severity') severity?: string) {
    return this.svc.getInterventionFeed(severity ?? 'medium');
  }

  @Get('activation-funnel')
  activationFunnel(@Query('track') track?: string) {
    return this.svc.getActivationFunnel(track ?? null);
  }

  @Get('track-alignment')
  trackAlignment() {
    return this.svc.getTrackAlignment();
  }

  @Get('kpis')
  kpis() {
    return this.svc.getKPIs();
  }
}
