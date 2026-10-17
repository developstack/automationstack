# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm dlx ultracite fix`
- **Check for issues**: `pnpm dlx ultracite check`
- **Diagnose setup**: `pnpm dlx ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Design Language

### Corner radius

All corners use one scale of four steps. The maximum radius is 8px. The tokens are in `packages/ui/src/styles/theme.css`.

| Class | Radius | Use |
| --- | --- | --- |
| `rounded-xs` | 2px | Very small marks in a component: chart legend squares, tooltip arrows. |
| `rounded-sm` | 4px | Small items: checkboxes, badges, inline code, the project initial, items in a menu. |
| `rounded-md` | 6px | Controls: buttons, inputs, select triggers, toggles, tabs, tooltips, sidebar items, the project switcher. |
| `rounded-lg` | 8px | Containers: the content panel, cards, dialogs, popovers, menus, alerts, code blocks, images. |
| `rounded-full` | Circle | Round items only: avatars, status dots, progress bars, scroll bar thumbs. |

1. Use only the classes in the table.
2. Do not use `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl`, or `rounded` without a step.
3. Do not use arbitrary radius values, for example `rounded-[6px]`.
4. Select the step from the function of the element, not from its size.
5. Do not use `rounded-full` on a rectangle that contains text. Buttons and badges are not pills.
6. An item in a container must have a radius that is equal to or smaller than the radius of the container.
7. A skeleton must have the same radius as the element that it replaces.
8. In a CSS file, use a `--radius-*` token or calculate the radius from `var(--radius)`. Do not write a fixed pixel value.
9. When you add a vendored component, for example from shadcn or Kibo UI, change its radius classes to this scale.

The tokens `--radius-xl` to `--radius-4xl` point to `--radius-lg`. Thus a vendored class that is not changed also stops at 8px.

### Menus

A menu shows only the items that the user can use at that time. This rule applies to all dropdown menus and context menus.

1. Do not show a menu item that the user cannot use.
2. Do not show an item as disabled. Do not write the reason next to the item.
3. Use the same rule as the server to find if the user can use an item. The server must also check each action.
4. If the user cannot use any item in a menu, do not show the button that opens the menu.
5. If you remove all items of a group, also remove the separator and the label of that group.
6. Write a test for each condition that removes an item from a menu.

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `pnpm dlx ultracite fix` before committing to ensure compliance.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for developstack/automationstack, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`, both created lazily. See `docs/agents/domain.md`.
