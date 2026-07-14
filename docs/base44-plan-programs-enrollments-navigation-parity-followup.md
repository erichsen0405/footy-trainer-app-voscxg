# Base44 Follow-up Prompt: Correct And Verify Plan Navigation Parity

Apply this correction to the implementation produced from
`base44-plan-programs-enrollments-navigation-parity-prompt.md` inside the
existing authenticated Base44/KlubAdmin webapp.

The overall direction is correct, but do not report the work complete yet. The
previous delivery contains placement, navigation-history and verification gaps.
Reuse the implementation already made; do not rebuild the module and do not
create new Base44 entities or services.

## 1. Put The `+` Beside The Actual Profile Control

The compact global create button must be located in the KlubAdmin top header,
immediately beside the existing profile button/control. It must not sit inside
the Plan content header.

Required behavior:

- Show the `+` only while Plan is the active KlubAdmin area and the actor may
  create content.
- Clicking it opens the existing Plan create picker.
- The picker contains Task, Exercise, Session, Week and Program.
- Keep the create picker state owned by Plan or a shared Plan controller; expose
  a small callback/ref/event contract to the header instead of duplicating the
  picker in `KlubAdmin.jsx`.
- Do not add a second `+`, large Create card or local Create button in Programs.
- The visible picker title must be `Create` or `Choose what to create`, not
  `Create template`, because Program is not a training template.

The header control must remain keyboard accessible and have an accessible name
such as `Create plan content` even though the visible button is only `+`.

## 2. Use Real URL-backed View Navigation

`localStorage` does not satisfy browser back/forward behavior and can restore a
view from another context unexpectedly. Replace `localStorage` as the source of
truth for the selected Plan view with the existing router/search-parameter
pattern used by KlubAdmin.

Use one stable query parameter, for example:

```text
/KlubAdmin?tab=plan&view=programs
/KlubAdmin?tab=plan&view=enrollments
```

Adapt the parameter names to existing conventions if the app already has them.

Required behavior:

- A direct load or refresh of `view=programs` renders the Programs overview on
  the first relevant paint.
- Selecting a View-dropdown option updates only the view URL/state.
- Browser Back and Forward restore the previous Plan view.
- Invalid/missing view values fall back to Tasks without a render loop.
- Changing owner/workspace must not reuse an incompatible stale view.
- Never put program-create intent in the URL, localStorage, sessionStorage or
  navigation history.

View state and create intent must remain separate:

```text
selectPlanView("programs") -> overview only
requestCreate("program")  -> select Programs + open builder once
```

Consume and clear the create intent synchronously as part of opening the
builder. Returning to Programs through dropdown, refresh, Back, Forward or
workspace remount must never replay it.

## 3. Remove The Dead Assignments Navigation

The previous implementation changed `navigateToAssignments` so it merely lands
on Plan. That leaves a misleading `View assignments` path that no longer opens
anything useful.

Do not navigate to an unrelated Plan view after a completed bulk assignment.
Use one of the existing supported outcomes:

1. Prefer reusing the existing batch-detail dialog/panel in place if it already
   works independently of the removed Assignments page.
2. Otherwise keep the completed result visible in the wizard and replace
   `View assignments` with `Done`/`Close`.

Remove obsolete `pendingBatchId`, `navigateToAssignments`,
`onConsumeBatchId`, dead imports and unreachable Assignments-view state from all
affected components. Do not leave no-op callbacks whose labels promise a view
that no longer exists.

Bulk assignment must still start from each supported content card. This
correction concerns only the post-result destination.

## 4. Harden The Cross-program Enrollments View

Continue using the existing canonical program-enrollment service. Do not query
Supabase tables directly and do not create an enrollment entity in Base44.

If the view must request enrollments once per program:

- use bounded concurrency rather than an unbounded request fan-out
- ignore stale responses after owner/view changes
- validate that every response belongs to the active owner and requested
  program
- show partial failure explicitly while preserving successfully loaded rows
- retry only failed program requests
- do not show the global empty state until every applicable request has
  completed successfully with no rows
- refetch the affected program after a lifecycle action

Filters must stay above the result list and work together. Player, program,
status and date range must remain visible and scannable.

## 5. Verify Instead Of Inferring

The previous acceptance table used code inspection as proof. Statements such as
`setView renders directly` are not executed test results.

Before reporting completion:

1. Run the Base44 project's available lint, typecheck, tests and production
   build. Report the exact commands and results.
2. Test the actual Base44 Preview at desktop and narrow responsive widths.
3. Test a refresh/direct load of the Programs URL.
4. Test browser Back and Forward between Tasks, Programs and Enrollments.
5. Test `+` -> Program, close, switch view, return and refresh; the builder must
   open only once.
6. Verify the `+` is visually beside the real profile control and does not
   appear elsewhere.
7. Complete a bulk assignment and verify the result CTA does not navigate to a
   dead Assignments destination.
8. Verify Enrollments loading, populated, empty, partial-error and lifecycle
   refresh states.

Provide screenshots from the actual Preview for:

- Plan/Programs with the global header, profile control and adjacent `+`
- Plan/Enrollments with filters above the list
- the create picker showing all five valid create types

If the environment cannot produce a screenshot or run a particular check, mark
that item `Not verified`; do not mark it passed based only on source inspection.

## Delivery

Return:

1. Exact files changed in this correction.
2. The final URL/view-state contract.
3. The final one-shot create-intent contract.
4. What replaced the dead `View assignments` destination.
5. Exact QA commands/results and Preview evidence.
6. Any acceptance item that remains unverified.
