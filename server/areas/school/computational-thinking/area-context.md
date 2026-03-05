# Computational Thinking — Area Context
# Aligned with: Swedish Lgr22 (Teknik + Programmering), GCSE CS, general secondary
# Age range: 13–19 | Default tier: T2 (ages 13–15)

## What Computational Thinking Is

Computational thinking is a problem-solving approach using four core pillars:

1. **Decomposition** — breaking a large problem into smaller, manageable parts
2. **Pattern Recognition** — identifying similarities and regularities within and between problems
3. **Abstraction** — focusing on essential information and hiding unnecessary detail
4. **Algorithms** — designing step-by-step solutions that can be followed precisely

These skills transfer beyond programming — they apply to mathematics, science, and everyday reasoning.

## Curriculum Alignment

### Swedish Lgr22 — Teknik & Programmering (Years 7–9)
Core content includes:
- Programming as a tool for problem-solving and automation
- Algorithms: sequencing, selection (if/else), repetition (loops)
- Variables, data types, and input/output
- Debugging: systematic error identification
- Simple data structures: lists, strings
- Event-driven programming (Scratch)
- Transition to text-based languages (Python)

### Swedish Gymnasiet (Years 10–12 / T3)
Extended content includes:
- Functions and modular programming
- Object-oriented principles (classes, objects, methods)
- Recursion and higher-order functions
- Data structures: dictionaries, sets, stacks, queues
- Algorithms: sorting (bubble, merge, quicksort), searching (binary search)
- APIs and web data (JSON, requests)
- Introduction to software engineering practices

## Age-Appropriate Language Choices

| Tier | Primary Languages | Secondary Languages |
|------|------------------|--------------------|
| T1 (age 10–12) | Scratch | — |
| T2 (age 13–15) | Scratch, Python | Basic HTML/CSS |
| T3 (age 16–18) | Python, JavaScript | Java, HTML/CSS/JS |
| T4+ (18+) | Python, JavaScript | Any |

**Default recommendation:** Python for T2+ because:
- Clean, readable syntax mirrors pseudocode
- Strongly used in Swedish secondary curricula
- Rich ecosystem for educational projects
- Easy REPL for experimenting

**Scratch is appropriate for:**
- Visual-first learners
- T1 students
- Introducing loops, conditionals, and events without syntax barriers

## Key Concepts by Tier

### T2 Key Concepts (Years 7–9)
- Variables and assignment (`name = "Anna"`)
- Data types: strings, integers, floats, booleans
- Input and output (`input()`, `print()`)
- Conditionals (`if`, `elif`, `else`)
- Loops (`for`, `while`)
- Lists (creating, indexing, appending)
- Functions (defining and calling)
- Basic debugging (reading error messages, tracing logic)

### T3 Key Concepts (Years 10–12)
All T2 concepts plus:
- Nested data structures (lists of dicts, dicts of lists)
- File I/O and working with text files
- Object-Oriented Programming (classes, `__init__`, methods, inheritance)
- Recursion
- Sorting and searching algorithms
- Modules and imports (standard library, third-party packages)
- API calls and JSON parsing
- Introductory complexity (why O(n²) loops are slower)

## Teaching Philosophy for Coding

**Guide, don't solve.** Alma never just writes the code for a student at L1-L2.
At L1: only guiding questions.
At L2: pseudocode or structural hints.
At L3: code skeleton with blanks to fill in.
At L4: full working solution with thorough explanation of every line.

**Error messages are friends.** Teach students to read Python tracebacks top-to-bottom.
Never fix the error for L1-L2 students — guide them to find it themselves.

**Real-world analogies.** Variables are like labelled boxes. Functions are like recipes.
Lists are like shopping lists. Loops are like instructions on repeat.

**Incremental building.** Always start with the simplest working version, then extend.
"Make it work, make it right, make it fast."
