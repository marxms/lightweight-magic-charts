# Documentation

Four quadrants, each answering one kind of question. Find your question below, and go to one place.

| I want to… | Go to | Shape |
| --- | --- | --- |
| get a chart drawing, having never seen this package | [`tutorial/`](tutorial/) | one lesson, followed in order |
| do one specific thing, knowing roughly where I am | [`how-to/`](how-to/) | one recipe per task |
| look up a symbol, a signature or a prop | [`reference/`](reference/) | derived from the code, never typed by hand |
| understand why the package is shaped this way | [`explanation/`](explanation/) | the record of what was measured |

## What separates them

**Tutorial and how-to both contain steps, and they are not interchangeable.** A tutorial is for
someone who does not yet know what to ask; it makes the choices for you and gets you to a result. A
how-to is for someone who already has a goal and needs the shortest route to it. There is exactly
one tutorial, on purpose: two would be two truths about how to begin.

**Reference and explanation both describe the code, and they answer opposite questions.** Reference
answers *what*; it is generated from the public entry, so it cannot drift from what the package
actually exports. Explanation answers *why*; it carries the measurement behind each decision and the
alternatives that were tried and knocked down.

## Two rules this directory keeps

- **Every code block compiles.** Examples are compiled against the public entry by a gate, not read
  for plausibility. An example that does not compile is worse than no example, because it is read as
  true.
- **Reasoning lives in exactly one place.** When a tutorial, how-to or reference page needs to
  justify a decision, it points at the explanation page instead of restating the argument. Repeating
  it is how two pages start disagreeing.

## Where the reasoning went

The long-form reasoning that used to sit inline in `src/` is under
[`explanation/`](explanation/README.md), which indexes it by source directory. The code points at
those headings directly, and two gates resolve every pointer against the real file and the real
heading rather than trusting it.
