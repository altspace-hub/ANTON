# Calculus — Layer 3 Module Methodology
# Module: Calculus | Area: Advanced Mathematics | Tier: T3

## Module Focus

This module covers **differential and integral calculus** as taught in Matematik 3c–4 (Gy11/Gy25):
- Derivatives: limit definition, rules (power, product, quotient, chain), implicit differentiation
- Applications of derivatives: optimisation, related rates, curve sketching, L'Hôpital's rule
- Integration: antiderivatives, definite integrals, the Fundamental Theorem of Calculus
- Techniques of integration: substitution, integration by parts
- Applications of integrals: area, volume of revolution, arc length

## Pedagogical Approach

### Conceptual Foundation First:
1. **The derivative as instantaneous rate of change.** Start with the secant line → limit as Δx→0. Never introduce rules before the concept.
2. **The integral as accumulation.** Riemann sums before the Fundamental Theorem. "The integral adds up infinitely many infinitely thin slices."
3. **Fundamental Theorem connection.** Differentiation and integration are inverse operations — this is the deepest insight in calculus.

### Derivative Teaching Sequence:
1. Limit definition: f'(x) = lim[h→0] (f(x+h) - f(x))/h
2. Power rule (derive it from the limit)
3. Constant, sum, difference rules
4. Product rule (derive using limits)
5. Quotient rule
6. Chain rule — the most important and most misunderstood
7. Implicit differentiation (treat y as a function of x throughout)

### Integration Teaching Sequence:
1. Antiderivative as "reverse derivative"
2. Indefinite integrals and the constant C
3. Definite integrals as signed area
4. Fundamental Theorem: ∫[a,b] f(x)dx = F(b) - F(a)
5. Substitution: when the integrand contains f(g(x))·g'(x)
6. Integration by parts: ∫u dv = uv - ∫v du (LIATE mnemonic for choosing u)

## Common Errors and Responses

**Chain rule errors:**
→ Ask: "What is the 'outer' function? What is the 'inner' function? What is the derivative of each?"
→ Use the layered notation: d/dx [f(g(x))] = f'(g(x)) · g'(x)

**Forgetting the constant of integration:**
→ "What is the derivative of any constant? So if we integrate, we must account for any constant we might have lost."

**Integration by substitution errors:**
→ "Did you also substitute the dx? If u = g(x), then du = g'(x)dx. Every x must become a u."

**Definite integral sign errors:**
→ "Apply F(b) - F(a) carefully. Write F(b) = ... and F(a) = ... separately, then subtract."

## Exam Technique for T3 Calculus

1. Always state the rule you are using before applying it
2. For optimisation: find critical points, determine nature (max/min), check boundary values
3. For definite integrals: show the antiderivative before substituting limits
4. For volume of revolution: Π∫[a,b] [f(x)]² dx — draw the graph first

## Example Socratic Dialogue — Optimisation (L1):

"We want to minimise costs. We've written the cost function C(x). What does it mean to minimise C?
What does a minimum look like on a graph?
How do we find where that slope is zero?
Good — so we need C'(x) = 0. Can you differentiate C(x)?
Now solve for x. Is that a minimum or maximum? How do we verify?"
