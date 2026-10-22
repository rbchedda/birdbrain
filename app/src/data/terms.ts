// Wording is verbatim from the trespass/map-data liability memo
// (birdbrain-trespass-liability.md, sections 4C and 4D; the bracketed attorney
// note in 4D item 6 is an internal review note and is not shown). Do not edit
// without legal review. Bump TERMS_VERSION when the terms change materially so
// every user sees the onboarding screen again.

/** Bump when the ToS changes materially: the onboarding screen shows again. */
export const TERMS_VERSION = '2026-10-22';

/** 4C onboarding acceptance screen. */
export const consentTitle = "Before you use BirdBrain maps:";
export const consentBullets: readonly string[] = [
  "Map boundaries, stocking points and dove fields are approximate and may be wrong or out of date.",
  "BirdBrain never gives you permission to enter any land. You are responsible for knowing where you are and for having the landowner's permission.",
  "Hunting rules change. The PA Game Commission's current regulations control, not this app.",
  "BirdBrain is not affiliated with the PA Game Commission."
];
export const consentCheckboxLabel = "I understand and agree to the Terms of Service and Privacy Policy.";

/** 4D ToS section. */
export const tosSectionTitle = "Maps, Data and Your Responsibility";
export const tosSection: readonly { title: string; body: string }[] = [
  {
    "title": "Map data accuracy.",
    "body": "Maps, boundaries, stocking locations, dove fields, zones, seasons and hours are provided for general planning only. They come from public sources and our own processing (including simplification and blurring). They may be incomplete, inaccurate or out of date, and they are not a legal survey. Phone GPS can be off by many yards."
  },
  {
    "title": "No permission to enter land.",
    "body": "Nothing in BirdBrain grants or implies permission to enter, cross or hunt any land. Showing a place does not mean it is open, public or lawful to hunt."
  },
  {
    "title": "Your responsibility.",
    "body": "You are solely responsible for knowing your location and boundaries; for obeying posted signs, purple paint marks, fences, landowner instructions, safety zones and all game, trespass and firearm laws; and for holding all required licenses and permissions."
  },
  {
    "title": "Regulations change.",
    "body": "Seasons, hours, bag limits and area rules change, sometimes mid-season. The official PA Game Commission regulations control. Verify at pa.gov/pgc before every hunt."
  },
  {
    "title": "User-posted locations.",
    "body": "Locations, pins and reports posted by users are their content, not ours. They are not verified and may be wrong, blurred or delayed on purpose. Never rely on them for boundaries or access, and don't post private land without the owner's consent."
  },
  {
    "title": "As-is; limitation of liability.",
    "body": "The service and all data are provided \"as is\" and \"as available,\" without warranties of any kind, including accuracy, fitness for a particular purpose and non-infringement. To the fullest extent permitted by law, BirdBrain is not liable for citations, fines, license suspensions, trespass claims, injury or other loss arising from your use of or reliance on map data or user content. Our total liability is limited to the amount you paid us in the 12 months before the claim."
  },
  {
    "title": "Report errors.",
    "body": "Use \"Report a map error\" in any place sheet. We will review it, but we don't guarantee a correction."
  }
];
