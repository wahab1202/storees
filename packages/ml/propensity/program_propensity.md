# Program: Propensity Model

## Objective
Train an XGBoost classifier to predict customer propensity for a target event (churn, dormancy, conversion, purchase).

## Scalar Metric
AUC-ROC on held-out validation set (temporal split).

## Current Best
- AUC: (not yet trained)
- Brier: (not yet trained)

## Experiment Ideas
1. Feature selection: try recursive feature elimination
2. Hyperparameter tuning: adjust learning_rate, max_depth, n_estimators
3. Class weighting: experiment with scale_pos_weight values
4. Feature engineering: add interaction terms, polynomial features
5. Alternative models: try LightGBM, CatBoost
6. Calibration: apply Platt scaling or isotonic regression post-hoc
7. Sampling strategy: try SMOTE or undersampling for imbalanced data

## Guardrails
- AUC > 0.92 = DATA LEAKAGE — reject immediately
- Coverage < 20% = AUTO REJECT
- Brier > 0.25 = POOR CALIBRATION
- < 200 positive labels = INSUFFICIENT_DATA — skip training

## Editable Section
The `AUTORESEARCH EDITABLE SECTION` in `train_propensity.py` contains the hyperparameters.
Only modify parameters within that section. Never modify shared/ infrastructure.
