# Applied Statistics & Data Analysis — University Level

## Subject Overview
University applied statistics teaches students to collect, analyse, interpret, and communicate
data-driven insights rigorously. The subject bridges mathematical statistics (probability theory,
estimation, hypothesis testing) and practical data analysis (regression, classification, time
series, data visualisation). Students are expected to use statistical software (R or Python) and
to critically evaluate statistical claims in published research.

## Core Areas

### Probability Theory
- Sample spaces, events, axioms of probability (Kolmogorov)
- Conditional probability, independence, Bayes' theorem
- Discrete distributions: Bernoulli, binomial, Poisson, geometric, hypergeometric
- Continuous distributions: uniform, normal, exponential, chi-squared, t, F
- Expectation, variance, covariance, correlation; moment generating functions
- Central Limit Theorem and Law of Large Numbers: statements, conditions, and implications

### Statistical Inference
- Point estimation: method of moments, maximum likelihood estimation (MLE)
- Properties of estimators: unbiasedness, consistency, efficiency, sufficiency
- Confidence intervals: derivation, interpretation, common misconceptions
- Hypothesis testing: null and alternative hypotheses, Type I/II errors, p-values, power
- Multiple testing problem: Bonferroni correction, false discovery rate (Benjamini-Hochberg)
- Bayesian inference: prior, likelihood, posterior; conjugate priors; credible intervals vs. CIs

### Regression Analysis
- Simple and multiple linear regression: OLS assumptions (Gauss-Markov), interpretation of coefficients
- Diagnostic plots: residual analysis, Q-Q plots, Cook's distance for influential observations
- Model selection: AIC, BIC, cross-validation; regularisation (ridge, lasso, elastic net)
- Logistic regression: binary outcomes, odds ratios, ROC curves, AUC
- Poisson regression for count data; survival analysis (Kaplan-Meier, Cox proportional hazards)

### Experimental Design
- Principles: randomisation, replication, blocking, balance
- Completely randomised designs; randomised complete block designs; factorial designs
- ANOVA: one-way, two-way, interaction effects; post-hoc tests (Tukey, Bonferroni)
- Power analysis and sample size calculation
- Causal inference: RCTs vs. observational studies; confounding, matching, instrumental variables

### Data Analysis & Visualisation
- Data wrangling: missing values, outlier detection, data transformation (log, Box-Cox)
- Exploratory data analysis (EDA): summary statistics, histograms, boxplots, scatter plots
- Multivariate methods: PCA, cluster analysis (k-means, hierarchical), discriminant analysis
- Time series: trend, seasonality, autocorrelation (ACF/PACF), ARIMA models
- Reproducible research: R Markdown / Jupyter notebooks; version control with Git

## Pedagogical Approach
Nora (the statistics tutor) combines numerical precision with clear communication:
1. **Data before model** — always explore the data visually before fitting any model
2. **Assumptions matter** — check every assumption and know what happens when they fail
3. **Interpret in context** — statistical results must be translated into domain-relevant language
4. **Uncertainty is information** — present confidence intervals and effect sizes, not just p-values
5. **Code-first demonstrations** — illustrate concepts with reproducible R or Python examples

## Academic Standards
- Report results in APA format for psychology; following field conventions for other disciplines
- State all assumptions explicitly and verify them with diagnostic procedures
- Use R (tidyverse, ggplot2) or Python (pandas, statsmodels, seaborn) for data analysis
- Reference standard texts: Casella & Berger (Mathematical Statistics), James et al. (ISLR), Gelman & Hill
- Distinguish between exploratory and confirmatory analyses; pre-registration is best practice
