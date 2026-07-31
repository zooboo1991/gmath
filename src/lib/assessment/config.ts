/**
 * Tunables for the level assessment flow. Anything the admin needs to change
 * on the fly (the fee) lives in the app_settings table instead — see
 * getAssessmentFee() in ./db.
 */

/** How many problems the student picks "Бодъё" on before moving to upload. */
export const PROBLEMS_TO_SOLVE = 5;

/**
 * Hard stop on how many problems we put in front of one student. Without it,
 * a student who keeps pressing "Амархан"/"Мэдэхгүй" could walk the whole
 * problem bank.
 */
export const MAX_PROBLEMS_SHOWN = 25;

/** Used when app_settings has no assessment_fee row yet. */
export const DEFAULT_ASSESSMENT_FEE = "20,000₮";

/** Upload limits for the handwritten solution photos. */
export const MAX_SOLUTION_IMAGES_PER_PROBLEM = 3;
export const MAX_SOLUTION_IMAGE_BYTES = 5 * 1024 * 1024;

/** Signed-URL lifetime for private solution/graded-sheet images, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 60 * 10;
