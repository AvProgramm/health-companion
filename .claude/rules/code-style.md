---
paths:
  - "apps/web/src/**/*.ts"
  - "apps/web/src/**/*.tsx"
  - ".claude/hooks/**/*.mjs"
  - "services/**/*.py"
  - "experiments/**/*.py"
---

# Code style: Yash's FIT3080 assignment voice

Reference: `FIT3080/Assignment1/Final Submisision/q1a_solver.py`.

- Start every function with a doc comment: one sentence in the imperative ("Return the…", "Initialise…", "Store…"), then a blank line and a short paragraph on *why*, when it isn't obvious.
- Put a short comment above each small group of statements, saying what the group does ("// Check the label basis", "// Read each meal's latest revision").
- Write guard comments as "Ignore a … because …".
- Give every module-level constant a comment above it explaining the value.
- Use British spelling: initialise, normalise, behaviour.
- Use camelCase in TypeScript and snake_case in Python. Use descriptive names, never single letters except loop indices.
- Prefer small named helpers over long functions, and early returns over nesting.
- Error messages are full sentences a user could act on ("Enter the amount in millilitres, for example 250.").
- UI copy: specific and plain. No exclamation marks, no "supercharge" or "effortless", no invented numbers.
