# Hook: Pre-Commit (ML Code)

## Trigger
Before committing ANY file in `packages/ml/`

## Checks (ALL must pass)

### 1. Infrastructure Integrity
```bash
# Verify protected files haven't been modified in this commit
PROTECTED_FILES=(
  "packages/ml/shared/prepare.py"
  "packages/ml/shared/features.py"
  "packages/ml/shared/eval.py"
  "packages/ml/shared/config.py"
)

for file in "${PROTECTED_FILES[@]}"; do
  if git diff --cached --name-only | grep -q "$file"; then
    echo "ERROR: Protected file modified: $file"
    echo "These files can only be modified intentionally by humans, never by autoresearch."
    echo "If this is intentional, use: git commit --no-verify"
    exit 1
  fi
done
```

### 2. METRIC Output Check
For any modified `train_*.py`:
```bash
# Verify the file still prints METRIC as last stdout line
for train_file in $(git diff --cached --name-only | grep 'train_.*\.py$'); do
  if ! grep -q 'print.*METRIC:' "$train_file"; then
    echo "ERROR: $train_file does not contain METRIC: output line"
    exit 1
  fi
done
```

### 3. No Domain Terms in Core Code
```bash
# Check for hardcoded domain terms in ML core (not in program_*.md, tests, or packs)
DOMAIN_TERMS="loan|emi|nbfc|gold.loan|disbursed|cart|sku|shopify|subscription|booking|court|lesson|enrollment"

for py_file in $(git diff --cached --name-only | grep 'packages/ml/.*\.py$' | grep -v 'test_' | grep -v 'program_'); do
  if grep -iEn "\"($DOMAIN_TERMS)\"|'($DOMAIN_TERMS)'" "$py_file"; then
    echo "WARNING: Possible domain-specific term in $py_file"
    echo "Core ML code must be vertical-agnostic. Domain terms belong in Vertical Pack configs only."
  fi
done
```

### 4. Type Hints Present
```bash
# Check that new/modified Python functions have type hints
for py_file in $(git diff --cached --name-only | grep 'packages/ml/.*\.py$'); do
  if grep -En '^def [a-z_]+\([^:)]+\)' "$py_file"; then
    echo "WARNING: Function without type hints in $py_file"
    echo "All function parameters must have type annotations."
  fi
done
```

### 5. Autoresearch Commit Format
```bash
# If commit message starts with "autoresearch", enforce format
COMMIT_MSG=$(cat "$1" 2>/dev/null || echo "")
if echo "$COMMIT_MSG" | grep -q "^autoresearch"; then
  if ! echo "$COMMIT_MSG" | grep -qE "^autoresearch\([a-z_]+\): exp [0-9]+ —"; then
    echo "ERROR: Autoresearch commit must follow format:"
    echo "  autoresearch(<model>): exp <N> — <metric_name> <value> (+/-<delta>) — <description>"
    exit 1
  fi
fi
```
