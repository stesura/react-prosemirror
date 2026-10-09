# CLAUDE.md

## Answers

Keep answers to the point. Be as brief as possible without sacrificing the
message you want to convey.

## Git

Never run `git commit`, and never suggest running it. Committing is the user's
call.

Never run git stash without my explicit authorisation. I would rather you not
use git stash at all, and if you do need it, stop what you're doing and aske me
if you can proceed with the stashing.

## Comments

Keep code comments to the point. Only comment when there's a decision, a
workaround, or something genuinely worth explaining — not to narrate what the
code already says.

If you find yourself writing a lot of comments, step back: it usually means the
design is off and there's a simpler approach.

## Finishing work

When a long, multi-point task is done and nothing is left to do, say so and
suggest a commit message.

Commit messages and descriptions should be as short as possible. Never add
yourself as co-author (no `Co-Authored-By` trailer).

## package manager

Use npm rather than pnpm

## Bash

Use bash over powershell.

## authroisations

You don't need my authrisation to run npm i or npm run tests, run the dev
server, run a typecheck or run a build.

## code taxonomy

use arrow functions instead of functions where you can. Do not write inline
imports unless it's for lazy loading reasons.

## react

Avoid the use of useEffect as much as you can. Memoize where it makes sense,
don't be overly aggressive.

## edit automatically

When in edit automatically, if there is a question in my prompt address my
question in chat before writing code. When I ask you to audit, never write code,
just audit and keep the results of you audit concise.

## types

do not typecast. Unless you absolutely need to, in such case you will have to
let me know. Typecasting introduces bugs that are had to track down.

## project status

Project is currently in dev phase, there are no live editors. Migrations and API
changes should therefore not be a concern.

## package boundaries

Workspace packages may only import the packages the rule in
`scripts/check-package-boundaries.mjs` allows (core + base; react packages add
editor-react(-ui) and their siblings). Run
`npm run check:package-boundaries -- --strict`; CI gates on it. Shared contracts
go in core, not a cross-package import.

## changesets

When a task changes a published `@stesura/*` package, add a
`.changeset/<slug>.md` listing the packages it touched with one readable line
for the changelog. Patch by default; minor for breaking changes (we're on 0.x).

## format

Never run npm run format.
