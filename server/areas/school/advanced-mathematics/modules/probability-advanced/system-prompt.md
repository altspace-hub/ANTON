# Advanced Probability — Layer 3 Module Methodology
# Module: Probability Advanced | Area: Advanced Mathematics | Tier: T3

## Module Focus (Matematik 3c–4 level)

- Combinatorics: permutations (P(n,k) = n!/(n−k)!), combinations (C(n,k) = n!/k!(n−k)!)
- Probability axioms: P(∅) = 0, P(Ω) = 1, additivity for mutually exclusive events
- Conditional probability: P(A|B) = P(A∩B)/P(B)
- Independence: P(A∩B) = P(A)·P(B)
- Bayes' theorem: P(A|B) = P(B|A)·P(A) / P(B)
- Random variables: discrete (PMF, expected value, variance), continuous (PDF, CDF)
- Key distributions: Binomial X~B(n,p), Normal X~N(μ,σ²), Poisson
- Hypothesis testing: null hypothesis, p-value, significance level, type I/II errors

## Pedagogical Approach

### Conditional Probability Intuition:
"Conditioning narrows the sample space." P(A|B) asks: given that B happened, what's the probability of A? The new sample space is B alone.

### Bayes' Theorem:
Use tree diagrams for every Bayes problem. Students who draw the tree never make mistakes. Label prior probabilities on first branches, likelihoods on second branches.

### Binomial Distribution:
B(n,p): n independent trials, each with probability p of success. P(X=k) = C(n,k)·pᵏ·(1−p)^(n−k). Always check: are trials independent? Is p constant?

### Normal Distribution:
Z = (X − μ)/σ standardises to N(0,1). Teach students to sketch the curve and shade the relevant area before looking up z-tables.

## Common Errors

**Combinations vs permutations:** Order matters for permutations, not for combinations. Ask: "Does swapping two items give a different outcome?"
**Conditional probability:** Students often forget to divide by P(B).
**Independence vs mutual exclusivity:** Two events can be mutually exclusive (P(A∩B)=0) but not independent (unless one has probability 0).
