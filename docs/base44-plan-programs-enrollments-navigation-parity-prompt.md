# Base44 Fix Prompt: Plan, Programs And Enrollments Navigation Parity

Apply this UX/navigation fix inside the existing authenticated Base44/KlubAdmin
webapp. Reuse the current Plan, training-template, Programs and Enrollments
components and services. Do not create a new portal, new business entities or a
parallel program/enrollment implementation.

This prompt supersedes the navigation and page-composition parts of
`base44-issue-286-complete-prompt.md` and
`base44-owner-training-programs-prompt.md`. Their data, permission, builder and
API contracts remain authoritative.

## Outcome

Make web follow the same information architecture as the mobile Plan workspace:

- Tasks, Exercise, Session, Week, Programs and Enrollments are views inside one
  Plan workspace.
- Changing the Plan view replaces the content below the shared Plan controls; it
  must not navigate through a temporary page or mount an unrelated create view.
- Programs and Enrollments use the same visual rhythm, spacing, cards, loading,
  error and empty-state patterns as Task, Exercise, Session and Week.
- There is no separate Assignments page/view. Assignment history and program
  participation are shown through Enrollments, while bulk assignment starts
  from the relevant content card.

This is a frontend navigation/design change. Preserve the existing Supabase
services and server-side write flows exactly as they are.

## Shared Plan Shell

Keep one persistent Plan shell with:

1. `Plan` and the active owner/workspace context.
2. The existing profile control.
3. A compact `+` button beside the profile control.
4. One View dropdown.
5. The controls and content belonging to the selected view.

The View dropdown must contain, in this order:

- Tasks
- Exercise
- Session
- Week
- Programs
- Enrollments

Selecting any option updates the active view in the existing Plan workspace.
Do not push to a separate Programs route as an intermediate step, reload the
whole shell or flash another view while data loads. A loading state belongs in
the content region beneath the dropdown.

If the web URL stores the current view, use one stable value such as
`?view=programs`; changing it must render Programs directly on the first paint.
Do not combine view selection with a create flag.

## Programs View

When `Programs` is selected:

- land directly on the program overview/list
- do not open the program builder
- do not show a standalone `Programs` page heading because the selected View
  dropdown already communicates the current location
- do not show a separate Create button inside the Programs content
- do not show Programs/Enrollments tabs inside the content
- preserve all existing program card actions, permissions and data behavior

Use the same card language as the other Plan views: calm border/shadow,
consistent radius and spacing, clear title/metadata hierarchy and predictable
placement of primary and secondary actions.

## Enrollments View

When `Enrollments` is selected:

- render the enrollment overview directly below the shared View dropdown
- do not show a standalone `Enrollments` page heading
- do not show a separate Create button
- do not show Programs/Enrollments tabs
- preserve the canonical enrollment data source, lifecycle actions and refresh
  behavior from `base44-owner-training-program-enrollments-list-v6-prompt.md`

The list should make player, program, status and date range easy to scan. Filters
must sit above the resulting player/enrollment list, and the result must update
in the same content region.

## Create Control

Remove the large Create card/button from Plan and remove local Create buttons
from Programs and Enrollments. Use the single compact `+` button beside the
profile control.

Clicking `+` opens the existing create picker with:

- Task
- Exercise
- Session
- Week
- Program

Task, Exercise, Session and Week open their existing builders. Program opens the
existing program builder.

Enrollments is not createable and must not appear in this picker.

## Separate View State From Create Intent

Fix the transient `Create Programs` behavior by treating these as two different
events:

- `selectPlanView('programs')` only selects the Programs overview
- `requestCreate('program')` selects Programs and opens a new program builder

The program-create request must be a one-shot event:

1. Emit it only from the explicit `+` -> `Program` action.
2. Consume and clear it immediately after the builder opens.
3. Do not store an uncleared create request in shared state, local storage,
   navigation history or a persistent URL parameter.
4. Remounting Programs after visiting another Plan view must not replay an old
   create request.
5. Close/reset any previous builder state before normal View-dropdown
   navigation renders the program overview.

Do not use a numeric counter or stale boolean that survives an unmount unless
the consumer acknowledges and resets it. A reducer/event ID is acceptable only
if already-consumed events cannot be replayed.

## Bulk Assignment Entry Points

Do not restore the removed Assignments page. The logical entry into bulk
assignment is the action on each assignable content card:

- Task
- Exercise
- Session
- Week
- published Program

Each action opens the existing shared bulk-assignment flow with that card's
content type and ID preselected. Do not create separate assignment logic per
view.

## Responsive Behavior

Preserve the existing Base44 desktop shell. On narrower layouts, keep the same
information architecture without copying a native bottom tab bar. The Plan
header controls may wrap or collapse, but the View dropdown, profile control and
`+` create action must remain clear and keyboard/touch accessible.

## Acceptance Tests

Verify all of the following in Base44 Preview and the published responsive web
app:

1. From Tasks, open the View dropdown and select Programs. The first rendered
   destination is the program overview; no `Create Programs` page/modal flashes.
2. Move from Programs to Enrollments and back. Neither transition opens the
   builder or changes route through an intermediate page.
3. Refresh with Programs selected. The program overview loads directly.
4. Click `+` -> `Program`. The program builder opens exactly once.
5. Close the builder, visit another view and return to Programs. The builder
   remains closed.
6. Programs and Enrollments have no duplicate heading, local Create button or
   tabs between those two views.
7. The old Assignments view/page is absent from Plan navigation.
8. Assign from each supported content card opens the shared bulk-assignment
   flow with the correct preselected content.
9. Existing program creation, enrollment loading and lifecycle actions still
   use their current services and pass their existing tests.
10. Keyboard navigation, browser back/forward and narrow responsive layouts do
    not replay create intent or lose the selected Plan view.

## Delivery From Base44

Return:

1. The files/components changed.
2. The final Plan view-state and create-intent flow.
3. Confirmation that no new Base44 entity, portal or assignment system was
   created.
4. Screenshots of Programs and Enrollments inside the shared Plan shell.
5. Results for all acceptance tests above, including the no-flash Programs test.
