# Skill: Autoresearch Pattern

## When to Use
Invoke this skill when running, debugging, or extending the overnight autoresearch loop.

## The Pattern (Karpathy, March 2026)
Three primitives make the loop work:
1. **Editable asset**: `train_<model>.py` — the ONLY file the agent modifies
2. **Scalar metric**: a single number that determines if a change was an improvement
3. **Time-boxed cycle**: fixed wall-clock budget per experiment (30-120 seconds)

## Loop Pseudocode
```
best_metric = run_baseline()
git_commit("baseline: {best_metric}")

for experiment in range(max_experiments):
    backup(train_file)
    
    modification = agent_proposes_change(
        program_md=read("program_<model>.md"),
        current_train=read("train_<model>.py"),
        last_10_results=experiment_log[-10:],
        best_metric=best_metric
    )
    
    apply(modification, train_file)
    
    result = run_with_timeout(train_file, timeout=budget)
    
    if result.timed_out:
        revert(train_file)
        log(experiment, "TIMEOUT", result.elapsed)
        continue
    
    metric = parse_metric(result.stdout)
    
    if metric == "INSUFFICIENT_DATA":
        revert(train_file)
        log(experiment, "SKIP", "insufficient data")
        continue
    
    if metric == "ERROR":
        revert(train_file)
        log(experiment, "ERROR", result.stderr)
        continue
    
    if metric > best_metric:
        best_metric = metric
        git_commit(f"autoresearch: exp {experiment} — {metric} (+{delta})")
        log(experiment, "IMPROVED", metric, modification.description)
    else:
        revert(train_file)
        log(experiment, "NO_IMPROVEMENT", metric)
    
    sleep(2)  # prevent CPU overheating on laptop
```

## program_<model>.md Structure
The human writes this. It tells the agent what to try.

```markdown
# Autoresearch: [Model Name]

## Context
[What the model does, what vertical it serves, what matters]

## Editable file
[Which file to modify, what sections are fair game]

## Metric
[Primary metric name, direction, current baseline]

## Constraints
- Must complete in under X seconds on CPU
- Must handle up to Y users/items
- Libraries available: [list]
- Must output METRIC: <float> as last stdout line

## What to try (prioritised)
1. [Highest priority experiments]
2. [Medium priority]
3. [Low priority / creative]

## What NOT to try
- [Things known to not work or be wasteful]
```

## Running on Laptop (No GPU)

### Hardware Expectations
- MacBook / Windows laptop with 8-16GB RAM
- All models train on CPU (no CUDA, no MPS needed)
- Training times: 10-120 seconds per experiment
- 500 experiments overnight ≈ 8-10 hours with 2s sleep between experiments
- Keep laptop plugged in, disable sleep mode

### Parallelism
- Run ONE model at a time (CPU-bound, parallelism doesn't help)
- Sequential: propensity → collaborative → cooccurrence → attribute → trending → affinity → bts → nba
- Or pick the most important model and give it all 500 experiments

### Monitoring
- Check `experiments/<model>.jsonl` for progress
- Each line is one experiment with timestamp, metric, and outcome
- If the last 50 experiments show no improvement, the search space may be exhausted — try modifying the program.md with new directions

## Git Branch Strategy
- All autoresearch runs happen on a feature branch: `autoresearch/<model>/<date>`
- After review, merge winning commits to main
- The git history IS the research log — every improvement is documented

## Common Failure Modes

### "METRIC stays flat after 100+ experiments"
The search space is exhausted OR the program.md instructions are too narrow. Add new experiment directions to the program.md.

### "METRIC improves then gets worse"
The agent is overfitting to the validation set. This shouldn't happen with temporal splits, but check that the val set is large enough (>1000 users).

### "Every experiment times out"
The agent is increasing model complexity beyond what fits in the time budget. Add a constraint to program.md: "Model must have <500 estimators and max_depth <8."

### "AUC jumps to 0.95+ suddenly"
Data leakage. The agent found a way to sneak future information into features. Check: did it modify the import of features.py? Did it add a new feature that uses val data? Revert and investigate.
