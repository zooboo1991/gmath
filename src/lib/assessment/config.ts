/**
 * Tunables for the level assessment flow. Anything the admin needs to change
 * on the fly (the fee) lives in the app_settings table instead — see
 * getAssessmentFee() in ./db.
 */

/** Used when app_settings has no assessment_fee row yet. */
export const DEFAULT_ASSESSMENT_FEE = "20,000₮";

/** Used when app_settings has no quiz_fee row yet (Энгийн/Сонгон tracks). */
export const DEFAULT_QUIZ_FEE = "10,000₮";

/** Questions per quiz attempt. Fewer are served when the bank is thin, never zero. */
export const QUIZ_QUESTIONS_PER_TEST = 10;

/** Questions in the free, sign-in-free taster. Short enough to finish standing up. */
export const SAMPLE_QUESTIONS_PER_TEST = 5;

/** Used when app_settings has no assessment_sla row yet. */
export const DEFAULT_ASSESSMENT_SLA = "1-2 хоног";

/**
 * Upload limits for the handwritten solution photos. Ten rather than three: a
 * single olympiad problem's working runs to several pages, and the cap is here
 * to stop a runaway upload loop, not to ration a child's paper.
 */
export const MAX_SOLUTION_IMAGES_PER_PROBLEM = 10;
export const MAX_SOLUTION_IMAGE_BYTES = 5 * 1024 * 1024;

/** Signed-URL lifetime for private solution/graded-sheet images, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 60 * 10;
