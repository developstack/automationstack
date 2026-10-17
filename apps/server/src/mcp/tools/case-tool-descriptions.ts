export const READ_CASES_DESCRIPTION =
	"Read existing test cases of a project, with their bodies. This is the tool " +
	"to call BEFORE writing any new case: it is the only way to learn how this " +
	"project actually writes cases (step granularity, naming, how specific the " +
	"expected results are) and the only way to tell whether a case you are about " +
	"to write already exists in another wording. " +
	"Filters: moduleId (+ includeDescendants), keyword (name substring), status, " +
	"priority[], tags[] (any-of), sourceRefPrefix (prefix match on sourceRef — " +
	"use 'gen:<requirement-id>#' to list what a previous generation run produced " +
	"for that requirement). " +
	"detail: 'summary' (default) returns id/name/moduleId/priority/status/" +
	"caseType/tags/sourceRef/maintainer/updatedAt; 'full' adds preconditions and " +
	"steps (each step carries screenshots: an ordered list of case attachment " +
	"ids, empty when the step has none), and is capped at 10 rows per page by default (20 max) because case " +
	"bodies are expensive — page through them rather than asking for everything. " +
	"Returns {detail, items[], page, pageSize, total}. " +
	"Do not use it to check whether one specific case landed after an import — " +
	"search_cases is cheaper for that.";

export const LIST_CASE_TAGS_DESCRIPTION =
	"List every tag already used by cases in a project (deduplicated, sorted). " +
	"Call it before tagging newly written cases and reuse what is there: tags are " +
	"a free-text vocabulary, so an agent that invents its own wording each run " +
	"('登录' / '用户登录' / 'auth') quietly degrades the project's tag filter, and " +
	"cleaning that up afterwards is manual work for the user. Returns string[]. " +
	"An empty array means the project has no tags yet, not that the call failed.";

export const IMPORT_TEST_CASES_DESCRIPTION =
	"Write test cases into a project — the single write path, shared by migrating " +
	"existing cases and by cases newly designed from a requirement. At most 50 per " +
	"call; split larger sets into batches. " +
	"Each case needs a moduleId (from ensure_module_path or get_module_tree) and a " +
	"name, and should carry a stable sourceRef, unique per project: it is the " +
	"idempotency key, so a re-run updates or skips instead of duplicating. For " +
	"cases designed from a requirement, use 'gen:<requirement-id>#<slug-of-case-" +
	"name>' and agree the requirement id with the user first, so the same " +
	"requirement produces the same keys next time. " +
	"Fields: priority P0-P3 (default P2 — for newly designed cases set it " +
	"explicitly, an all-P2 batch carries no prioritisation), caseType " +
	"functional|interface|performance|security|compatibility|other, status " +
	"draft|active|deprecated, preconditions, steps [{id, step, expected}] (id must " +
	"be a unique non-empty string, e.g. a uuid; step screenshots cannot be " +
	"written here, and on overwrite a step that keeps its id keeps its stored " +
	"screenshots), tags, maintainer. " +
	"Newly designed cases go in as status 'draft' (the default): the platform's " +
	"case list filters on status, so draft is where a human reviews them before " +
	"they count as the project's real coverage. Writing 'active' directly puts " +
	"unreviewed AI output into the live suite. " +
	"onDuplicate (required) decides what happens when a sourceRef already exists: " +
	"'skip' leaves the existing case untouched (use it to fill gaps), 'overwrite' " +
	"updates it through the version-snapshot pipeline so the change is revertible " +
	"(use it when the requirement changed) — note it updates content only and does " +
	"NOT move the case to a different moduleId — and 'create-anyway' creates a " +
	"second case with sourceRef forced to null, which permanently drops that case " +
	"out of the idempotency scheme; avoid it for generated cases. " +
	"Rows are validated and executed independently: a malformed or failing row is " +
	"reported in 'errors' with its index in the batch and the offending field, and " +
	"never rejects the other rows. " +
	"Result: {created[] (action created|overwritten, caseId, version), skipped[], " +
	"errors[] (index, name, sourceRef, message)}.";

export const SEARCH_CASES_DESCRIPTION =
	"Look up cases in a project by a case-insensitive substring of their name " +
	"(%/_ are matched literally). Returns up to 'limit' summary rows (id, name, " +
	"moduleId, priority, status, caseType, sourceRef, updatedAt), newest-updated " +
	"first. It answers one question: is this particular case there? Typical use is " +
	"spot-checking after an import batch. " +
	"It never returns steps or preconditions, so it cannot tell you how this " +
	"project writes cases and cannot be used to judge whether a new case " +
	"duplicates an existing one — use read_cases with detail 'full' for that.";

export const DELETE_CASES_DESCRIPTION =
	"Permanently delete up to 100 test cases of ONE project in one call. " +
	"This is a hard delete: there is no trash and no restore, and the version " +
	"history of each case is also deleted. Call it only when the user explicitly " +
	"asks to delete these cases. Examples are duplicates and rows that an import " +
	"added by mistake. Do not delete cases as cleanup that you decide on. If the " +
	"request is not clear, ask the user which cases to delete. Get the ids from " +
	"read_cases or search_cases first. " +
	"Do not delete a case to retire it from the real suite. Instead, set its " +
	"status to 'deprecated' with change_case_status. " +
	"A case that a test run uses cannot be deleted, because test runs are " +
	"permanent. The tool skips these cases and deletes the other cases in one " +
	"transaction. If an id does not exist, the tool puts it in missingIds and " +
	"continues. If the ids belong to different projects, the tool deletes nothing. " +
	"Any member of the project can call it. Split larger sets into calls of at " +
	"most 100 ids. " +
	"Returns {deleted[] (id, name), skipped[] (id, name, referencedByRunCount), " +
	"missingIds[]}. Tell the user about each skipped case and offer to set it to " +
	"'deprecated'.";

export const CHANGE_CASE_STATUS_DESCRIPTION =
	"Change the status (draft | active | deprecated) of up to 100 cases of ONE " +
	"project in one call — e.g. promote reviewed drafts to 'active', or retire " +
	"cases with 'deprecated'. Only the status changes: steps and other fields " +
	"stay as they are, and there is no version check. The call is all-or-nothing: " +
	"if any id does not exist, or the ids belong to different projects, nothing " +
	"changes. Any member of the project may call it. Split larger sets into calls " +
	"of at most 100 ids. " +
	"Every case whose status actually changes gets a new version in its history; " +
	"a case already in the target status is left alone. " +
	"Returns {changed[] (id, name, previousStatus, status, version), unchanged[] " +
	"(id, name, status)}. To undo, call again once per distinct previousStatus " +
	"with the ids that had it.";
