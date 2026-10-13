// Shared dropdown options + lead source/kind types for the lead-gen forms.

export type LeadSource =
  | "sidebar"
  | "billing_card"
  | "billing_custom_pricing"
  | "builder_nudge"
  | "hire_expert"
  | "onboarding"
  | "pricing_custom_volume"
  | "landing_contact"
  | "auth_page";

export type LeadKind = "hire_expert" | "enterprise";

// Provenance stamped by the in-app forms (analytics only; the marketing site and
// server use "website"). Derived from AppConfig deploymentMode: cloud → "cloud_app",
// otherwise "oss_app". OSS submits via the public no-token endpoints.
export type LeadOrigin = "cloud_app" | "oss_app";

// Monthly call-volume buckets. Values MUST match the backend qualifier enum
// (user_onboarding flows): "0-5k" | "5k-100k" | "100k+" | "not-sure".
// `labelKey` is a next-intl message key under the `Campaigns` namespace.
export const VOLUME_OPTIONS = [
  { value: "0-5k", labelKey: "options.volume0to5k" },
  { value: "5k-100k", labelKey: "options.volume5kTo100k" },
  { value: "100k+", labelKey: "options.volume100kPlus" },
  { value: "not-sure", labelKey: "options.notSure" },
] as const;

// Hire-an-Expert expected monthly call volume (shared bucket set).
export const HIRE_VOLUME_OPTIONS = VOLUME_OPTIONS;

// Enterprise monthly call volume (shared bucket set).
export const ENTERPRISE_VOLUME_OPTIONS = VOLUME_OPTIONS;

// Lead sources for which the Enterprise modal surfaces the conditional
// "Need enterprise deployment (SSO, on-prem, data residency)?" question.
// Other entry points hide it and default the payload to "yes".
export const ENTERPRISE_DEPLOYMENT_SOURCES: readonly LeadSource[] = [
  "billing_custom_pricing",
  "pricing_custom_volume",
  "landing_contact",
  "auth_page",
];

// Enterprise deployment need (conditional — see ENTERPRISE_DEPLOYMENT_SOURCES).
export const ENTERPRISE_DEPLOYMENT_OPTIONS = [
  { value: "yes", labelKey: "options.yes" },
  { value: "no", labelKey: "options.no" },
  { value: "maybe", labelKey: "options.maybe" },
] as const;

// ---------------------------------------------------------------------------
// Post-signup onboarding form options
// ---------------------------------------------------------------------------

// Onboarding: are you migrating from another provider? (a trimmed competitor list).
// "no" → not migrating; "other" → reveals a free-text provider field.
export const ONBOARDING_MIGRATION_OPTIONS = [
  { value: "no", labelKey: "options.migrationNo" },
  { value: "vapi", labelKey: "options.providerVapi" },
  { value: "retell", labelKey: "options.providerRetell" },
  { value: "bland", labelKey: "options.providerBland" },
  { value: "elevenlabs", labelKey: "options.providerElevenlabs" },
  { value: "synthflow", labelKey: "options.providerSynthflow" },
  { value: "other", labelKey: "options.other" },
] as const;

// Onboarding: how did you hear about us? (trimmed).
export const ONBOARDING_HEARD_OPTIONS = [
  { value: "github", labelKey: "options.heardGithub" },
  { value: "search_engine", labelKey: "options.heardSearchEngine" },
  { value: "social_media", labelKey: "options.heardSocialMedia" },
  { value: "youtube", labelKey: "options.heardYoutube" },
  { value: "ai_tool", labelKey: "options.heardAiTool" },
  { value: "referral", labelKey: "options.heardReferral" },
  { value: "other", labelKey: "options.other" },
] as const;

// Onboarding: expected monthly call volume. Its own set — value "exploring" is NOT
// the qualifier's "not-sure"; onboarding has no flow, so this is analytics-only.
export const ONBOARDING_VOLUME_OPTIONS = [
  { value: "0-5k", labelKey: "options.volume0to5k" },
  { value: "5k-100k", labelKey: "options.volume5kTo100k" },
  { value: "100k+", labelKey: "options.volume100kPlus" },
  { value: "exploring", labelKey: "options.volumeExploring" },
] as const;

// Onboarding: what best describes you.
export const ONBOARDING_PERSONA_OPTIONS = [
  { value: "enterprise_midmarket", labelKey: "options.personaEnterprise" },
  { value: "agency", labelKey: "options.personaAgency" },
  { value: "local_business", labelKey: "options.personaLocalBusiness" },
  { value: "startup", labelKey: "options.personaStartup" },
  { value: "solo", labelKey: "options.personaSolo" },
] as const;

// Persona values that unlock the on-prem conditional question.
export const ONBOARDING_ONPREM_PERSONAS: readonly string[] = ["enterprise_midmarket"];

// Onboarding: on-prem deployment need (conditional on Enterprise/Mid-Market).
export const ONBOARDING_ONPREM_OPTIONS = [
  { value: "yes", labelKey: "options.yes" },
  { value: "no", labelKey: "options.no" },
  { value: "not_sure", labelKey: "options.notSure" },
] as const;
